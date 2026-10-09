---
id: DR-002
title: The weighting scheme
status: Accepted
date: 2026-10-09
applies-to: web/src/lib/generator/weights.ts, /generate, /sampling
---

# DR-002: The weighting scheme

**Decision in one line:** keep uniform sampling as the faithful default, and add the weighting the 2025 README promised as a two-stage draw (first a category with the `config.py` weight, then a suburb uniformly inside it), plus population weighting, with the weights renormalised over whatever categories survive the filters.

## Context

The 2025 README said generation followed remoteness and socio-economic weights. `config.py` defined them (`DEFAULT_REMOTENESS_WEIGHTS`: 0.40, 0.25, 0.20, 0.10, 0.05; `DEFAULT_SOCIOECONOMIC_WEIGHTS` over six bands 0 to 5), but the import was commented out, so every suburb was equally likely. The six socio-economic bands were never defined, and the table's socio-economic column was 0 in every row.

## Decision

- **Uniform** (the default, labelled "as built in 2025") keeps the original behaviour, so the replay and the generator can be compared.
- **Remoteness weights:** pick a remoteness area with probability equal to its weight, then a suburb uniformly within it. The realised area mix then matches the weights exactly in expectation, whatever the number of suburbs per area.
- **SEIFA weights:** the six undefined bands are spread over the ten IRSAD deciles. Decile d belongs to band round((d − 1) × 5 / 9) and each band's weight is split evenly across its deciles, so band totals are preserved. Suburbs with no published decile get zero weight in this mode, and the page says how many.
- **Population:** suburbs in proportion to 2021 usual residents.
- **Filters first, then renormalise:** filters remove suburbs; the category weights are renormalised over the categories that still have suburbs, and a mode whose weights are all zero returns an error instead of silently falling back (the 2025 code's worst habit).

## Options considered

1. **Single-stage weights per suburb** (each suburb gets its area's weight). Simpler, but the area mix would then depend on how many suburbs each area has: Outer Regional has 582 suburbs and Major Cities 424, so Outer Regional would be over-drawn relative to the promise.
2. **Two-stage: category, then suburb** (chosen). The promise is about the category mix, so the design should deliver exactly that mix.
3. **Raking or iterative proportional fitting to several margins at once** (remoteness and SEIFA together). More expressive, but the 2025 tool never combined them and it is harder to explain.

## Why

The two-stage design makes the target explicit and checkable: the expected share of each area equals its weight, so a goodness-of-fit test against the weights is a test of the implementation. Keeping uniform as the default keeps the revival honest about what the 2025 code actually did.

## What happened

- With seed 2025 and 2,000 addresses, the weighted design gives χ²(4) = 2.86, p = 0.58 against the target; the uniform design gives χ²(4) = 497, p < 0.001, Cohen's w = 0.50.
- Over 200 seeds of 1,000 addresses (/sampling), the goodness-of-fit test rejects the weighted design in 6 of 200 seeds (3.0%, 95% CI 1.4% to 6.4%), consistent with its 5% level, and the 95% Wilson intervals cover the target in 93.5% to 97% of seeds per area. The uniform design is rejected in all 200.
- The decile mapping is my reading of six undefined bands, not a documented intent. It is shown in the UI next to the editable weights.

## What I'd change

- Weight by dwellings rather than residents for address-like realism (the Census mesh block counts include dwellings).
- Allow joint targets (remoteness by SEIFA) with raking, and test the joint mix.
- Let users load a target mix from a file, with the realised mix and its test exported alongside the addresses.
