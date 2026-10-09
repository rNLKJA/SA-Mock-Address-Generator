# /// script
# requires-python = ">=3.12"
# dependencies = [
#   "numpy>=1.26",
#   "scipy>=1.13",
#   "statsmodels>=0.14",
# ]
# ///
"""Record SciPy / statsmodels reference values for the web app's statistics.

Writes web/src/lib/stats/__fixtures__/reference.json, read by
web/src/lib/stats/stats.reference.test.ts. Each value is computed here by an
independent route (SciPy distributions, brute-force enumeration with
scipy.stats.multinomial, a k-d tree for nearest neighbours), so the
TypeScript code is checked against something it does not share code with.

Run from the repo root:
    uv run scripts/make_stats_reference.py
"""

from __future__ import annotations

import itertools
import json
import math
from pathlib import Path

import numpy as np
import scipy
import scipy.special
import statsmodels
from scipy import stats
from scipy.spatial import cKDTree
from statsmodels.stats.proportion import proportion_confint

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "web" / "src" / "lib" / "stats" / "__fixtures__" / "reference.json"


def compositions(n: int, k: int):
    """Every vector of k non-negative integers summing to n."""
    for cuts in itertools.combinations(range(n + k - 1), k - 1):
        prev = -1
        out = []
        for c in cuts:
            out.append(c - prev - 1)
            prev = c
        out.append(n + k - 1 - prev - 1)
        yield out


def exact_multinomial(observed: list[int], probs: list[float]) -> dict:
    p = np.array(probs, dtype=float)
    p = p / p.sum()
    n = int(sum(observed))
    k = len(observed)
    dist = stats.multinomial(n, p)
    p_obs = dist.pmf(observed)
    total = 0.0
    count = 0
    for x in compositions(n, k):
        px = dist.pmf(x)
        count += 1
        if px <= p_obs * (1 + 1e-7):
            total += px
    return {
        "observed": observed,
        "probs": probs,
        "p": min(1.0, total),
        "probObserved": float(p_obs),
        "outcomes": count,
    }


def test_sizes(n: int, probs: list[float], alpha: float = 0.05) -> dict:
    """True size of the exact and chi-square tests by full enumeration."""
    p = np.array(probs, dtype=float)
    p = p / p.sum()
    xs = np.array(list(compositions(n, len(p))))
    log_pmf = scipy.special.gammaln(n + 1) + (xs * np.log(p) - scipy.special.gammaln(xs + 1)).sum(1)
    pmf = np.exp(log_pmf)
    order = np.sort(pmf)
    cum = np.cumsum(order)
    pv = cum[np.searchsorted(order, pmf * (1 + 1e-7), side="right") - 1]
    chi = ((xs - n * p) ** 2 / (n * p)).sum(1)
    exact = pv < alpha
    chisq = stats.chi2.sf(chi, len(p) - 1) < alpha
    return {
        "n": n,
        "probs": probs,
        "outcomes": int(len(xs)),
        "exact": float(pmf[exact].sum()),
        "chiSquare": float(pmf[chisq].sum()),
        "disagree": float(pmf[exact != chisq].sum()),
    }


def wilson_half_width(p: float, n: int, z: float) -> float:
    z2 = z * z
    return z * math.sqrt(p * (1 - p) / n + z2 / (4 * n * n)) / (1 + z2 / n)


def wilson_sample_size(p: float, margin: float, confidence: float) -> int:
    z = stats.norm.ppf(1 - (1 - confidence) / 2)
    n = 1
    while wilson_half_width(p, n, z) > margin:
        n += 1
    return n


def share_window(n: np.ndarray, p: float, margin: float) -> np.ndarray:
    """P(|K/n - p| <= margin) for K ~ Binomial(n, p), from scipy.stats.binom.

    The window is the whole counts k with n(p - E) <= k <= n(p + E); the 1e-7
    tolerance keeps exact boundaries (2,300 x 0.42 = 966) inside.
    """
    lo = np.maximum(0, np.ceil(n * (p - margin) - 1e-7))
    hi = np.minimum(n, np.floor(n * (p + margin) + 1e-7))
    prob = stats.binom.cdf(hi, n, p) - stats.binom.cdf(lo - 1, n, p)
    return np.where(lo > hi, 0.0, prob)


