<div align="center">

# SA Mock Address Lab

Mock South Australian addresses for software testing, with the receipts: a seeded
generator with three sampling designs, statistical checks that each sample hits its
target mix, spatial checks on every coordinate, a suburb map, a real-address lookup, an
optional bring-your-own-key AI assistant with an audit log, and a byte-for-byte replay
of the 2025 Python tool it grew out of.

**Live demo:** [sa-mock-address-generator.vercel.app](https://sa-mock-address-generator.vercel.app)

[![CI](https://github.com/rNLKJA/SA-Mock-Address-Generator/actions/workflows/ci.yml/badge.svg)](https://github.com/rNLKJA/SA-Mock-Address-Generator/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

## Showcase

![Generate a test set: 200 seeded mock addresses weighted by remoteness, mapped inside their suburbs and downloaded as CSV](docs/showcase/generate-a-test-set.gif)

**[Take the guided tour](https://sa-mock-address-generator.vercel.app/tour)**: three captioned walkthrough videos and every screenshot below, recorded from the live site by a reproducible Playwright script (`cd web && pnpm showcase`) that also checks each step it shows.

| | |
| --- | --- |
| ![Landing page](docs/showcase/01-landing-light.png)<br>**Landing page.** Mock addresses with the receipts: a seeded specimen sheet and the features. | ![Landing page, dark mode](docs/showcase/02-landing-dark.png)<br>**Landing page, dark mode.** The same page in dark mode. |
| ![Generator](docs/showcase/03-generate-results.png)<br>**Generator.** 200 addresses, remoteness weights, seed 2025: settings, MOCK stamp, results. | ![The sample on the map](docs/showcase/04-generate-map.png)<br>**The sample on the map.** Each point drawn inside its suburb's ABS boundary, suburbs shaded by remoteness. |
| ![Did the sample hit the target?](docs/showcase/05-target-check.png)<br>**Did the sample hit the target?** Realised shares with 95% Wilson intervals, the chosen test, n and Cohen's w. | ![Three designs over 200 seeds](docs/showcase/06-sampling-designs.png)<br>**Three designs over 200 seeds.** Uniform, weighted and stratified: rejection rates with their own intervals. |
| ![Sample-size calculator](docs/showcase/07-sample-size.png)<br>**Sample-size calculator.** How many addresses a share, a per-area rate or a zero-failure claim needs. | ![Atlas](docs/showcase/08-atlas.png)<br>**Atlas.** All 1,695 suburbs and localities, shaded by SEIFA decile. |
| ![Lookup](docs/showcase/09-lookup.png)<br>**Lookup.** Photon search, then suburb, postcode, council, remoteness and decile. | ![2025 replay](docs/showcase/10-replay.png)<br>**2025 replay.** The original Python CLI ported line by line: same seed, same bytes. |
| ![Bring your own key](docs/showcase/11-ai-settings.png)<br>**Bring your own key.** AI settings: Anthropic by default, OpenAI optional; the key stays in this browser. | ![Describe a scenario (mocked reply)](docs/showcase/12-ai-proposal-mocked.png)<br>**Describe a scenario (mocked reply).** A mocked proposal for illustration: labelled AI-generated, reviewed field by field. |
| ![AI audit log](docs/showcase/13-ai-log.png)<br>**AI audit log.** Every AI call with input, output, model, latency and your decision; JSON or CSV. | ![Methods](docs/showcase/14-methods.png)<br>**Methods.** Provenance, evaluation design, limitations, decision records and the AI use statement. |
| ![Mobile: landing](docs/showcase/15-mobile-landing.png)<br>**Mobile: landing.** The landing page at 390 px. | ![Mobile: target check](docs/showcase/16-mobile-target-check.png)<br>**Mobile: target check.** The interval chart and the verdict on a phone. |
| ![Mobile: lookup](docs/showcase/17-mobile-lookup.png)<br>**Mobile: lookup.** A lookup result on a phone. | ![Verification Lab](docs/showcase/18-verify.png)<br>**Verification Lab.** The 200-address run regenerated from its seed: every check passes, remoteness mix χ²(4) = 2.77. |

### Workflow walkthrough

#### 1. Generate a test set (`/generate`)

Shown in the GIF at the top of this section. 200 addresses, Remoteness weights (the config.py defaults: 40 / 25 / 20 / 10 / 5%), seed 2025, coordinates on, no filters. The same settings give the same 200 addresses in any browser.

1. Generator: the 2025 recipe on the ABS 2021 suburb table, running in your browser
2. Ask for 200 addresses with the fixed seed 2025: same seed, same list
3. Weight by remoteness: the config.py weights the 2025 README promised but never applied
4. Generate: 200 addresses in a Web Worker, each one stamped MOCK
5. Map: every point is drawn inside its own suburb's ABS boundary
6. Shade the suburbs by remoteness to see where the sample landed
7. Choose CSV and download it: 200 rows with suburb, postcode, council and coordinates

#### 2. Did the sample hit the target? (`/generate`)

![Did the sample hit the target?](docs/showcase/did-the-sample-hit-the-target.gif)

200 addresses, seed 2025: first Remoteness weights, then Uniform (as built in 2025). Pearson chi-square test (every expected count is at least 5), Cohen's w for the effect size.

1. The same test set: 200 addresses, remoteness weights, seed 2025
2. Target check: each area's realised share with a 95% Wilson interval; the dark tick is the target
3. Major Cities: 84 of 200 (42%, 95% CI 35.4% to 48.9%) against a 40% target
4. Pearson chi-square: χ²(4) = 2.77, p = 0.60, Cohen's w = 0.118 (small): on target
5. Now the 2025 behaviour: uniform weighting, the same seed and the same 200
6. Against the README's promised weights: χ²(4) = 74.68, p < 0.001, w = 0.611 (large): off target
7. Show as a table: counts, Wilson intervals, targets and expected counts
8. Over 200 seeds the test rejects the weighted design in 6 (3.0%, 95% CI 1.4% to 6.4%), near its 5% level

#### 3. Look up a real address (`/lookup`)

![Look up a real address](docs/showcase/look-up-a-real-address.gif)

Live Photon results for “Glenelg Jetty” and “Coober Pedy”; the suburb is found locally against the ABS 2021 boundaries, so a map click works without the geocoder.

1. Lookup: search a real South Australian place, or click the map
2. Search “Glenelg Jetty”: Photon (OpenStreetMap) answers through this site's cached route
3. Pick a result: point-in-polygon against the ABS 2021 boundaries, in your browser
4. Glenelg: postcode 5045, Holdfast Bay council, Major Cities, IRSAD decile 8 in SA
5. The jetty sits past the simplified coastline, so the nearest suburb is named, with the distance
6. Coober Pedy, 751 km from the Adelaide GPO: Very Remote Australia, IRSAD decile 1 in SA
7. Click anywhere on the map: the lookup works even when the geocoder is offline

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

The October 2026 upgrade adds the evidence around the generator rather than changing its
recipe: a stratified design, exact and Monte Carlo goodness-of-fit tests, a replicate
study of every design over 200 seeds, point-in-polygon and Clark-Evans checks on the
coordinates, a sample-size calculator, a data card, five decision records, and an
optional AI assistant that proposes settings for a person to review.

## Features

- **Generator** (`/generate`): up to 5,000 addresses from a seed, filtered by suburb,
  council, remoteness area or SEIFA decile, drawn uniformly (as built in 2025), by the
  `config.py` remoteness or socio-economic weights, by population, or **stratified with
  fixed quotas per remoteness area**. Coordinates are sampled inside the real suburb
  boundary. Runs client-side in a Web Worker; export as text, JSON or CSV.
- **Did the sample hit the target?**: realised shares with 95% Wilson intervals and a
  goodness-of-fit test chosen for the sample (exact multinomial when it can be
  enumerated, chi-square when every expected count is at least 5, a seeded Monte Carlo
  p-value otherwise), always with n and Cohen's w. Below 100 addresses a non-rejection
  is reported as "no clear gap" with a power caveat, not as "on target". A stratified
  sample is reported as "fixed by design" instead of tested, and a stratified run too
  small for every area to get a quota says so before and after generating.
- **Verification Lab** (`/verify`): "Verify these results" on `/generate` carries the
  run over (seed, count, design, filters, weights, coordinates), and the lab regenerates
  the identical set with the site's own generator in a Web Worker. Sixteen record-level
  checks run on every row (fields, MOCK marker, SA postcode including the APY Lands'
  0872, suburb, postcode, council, remoteness class and IRSAD decile against the
  reference table, point inside its own SAL boundary and inside South Australia, no
  duplicates), with failing rows listed and downloadable. Set-level checks test the
  remoteness and decile mix against the design's targets (chi-square, df, p-value,
  Cohen's w, per-class Wilson intervals), the spatial spread (mean nearest-neighbour
  distance against re-draws of the same suburbs, plus the classic Clark-Evans ratio
  where one suburb holds 20 or more points, with the limitation stated: it has little
  power when most suburbs hold a single point, so a statewide set with one address per
  suburb on its suburb's centre point can pass), and reproducibility (a second run
  compared byte for byte, with SHA-256). The three
  statistical tests share one 5% false-alarm budget through Holm's adjustment. A CSV in
  the site's export format can be checked too, and an optional live spot check
  reverse-geocodes up to 10 points through `/api/geocode` (off by default, one run a
  minute). The report downloads as Markdown or JSON.
- **Sampling design** (`/sampling`): the three designs through the real generator over
  200 seeds each (spread against multinomial theory, Wilson coverage, the test's
  rejection rate with its own interval); the exact false-alarm rate of the exact and
  chi-square tests at small n; a sample-size calculator (share precision from the exact
  binomial distribution, per-area rates from the Wilson interval, zero-failure
  demonstrations from Clopper-Pearson); point-in-polygon validation of every coordinate;
  and the Clark-Evans nearest-neighbour ratio inside six differently shaped suburbs,
  with two negative controls.
- **Describe a test scenario** (optional AI, bring your own key): describe the test data
  you need and a model proposes generator settings as structured output. The proposal
  is validated against a schema and the reference table, labelled AI-generated, and
  applied only field by field after you review it. See [BYOK AI](#optional-ai-bring-your-own-key).
- **AI audit log** (`/ai-log`): every AI call made from your browser, with input,
  output, model, latency, token usage, failed checks and your decision; export as JSON
  or CSV.
- **Methods** (`/methods`): data provenance, method, evaluation design, assumptions,
  limitations, what I'd change, the decision records, the data card and the AI use
  statement.
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
- **Guided tour** (`/tour`): three captioned walkthrough videos (generate a test set,
  check it against its target, look up a real address) with transcripts, and every
  screenshot in a lightbox.

## Key results

- The TypeScript port reproduces **20 of 20** recorded runs of the original Python
  (11 CLI invocations, 9 generator calls) exactly; this is checked in CI.
- Of the 1,894 names in the 2025 table, 1,694 match an ABS suburb; of those, **99.3%**
  agree on the postcode and **98.2%** on the council once names are crosswalked.
- With the `config.py` remoteness weights, a 2,000-address sample (seed 2025) gives
  χ²(4) = 2.86, p = 0.58 against the target; the 2025 uniform generator gives
  χ²(4) = 497, p < 0.001 against the same target.
- Over 200 seeds of 1,000 addresses, the goodness-of-fit test rejects the weighted
  design in 6 (3.0%, 95% CI 1.4% to 6.4%), consistent with its 5% level, and the 95%
  Wilson intervals cover the target in 93.5% to 97% of seeds per area. It rejects the
  uniform design in all 200 (Cohen's w about 0.45).
- Every coordinate lands in the suburb its address names: 5,000 of 5,000 for the
  uniform and population designs and 8,475 of 8,475 in a census of every suburb (95%
  Wilson lower bounds 99.92% and 99.95%). The first run of this check found one point
  in 5,000 that rounding pushed across a boundary; the sampler now rounds before it
  tests. The check shares its point-in-polygon routine with the sampler, so that routine
  is also compared with Shapely (GEOS) on 3,000 seeded points, half of them 10 cm from a
  boundary: they agree on every one.
- Inside suburbs the points are uniform: the edge-corrected Clark-Evans ratio averages
  0.996 to 1.003 over 100 seeds in five single-part suburbs. Kingscote, which has two
  parts, sits at 1.02 and is rejected in 13 of 100 seeds, a known weakness of the
  edge correction that is reported, not hidden.
- The site holds no API keys. All boundary geometry is about 0.5 MB gzipped.

Every number above is checked in CI: the 2025 replay run by run in
`web/src/lib/original/original.test.ts`, the Shapely comparison in
`web/src/lib/sampling/pip.reference.test.ts`, and the rest (including the match rates and
the gzipped size) recomputed in `web/src/lib/sampling/claims.test.ts`.

## Tech stack

| Layer | 2025 original | 2026 revival |
| --- | --- | --- |
| Language | Python 3.8+, pandas | TypeScript (strict); Python only for data builds |
| App | argparse CLI | Next.js 16 (App Router, Cache Components), React 19 |
| UI | none | Tailwind CSS v4, shadcn/ui (Radix), lucide-react, next-themes |
| Maps | none | MapLibre GL JS 6 + OpenFreeMap tiles, bundled GeoJSON fallback |
| Geocoding | Mapbox Geocoding v5 (key) | Photon (free, keyless), local point-in-polygon |
| Data | CSV, source not recorded | ABS ASGS 2021, Census 2021 mesh blocks, SEIFA 2021 |
| Statistics | none | `web/src/lib/stats`: Wilson, exact multinomial, Monte Carlo and chi-square tests, exact binomial and Wilson sample sizes, bootstrap, Clark-Evans, checked against SciPy |
| AI | none | Optional, bring your own key (Anthropic or OpenAI), called from the browser, zod-validated, audit-logged in IndexedDB |
| Tests | none | Vitest unit, parity, SciPy-reference and claims tests; GitHub Actions CI |

## Repository structure

```
SA-Mock-Address-Generator/
├── README.md
├── LICENSE                  MIT
├── .github/workflows/ci.yml lint, format, typecheck, test, build (web/)
├── docs/                    data-card.md, decisions/DR-001..005 (rendered on /methods),
│                            showcase/ (README screenshots and GIFs)
├── original/                the 2025 Python tool, unchanged (git mv, history kept)
│   ├── README.md            what is inside and how to run it
│   ├── cli.py, sa_address_lookup.py, config.py, sa_address, example_usage.py
│   ├── data/                sa_suburbs_data.csv and other original files
│   └── README-2025.md, _archive/
├── scripts/                 reproducible Python (uv, PEP 723)
│   ├── build_data.py        ABS downloads -> web/public/data/*
│   ├── make_fixtures.py     records Python output for the parity tests
│   ├── make_stats_reference.py  SciPy/statsmodels reference values for lib/stats
│   ├── make_pip_reference.py    Shapely (GEOS) point-in-polygon answers for lib/geo
│   └── replay_original.py   runs original/cli.py with both RNGs seeded
└── web/                     the Next.js app (Vercel root)
    ├── e2e/                 the Playwright guided tour (pnpm showcase)
    ├── public/data/         suburbs.json, sal-sa.geojson, sa-context.geojson,
    │                        original-suburbs.json, provenance.json
    ├── public/showcase/     the /tour videos, posters, captions and screenshots
    └── src/
        ├── app/             /, /generate, /verify, /sampling, /map, /lookup, /replay,
        │                    /data, /methods, /ai-log, /tour, /api/geocode
        ├── components/      ui/ (shadcn), layout/, common/, generate/, verify/,
        │                    sampling/, ai/, methods/, map/, lookup/, replay/
        ├── content/         copies of docs/ for the site (pnpm sync:docs)
        ├── lib/             rng/, original/, generator/, stats/, sampling/, verification/,
        │                    ai/, geo, photon, content (+ tests)
        ├── hooks/           worker, data-loading and AI-settings hooks
        └── workers/         generator and verification Web Workers
```

## Local development

Requirements: Node 20+ and pnpm 10 (`corepack enable`).

```bash
cd web
pnpm install          # also copies the MapLibre worker into public/vendor/
pnpm dev              # http://localhost:3000
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build
```

The guided tour doubles as an end-to-end test of the main journeys. It runs on the
system Google Chrome (no browser download) and needs `ffmpeg` on the PATH:

```bash
pnpm showcase                                  # against production; rebuilds every screenshot, video and GIF
BASE_URL=http://localhost:3000 pnpm showcase   # against a local `pnpm build` (started for you)
pnpm showcase:test                             # the journeys only: no pauses, no recording
```

No environment variables are needed. The site is static apart from `/api/geocode`,
which proxies Photon with a polite User-Agent, a one-day cache and a per-IP rate limit.
`/sampling` is computed at build time from fixed seeds (a few seconds).

There is no database and the server stores nothing: the tool only reads data. The one
record the site keeps is the optional AI audit log, and it lives in your own browser
(IndexedDB, see below). The reference data the site uses is plain JSON in
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

## Optional AI (bring your own key)

The site works fully without AI and has no key of its own. On `/generate`, **Describe a
test scenario** turns a plain-language description ("a fixture of 40 addresses that
covers every remoteness area, as CSV") into a proposed configuration:

1. Open **AI settings** (the key icon in the header), choose Anthropic (default, Claude
   Haiku 4.5; Claude Sonnet 5.5 optional) or OpenAI (model id editable), and paste
   **your own** API key. It is kept in `sessionStorage` (or `localStorage` if you tick
   "remember on this device"); **Forget key** removes it.
2. The browser calls the provider directly (Anthropic with
   `anthropic-dangerous-direct-browser-access: true`). The key travels only in the
   request header to the provider: it is never sent to this site, logged, or stored in
   the audit log, and anything key-like is redacted from stored text.
3. What is sent: your scenario (at most 1,000 characters), the current settings and the
   catalogue of remoteness areas, deciles and council names. No suburb list, no
   generated addresses, nothing about you.
4. The reply must match a JSON schema and is validated again with zod, then checked
   against the reference table (unknown suburbs or councils, out-of-range values). It is
   labelled **AI-generated** and shown as a table of changes; you tick which to apply,
   or reject it. Nothing is generated until you press Generate.

**Viewing the AI audit log.** Open [`/ai-log`](https://sa-mock-address-generator.vercel.app/ai-log)
(also linked in the footer and the AI settings dialog). Each entry records the time,
feature, provider, model, the exact input, the raw output, latency, token usage, the
checks the proposal failed and your decision (accepted, edited with what you applied,
or rejected); failed calls are logged too. **JSON** and **CSV** export buttons download
the whole log; **Clear** deletes it from the browser. The log is per browser: this site
keeps no copy.

The design is in [DR-004](docs/decisions/DR-004-byok-scenario-to-config.md) and the AI
use statement on `/methods#ai-use`. It is informed by the Australian Government's
policy for the responsible use of AI in government, the EU AI Act's transparency
principles and the NIST AI RMF; it makes no claim of compliance with any of them.

## Methods, decision records and the data card

- [`docs/data-card.md`](docs/data-card.md): sources, ASGS edition, licence, how each
  field is built, and the limits (a SAL is not always the gazetted suburb; SEIFA is
  area-level, not individual).
- [`docs/decisions/`](docs/decisions/): DR-001 open data and Photon instead of Mapbox,
  DR-002 the weighting scheme, DR-003 synthetic coordinates instead of geocoding, DR-004
  the bring-your-own-key assistant, DR-005 the stratified design and test selection.
  Each states the decision first, then context, options, reasons, what happened (weak
  numbers included) and what I'd change. Past records are superseded, never edited.
- All of them are rendered on [`/methods`](https://sa-mock-address-generator.vercel.app/methods).
  The site deploys from `web/` alone, so `pnpm sync:docs` copies `docs/` into
  `web/src/content/`; a test fails if the copies drift.

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
uv run scripts/make_stats_reference.py # SciPy reference values for web/src/lib/stats
uv run scripts/make_pip_reference.py   # Shapely point-in-polygon answers for web/src/lib/geo.ts
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
