"""Reference seismology used to build and check the catalog forecast.

The browser port lives in src/lib/seismo/model.ts and follows these formulas:
  Aki (1965): b = log10(e) / (mean(M) - (Mc - dM/2))
  Gutenberg-Richter: log10 N(>=M) = a - b M
  Poisson: P(N>=1) = 1 - exp(-annual * days / 365.25)
  Omori-Utsu survival: S(t) = (c / (c+t)) ** (p-1)
"""

from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "public" / "data" / "catalog.json"
YEAR_MS = 365.25 * 24 * 3600 * 1000
WINDOW_START = datetime(2000, 1, 1, tzinfo=timezone.utc).timestamp() * 1000


def aki_b(mags: list[float], mc: float = 4.5, dm: float = 0.1) -> dict[str, float]:
    sel = [m for m in mags if m >= mc]
    if len(sel) < 25:
        raise ValueError("not enough events")
    mean = sum(sel) / len(sel)
    b = math.log10(math.e) / (mean - (mc - dm / 2))
    a = math.log10(len(sel)) + b * mc
    return {"n": float(len(sel)), "mean": mean, "b": b, "a": a}


def poisson(count: int, span_years: float, days: float) -> tuple[float, float]:
    annual = count / span_years
    expected = annual * days / 365.25
    return expected, 1 - math.exp(-expected)


def region(events: list[tuple[int, float, float, float]], box: tuple[float, float, float, float]):
    south, west, north, east = box
    return [ev for ev in events if south <= ev[1] <= north and west <= ev[2] <= east]


def main() -> None:
    packed = json.loads(CATALOG.read_text())
    events = list(zip(packed["ms"], packed["lat"], packed["lon"], packed["mag"]))
    now = max(ms for ms, *_ in events)
    span = (now - WINDOW_START) / YEAR_MS
    boxes = {
        "taiwan": (21.8, 120.0, 25.4, 122.1),
        "southwest": (21.6, 119.2, 23.4, 120.8),
        "nankai": (31.2, 132.0, 35.2, 138.8),
    }
    print(f"events={len(events)} span_years={span:.2f}")
    for name, box in boxes.items():
        sub = region(events, box)
        mags = [m for *_, m in sub]
        fit = aki_b(mags)
        for threshold in (5, 6, 7):
            count = sum(1 for m in mags if m >= threshold)
            expected, prob = poisson(count, span, 30)
            print(
                f"{name} M>={threshold} n={count} b={fit['b']:.3f} "
                f"30d_expected={expected:.4f} P={prob * 100:.2f}%"
            )


if __name__ == "__main__":
    main()
