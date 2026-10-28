"""Turn a model extraction (or a seed file entry) into typed fact proposals."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time
from typing import Any
from zoneinfo import ZoneInfo

from .extract.schema import PageExtraction
from .timezones import zone_for
from .validate.checks import (
    CycleInfo,
    Issue,
    check_cost,
    check_deadline,
    check_quote,
    check_score,
    check_timezone,
)


@dataclass
class Proposal:
    subject: str  # requirement | deadline | cost_item
    proposed: dict[str, Any]
    evidence_quote: str
    issues: list[Issue] = field(default_factory=list)

    @property
    def has_errors(self) -> bool:
        return any(i.level == "error" for i in self.issues)

    def key(self) -> tuple[Any, ...]:
        """Identity of the fact within a cycle, used to find the row a proposal updates."""
        p = self.proposed
        if self.subject == "requirement":
            return (self.subject, p.get("applicant_category"), p["kind"], p.get("exam"), p.get("qualification"))
        if self.subject == "deadline":
            return (self.subject, p.get("applicant_category"), p.get("kind"), p.get("round"))
        return (self.subject, p.get("applicant_category"), p["kind"], p["basis"])


def to_due_at(day: date, at: time | None, tz_name: str) -> tuple[datetime, str]:
    """A deadline instant and its precision. Date-only deadlines are stored at local midnight."""
    tz = ZoneInfo(tz_name)
    if at is None:
        return datetime.combine(day, time(0, 0), tz), "date"
    return datetime.combine(day, at, tz), "exact_time"


def deadline_proposal(
    *,
    day: date,
    at: time | None,
    timezone: str | None,
    country: str,
    quote: str,
    cycle: CycleInfo,
    page_text: str | None,
    extra: dict[str, Any],
    region: str | None = None,
) -> Proposal:
    tz_issues = check_timezone(timezone)
    issues = check_quote(quote, page_text) + tz_issues
    tz: str | None = timezone if timezone and not tz_issues else None
    if tz is None:
        tz, certain = zone_for(country, region)
        if tz is None:
            tz = "UTC"
            issues.append(Issue("warning", "timezone_assumed", "No time zone stated; stored as UTC."))
        elif not certain:
            issues.append(Issue("warning", "timezone_assumed", f"No time zone stated; assumed {tz} for this state."))
    due_at, precision = to_due_at(day, at, tz)
    issues += check_deadline(due_at, cycle)
    proposed = {**extra, "due_at": due_at.isoformat(), "timezone": tz, "precision": precision}
    return Proposal("deadline", proposed, quote, issues)


def from_extraction(
    extraction: PageExtraction, cycle: CycleInfo, country: str, page_text: str, region: str | None = None
) -> list[Proposal]:
    proposals: list[Proposal] = []

    for lt in extraction.language_tests:
        version = lt.exam_version
        proposed = {
            "applicant_category": lt.applicant_category,
            "kind": "language_test",
            "exam": lt.exam,
            "exam_version": version,
            "min_total": lt.min_total,
            "min_sections": {s.section.lower(): s.minimum for s in lt.min_sections} or None,
        }
        issues = check_quote(lt.quote, page_text) + check_score(lt.exam, version, lt.min_total)
        if lt.exam.startswith("ielts"):  # IELTS sections share the 0-9 band scale
            for section in lt.min_sections:
                issues += check_score(lt.exam, None, section.minimum, f"{section.section} minimum")
        proposals.append(Proposal("requirement", proposed, lt.quote, issues))

    for eq in extraction.entry_qualifications:
        proposed = {
            "applicant_category": eq.applicant_category,
            "kind": "entry_qualification",
            "qualification": eq.qualification,
            "min_grade_text": eq.min_grade_text,
            "min_grade_numeric": eq.min_grade_numeric,
            "grade_scale": eq.grade_scale,
            "is_desirable": eq.is_desirable,
        }
        issues = check_quote(eq.quote, page_text)
        if eq.min_grade_numeric is not None and not eq.grade_scale:
            issues.append(Issue("error", "grade_without_scale", "A numeric minimum needs its grading scale."))
        proposals.append(Proposal("requirement", proposed, eq.quote, issues))

    for at in extraction.admissions_tests:
        proposed = {
            "applicant_category": at.applicant_category,
            "kind": "admissions_test",
            "exam": at.exam,
            "test_policy": at.test_policy,
            "min_total": at.min_total,
        }
        issues = check_quote(at.quote, page_text) + check_score(at.exam, None, at.min_total)
        proposals.append(Proposal("requirement", proposed, at.quote, issues))

    for dl in extraction.deadlines:
        try:
            day = date.fromisoformat(dl.date)
            at_time = time.fromisoformat(dl.time) if dl.time else None
        except ValueError:
            proposals.append(
                Proposal(
                    "deadline",
                    {"original_text": dl.original_text},
                    dl.quote,
                    [Issue("error", "bad_date", f"Could not read date {dl.date!r} / time {dl.time!r}.")],
                )
            )
            continue
        proposals.append(
            deadline_proposal(
                day=day,
                at=at_time,
                timezone=dl.timezone,
                country=country,
                quote=dl.quote,
                cycle=cycle,
                page_text=page_text,
                extra={
                    "applicant_category": dl.applicant_category,
                    "round": dl.round,
                    "kind": dl.kind,
                    "owning_system": dl.owning_system,
                    "original_text": dl.original_text,
                },
                region=region,
            )
        )

    for c in extraction.costs:
        high = c.amount_high if c.amount_high is not None else c.amount
        proposed = {
            "applicant_category": c.applicant_category,
            "kind": c.kind,
            "basis": c.basis,
            "low": c.amount,
            "base": (c.amount + high) / 2,
            "high": high,
            "currency": c.currency.upper(),
            "fee_year": c.fee_year,
        }
        proposals.append(
            Proposal("cost_item", proposed, c.quote, check_quote(c.quote, page_text) + check_cost(proposed))
        )

    return proposals