def exact_share_sample_size(p: float, margin: float, confidence: float) -> int:
    """Smallest n from which the window probability stays >= confidence.

    Brute force: evaluate every n up to four times the normal-approximation
    size (where the window spans more than +-2.7 standard errors), and answer
    one more than the last n that falls short.
    """
    z = stats.norm.ppf(1 - (1 - confidence) / 2)
    n_max = int(4 * z * z * p * (1 - p) / margin**2) + 200
    ns = np.arange(1, n_max + 1)
    short = ns[share_window(ns, p, margin) < confidence]
    assert len(short) == 0 or short[-1] < n_max / 2, "search range too small"
    return int(short[-1] + 1) if len(short) else 1


def clark_evans(points: np.ndarray, area: float, perimeter: float) -> dict:
    tree = cKDTree(points)
    d, _ = tree.query(points, k=2)
    nn = d[:, 1]
    n = len(points)
    mean_nn = float(nn.mean())
    naive = 0.5 * math.sqrt(area / n)
    expected = naive + (0.0514 + 0.041 / math.sqrt(n)) * perimeter / n
    var = 0.0703 * area / n**2 + 0.037 * perimeter * math.sqrt(area / n**5)
    z = (mean_nn - expected) / math.sqrt(var)
    return {
        "meanNn": mean_nn,
        "expectedNaive": naive,
        "rNaive": mean_nn / naive,
        "expected": expected,
        "r": mean_nn / expected,
        "z": z,
        "p": float(2 * stats.norm.sf(abs(z))),
    }


