"""Generate 196 synthetic evaluation fixtures for X3 extraction benchmark.

Combines with the 4 existing fixtures to reach 200 total cases.
All fixtures strictly follow the schema and quality gates of uniguide-worker.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import yaml

FIXTURES_DIR = Path(__file__).parent / "fixtures"

COUNTRIES = [
    # (code, count, currency, default_tz)
    ("US", 50, "USD", "America/New_York"),
    ("GB", 40, "GBP", "Europe/London"),
    ("CA", 25, "CAD", "America/Toronto"),
    ("AU", 25, "AUD", "Australia/Sydney"),
    ("DE", 25, "EUR", "Europe/Berlin"),
    ("NL", 15, "EUR", "Europe/Amsterdam"),
    ("IE", 8, "EUR", "Europe/Dublin"),
    ("FR", 4, "EUR", "Europe/Paris"),
    ("NZ", 2, "NZD", "Pacific/Auckland"),
    ("SG", 2, "SGD", "Asia/Singapore"),
]

FIELDS = [
    ("Computer Science", "CS"),
    ("Data Science & AI", "DS"),
    ("Mechanical Engineering", "MechEng"),
    ("Electrical Engineering", "EE"),
    ("Biomedical Engineering", "BME"),
    ("Business Administration", "MBA"),
    ("Finance", "Fin"),
    ("Economics", "Econ"),
    ("Public Health", "MPH"),
    ("Environmental Science", "EnvSci"),
    ("Civil Engineering", "CivEng"),
    ("Psychology", "Psych"),
    ("International Relations", "IR"),
    ("Biotechnology", "Biotech"),
    ("Architecture", "Arch"),
    ("Cybersecurity", "Cyber"),
]

LEVELS = [
    ("Undergraduate", "Bachelor of Science", "BS"),
    ("Postgraduate", "Master of Science", "MS"),
    ("Postgraduate", "Master of Engineering", "MEng"),
    ("Doctorate", "Doctor of Philosophy", "PhD"),
]

CYCLES = {
    "fall": ("2027-fall", 2027, "2027-09-01", "Fall 2027"),
    "autumn": ("2027-autumn", 2027, "2027-09-27", "Autumn 2027"),
    "spring": ("2027-spring", 2027, "2027-01-15", "Spring 2027"),
    "winter": ("2027-winter", 2027, "2027-02-01", "Winter 2027"),
}


def build_case(idx: int, country: str, currency: str, tz: str) -> tuple[str, str, dict[str, Any], dict[str, Any]]:
    field_name, field_code = FIELDS[idx % len(FIELDS)]
    _level_type, degree_title, degree_code = LEVELS[(idx // 3) % len(LEVELS)]

    # Pick intake
    if country in ("AU", "NZ"):
        cycle_key = "spring" if idx % 2 == 0 else "winter"
    elif country == "GB":
        cycle_key = "autumn"
    else:
        cycle_key = "fall" if idx % 4 != 0 else "spring"

    cycle_label, intake_year, starts_on, intake_desc = CYCLES[cycle_key]
    case_name = f"case_{idx:03d}_{country.lower()}_{degree_code.lower()}_{field_code.lower()}"

    uni_name = f"Example {country} University of {field_name.split()[0]} {idx}"

    # Dates
    if cycle_key in ("fall", "autumn"):
        d1_str = "2026-12-15" if idx % 2 == 0 else "2027-01-15"
        d2_str = "2027-03-31" if idx % 2 == 0 else "2027-05-15"
    else:
        d1_str = "2026-09-15"
        d2_str = "2026-11-01"

    # Tuition amounts
    base_tuition = 12000 + (idx * 370) % 38000
    app_fee = 50 + (idx * 15) % 100

    basis = "per_year"
    if country == "US" and idx % 3 == 0:
        basis = "per_credit"
        base_tuition = 1200 + (idx * 45) % 1800
    elif country == "DE" and idx % 2 == 0:
        base_tuition = 1500  # Baden-Württemberg or administration fee
        basis = "per_term"

    # HTML templates
    use_table = idx % 2 == 0

    deadline_quote_1 = f"Priority scholarship deadline: {d1_str}"
    deadline_quote_2 = f"Final application deadline: {d2_str}"
    tuition_quote = f"Tuition fee: {currency} {base_tuition:,} {basis.replace('_', ' ')}."
    app_fee_quote = f"A non-refundable application fee of {currency} {app_fee} is required."
    intake_quote = f"Admissions open for {intake_desc} entry."

    if use_table:
        cost_section = f"""
        <h2>Tuition & Fees</h2>
        <p>{tuition_quote}</p>
        <table>
            <tr><th>Fee Description</th><th>Amount</th></tr>
            <tr><td>Standard Tuition ({basis.replace("_", " ")})</td><td>{currency} {base_tuition:,}</td></tr>
            <tr><td>Application Fee</td><td>{currency} {app_fee}</td></tr>
        </table>
        <p>{app_fee_quote}</p>
        """
    else:
        cost_section = f"""
        <h2>Tuition & Fees</h2>
        <ul>
            <li>{tuition_quote}</li>
            <li>{app_fee_quote}</li>
        </ul>
        """

    html = f"""<!doctype html>
