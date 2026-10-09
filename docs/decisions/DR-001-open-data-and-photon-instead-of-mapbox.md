---
id: DR-001
title: Open ABS data and Photon instead of Mapbox
status: Accepted
date: 2026-10-09
applies-to: scripts/build_data.py, web/public/data, /lookup, /api/geocode, /data
---

# DR-001: Open ABS data and Photon instead of Mapbox

**Decision in one line:** rebuild the suburb table from Australian Bureau of Statistics open data with a script anyone can rerun, and replace the Mapbox geocoder with the free, keyless Photon geocoder (through a cached, rate-limited route) plus point-in-polygon against ABS boundaries.

## Context

The 2025 tool had two external dependencies. Its suburb table (`original/data/sa_suburbs_data.csv`, 1,894 rows) had no recorded source, and porting it showed why that matters: socio-economic status was 0 in every row, 997 rows had the remoteness level "Not Applicable", and 19 postcodes had lost their leading zero. Its lookup and its coordinates called the Mapbox Geocoding v5 API, which needs a personal access token, and whose terms restrict storing and republishing results. A public demo cannot ship a key, and I have no budget for one.

## Decision

- Rebuild the table from ABS ASGS Edition 3 allocation files and boundaries, 2021 Census mesh block counts and SEIFA 2021 (all CC BY 4.0, direct downloads). Each suburb takes the postcode, council and remoteness area holding most of its residents. `scripts/build_data.py` does it end to end and writes `provenance.json`, a row-by-row comparison with the 2025 table.
- Look up real places with Photon (komoot's OpenStreetMap geocoder), called by a server route with a polite User-Agent, a one-day cache per normalised query and a per-IP limit of 30 searches a minute. The suburb, postcode, council, remoteness and decile then come from point-in-polygon against the ABS boundaries in the browser, so clicking the map works with no geocoder at all.
- Keep the 2025 table and the stored Mapbox results in `original/` as a historical record; the site never reads or serves the Mapbox file.

## Options considered

1. **Keep Mapbox with a server-side key.** Best geocoding quality, but a cost and abuse risk on a public demo, and storing results is restricted.
2. **Keep the 2025 table and patch it by hand.** Quick, but the source would still be unknown and every fix a judgement call.
3. **Google or another commercial geocoder.** Same key and cost problem as Mapbox.
4. **ABS open data plus Photon** (chosen).

## Why

Every field now has a named, licensed, re-downloadable source and a deterministic rule, and the whole table can be rebuilt with one command. Photon needs no key, and caching plus rate limiting keep the site within its fair-use expectations. The governance gain is provenance: a reviewer can trace any value on the site back to an ABS file.

## What happened

- 1,694 of the 1,894 names in the 2025 table match an ABS suburb. Of those, 99.3% (1,682) agree on the postcode and 98.2% (1,664) on the council after a council-name crosswalk. The 200 unmatched names are pastoral stations and outback places that the ABS folds into larger localities; all 200 were "Not Applicable" for remoteness.
- Majority rules have a cost: a suburb split between postcodes, councils or remoteness areas gets one value. The data card lists this and the other limits (a SAL is not always the gazetted suburb; SEIFA is area-level).
- Photon's quality is OpenStreetMap's: good for towns and streets, weaker for rural addresses and new estates, and the public instance can be slow or unavailable. The lookup degrades to clicking the map when it is.

## What I'd change

- Use the Geocoded National Address File (G-NAF, open) to check that generated street names exist in a suburb, or to warn when a mock address coincides with a real one.
- Host a Photon instance (or use a paid tier) if the lookup ever carries real traffic.
- Rebuild on ASGS Edition 4 and 2026 Census counts when they are published, and record the change in a new decision record rather than editing this one.
