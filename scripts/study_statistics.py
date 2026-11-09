"""Small, dependency-free Student-t intervals for the preserved study samples."""
import functools
import math
import statistics

@functools.lru_cache(maxsize=None)
def t975(df):
    """Invert the t CDF using Simpson quadrature and bisection (df >= 1)."""
    if df < 1:
        raise ValueError('Positive degrees of freedom required')
    scale = math.exp(math.lgamma((df + 1) / 2) - math.lgamma(df / 2)) / math.sqrt(df * math.pi)
    def cdf(x):
        panels = 2000
        h = x / panels
        def density(y):
            return scale * (1 + y * y / df) ** (-(df + 1) / 2)
        total = density(0) + density(x)
        total += sum((4 if i % 2 else 2) * density(i * h) for i in range(1, panels))
        return .5 + h * total / 3
    lo, hi = 0., 32.
    for _ in range(48):
        mid = (lo + hi) / 2
        if cdf(mid) < .975:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2

def describe(values):
    n = len(values)
    mean = statistics.mean(values) if n else None
    sd = statistics.stdev(values) if n > 1 else None
    margin = t975(n - 1) * sd / math.sqrt(n) if n > 1 else None
    return {'n': n, 'mean': mean, 'sd': sd,
            'ci95': [mean - margin, mean + margin] if margin is not None else None}
