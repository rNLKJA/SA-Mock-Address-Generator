# /// script
# requires-python = ">=3.12"
# dependencies = [
#   "pandas>=2.2",
#   "python-calamine>=0.2",
#   "shapely>=2.0",
# ]
# ///
"""Rebuild the South Australian suburb reference table from ABS open data.

The 2025 tool shipped `original/data/sa_suburbs_data.csv` with no stated source,
an all-zero socio-economic column and 997 "Not Applicable" remoteness rows. This
script rebuilds an equivalent table for every 2021 ABS Suburb and Locality (SAL)
in South Australia, then writes the small artefacts the web app reads:

  web/public/data/suburbs.json           rebuilt table (one row per SAL)
  web/public/data/sal-sa.geojson         simplified SAL boundaries (mapshaper)
  web/public/data/sa-context.geojson     simplified state outlines (offline basemap)
  web/public/data/original-suburbs.json  the 2025 table, row order preserved
  web/public/data/provenance.json        original vs rebuilt diff + sources

Every input is an ABS release under CC BY 4.0, downloaded without a login:
  * ASGS Edition 3 allocation files (MB -> SAL, LGA, POA, SA1; SA1 -> RA)
  * ASGS Edition 3 SAL and STE digital boundaries (GDA2020)
  * Census 2021 Mesh Block counts (usual resident persons per mesh block)
  * SEIFA 2021, Suburbs and Localities, IRSAD

Method: each SAL is assigned the postcode (POA), council (LGA) and remoteness
area (RA) holding the largest share of its 2021 usual residents, with land area
as the tie-breaker for unpopulated SALs.

Run from the repo root:
    uv run scripts/build_data.py            # downloads into scripts/.cache/
    uv run scripts/build_data.py --offline  # reuse the cache only

Requires pnpm (for `pnpm dlx mapshaper`) on PATH.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import urllib.request
import zipfile
from collections import Counter
from datetime import date
from pathlib import Path

import pandas as pd
from shapely.geometry import shape
from shapely.ops import polylabel

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "scripts" / ".cache"
OUT = ROOT / "web" / "public" / "data"
ORIGINAL_CSV = ROOT / "original" / "data" / "sa_suburbs_data.csv"

USER_AGENT = (
    "SA-Mock-Address-Lab data build "
    "(+https://github.com/rNLKJA/SA-Mock-Address-Generator)"
)
MAPSHAPER = ["pnpm", "dlx", "mapshaper@0.7.81"]
SAL_SIMPLIFY = "10%"
STE_SIMPLIFY = "0.4%"

ASGS = (
    "https://www.abs.gov.au/statistics/standards/"
    "australian-statistical-geography-standard-asgs/"
    "edition-3-july-2021-june-2026/access-and-downloads"
)
SOURCES = {
    "SAL_2021_AUST.xlsx": {
        "url": f"{ASGS}/allocation-files/SAL_2021_AUST.xlsx",
        "title": "ASGS Ed. 3 allocation file: Mesh Block to Suburbs and Localities (SAL) 2021",
    },
    "LGA_2021_AUST.xlsx": {
        "url": f"{ASGS}/allocation-files/LGA_2021_AUST.xlsx",
        "title": "ASGS Ed. 3 allocation file: Mesh Block to Local Government Areas (LGA) 2021",
    },
    "POA_2021_AUST.xlsx": {
        "url": f"{ASGS}/allocation-files/POA_2021_AUST.xlsx",
        "title": "ASGS Ed. 3 allocation file: Mesh Block to Postal Areas (POA) 2021",
    },
    "MB_2021_AUST.xlsx": {
        "url": f"{ASGS}/allocation-files/MB_2021_AUST.xlsx",
        "title": "ASGS Ed. 3 allocation file: Mesh Blocks to Main Structure (SA1) 2021",
    },
    "RA_2021_AUST.xlsx": {
        "url": f"{ASGS}/allocation-files/RA_2021_AUST.xlsx",
        "title": "ASGS Ed. 3 allocation file: SA1 to Remoteness Areas (RA) 2021",
    },
    "SAL_2021_AUST_GDA2020_SHP.zip": {
        "url": f"{ASGS}/digital-boundary-files/SAL_2021_AUST_GDA2020_SHP.zip",
        "title": "ASGS Ed. 3 digital boundaries: Suburbs and Localities 2021 (GDA2020)",
    },
    "STE_2021_AUST_SHP_GDA2020.zip": {
        "url": f"{ASGS}/digital-boundary-files/STE_2021_AUST_SHP_GDA2020.zip",
        "title": "ASGS Ed. 3 digital boundaries: States and Territories 2021 (GDA2020)",
    },
    "MB_counts_2021.xlsx": {
        "url": "https://www.abs.gov.au/census/guide-census-data/mesh-block-counts/2021/Mesh%20Block%20Counts%2C%202021.xlsx",
        "title": "Census of Population and Housing 2021: Mesh Block counts",
    },
    "SEIFA_SAL_2021.xlsx": {
        "url": "https://www.abs.gov.au/statistics/people/people-and-communities/socio-economic-indexes-areas-seifa-australia/2021/Suburbs%20and%20Localities%2C%20Indexes%2C%20SEIFA%202021.xlsx",
        "title": "SEIFA 2021: Suburbs and Localities, Indexes (IRSAD)",
    },
}

SA = "4"
# SAL codes that are not places: "No usual address (SA)" and
# "Migratory - Offshore - Shipping (SA)".
SPECIAL_SAL = {"49494", "49797"}
RA_NAMES = {
    "40": "Major Cities of Australia",
    "41": "Inner Regional Australia",
    "42": "Outer Regional Australia",
    "43": "Remote Australia",
    "44": "Very Remote Australia",
}


def log(msg: str) -> None:
    print(f"[build_data] {msg}", flush=True)


def download(offline: bool) -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    for name, meta in SOURCES.items():
        target = CACHE / name
        if target.exists() and target.stat().st_size > 0:
            continue
        if offline:
            sys.exit(f"missing {target} and --offline was given")
        log(f"downloading {name}")
        req = urllib.request.Request(meta["url"], headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=300) as resp, open(target, "wb") as fh:
            while chunk := resp.read(1 << 20):
                fh.write(chunk)
    for zname, folder in [
        ("SAL_2021_AUST_GDA2020_SHP.zip", "sal"),
        ("STE_2021_AUST_SHP_GDA2020.zip", "ste"),
    ]:
        dest = CACHE / folder
        if not dest.exists():
            with zipfile.ZipFile(CACHE / zname) as zf:
                zf.extractall(dest)


def read_xlsx(name: str, cols: list[str]) -> pd.DataFrame:
    """Read an ABS allocation workbook (first sheet), caching as parquet-free CSV."""
    cached = CACHE / f"{Path(name).stem}.{'_'.join(c[:6] for c in cols)}.csv"
    if cached.exists():
        return pd.read_csv(cached, dtype=str)
    log(f"parsing {name}")
    df = pd.read_excel(CACHE / name, engine="calamine", usecols=cols, dtype=str)
    df.to_csv(cached, index=False)
    return df


def read_mb_counts() -> pd.DataFrame:
    cached = CACHE / "MB_counts_2021.SA.csv"
    if cached.exists():
        return pd.read_csv(cached, dtype={"MB_CODE_2021": str})
    log("parsing Mesh Block counts")
    book = pd.ExcelFile(CACHE / "MB_counts_2021.xlsx", engine="calamine")
    frames = []
    for sheet in book.sheet_names:
        if not sheet.startswith("Table"):
            continue
        raw = book.parse(sheet, header=None, dtype=str)
        header_row = raw.index[raw.iloc[:, 0] == "MB_CODE_2021"]
        if len(header_row) == 0:
            continue
        h = header_row[0]
        df = raw.iloc[h + 1 :].copy()
        df.columns = [str(c).strip() for c in raw.iloc[h]]
        df = df[df["MB_CODE_2021"].notna() & df["MB_CODE_2021"].str.match(r"^\d{11}$")]
        frames.append(df)
    mb = pd.concat(frames, ignore_index=True)
    mb = mb[mb["State"].astype(str) == SA][["MB_CODE_2021", "Person", "Dwelling"]]
    mb["Person"] = pd.to_numeric(mb["Person"], errors="coerce").fillna(0).astype(int)
    mb["Dwelling"] = pd.to_numeric(mb["Dwelling"], errors="coerce").fillna(0).astype(int)
    mb.to_csv(cached, index=False)
    return mb


def read_seifa() -> pd.DataFrame:
    raw = pd.read_excel(
        CACHE / "SEIFA_SAL_2021.xlsx", sheet_name="Table 3", header=None, engine="calamine"
    )
    # Columns (Table 3, IRSAD): code, name, URP, score, _, aus rank, aus decile,
    # aus percentile, _, state, state rank, state decile, state percentile, ...
    body = raw.iloc[6:, [0, 1, 2, 3, 6, 9, 11, 16]].copy()
    body.columns = [
        "SAL_CODE_2021",
        "seifa_name",
        "urp",
        "irsad",
        "decile_aus",
        "state",
        "decile_sa",
        "caution",
    ]
    body = body[body["SAL_CODE_2021"].astype(str).str.match(r"^\d{5}$")]
    body["SAL_CODE_2021"] = body["SAL_CODE_2021"].astype(str)
    body = body[body["state"] == "SA"]
    for col in ["urp", "irsad", "decile_aus", "decile_sa"]:
        body[col] = pd.to_numeric(body[col], errors="coerce")
    body["caution"] = body["caution"].astype(str).str.strip().eq("Y")
    return body


def majority(
    alloc: pd.DataFrame, key: str, label: str, weights: pd.DataFrame
) -> pd.DataFrame:
    """For each SAL pick the `key` value with the most residents (area breaks ties)."""
    joined = alloc.merge(weights, on="MB_CODE_2021", how="left")
    joined["Person"] = joined["Person"].fillna(0)
    grouped = (
        joined.groupby(["SAL_CODE_2021", key], as_index=False)
        .agg(person=("Person", "sum"), area=("AREA", "sum"))
        .sort_values(["SAL_CODE_2021", "person", "area"], ascending=[True, False, False])
    )
    totals = grouped.groupby("SAL_CODE_2021").agg(
        person_total=("person", "sum"), area_total=("area", "sum"), n=(key, "nunique")
    )
    top = grouped.drop_duplicates("SAL_CODE_2021").set_index("SAL_CODE_2021")
    out = top[[key]].join(totals)
    share = top["person"] / out["person_total"]
    area_share = top["area"] / out["area_total"]
    out[f"{label}_share"] = share.where(out["person_total"] > 0, area_share).round(3)
    out[f"{label}_all"] = grouped.groupby("SAL_CODE_2021")[key].apply(list)
    return out[[key, f"{label}_share", f"{label}_all"]]


def clean_name(sal_name: str) -> str:
    return re.sub(r"\s*\(SA\)$", "", sal_name).upper()


def run_mapshaper() -> None:
    sal_out = OUT / "sal-sa.geojson"
    log(f"simplifying SAL boundaries ({SAL_SIMPLIFY})")
    subprocess.run(
        [
            *MAPSHAPER,
            str(CACHE / "sal" / "SAL_2021_AUST_GDA2020.shp"),
            "-filter",
            f"STE_CODE21 == '{SA}' && !this.isNull",
            "-filter-fields",
            "SAL_CODE21",
            "-rename-fields",
            "c=SAL_CODE21",
            "-simplify",
            SAL_SIMPLIFY,
            "keep-shapes",
            "-o",
            "format=geojson",
            "precision=0.0001",
            str(sal_out),
        ],
        check=True,
    )
    log(f"simplifying state outlines ({STE_SIMPLIFY})")
    subprocess.run(
        [
            *MAPSHAPER,
            str(CACHE / "ste" / "STE_2021_AUST_GDA2020.shp"),
            "-filter",
            "!this.isNull && STE_CODE21 != '9'",
            "-filter-fields",
            "STE_CODE21,STE_NAME21",
            "-rename-fields",
            "code=STE_CODE21,name=STE_NAME21",
            "-simplify",
            STE_SIMPLIFY,
            "keep-shapes",
            "-o",
            "format=geojson",
            "precision=0.001",
            str(OUT / "sa-context.geojson"),
        ],
        check=True,
    )


def label_points() -> dict[str, list[float]]:
    gj = json.loads((OUT / "sal-sa.geojson").read_text())
    points: dict[str, list[float]] = {}
    for feat in gj["features"]:
        geom = shape(feat["geometry"])
        if geom.geom_type == "MultiPolygon":
            geom = max(geom.geoms, key=lambda g: g.area)
        pt = polylabel(geom, tolerance=0.0005)
        if not geom.contains(pt):  # degenerate slivers
            pt = geom.representative_point()
        points[str(feat["properties"]["c"])] = [round(pt.x, 5), round(pt.y, 5)]
    return points


def build() -> pd.DataFrame:
    sal = read_xlsx(
        "SAL_2021_AUST.xlsx",
        ["MB_CODE_2021", "SAL_CODE_2021", "SAL_NAME_2021", "STATE_CODE_2021", "AREA_ALBERS_SQKM"],
    )
    sal = sal[(sal["STATE_CODE_2021"] == SA) & ~sal["SAL_CODE_2021"].isin(SPECIAL_SAL)]
    sal = sal.rename(columns={"AREA_ALBERS_SQKM": "AREA"})
    sal["AREA"] = pd.to_numeric(sal["AREA"])
    names = sal.drop_duplicates("SAL_CODE_2021").set_index("SAL_CODE_2021")["SAL_NAME_2021"]
    area = sal.groupby("SAL_CODE_2021")["AREA"].sum()

    lga = read_xlsx("LGA_2021_AUST.xlsx", ["MB_CODE_2021", "LGA_CODE_2021", "LGA_NAME_2021", "STATE_CODE_2021"])
    poa = read_xlsx("POA_2021_AUST.xlsx", ["MB_CODE_2021", "POA_CODE_2021"])
    mb = read_xlsx("MB_2021_AUST.xlsx", ["MB_CODE_2021", "SA1_CODE_2021", "STATE_CODE_2021"])
    ra = read_xlsx("RA_2021_AUST.xlsx", ["SA1_CODE_2021", "RA_CODE_2021", "STATE_CODE_2021"])
    counts = read_mb_counts()

    lga = lga[lga["STATE_CODE_2021"] == SA]
    mb = mb[mb["STATE_CODE_2021"] == SA]
    ra = ra[ra["STATE_CODE_2021"] == SA]
    mb_ra = mb.merge(ra[["SA1_CODE_2021", "RA_CODE_2021"]], on="SA1_CODE_2021", how="left")

    base = sal[["MB_CODE_2021", "SAL_CODE_2021", "AREA"]]
    lga_major = majority(base.merge(lga[["MB_CODE_2021", "LGA_CODE_2021"]], on="MB_CODE_2021"), "LGA_CODE_2021", "lga", counts)
    poa_major = majority(base.merge(poa, on="MB_CODE_2021"), "POA_CODE_2021", "poa", counts)
    ra_major = majority(base.merge(mb_ra[["MB_CODE_2021", "RA_CODE_2021"]], on="MB_CODE_2021"), "RA_CODE_2021", "ra", counts)

    pop = base.merge(counts, on="MB_CODE_2021", how="left").groupby("SAL_CODE_2021").agg(
        pop=("Person", "sum"), dwellings=("Dwelling", "sum")
    )
    lga_names = lga.drop_duplicates("LGA_CODE_2021").set_index("LGA_CODE_2021")["LGA_NAME_2021"]
    seifa = read_seifa().set_index("SAL_CODE_2021")

    df = pd.DataFrame({"name_official": names, "area": area})
    df = df.join(lga_major).join(poa_major).join(ra_major).join(pop).join(seifa, how="left")
    df["council"] = df["LGA_CODE_2021"].map(lga_names)
    df["name"] = df["name_official"].map(clean_name)
    df["pop"] = df["pop"].fillna(0).astype(int)
    df["dwellings"] = df["dwellings"].fillna(0).astype(int)
    unknown_ra = set(df["RA_CODE_2021"].dropna()) - set(RA_NAMES)
    if unknown_ra:
        raise SystemExit(f"unexpected RA codes {unknown_ra}")
    return df.sort_index()


def compare(df: pd.DataFrame) -> dict:
    """Diff the 2025 table against the rebuilt one."""
    orig = pd.read_csv(ORIGINAL_CSV)
    orig = orig.dropna(subset=["Suburb"])
    orig["Suburb"] = orig["Suburb"].str.upper()
    orig["postcode4"] = orig["Postcode"].astype(int).astype(str).str.zfill(4)

    by_name = df.reset_index().drop_duplicates("name").set_index("name")
    matched = orig[orig["Suburb"].isin(by_name.index)].copy()
    only_orig = orig[~orig["Suburb"].isin(by_name.index)]
    only_new = by_name[~by_name.index.isin(orig["Suburb"])]

    m = matched.join(by_name, on="Suburb")
    postcode_exact = int((m["postcode4"] == m["POA_CODE_2021"]).sum())
    postcode_any = int(sum(p in alls for p, alls in zip(m["postcode4"], m["poa_all"])))

    crosswalk_rows = []
    for council, grp in m.groupby("Council"):
        counts = Counter(grp["council"])
        best, n = counts.most_common(1)[0]
        crosswalk_rows.append(
            {"original": council, "rebuilt": best, "agree": n, "suburbs": int(len(grp))}
        )
    crosswalk_rows.sort(key=lambda r: (-r["suburbs"], r["original"]))
    council_agree = sum(r["agree"] for r in crosswalk_rows)

    ra_label = m["RA_CODE_2021"].map(RA_NAMES)
    confusion: dict[str, dict[str, int]] = {}
    for o, n in zip(m["Remoteness Level"], ra_label):
        confusion.setdefault(o, {}).setdefault(n, 0)
        confusion[o][n] += 1
    na_rows = m[m["Remoteness Level"] == "Not Applicable"]

    examples = []
    for sub in ["ADELAIDE", "AMATA", "KRONDORF", "PARNDANA", "MOUNT GAMBIER", "COOBER PEDY", "WHYALLA", "STEWART RANGE"]:
        if sub in m["Suburb"].values:
            r = m[m["Suburb"] == sub].iloc[0]
            examples.append(
                {
                    "suburb": sub,
                    "original": {
                        "postcode": str(int(r["Postcode"])),
                        "council": r["Council"],
                        "ses": int(r["SocioEconomicStatus"]),
                        "remoteness": r["Remoteness Level"],
                    },
                    "rebuilt": {
                        "postcode": r["POA_CODE_2021"],
                        "council": r["council"],
                        "decileSa": None if pd.isna(r["decile_sa"]) else int(r["decile_sa"]),
                        "remoteness": RA_NAMES[r["RA_CODE_2021"]],
                    },
                }
            )

    return {
        "original": {
            "rows": int(len(orig)),
            "councils": int(orig["Council"].nunique()),
            "sesValues": {str(k): int(v) for k, v in orig["SocioEconomicStatus"].value_counts().items()},
            "remoteness": {k: int(v) for k, v in orig["Remoteness Level"].value_counts().items()},
            "postcodesMissingZero": int((orig["Postcode"].astype(int) < 1000).sum()),
            "postcodesMissingZeroExample": sorted(
                orig.loc[orig["Postcode"].astype(int) < 1000, "Suburb"].tolist()
            )[:6],
        },
        "rebuilt": {
            "rows": int(len(df)),
            "councils": int(df["council"].nunique()),
            "withSeifa": int(df["decile_sa"].notna().sum()),
            "remoteness": {RA_NAMES[k]: int(v) for k, v in df["RA_CODE_2021"].value_counts().sort_index().items()},
            "population": int(df["pop"].sum()),
        },
        "match": {
            "byName": int(len(matched)),
            "onlyOriginal": int(len(only_orig)),
            "onlyOriginalSample": sorted(only_orig["Suburb"].tolist())[:24],
            "onlyRebuilt": int(len(only_new)),
            "onlyRebuiltSample": sorted(only_new.index.tolist())[:24],
            "postcodeExact": postcode_exact,
            "postcodeAnyOverlap": postcode_any,
            "councilAgree": int(council_agree),
            "notApplicableResolved": {
                RA_NAMES[k]: int(v)
                for k, v in na_rows["RA_CODE_2021"].value_counts().sort_index().items()
            },
        },
        "councilCrosswalk": crosswalk_rows,
        "remotenessConfusion": confusion,
        "examples": examples,
    }


# Not a place anyone lives: the ABS bucket for land outside every suburb/locality.
NON_ADDRESSABLE = {"SA REMAINDER"}
ORIGINAL_RA_INDEX = {
    "Major Cities of Australia": 0,
    "Inner Regional Australia": 1,
    "Outer Regional Australia": 2,
    "Remote Australia": 3,
    "Very Remote Australia": 4,
    "Not Applicable": 5,
}


def annotate_geojson(df: pd.DataFrame) -> None:
    """Attach the few attributes the map styles on (code, name, RA, deciles, original RA)."""
    path = OUT / "sal-sa.geojson"
    gj = json.loads(path.read_text())
    orig = pd.read_csv(ORIGINAL_CSV).dropna(subset=["Suburb"])
    orig_ra = dict(zip(orig["Suburb"].str.upper(), orig["Remoteness Level"]))
    for feat in gj["features"]:
        code = str(feat["properties"]["c"])
        r = df.loc[code]
        o = orig_ra.get(r["name"])
        feat["properties"] = {
            "c": code,
            "n": r["name_official"],
            "ra": int(r["RA_CODE_2021"]) - 40,
            "d": None if pd.isna(r["decile_sa"]) else int(r["decile_sa"]),
            "o": None if o is None else ORIGINAL_RA_INDEX[o],
        }
    gj.pop("bbox", None)
    path.write_text(json.dumps(gj, separators=(",", ":"), ensure_ascii=False))


def write_outputs(df: pd.DataFrame, labels: dict[str, list[float]], diff: dict) -> None:
    rows = []
    for code, r in df.iterrows():
        if code not in labels:
            raise SystemExit(f"SAL {code} has no simplified geometry")
        rows.append(
            {
                "code": code,
                "name": r["name"],
                "official": r["name_official"],
                "postcode": r["POA_CODE_2021"],
                "postcodes": sorted(set(r["poa_all"])),
                "council": r["council"],
                "lgaCode": r["LGA_CODE_2021"],
                "ra": int(r["RA_CODE_2021"]) - 40,
                "raShare": float(r["ra_share"]),
                "decileSa": None if pd.isna(r["decile_sa"]) else int(r["decile_sa"]),
                "decileAus": None if pd.isna(r["decile_aus"]) else int(r["decile_aus"]),
                "irsad": None if pd.isna(r["irsad"]) else round(float(r["irsad"]), 1),
                "pop": int(r["pop"]),
                "areaKm2": round(float(r["area"]), 3),
                "label": labels[code],
                "addressable": r["name"] not in NON_ADDRESSABLE,
            }
        )
    meta = {
        "generated": date.today().isoformat(),
        "method": (
            "One row per 2021 ABS Suburb and Locality (SAL) in South Australia. Postcode, council and "
            "remoteness area are the ABS Postal Area, LGA and Remoteness Area holding the largest share "
            "of the SAL's 2021 usual residents (mesh block allocation, area breaks ties). SEIFA is the 2021 "
            "IRSAD decile; decileSa ranks SALs within South Australia. pop is the 2021 Census usual resident count."
        ),
        "raNames": list(RA_NAMES.values()),
        "licence": "Contains ABS data, Commonwealth of Australia, CC BY 4.0",
    }
    (OUT / "suburbs.json").write_text(
        json.dumps({"meta": meta, "rows": rows}, separators=(",", ":"), ensure_ascii=False)
    )

    orig = pd.read_csv(ORIGINAL_CSV)
    original_rows = [
        [r["Suburb"], int(r["Postcode"]), r["Council"], int(r["SocioEconomicStatus"]), r["Remoteness Level"]]
        for _, r in orig.iterrows()
    ]
    (OUT / "original-suburbs.json").write_text(
        json.dumps(
            {
                "columns": ["Suburb", "Postcode", "Council", "SocioEconomicStatus", "Remoteness Level"],
                "source": "original/data/sa_suburbs_data.csv (2025, source not recorded), row order preserved",
                "rows": original_rows,
            },
            separators=(",", ":"),
        )
    )

    provenance = {
        "generated": date.today().isoformat(),
        "sources": [
            {"file": k, "title": v["title"], "url": v["url"], "publisher": "Australian Bureau of Statistics", "licence": "CC BY 4.0"}
            for k, v in SOURCES.items()
        ],
        "tools": {
            "mapshaper": MAPSHAPER[-1],
            "salSimplify": SAL_SIMPLIFY,
            "steSimplify": STE_SIMPLIFY,
            "precision": "0.0001 degrees (about 11 m)",
        },
        **diff,
    }
    (OUT / "provenance.json").write_text(json.dumps(provenance, indent=1, ensure_ascii=False))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--offline", action="store_true", help="use scripts/.cache only")
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    download(args.offline)
    df = build()
    run_mapshaper()
    labels = label_points()
    diff = compare(df)
    write_outputs(df, labels, diff)
    annotate_geojson(df)
    for f in sorted(OUT.glob("*.json")) + sorted(OUT.glob("*.geojson")):
        log(f"wrote {f.relative_to(ROOT)} ({f.stat().st_size / 1024:.0f} KiB)")


if __name__ == "__main__":
    main()
