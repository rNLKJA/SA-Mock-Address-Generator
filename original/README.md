# Original 2025 Python tool

This folder holds the original **SA Mock Address Generator** exactly as it was
written in August 2025. The files were moved here with `git mv` during the 2026
revival, so their history is preserved and their contents are unchanged. The
revived web app lives in [`../web`](../web), and the scripts that rebuild its
data live in [`../scripts`](../scripts).

## What is inside

| Path | What it is |
| --- | --- |
| `sa_address_lookup.py` | `SAAddressLookup`: loads the suburb table, generates random addresses, and looks up real addresses through the Mapbox Geocoding v5 API |
| `cli.py` | Command-line interface: `generate`, `lookup` and `options`, with `default`, `json` and `csv` output |
| `sa_address` | Small wrapper so the CLI runs as `./sa_address ...` |
| `config.py` | Mapbox key loading plus `DEFAULT_REMOTENESS_WEIGHTS` and `DEFAULT_SOCIOECONOMIC_WEIGHTS` (note: never imported by the generator, see below) |
| `example_usage.py` | Walk-through of every generation mode |
| `requirements.txt`, `pyproject.toml`, `env.example` | Original environment files (black/isort config, Mapbox key template) |
| `README-2025.md` | The README as it stood before the revival |
| `_archive/README.original.md` | An earlier, longer README |
| `data/sa_suburbs_data.csv` | The 1,894-row suburb reference table used by the generator |
| `data/regional_coastal_addresses_1.9k.csv` | Stored Mapbox geocoding results (see the licensing note below) |
| `data/sample_results.xlsx`, `data/~$sample_results.xlsx` | A sample results workbook and an Excel lock file that was committed by accident |

## How to run it

Generation needs no API key. From this folder:

```bash
cd original
uv run --no-project --with pandas --with requests --with python-dotenv cli.py generate 3
uv run --no-project --with pandas --with requests --with python-dotenv cli.py --format json generate 2 --suburb ADELAIDE
uv run --no-project --with pandas --with requests --with python-dotenv cli.py options
```

(`--no-project` stops uv from treating the black/isort `pyproject.toml` as a
project. Plain `pip install pandas requests python-dotenv` works too.)

`lookup` and generated coordinates call Mapbox and need a `MAPBOX_API_KEY`. The
revived site replaces both with free, key-less services (Photon for lookup, and
points sampled inside ABS suburb boundaries for coordinates).

To reproduce a run of the original byte for byte, seed both of its random
number generators with [`../scripts/replay_original.py`](../scripts/replay_original.py):

```bash
uv run scripts/replay_original.py --seed 42 -- --format json generate 3
```

The web app's **Original replay** page runs a TypeScript port of this code that
produces the same output for the same seed.

## Known issues found during the revival

These are documented rather than fixed, so the original stays a faithful record.

1. The README promised weighting by remoteness and socio-economic status, but
   the `config.py` import is commented out and the weights are never applied.
   Every suburb that passes the (single) filter is equally likely.
2. `SocioEconomicStatus` is `0` for all 1,894 rows, so `--socioeconomic 1..5`
   matches nothing and silently falls back to every suburb.
3. 997 rows have the remoteness level `Not Applicable`.
4. 19 Northern Territory border postcodes lost their leading zero (`872`
   instead of `0872`).
5. The street names are a fixed list of 49 Adelaide CBD and inner-suburb
   streets, used for every suburb in the state.
6. `data/regional_coastal_addresses_1.9k.csv` has 1,000 rows (not 1.9k), is
   mostly Major Cities rather than regional or coastal, and in about half of
   the rows the geocoded address sits in a different suburb from the claimed
   one. It stores Mapbox geocoding results, which Mapbox's terms do not allow
   to be stored or redistributed, so the revived site never reads or serves it.
