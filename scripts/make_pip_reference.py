# /// script
# requires-python = ">=3.12"
# dependencies = [
#   "numpy>=1.26",
#   "shapely>=2.0",
# ]
# ///
"""Record Shapely (GEOS) point-in-polygon answers for the web app's lookup.

The point-in-polygon validation on /sampling looks every generated point up
again against all 1,696 SAL boundaries, but it does so with the same
ray-casting routine (web/src/lib/geo.ts) the sampler used to accept the
point. This script checks that routine against code it shares nothing with:
Shapely's GEOS predicates over the same simplified boundaries.

Two seeded sets of points:
  - uniform: points drawn uniformly over South Australia's bounding box
    (most fall in a suburb, some offshore or interstate, which must give no
    suburb);
  - near_edge: points 1e-6 degrees (about 10 cm) either side of the midpoint
    of a randomly chosen boundary edge, where an off-by-one in the crossing
    rule or a ring-orientation bug would show.

For each point the fixture lists every SAL code whose polygon contains it
(GEOS `contains`, so a point exactly on an edge belongs to no polygon; none
of these points is on an edge). The TypeScript test asserts that
GeometryIndex.locate agrees on every point.

Writes web/src/lib/__fixtures__/pip-reference.json, read by
web/src/lib/sampling/pip.reference.test.ts. Run from the repo root:
    uv run scripts/make_pip_reference.py
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import shapely
from shapely.geometry import shape

ROOT = Path(__file__).resolve().parents[1]
GEOJSON = ROOT / "web" / "public" / "data" / "sal-sa.geojson"
OUT = ROOT / "web" / "src" / "lib" / "__fixtures__" / "pip-reference.json"

SEED = 2025
SA_BBOX = (128.9, -38.2, 141.1, -25.9)  # same as SA_BBOX in web/src/lib/geo.ts
N_UNIFORM = 1500
N_EDGES = 750  # two points per edge, one each side
OFFSET = 1e-6  # degrees, about 10 cm


def main() -> None:
    fc = json.loads(GEOJSON.read_text())
    codes = [str(f["properties"]["c"]) for f in fc["features"]]
    geoms = [shape(f["geometry"]) for f in fc["features"]]
    tree = shapely.STRtree(geoms)
    rng = np.random.default_rng(SEED)

    lo_x, lo_y, hi_x, hi_y = SA_BBOX
    uniform = np.column_stack(
        [rng.uniform(lo_x, hi_x, N_UNIFORM), rng.uniform(lo_y, hi_y, N_UNIFORM)]
    )

    # Every edge of every ring (shared edges appear once per polygon).
    edges = []
    for f in fc["features"]:
        g = f["geometry"]
        polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        for poly in polys:
            for ring in poly:
                for a, b in zip(ring[:-1], ring[1:]):
                    if a != b:
                        edges.append((a, b))
    picked = rng.choice(len(edges), size=N_EDGES, replace=False)
    near = []
    for i in picked:
        (ax, ay), (bx, by) = edges[i]
        mx, my = (ax + bx) / 2, (ay + by) / 2
        length = float(np.hypot(bx - ax, by - ay))
        nx, ny = -(by - ay) / length, (bx - ax) / length
        near.append((mx + OFFSET * nx, my + OFFSET * ny))
        near.append((mx - OFFSET * nx, my - OFFSET * ny))
    near = np.array(near)

    def containing(points: np.ndarray) -> list[list[str]]:
        pts = shapely.points(points)
        hits = tree.query(pts, predicate="within")  # point within polygon
        out: list[list[str]] = [[] for _ in range(len(points))]
        for p, g in zip(*hits):
            out[int(p)].append(codes[int(g)])
        return [sorted(c) for c in out]

    def records(points: np.ndarray) -> list:
        # Round-trip exact: Python's repr of a float parses to the same double in JS.
        return [
            [float(x), float(y), c] for (x, y), c in zip(points.tolist(), containing(points))
        ]

    uniform_rec = records(uniform)
    near_rec = records(near)
    payload = {
        "generated_by": "scripts/make_pip_reference.py",
        "shapely": shapely.__version__,
        "geos": shapely.geos_version_string,
        "seed": SEED,
        "bbox": list(SA_BBOX),
        "offset_degrees": OFFSET,
        "summary": {
            "uniform": {
                "points": len(uniform_rec),
                "in_a_suburb": sum(1 for r in uniform_rec if r[2]),
                "in_two_or_more": sum(1 for r in uniform_rec if len(r[2]) > 1),
            },
            "near_edge": {
                "points": len(near_rec),
                "in_a_suburb": sum(1 for r in near_rec if r[2]),
                "in_two_or_more": sum(1 for r in near_rec if len(r[2]) > 1),
            },
        },
        "uniform": uniform_rec,
        "near_edge": near_rec,
    }
    OUT.write_text(json.dumps(payload, separators=(",", ":")) + "\n")
    print(json.dumps(payload["summary"], indent=2))
    print(f"wrote {OUT.relative_to(ROOT)} (Shapely {shapely.__version__}, GEOS {shapely.geos_version_string})")


if __name__ == "__main__":
    main()
