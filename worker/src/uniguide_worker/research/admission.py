"""Hierarchical admission model with a future-cycle holdout and a calibration gate.

Logistic regression of admitted vs rejected (waitlists are left out) on:
  - the applicant's grade, standardised within its own grading scale (never converted between
    scales), plus a missing-grade indicator;
  - a destination-country offset and a course offset, partially pooled: Gaussian priors shrink
    each course toward its country and each country toward the global rate, so courses with few
    outcomes borrow strength and courses with none get no estimate at all.

The model is fit by MAP (Newton's method) on intakes before the latest year and scored on the
latest year it has never seen. It is published only when it beats the base-rate baseline on Brier
score and is well calibrated; otherwise it is stored as failed and stays hidden.
"""

from __future__ import annotations

import math
from collections import Counter
from dataclasses import dataclass, field
from typing import Any

import numpy as np
from psycopg.types.json import Jsonb

from ..db import Connection

VERSION = "admission-0.1.0"

# Scales where a lower number is a better grade.
LOWER_IS_BETTER = {"german_1_5"}
NUMERIC_SCALES = {"percent", "gpa_4", "gpa_10", "ib_45", "atar", "german_1_5"}


@dataclass(frozen=True)
class Gate:
    min_train: int = 500
    min_holdout: int = 100
    # Brier must be at most this fraction of the baseline's (5% better or more).
    max_brier_ratio: float = 0.95
    max_calibration_error: float = 0.05
    # Course estimates are shown only for courses with at least this many training outcomes.
    min_program_n: int = 20


@dataclass(frozen=True)
class Priors:
    fixed_sd: float = 2.5
    country_sd: float = 0.5
    program_sd: float = 0.75


DEFAULT_GATE = Gate()
DEFAULT_PRIORS = Priors()


@dataclass
class Fit:
    intercept: float
    slopes: dict[str, float]
    scales: dict[str, dict[str, float]]
    country: dict[str, float]
    program: dict[str, dict[str, Any]]

    def params(self) -> dict[str, Any]:
        return {
            "intercept": self.intercept,
            "slopes": self.slopes,
            "scales": self.scales,
            "country": self.country,
            "program": self.program,
        }


@dataclass
class Evaluation:
    passed: bool
    n_train: int
    n_holdout: int
    brier: float
    brier_baseline: float
    calibration_error: float
    calibration: list[dict[str, Any]]
    trained_through: int
    holdout_year: int
    reasons: list[str] = field(default_factory=list)
    fit: Fit | None = None


def _sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-x))


def _scale_stats(rows: list[dict[str, Any]]) -> dict[str, dict[str, float]]:
    by_scale: dict[str, list[float]] = {}
    for r in rows:
        if r["grade_scale"] in NUMERIC_SCALES and r["grade_value"] is not None:
            by_scale.setdefault(r["grade_scale"], []).append(float(r["grade_value"]))
    stats = {}
    for scale, values in by_scale.items():
        if len(values) < 5:
            continue
        mean = sum(values) / len(values)
        sd = math.sqrt(sum((v - mean) ** 2 for v in values) / (len(values) - 1)) or 1.0
        stats[scale] = {"mean": mean, "sd": sd, "direction": -1.0 if scale in LOWER_IS_BETTER else 1.0}
    return stats


def grade_feature(value: float | None, scale: str | None, scales: dict[str, dict[str, float]]) -> tuple[float, float]:
    """(standardised grade, missing flag). Standardised only against the same scale."""
    if value is None or scale not in scales:
        return 0.0, 1.0
    s = scales[scale]
    return s["direction"] * (float(value) - s["mean"]) / s["sd"], 0.0


def fit(rows: list[dict[str, Any]], priors: Priors = DEFAULT_PRIORS, iterations: int = 50) -> Fit:
    scales = _scale_stats(rows)
    countries = sorted({r["country"] for r in rows})
    programs = sorted({str(r["program_id"]) for r in rows})
    c_index = {c: i for i, c in enumerate(countries)}
    p_index = {p: i for i, p in enumerate(programs)}
    n_fixed = 3  # intercept, grade, grade missing
    k = n_fixed + len(countries) + len(programs)

    x = np.zeros((len(rows), k))
    y = np.zeros(len(rows))
    for i, r in enumerate(rows):
        grade, missing = grade_feature(r["grade_value"], r["grade_scale"], scales)
        x[i, 0:3] = (1.0, grade, missing)
        x[i, n_fixed + c_index[r["country"]]] = 1.0
        x[i, n_fixed + len(countries) + p_index[str(r["program_id"])]] = 1.0
        y[i] = 1.0 if r["decision"] == "admitted" else 0.0

    # Prior precision. Course offsets are centred on zero relative to their country's offset,
    # which is what the additive country + course terms express.
    precision = np.concatenate(
        [
            np.full(n_fixed, 1 / priors.fixed_sd**2),
            np.full(len(countries), 1 / priors.country_sd**2),
            np.full(len(programs), 1 / priors.program_sd**2),
        ]
    )
    beta = np.zeros(k)
    for _ in range(iterations):
        p = _sigmoid(x @ beta)
        grad = x.T @ (y - p) - precision * beta
        hess = -(x.T * (p * (1 - p))) @ x - np.diag(precision)
        step = np.linalg.solve(hess, grad)
        beta -= step
        if np.max(np.abs(step)) < 1e-8:
            break

    counts = Counter(str(r["program_id"]) for r in rows)
    program_country = {str(r["program_id"]): r["country"] for r in rows}
    return Fit(
        intercept=float(beta[0]),
        slopes={"grade": float(beta[1]), "grade_missing": float(beta[2])},
        scales=scales,
        country={c: float(beta[n_fixed + i]) for c, i in c_index.items()},
        program={
            p: {"offset": float(beta[n_fixed + len(countries) + i]), "n": counts[p], "country": program_country[p]}
            for p, i in p_index.items()
        },
    )


