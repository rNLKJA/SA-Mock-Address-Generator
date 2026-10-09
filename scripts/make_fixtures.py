# /// script
# requires-python = ">=3.12"
# dependencies = [
#   "pandas>=2.2",
#   "numpy>=1.26",
#   "requests>=2.31",
#   "python-dotenv>=1.0",
#   "scipy>=1.13",
#   "statsmodels>=0.14",
# ]
# ///
"""Record reference outputs from the ORIGINAL Python code for the web app's parity tests.

Writes:
  web/src/lib/__fixtures__/original-parity.json  RNG streams, generator output and
                                                 CLI stdout from original/ (seeded)
  web/src/lib/__fixtures__/stats-reference.json  SciPy / statsmodels reference values
                                                 for the chi-square and Wilson code

Run from the repo root:
    uv run scripts/make_fixtures.py
"""

from __future__ import annotations

import io
import json
import os
import platform
import random
import subprocess
import sys
from contextlib import redirect_stdout
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats
from statsmodels.stats.proportion import proportion_confint

ROOT = Path(__file__).resolve().parent.parent
ORIGINAL = ROOT / "original"
OUT = ROOT / "web" / "src" / "lib" / "__fixtures__"


def to_py(value):
    return value.item() if hasattr(value, "item") else value


def rng_reference() -> dict:
    py = []
    for seed in [0, 1, 42, 2025, 2**32 + 5, 123456789012]:
        r = random.Random(seed)
        bits = [r.getrandbits(32) for _ in range(6)]
        r = random.Random(seed)
        ints = [r.randint(1, 999) for _ in range(6)]
        r = random.Random(seed)
        picks = [r.randrange(49) for _ in range(6)]
        r = random.Random(seed)
        floats = [r.random() for _ in range(4)]
        py.append({"seed": seed, "getrandbits32": bits, "randint1to999": ints, "randbelow49": picks, "random": floats})
    npy = []
    for seed in [0, 1, 42, 2025, 4294967295]:
        rs = np.random.RandomState(seed)
        raw = [int(x) for x in rs._bit_generator.random_raw(6)]
        rs = np.random.RandomState(seed)
        perm = [int(x) for x in rs.permutation(10)]
        rs = np.random.RandomState(seed)
        choice = [int(rs.choice(1894, size=1, replace=False)[0]) for _ in range(5)]
        npy.append({"seed": seed, "uint32": raw, "permutation10": perm, "choice1894": choice})
    return {"python": py, "numpy": npy}


def generator_reference() -> list[dict]:
    os.chdir(ORIGINAL)
    sys.path.insert(0, str(ORIGINAL))
    for var in ("MAPBOX_API_KEY", "MAPBOX_ACCESS_TOKEN"):
        os.environ.pop(var, None)
    from sa_address_lookup import SAAddressLookup  # noqa: E402

    with redirect_stdout(io.StringIO()):
        lookup = SAAddressLookup()
    cases = [
        (42, "default", None, 6),
        (7, "suburb", "adelaide", 3),
        (11, "council", "CITY OF MARION", 4),
        (3, "remoteness", "Very Remote Australia", 4),
        (5, "remoteness", "Not Applicable", 3),
        (9, "socioeconomic", "5", 3),
        (13, "socioeconomic", "0", 3),
        (21, "suburb", "NOWHERE", 3),
        (2025, "council", "PASTORAL UNINCORPORATED AREA", 5),
    ]
    out = []
    for seed, dtype, dvalue, count in cases:
        random.seed(seed)
        np.random.seed(seed)
        addresses = []
        for _ in range(count):
            a = lookup.generate_random_address(distribution_type=dtype, distribution_value=dvalue)
            addresses.append({k: to_py(v) for k, v in a.items()})
        out.append({"seed": seed, "type": dtype, "value": dvalue, "addresses": addresses})
    options = lookup.get_available_options()
    out_options = {k: [to_py(x) for x in v] for k, v in options.items()}
    return out, {"counts": {k: len(v) for k, v in out_options.items()}, "head": {k: v[:5] for k, v in out_options.items()}, "remoteness_levels": out_options["remoteness_levels"], "socioeconomic_levels": out_options["socioeconomic_levels"]}


