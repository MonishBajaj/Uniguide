"""Scaffold a new hand-verified course seed file."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from ..config import REPO_ROOT

COUNTRY_DEFAULTS: dict[str, dict[str, Any]] = {
    "US": {
        "credit_system": "us_credit",
        "currency": "USD",
        "duration_months": 24,
        "required_credits": 30,
        "cip": "11.0701",
        "term": "fall",
        "starts": "2027-08-25",
    },
    "GB": {
        "credit_system": "uk_cats",
        "currency": "GBP",
        "duration_months": 12,
        "required_credits": 180,
        "term": "fall",
        "starts": "2027-10-01",
    },
    "DE": {
        "credit_system": "ects",
        "currency": "EUR",
        "duration_months": 24,
        "required_credits": 120,
        "term": "winter",
        "starts": "2027-10-01",
    },
    "CA": {
        "credit_system": "other",
        "currency": "CAD",
        "duration_months": 24,
        "required_credits": 30,
        "cip": "11.0701",
        "term": "fall",
        "starts": "2027-09-01",
    },
    "AU": {
        "credit_system": "other",
        "currency": "AUD",
        "duration_months": 24,
        "required_credits": 96,
        "term": "first_semester",
        "starts": "2027-02-20",
    },
    "IE": {
        "credit_system": "ects",
        "currency": "EUR",
        "duration_months": 12,
        "required_credits": 90,
        "term": "fall",
        "starts": "2027-09-01",
    },
}


def scaffold_course_file(
    country: str,
    slug: str,
    *,
    institution_name: str | None = None,
    program_title: str | None = None,
    official_domain: str | None = None,
    target_dir: Path | None = None,
    force: bool = False,
) -> Path:
    country_code = country.strip().upper()
    dest_dir = (target_dir or (REPO_ROOT / "data" / "seed" / "courses")) / country_code.lower()
    dest_dir.mkdir(parents=True, exist_ok=True)
    out_path = dest_dir / f"{slug}.yaml"

    if out_path.exists() and not force:
        raise FileExistsError(f"{out_path} already exists. Pass --force to overwrite.")

    defaults = COUNTRY_DEFAULTS.get(
        country_code,
        {
            "credit_system": "other",
            "currency": "USD",
            "duration_months": 24,
            "required_credits": 120,
            "term": "fall",
            "starts": "2027-09-01",
        },
    )

    name = institution_name or f"University Name ({country_code})"
    title = program_title or "MS in Computer Science"
    domain = official_domain or f"{slug.split('-')[0]}.edu"
    official_url = f"https://www.{domain}/academics/{slug}"
    cycle_label = f"2027-{defaults['term']}"

    data: dict[str, Any] = {
        "institution": {
            "name": name,
            "country": country_code,
            "city": "City Name",
            "region": "ST",
            "official_domain": domain,
            "ids": {
                "ror_id": "https://ror.org/xxxxxxxxx",
            },
        },
        "program": {
            "slug": slug,
            "title": title,
            "level": "master",
            "isced_level": 7,
            "isced_f": "0613",
            "field_label": "Computer Science",
            "delivery_mode": "on_campus",
            "duration_months": defaults["duration_months"],
            "required_credits": defaults["required_credits"],
            "credit_system": defaults["credit_system"],
            "languages_of_instruction": ["en"],
            "official_url": official_url,
        },
        "cycles": [
            {
                "label": cycle_label,
                "intake_year": 2027,
                "intake_term": defaults["term"],
                "starts_on": defaults["starts"],
                "facts": [
                    {
                        "subject": "requirement",
                        "fields": {
                            "kind": "entry_qualification",
                            "applicant_category": "all",
                            "qualification": "bachelor_any",
                            "details": "Recognized undergraduate degree in Computer Science or a related field.",
                        },
                        "source_url": official_url,
                        "evidence_quote": "Verbatim quote stating the degree requirement from the official page.",
                        "verified_by": "Harman",
                        "verified_at": "2026-10-28",
                        "second_checked_by": "Reviewer2",
                        "second_checked_at": "2026-10-28",
                    },
                    {
                        "subject": "requirement",
                        "fields": {
                            "kind": "language_test",
                            "applicant_category": "international",
                            "exam": "toefl_ibt",
                            "min_total": 90,
                        },
                        "source_url": official_url,
                        "evidence_quote": "Verbatim quote stating the TOEFL requirement from the official page.",
                        "verified_by": "Harman",
                        "verified_at": "2026-10-28",
                        "second_checked_by": "Reviewer2",
                        "second_checked_at": "2026-10-28",
                    },
                    {
                        "subject": "requirement",
                        "fields": {
                            "kind": "language_test",
                            "applicant_category": "international",
                            "exam": "ielts_academic",
                            "min_total": 7.0,
                        },
                        "source_url": official_url,
                        "evidence_quote": "Verbatim quote stating the IELTS requirement from the official page.",
                        "verified_by": "Harman",
                        "verified_at": "2026-10-28",
                        "second_checked_by": "Reviewer2",
                        "second_checked_at": "2026-10-28",
                    },
                    {
                        "subject": "deadline",
                        "fields": {
                            "date": "2027-01-15",
                            "kind": "application",
                            "owning_system": "direct",
                            "original_text": "Application deadline: January 15",
                            "applicant_category": "all",
                        },
                        "source_url": official_url,
                        "evidence_quote": "Verbatim quote stating application deadline from the official page.",
                        "verified_by": "Harman",
                        "verified_at": "2026-10-28",
                        "second_checked_by": "Reviewer2",
                        "second_checked_at": "2026-10-28",
                    },
                    {
                        "subject": "cost_item",
                        "fields": {
                            "kind": "tuition",
                            "basis": "per_year",
                            "base": 30000,
                            "currency": defaults["currency"],
                            "fee_year": "2027-28",
                            "applicant_category": "international",
                            "details": "Tuition for international graduate students",
                        },
                        "source_url": official_url,
                        "evidence_quote": "Verbatim quote stating the tuition fee from the official university page.",
                        "verified_by": "Harman",
                        "verified_at": "2026-10-28",
                        "second_checked_by": "Reviewer2",
                        "second_checked_at": "2026-10-28",
                    },
                ],
            }
        ],
    }

    if "cip" in defaults:
        data["program"]["cip"] = defaults["cip"]

    content = yaml.dump(data, sort_keys=False, allow_unicode=True)
    out_path.write_text(content, encoding="utf-8")
    return out_path
