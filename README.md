<div align="center">

# SA Mock Address Lab

Mock South Australian addresses for software testing, with the receipts: a seeded
generator, a check that each sample hits its target mix, a suburb map, a real-address
lookup, and a byte-for-byte replay of the 2025 Python tool it grew out of.

**Live demo:** [sa-mock-address-generator.vercel.app](https://sa-mock-address-generator.vercel.app)

[![CI](https://github.com/rNLKJA/SA-Mock-Address-Generator/actions/workflows/ci.yml/badge.svg)](https://github.com/rNLKJA/SA-Mock-Address-Generator/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

## Overview

In August 2025 I wrote a small Python CLI that produced mock South Australian
addresses (`12 King Street, ADELAIDE SA 5000`) with a suburb, postcode, council,
remoteness level and socio-economic band. Porting it to the web in 2026 surfaced
four problems the README never mentioned:

| Finding in the 2025 code and data | What the revival does |
| --- | --- |
| The remoteness and socio-economic weights in `config.py` were never applied (the import was commented out), so every suburb was equally likely. | Keeps "uniform" as the faithful mode, and adds the promised remoteness and SEIFA weighting plus population weighting. |
| `SocioEconomicStatus` was `0` in all 1,894 rows, so `--socioeconomic 1..5` silently fell back to the whole state. | Uses the ABS SEIFA 2021 IRSAD decile for 1,613 suburbs. |
| 997 rows had the remoteness level "Not Applicable". | Assigns every suburb an ABS 2021 Remoteness Area. |
| 19 postcodes lost their leading zero (`872`, not `0872`). | Uses four-digit ABS Postal Areas. |

Every output is stamped **`MOCK: synthetic test data`**. A generated address can
coincide with a real one by chance, so never use it for mail, identity checks, or
paired with a person's name.

## Features

- **Generator** (`/generate`): up to 5,000 addresses from a seed, filtered by suburb,
  council, remoteness area or SEIFA decile, weighted uniformly (as built in 2025), by
  the `config.py` remoteness or socio-economic weights, or by population. Coordinates
  are sampled inside the real suburb boundary. Runs client-side in a Web Worker; export
  as text, JSON or CSV.
- **Did the sample hit the target?**: realised shares with 95% Wilson intervals and a
  chi-square goodness-of-fit test, against the mode's own target or the README's
  promise.
- **Atlas** (`/map`): all 1,695 suburbs and localities on MapLibre + OpenFreeMap, shaded by
  remoteness, SEIFA decile, or the 2025 table's remoteness column. Falls back to a
  bundled outline basemap if tiles fail.
- **Lookup** (`/lookup`): search a real place with Photon (through a cached,
  rate-limited route handler), then find its suburb, postcode, council, remoteness and
  decile by point-in-polygon in the browser. Clicking the map works even offline.
- **2025 replay** (`/replay`): `cli.py generate` and `cli.py options` ported line by
  line, bugs included. Python's `random` and NumPy's legacy Mersenne Twister are
  reimplemented, so a seed prints the same bytes as the real Python.
- **Provenance** (`/data`): the 2025 table against the ABS rebuild, with every source
  and licence.

## Key results

- The TypeScript port reproduces **20 of 20** recorded runs of the original Python
  (11 CLI invocations, 9 generator calls) exactly; this is checked in CI.
- Of the 1,894 names in the 2025 table, 1,694 match an ABS suburb; of those, **99.3%**
  agree on the postcode and **98.2%** on the council once names are crosswalked.
- With the `config.py` remoteness weights, a 2,000-address sample (seed 2025) gives
  χ²(4) = 2.86, p = 0.58 against the target; the 2025 uniform generator gives
  χ²(4) = 497, p < 0.001 against the same target.
- All boundary geometry is about 0.5 MB gzipped. No API keys anywhere.

## Tech stack

| Layer | 2025 original | 2026 revival |
| --- | --- | --- |
| Language | Python 3.8+, pandas | TypeScript (strict); Python only for data builds |
| App | argparse CLI | Next.js 16 (App Router, Cache Components), React 19 |
| UI | none | Tailwind CSS v4, shadcn/ui (Radix), lucide-react, next-themes |
| Maps | none | MapLibre GL JS 6 + OpenFreeMap tiles, bundled GeoJSON fallback |
| Geocoding | Mapbox Geocoding v5 (key) | Photon (free, keyless), local point-in-polygon |
| Data | CSV, source not recorded | ABS ASGS 2021, Census 2021 mesh blocks, SEIFA 2021 |
| Tests | none | Vitest unit and parity tests; GitHub Actions CI |

## Repository structure

```
SA-Mock-Address-Generator/
├── README.md
├── LICENSE                  MIT
├── .github/workflows/ci.yml lint, format, typecheck, test, build (web/)
├── original/                the 2025 Python tool, unchanged (git mv, history kept)
│   ├── README.md            what is inside and how to run it
│   ├── cli.py, sa_address_lookup.py, config.py, sa_address, example_usage.py
│   ├── data/                sa_suburbs_data.csv and other original files
│   └── README-2025.md, _archive/
├── scripts/                 reproducible Python (uv, PEP 723)
│   ├── build_data.py        ABS downloads -> web/public/data/*
│   ├── make_fixtures.py     records Python output for the parity tests
│   └── replay_original.py   runs original/cli.py with both RNGs seeded
└── web/                     the Next.js app (Vercel root)
    ├── public/data/         suburbs.json, sal-sa.geojson, sa-context.geojson,
    │                        original-suburbs.json, provenance.json
    └── src/
        ├── app/             /, /generate, /map, /lookup, /replay, /data, /api/geocode
        ├── components/      ui/ (shadcn), layout/, common/, generate/, map/, lookup/, replay/
        ├── lib/             rng/, original/, generator/, geo, stats, photon (+ tests)
        ├── hooks/           worker and data-loading hooks
        └── workers/         generator Web Worker
```

## Local development

Requirements: Node 20+ and pnpm 10 (`corepack enable`).

```bash
cd web
pnpm install          # also copies the MapLibre worker into public/vendor/
pnpm dev              # http://localhost:3000
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build
```

No environment variables are needed. The site is static apart from `/api/geocode`,
which proxies Photon with a polite User-Agent, a one-day cache and a per-IP rate limit.

There is no database and nothing is stored: the tool only reads data, so there are no
records to browse. The reference data the site uses is plain JSON in
`web/public/data/`, readable in any editor or straight from the live site (for
example `/data/suburbs.json`). The 2025 table is `original/data/sa_suburbs_data.csv`.

### Deployment

Production is the Vercel project `sa-mock-address-generator`, deployed from `web/`
(Next.js defaults, no environment variables):

```bash
cd web
vercel link --yes --project sa-mock-address-generator
vercel deploy --prod --yes
```

## How the data artefacts are generated

Everything in `web/public/data/` is produced by
[`scripts/build_data.py`](scripts/build_data.py) from Australian Bureau of Statistics
open data (CC BY 4.0, direct downloads, no login):

- ASGS Edition 3 allocation files (mesh block to SAL, LGA, POA and SA1; SA1 to
  Remoteness Area) and the SAL and state boundaries (GDA2020);
- Census 2021 mesh block counts (usual residents);
- SEIFA 2021 Suburbs and Localities (IRSAD).

Each suburb gets the postcode, council and remoteness area holding most of its
residents. Boundaries are simplified with mapshaper (10% of removable vertices,
shared edges preserved, 0.0001° precision). The script also diffs the rebuild
against `original/data/sa_suburbs_data.csv` into `provenance.json`.

```bash
uv run scripts/build_data.py           # downloads ~235 MB into scripts/.cache/ (ignored)
uv run scripts/make_fixtures.py        # re-records the Python parity fixtures
uv run scripts/replay_original.py --seed 42 -- --format json generate 3
```

`build_data.py` needs `pnpm` on the PATH for `pnpm dlx mapshaper`.

## Credits

- Original tool and revival: [Sunchuangyu (Rin) Huang](https://github.com/rNLKJA).
- Suburbs, boundaries, remoteness, SEIFA and population: Australian Bureau of
  Statistics, © Commonwealth of Australia, CC BY 4.0.
- Basemap: [OpenFreeMap](https://openfreemap.org) (OpenMapTiles schema),
  © OpenStreetMap contributors (ODbL).
- Geocoding: [Photon](https://photon.komoot.io) by komoot, © OpenStreetMap
  contributors (ODbL).

## Provenance note

This is a personal project, not university coursework. The 2025 code, data and
README are preserved unchanged in [`original/`](original/) with their git history.
The website is a rewrite: its generator is a faithful port of that code (verified
against recorded Python output), and its suburb data is rebuilt from ABS open data.
`original/data/regional_coastal_addresses_1.9k.csv` holds stored results from the
Mapbox Geocoding API; it is kept only as a historical record of the 2025 tool and is
never read or served by the site.

## License

[MIT](LICENSE) © 2025-2026 Sunchuangyu Huang. Data licences as listed above.