def predict(model: Fit, row: dict[str, Any]) -> float:
    grade, missing = grade_feature(row.get("grade_value"), row.get("grade_scale"), model.scales)
    z = model.intercept + model.slopes["grade"] * grade + model.slopes["grade_missing"] * missing
    z += model.country.get(row["country"], 0.0)
    z += model.program.get(str(row["program_id"]), {}).get("offset", 0.0)
    return 1.0 / (1.0 + math.exp(-z))


def calibration(preds: list[float], ys: list[int], bins: int = 10) -> tuple[float, list[dict[str, Any]]]:
    """Expected calibration error over equal-width bins, and the per-bin table."""
    table = []
    ece = 0.0
    for b in range(bins):
        lo, hi = b / bins, (b + 1) / bins
        idx = [i for i, p in enumerate(preds) if lo <= p < hi or (b == bins - 1 and p == 1.0)]
        if not idx:
            continue
        predicted = sum(preds[i] for i in idx) / len(idx)
        observed = sum(ys[i] for i in idx) / len(idx)
        ece += len(idx) / len(preds) * abs(predicted - observed)
        table.append(
            {
                "bin": f"{lo:.1f}-{hi:.1f}",
                "predicted": round(predicted, 3),
                "observed": round(observed, 3),
                "n": len(idx),
            }
        )
    return ece, table


def evaluate(
    rows: list[dict[str, Any]], gate: Gate = DEFAULT_GATE, priors: Priors = DEFAULT_PRIORS
) -> Evaluation | None:
    """Train on earlier intakes, test on the latest. None when there is only one intake year."""
    decided = [r for r in rows if r["decision"] in ("admitted", "rejected")]
    years = sorted({r["intake_year"] for r in decided})
    if len(years) < 2:
        return None
    holdout_year = years[-1]
    train = [r for r in decided if r["intake_year"] < holdout_year]
    test = [r for r in decided if r["intake_year"] == holdout_year]
    model = fit(train, priors)

    ys = [1 if r["decision"] == "admitted" else 0 for r in test]
    preds = [predict(model, r) for r in test]
    base_rate = sum(r["decision"] == "admitted" for r in train) / len(train)
    brier = sum((p - y) ** 2 for p, y in zip(preds, ys, strict=True)) / len(test)
    baseline = sum((base_rate - y) ** 2 for y in ys) / len(test)
    ece, table = calibration(preds, ys)

    reasons = []
    if len(train) < gate.min_train:
        reasons.append(f"only {len(train)} training outcomes (need {gate.min_train})")
    if len(test) < gate.min_holdout:
        reasons.append(f"only {len(test)} holdout outcomes (need {gate.min_holdout})")
    if baseline == 0 or brier > gate.max_brier_ratio * baseline:
        reasons.append(f"Brier {brier:.4f} does not beat the base rate's {baseline:.4f} by enough")
    if ece > gate.max_calibration_error:
        reasons.append(f"calibration error {ece:.3f} above {gate.max_calibration_error}")
    return Evaluation(
        passed=not reasons,
        n_train=len(train),
        n_holdout=len(test),
        brier=brier,
        brier_baseline=baseline,
        calibration_error=ece,
        calibration=table,
        trained_through=years[-2],
        holdout_year=holdout_year,
        reasons=reasons,
        fit=model,
    )


def publish(conn: Connection, ev: Evaluation, gate: Gate = DEFAULT_GATE) -> str:
    """Store the run. A passing model becomes the active one; a failing one is kept for the record."""
    assert ev.fit is not None
    params = ev.fit.params()
    # Thin courses are dropped from what is served; their data still shaped the pooled offsets.
    params["program"] = {p: v for p, v in params["program"].items() if v["n"] >= gate.min_program_n}
    if ev.passed:
        conn.execute("update admission_models set active = false where active")
    row = conn.execute(
        """
        insert into admission_models (version, trained_through, holdout_year, n_train, n_holdout, brier,
          brier_baseline, calibration_error, calibration, passed, params, min_program_n, active, notes)
        values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        returning id
        """,
        (
            VERSION, ev.trained_through, ev.holdout_year, ev.n_train, ev.n_holdout, ev.brier, ev.brier_baseline,
            ev.calibration_error, Jsonb(ev.calibration), ev.passed, Jsonb(params), gate.min_program_n, ev.passed,
            "; ".join(ev.reasons) or None,
        ),
    ).fetchone()  # fmt: skip
    conn.commit()
    assert row is not None
    return str(row["id"])