def main() -> None:
    rng = np.random.default_rng(20261009)

    normal = {
        "quantiles": [
            {"p": p, "z": float(stats.norm.ppf(p))}
            for p in [1e-9, 1e-6, 0.001, 0.01, 0.02425, 0.05, 0.3, 0.5, 0.8, 0.9, 0.95, 0.975, 0.995, 0.9995]
        ],
        "cdf": [{"x": x, "p": float(stats.norm.cdf(x))} for x in [-6, -3.2, -1.96, -0.5, 0, 0.4, 1.2, 2.5, 5]],
    }

    exact = [
        exact_multinomial([3, 1, 0], [0.5, 0.3, 0.2]),
        exact_multinomial([10, 6, 3, 1, 0], [0.4, 0.25, 0.2, 0.1, 0.05]),
        exact_multinomial([8, 5, 4, 2, 1], [0.4, 0.25, 0.2, 0.1, 0.05]),
        exact_multinomial([4, 4, 4, 4, 4], [0.4, 0.25, 0.2, 0.1, 0.05]),
        exact_multinomial([16, 10, 8, 4, 2], [0.4, 0.25, 0.2, 0.1, 0.05]),
        exact_multinomial([2, 9, 7, 2], [0.25, 0.25, 0.25, 0.25]),
        exact_multinomial([0, 0, 12], [1 / 3, 1 / 3, 1 / 3]),
    ]

    chisq = []
    for obs, probs in [
        ([10, 6, 3, 1, 0], [0.4, 0.25, 0.2, 0.1, 0.05]),
        ([16, 10, 8, 4, 2], [0.4, 0.25, 0.2, 0.1, 0.05]),
        ([424, 343, 582, 200, 146], [0.4, 0.25, 0.2, 0.1, 0.05]),
    ]:
        n = sum(obs)
        p = np.array(probs) / sum(probs)
        res = stats.chisquare(obs, n * p)
        chisq.append(
            {
                "observed": obs,
                "probs": probs,
                "statistic": float(res.statistic),
                "p": float(res.pvalue),
                "w": math.sqrt(float(res.statistic) / n),
            }
        )

    sample_size = []
    for p, margin, conf in [
        (0.4, 0.02, 0.95),
        (0.05, 0.01, 0.95),
        (0.5, 0.05, 0.95),
        (0.25, 0.03, 0.99),
        (0.1, 0.02, 0.9),
        (0.5, 0.1, 0.99),
        (0.2, 0.02, 0.99),
    ]:
        z = float(stats.norm.ppf(1 - (1 - conf) / 2))
        sample_size.append(
            {
                "p": p,
                "margin": margin,
                "confidence": conf,
                "normal": math.ceil(z * z * p * (1 - p) / margin**2 - 1e-9),
                "wilson": wilson_sample_size(p, margin, conf),
                "exact": exact_share_sample_size(p, margin, conf),
            }
        )

    # The binomial probability that a share lands within +-E of its target.
    share_windows = [
        {"n": n, "p": p, "margin": margin, "prob": float(share_window(np.array([n]), p, margin)[0])}
        for n, p, margin in [
            (2300, 0.42, 0.02),
            (2320, 0.4, 0.02),
            (2319, 0.4, 0.02),
            (1000, 0.05, 0.01),
            (37, 0.25, 0.1),
            (5, 0.5, 0.05),
            (400, 0.01, 0.02),
        ]
    ]

    # statsmodels' Wilson interval, checked at the planning sizes (k = round(n p)).
    wilson_check = []
    for case in sample_size:
        n = case["wilson"]
        k = round(n * case["p"])
        lo, hi = proportion_confint(k, n, alpha=1 - case["confidence"], method="wilson")
        wilson_check.append({"k": k, "n": n, "confidence": case["confidence"], "lo": float(lo), "hi": float(hi)})

    sizes = [test_sizes(n, [0.4, 0.25, 0.2, 0.1, 0.05]) for n in (5, 10, 20, 30)]
    sizes.append(test_sizes(12, [0.25, 0.25, 0.25, 0.25]))

    zero_failure = []
    for max_rate, conf in [(0.01, 0.95), (0.05, 0.95), (0.001, 0.99), (0.02, 0.9)]:
        n = math.ceil(math.log(1 - conf) / math.log(1 - max_rate) - 1e-9)
        while stats.beta.ppf(conf, 1, n) > max_rate:
            n += 1
        zero_failure.append(
            {
                "maxRate": max_rate,
                "confidence": conf,
                "n": n,
                "upper": float(stats.beta.ppf(conf, 1, n)),
            }
        )

    # Clark-Evans on fixed point sets: uniform in a 4 x 2.5 km rectangle, and
    # clustered around three centres in a 3 x 3 km square.
    uniform = np.column_stack([rng.uniform(0, 4, 160), rng.uniform(0, 2.5, 160)])
    centres = rng.uniform(0.6, 2.4, (3, 2))
    clustered = np.concatenate([c + rng.normal(0, 0.12, (40, 2)) for c in centres])
    clustered = np.clip(clustered, 0, 3)
    spatial = [
        {
            "name": "uniform rectangle",
            "points": np.round(uniform, 6).tolist(),
            "area": 10.0,
            "perimeter": 13.0,
            **clark_evans(np.round(uniform, 6), 10.0, 13.0),
        },
        {
            "name": "three clusters",
            "points": np.round(clustered, 6).tolist(),
            "area": 9.0,
            "perimeter": 12.0,
            **clark_evans(np.round(clustered, 6), 9.0, 12.0),
        },
    ]

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {
                "meta": {
                    "scipy": scipy.__version__,
                    "numpy": np.__version__,
                    "statsmodels": statsmodels.__version__,
                    "script": "scripts/make_stats_reference.py",
                },
                "normal": normal,
                "exactMultinomial": exact,
                "chiSquare": chisq,
                "sampleSize": sample_size,
                "wilsonAtPlanningSize": wilson_check,
                "shareWindow": share_windows,
                "testSizes": sizes,
                "zeroFailure": zero_failure,
                "clarkEvans": spatial,
            },
            indent=1,
        )
        + "\n"
    )
    print(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