def cli_reference() -> list[dict]:
    cases = [
        (42, ["generate", "3"]),
        (7, ["--format", "json", "generate", "2", "--suburb", "ADELAIDE"]),
        (11, ["--format", "csv", "generate", "4", "--remoteness", "Very Remote Australia"]),
        (3, ["generate", "1", "--socioeconomic", "5"]),
        (4, ["generate", "2", "--socioeconomic", "0"]),
        (5, ["--format", "csv", "generate", "2", "--council", "city of adelaide"]),
        (9, ["generate", "2", "--suburb", "NOWHERE"]),
        (1, ["--format", "json", "generate", "1"]),
        (0, ["generate", "0"]),
    ]
    out = []
    for seed, argv in cases:
        proc = subprocess.run(
            [sys.executable, str(ROOT / "scripts" / "replay_original.py"), "--seed", str(seed), "--", *argv],
            capture_output=True,
            text=True,
            env={k: v for k, v in os.environ.items() if not k.startswith("MAPBOX")},
        )
        out.append({"seed": seed, "argv": argv, "stdout": proc.stdout, "stderr": proc.stderr, "exitCode": proc.returncode})
    # `options` in text and json form (no randomness involved)
    for argv in (["options"], ["--format", "json", "options"]):
        proc = subprocess.run(
            [sys.executable, str(ROOT / "scripts" / "replay_original.py"), "--seed", "0", "--", *argv],
            capture_output=True,
            text=True,
        )
        out.append({"seed": 0, "argv": argv, "stdout": proc.stdout, "stderr": proc.stderr, "exitCode": proc.returncode})
    return out


def stats_reference() -> dict:
    sf = [{"x": x, "df": df, "p": float(stats.chi2.sf(x, df))} for x, df in [(0.5, 1), (3.84, 1), (7.2, 3), (12.0, 4), (25.0, 9), (2.0, 9), (150.0, 4), (0.0, 2), (18.3, 10)]]
    gof = []
    for observed, probs in [
        ([40, 25, 20, 10, 5], [0.4, 0.25, 0.2, 0.1, 0.05]),
        ([400, 250, 210, 90, 50], [0.4, 0.25, 0.2, 0.1, 0.05]),
        ([30, 30, 20, 10, 10], [0.25, 0.2, 0.34, 0.12, 0.09]),
        ([9, 11, 10, 8, 12, 10, 9, 11, 10, 10], [0.1] * 10),
    ]:
        n = sum(observed)
        expected = [p * n for p in probs]
        res = stats.chisquare(observed, expected)
        gof.append({"observed": observed, "probs": probs, "statistic": float(res.statistic), "p": float(res.pvalue), "df": len(observed) - 1})
    wilson = []
    for k, n in [(0, 10), (3, 10), (40, 100), (100, 100), (1, 5000), (2000, 5000), (17, 23)]:
        lo, hi = proportion_confint(k, n, alpha=0.05, method="wilson")
        wilson.append({"k": k, "n": n, "lo": float(lo), "hi": float(hi)})
    return {"chi2sf": sf, "gof": gof, "wilson95": wilson}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    rng = rng_reference()
    stats_ref = stats_reference()
    cli = cli_reference()
    generate, options = generator_reference()
    meta = {
        "python": platform.python_version(),
        "pandas": pd.__version__,
        "numpy": np.__version__,
        "note": "Recorded by scripts/make_fixtures.py from original/ (unchanged 2025 code). Seeds both random and numpy.random.",
    }
    (OUT / "original-parity.json").write_text(
        json.dumps({"meta": meta, "rng": rng, "generate": generate, "options": options, "cli": cli}, indent=1) + "\n"
    )
    (OUT / "stats-reference.json").write_text(json.dumps({"meta": {"scipy": __import__("scipy").__version__}, **stats_ref}, indent=1) + "\n")
    print(f"wrote {OUT}/original-parity.json and stats-reference.json")


if __name__ == "__main__":
    main()
