# /// script
# requires-python = ">=3.12"
# dependencies = [
#   "pandas>=2.2",
#   "numpy>=1.26",
#   "requests>=2.31",
#   "python-dotenv>=1.0",
# ]
# ///
"""Run the original 2025 CLI with both of its random number generators seeded.

The original tool never seeds anything, so two runs never match. It draws the
suburb with pandas `DataFrame.sample` (NumPy's global legacy RandomState) and
the street number and street name with Python's `random` module. Seeding both
with the same integer makes a run reproducible, which is how the web app's
Original replay page is checked: its TypeScript port prints the same bytes for
the same seed.

Usage (from the repo root):
    uv run scripts/replay_original.py --seed 42 -- generate 3
    uv run scripts/replay_original.py --seed 7 -- --format json generate 2 --suburb ADELAIDE

Everything after `--` is passed to original/cli.py unchanged. MAPBOX_API_KEY is
removed from the environment so the run matches the key-less web replay.
"""

from __future__ import annotations

import argparse
import os
import random
import runpy
import sys
from pathlib import Path

import numpy as np

ORIGINAL = Path(__file__).resolve().parent.parent / "original"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--seed", type=int, required=True, help="integer in [0, 2**32 - 1]")
    ap.add_argument("cli_args", nargs=argparse.REMAINDER, help="arguments for original/cli.py")
    args = ap.parse_args()
    cli_args = args.cli_args[1:] if args.cli_args[:1] == ["--"] else args.cli_args

    for var in ("MAPBOX_API_KEY", "MAPBOX_ACCESS_TOKEN"):
        os.environ.pop(var, None)
    os.chdir(ORIGINAL)  # the original resolves data/sa_suburbs_data.csv relative to cwd
    sys.path.insert(0, str(ORIGINAL))

    random.seed(args.seed)
    np.random.seed(args.seed)
    sys.argv = ["cli.py", *cli_args]
    runpy.run_path(str(ORIGINAL / "cli.py"), run_name="__main__")


if __name__ == "__main__":
    main()