<html lang="en">
<head><title>{degree_title} in {field_name} | {uni_name}</title></head>
<body>
<main>
    <h1>{degree_title} in {field_name}</h1>
    <p>{intake_quote}</p>

    <h2>Important Deadlines</h2>
    <p>Please note the following official deadlines for {intake_desc}:</p>
    <ul>
        <li>{deadline_quote_1}</li>
        <li>{deadline_quote_2}</li>
    </ul>

    {cost_section}

    <h2>Language & Admission Requirements</h2>
    <p>English proficiency requirement: IELTS Academic 6.5 minimum overall score.</p>
</main>
<footer>© {uni_name} - Official Admissions Page</footer>
</body>
</html>
"""

    labels = {
        "cycle": {"label": cycle_label, "intake_year": intake_year, "starts_on": starts_on},
        "country": country,
        "deadlines": [
            {"date": d1_str, "kind": "priority"},
            {"date": d2_str, "kind": "application"},
        ],
        "fees": [
            {"kind": "tuition", "basis": basis, "base": base_tuition, "currency": currency},
            {"kind": "application_fee", "basis": "one_off", "base": app_fee, "currency": currency},
        ],
    }

    recorded_response = {
        "effective_intake": intake_desc,
        "effective_intake_year": intake_year,
        "language_tests": [
            {
                "applicant_category": "international",
                "exam": "ielts_academic",
                "exam_version": None,
                "min_total": 6.5,
                "min_sections": [],
                "quote": "English proficiency requirement: IELTS Academic 6.5 minimum overall score.",
            }
        ],
        "entry_qualifications": [],
        "admissions_tests": [],
        "deadlines": [
            {
                "applicant_category": "all",
                "round": "Priority",
                "kind": "priority",
                "owning_system": "direct",
                "date": d1_str,
                "time": None,
                "timezone": tz,
                "original_text": d1_str,
                "quote": deadline_quote_1,
            },
            {
                "applicant_category": "all",
                "round": "Final",
                "kind": "application",
                "owning_system": "direct",
                "date": d2_str,
                "time": None,
                "timezone": tz,
                "original_text": d2_str,
                "quote": deadline_quote_2,
            },
        ],
        "costs": [
            {
                "applicant_category": "all",
                "kind": "tuition",
                "basis": basis,
                "amount": float(base_tuition),
                "amount_high": None,
                "currency": currency,
                "fee_year": f"{intake_year}-{intake_year + 1}",
                "quote": tuition_quote,
            },
            {
                "applicant_category": "all",
                "kind": "application_fee",
                "basis": "one_off",
                "amount": float(app_fee),
                "amount_high": None,
                "currency": currency,
                "fee_year": None,
                "quote": app_fee_quote,
            },
        ],
    }

    return case_name, html, labels, recorded_response


def main() -> None:
    FIXTURES_DIR.mkdir(parents=True, exist_ok=True)
    count = 0
    idx = 1
    for country, target_count, currency, tz in COUNTRIES:
        for _ in range(target_count):
            case_name, html, labels, recorded_response = build_case(idx, country, currency, tz)
            case_dir = FIXTURES_DIR / case_name
            case_dir.mkdir(exist_ok=True)
            (case_dir / "page.html").write_text(html, encoding="utf-8")
            (case_dir / "labels.yaml").write_text(yaml.safe_dump(labels, sort_keys=False), encoding="utf-8")
            (case_dir / "recorded_response.json").write_text(json.dumps(recorded_response, indent=2), encoding="utf-8")
            count += 1
            idx += 1

    print(f"Generated {count} synthetic test cases under {FIXTURES_DIR}")


if __name__ == "__main__":
    main()
