---
id: DR-005
title: A stratified design, and which goodness-of-fit test to report
status: Accepted
date: 2026-10-09
applies-to: web/src/lib/generator, web/src/lib/stats, /generate (target check), /sampling
---

# DR-005: A stratified design, and which goodness-of-fit test to report

**Decision in one line:** add a stratified design with fixed remoteness quotas (largest remainder), and have the target check report the exact multinomial test when the sample can be enumerated, Pearson's chi-square when every expected count is at least 5, and a seeded Monte Carlo p-value otherwise, always with the test's name, n and Cohen's w.

## Context

The weighted design (DR-002) draws each address independently, so the area counts are random: a small fixture of 30 addresses can easily contain no Very Remote address even though the target is 5%. Testers who need every area represented want fixed counts. Separately, the 2025-era target check used the chi-square approximation for every sample, and small samples break its rule of thumb (expected counts of at least 5).

## Decision

- **Stratified design:** quotas n·w_h rounded by the largest-remainder method (ties to the earlier area), then suburbs uniformly within each area. The order of areas is a Fisher-Yates shuffle with the same random stream (identical to Python's `random.shuffle`), so output is still seeded and reproducible. The target check says "fixed by design" for the remoteness breakdown instead of running a meaningless test.
- **Test selection:** exact multinomial (probability ordering, as in R's EMT package) when there are at most 200,000 possible count vectors; otherwise chi-square if the smallest expected count is at least 5; otherwise a chi-square statistic with a Monte Carlo p-value (as R's `chisq.test(simulate.p.value = TRUE)`, seeded, up to 10,000 draws). The p-value is never reported without the test's name, n and Cohen's w.
- Statistics live in `web/src/lib/stats/` and are checked against SciPy and statsmodels values recorded by `scripts/make_stats_reference.py`.

## Options considered

1. **Chi-square only, with a warning** (the earlier behaviour). Simple, but the warning puts the burden on the reader.
2. **Exact test only.** Correct, but enumeration explodes: 5,000 addresses over 11 decile categories is far beyond reach.
3. **Monte Carlo for everything.** Always available, but adds simulation noise to results that could be exact or asymptotic.
4. **Choose by feasibility and expected counts** (chosen).

## Why

The design should state its guarantee: weighted draws are random with a known distribution, stratified draws are fixed. The test should match the situation and say which one it is, because a p-value without its test is not reproducible. Cohen's w is reported because with thousands of addresses a trivial gap reaches significance.

## What happened

- The exact false-alarm rate of each test at 5%, computed by enumerating every count vector for the `config.py` target: n = 10, exact 4.89%, chi-square 4.86%; n = 20, 4.97% against 5.28%; n = 30, 4.96% against 5.04%. The chi-square approximation is better behaved for this target than the rule of thumb suggests, which is worth saying plainly. The two tests still disagree on about 2% of samples, roughly two in five rejections, so the choice changes individual verdicts even though the overall rate barely moves.
- The stratified design gives exact shares in all 200 seeds of the replicate study, and it has one cost: a shorter run is no longer a prefix of a longer run with the same seed, because the quotas and the shuffle depend on the count. The uniform and weighted designs keep that property.

## What I'd change

- Offer stratification by SEIFA decile and by remoteness and decile together (a two-way quota table).
- Report a confidence interval for Cohen's w (by bootstrap over the counts) instead of the point estimate alone.
