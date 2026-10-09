---
id: DR-003
title: Synthetic coordinates instead of geocoding
status: Accepted
date: 2026-10-09
applies-to: web/src/lib/geo.ts, web/src/lib/generator/generate.ts, /generate, /sampling#spatial
---

# DR-003: Synthetic coordinates instead of geocoding

**Decision in one line:** give each mock address a point drawn uniformly at random inside its suburb's ABS boundary, from its own seeded random stream, instead of geocoding anything.

## Context

The 2025 generator geocoded the suburb name through Mapbox for every address (`_get_suburb_coordinates`), so all addresses in a suburb shared one point, and it needed an API key. The street addresses themselves are invented (a random number from 1 to 999 and one of 49 Adelaide street names), so geocoding them would either fail or snap to a real street that happens to share the name.

## Decision

- Rejection sampling inside the simplified ABS polygon: draw a point uniformly in the bounding box until it falls inside; fall back to the suburb's label point after 2,000 failed tries (it has never happened).
- A separate random stream for coordinates, seeded from the address seed, so turning coordinates on or off never changes the addresses.
- Publish coordinates to 6 decimal places, and test the **rounded** point for being inside (see What happened).
- Stamp every output "MOCK: synthetic test data".

## Options considered

1. **Geocode each mock address.** Needs a key and a network call per address, mostly fails, and where it succeeds it places a mock address on a real street, which makes it look more real than it is.
2. **One point per suburb** (the 2025 behaviour). Every address in a suburb on the same spot: useless for anything spatial.
3. **Uniform inside the suburb boundary** (chosen). Keyless, instant, reproducible, and visibly synthetic.
4. **Inside residential mesh blocks, weighted by dwellings.** More realistic placement, at the cost of shipping mesh block geometry (much larger).

## Why

Test data needs coordinates that are plausible (in the right suburb), reproducible (seeded) and unmistakably not real. Uniform sampling inside the boundary is the simplest design that meets all three, and it is checkable: a point-in-polygon validation and a uniformity statistic can confirm the implementation does what it says.

## What happened

- The point-in-polygon validation (every point looked up again against all 1,696 boundaries) failed **one point in 5,000** on its first run (seed 2025): a point drawn inside Mobilong a few centimetres from the edge was rounded to 6 decimals after the inside test and crossed into the neighbouring suburb. The sampler now rounds before testing. After the fix: 5,000 of 5,000 for the uniform design, 5,000 of 5,000 for the population design and 8,475 of 8,475 in a census of 5 points per suburb (95% Wilson lower bound 99.92% and 99.95%). The failing point is a regression test.
- The Clark-Evans ratio with Donnelly's edge correction sits at 1 for single-part suburbs (mean over 100 seeds between about 0.99 and 1.01) and the z-test rejects randomness in about 5% of seeds, as it should. For Kingscote, which has two parts, the mean is about 1.02 and the test rejects in 13 of 100 seeds: the edge correction assumes one rectangle, so the reference value, not the sampler, is off there. Two negative controls are flagged clearly: all points on one geocoded spot gives R = 0, and a clustered pattern gives R ≈ 0.34.
- Uniform inside a suburb means points can fall in parks, lakes, reserves and airports. That is stated on the data card: the points are mock locations, not dwellings.

## What I'd change

- Sample within residential mesh blocks weighted by dwellings (option 4), and measure how much more realistic the placement is against G-NAF density.
- Replace the Clark-Evans reference with a Monte Carlo envelope from an independent uniform sampler (for example, triangulating the polygon), which handles multi-part and irregular suburbs properly.
