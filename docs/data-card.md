# Data card: rebuilt South Australian suburb table

The reference table behind every generated address, map and lookup on the site. It
replaces the 2025 table (`original/data/sa_suburbs_data.csv`, 1,894 rows, source not
recorded), which stays in the repository unchanged.

## At a glance

| Item | Detail |
| --- | --- |
| Files | `web/public/data/suburbs.json` (table), `sal-sa.geojson` (boundaries), `sa-context.geojson` (state outline), `provenance.json` (comparison with 2025) |
| Unit | One row per ABS Suburb and Locality (SAL) 2021 in South Australia |
| Rows | 1,696 (1,695 addressable; "SA Remainder" is never used for addresses) |
| Built by | `scripts/build_data.py` (uv, PEP 723), from direct ABS downloads, no login |
| Geography | Australian Statistical Geography Standard (ASGS) Edition 3, July 2021 to June 2026, GDA2020 |
| Population | 2021 Census usual residents, by mesh block (1,777,698 in total) |
| Socio-economic | SEIFA 2021, Index of Relative Socio-economic Advantage and Disadvantage (IRSAD) |
| Licence | Contains ABS data, © Commonwealth of Australia, CC BY 4.0 |
| Personal information | None. Every input is published area-level statistics |

## Sources

| Source | Publisher | Licence | Used for |
| --- | --- | --- | --- |
| ASGS Ed. 3 allocation files: mesh block to SAL, LGA, POA, SA1; SA1 to Remoteness Area | ABS | CC BY 4.0 | Joining every mesh block to its suburb, council, postal area and remoteness area |
| ASGS Ed. 3 digital boundaries: SAL 2021 and states (GDA2020) | ABS | CC BY 4.0 | Suburb polygons, label points, the state outline |
| Census 2021 mesh block counts | ABS | CC BY 4.0 | Usual residents per mesh block (the weights for every majority rule) |
| SEIFA 2021, Suburbs and Localities | ABS | CC BY 4.0 | IRSAD score and deciles |

Exact file URLs are listed in `provenance.json` and on the site's Data page.

## How each field is built

| Field | Meaning | Rule |
| --- | --- | --- |
| `code`, `official`, `name` | SAL 2021 code and name | `name` is upper case without the " (SA)" disambiguator |
| `postcode`, `postcodes` | ABS Postal Area | The Postal Area holding most of the suburb's 2021 residents (four digits, leading zero kept); `postcodes` lists every one that overlaps |
| `council`, `lgaCode` | Local Government Area 2021 | The LGA holding most residents; land area breaks ties for empty localities |
| `ra`, `raShare` | ABS Remoteness Area 2021 | The Remoteness Area holding most residents, and the share of residents in it |
| `decileSa`, `decileAus`, `irsad` | SEIFA 2021 IRSAD | Deciles ranked within South Australia and nationally; null where the ABS publishes none (83 rows) |
| `pop` | Usual residents, Census 2021 | Sum over the suburb's mesh blocks |
| `areaKm2` | Area | ABS SAL area |
| `label` | A point guaranteed inside the simplified boundary | Used when a coordinate cannot be sampled (it never has been) |

Boundaries are simplified with mapshaper 0.7.81 (Visvalingam, keeping 10% of removable
vertices, shared edges preserved) and rounded to 0.0001 degrees (about 11 m).

## Quality checks

- 1,694 of the 1,894 names in the 2025 table match an ABS suburb; of those, 99.3% agree on
  the postcode and 98.2% on the council once council names are crosswalked. The 200 names
  only in the 2025 table are pastoral stations and outback places the ABS folds into larger
  localities.
- Every label point falls inside its own polygon, and every one of 5,000 generated
  coordinates (and a census of 5 points in each of 1,695 suburbs) falls inside the suburb
  its address names, looked up again against all 1,696 boundaries (the 1,695 suburbs plus
  the non-addressable SA Remainder), not only its own. That lookup shares its
  point-in-polygon routine with the sampler, so the routine is also checked against
  Shapely (GEOS) on 3,000 seeded points, half of them 10 cm from a boundary: they agree on
  every point (see the Sampling page).
- Projected polygon areas agree with the ABS areas to within about 1% for 90% of suburbs
  larger than half a square kilometre.

## Known limits (read before relying on a field)

- **A SAL is not always the gazetted suburb.** ABS Suburbs and Localities are built from
  mesh blocks to approximate the officially gazetted suburbs and localities. Edges can
  differ, a few names differ, and small localities can be absorbed into larger ones.
- **A postcode is the majority Postal Area, not the delivery postcode.** ABS Postal Areas
  approximate Australia Post postcodes; they are not the official delivery list. A suburb
  split between postcodes gets the one most of its residents live in.
- **Council and remoteness are majority rules.** Suburbs that straddle a council or a
  remoteness boundary carry one value for the whole suburb.
- **SEIFA is area-level, not individual.** An IRSAD decile describes the residents of an
  area in aggregate. It says nothing about any person or household, and a mock address in
  a low-decile suburb must never be used to stand in for a disadvantaged person (the
  ecological fallacy). The ABS publishes no SEIFA for very small populations.
- **Population is from 2021.** Growth areas have changed since; the 2026 Census will need
  a rebuild once its counts and the next ASGS edition are published.
- **Simplified boundaries.** Simplification moves edges by up to tens of metres, so a mock
  point near an edge can sit in the real neighbouring suburb, and a point can land in a
  park, a lake or a reserve inside the suburb. Coordinates are mock locations, not
  dwellings.

## Intended use

Generating synthetic, clearly stamped test addresses for software testing; illustrating
sampling designs; looking up which suburb a real point is in.

**Out of scope:** postal delivery, identity verification, eligibility or service
decisions, any inference about real people or households, and pairing mock addresses with
names to create realistic-looking personal records.

## Maintenance

Rebuild with `uv run scripts/build_data.py` (downloads about 235 MB into
`scripts/.cache/`). The script rewrites every file above and the comparison in
`provenance.json`. The decision to rebuild from open data rather than keep the 2025 table
is recorded in [DR-001](decisions/DR-001-open-data-and-photon-instead-of-mapbox.md).
