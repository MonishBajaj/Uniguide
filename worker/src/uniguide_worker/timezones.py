"""Time zone for a deadline whose page states a date but no zone."""

from __future__ import annotations

SINGLE_ZONE = {
    "GB": "Europe/London",
    "IE": "Europe/Dublin",
    "DE": "Europe/Berlin",
    "NL": "Europe/Amsterdam",
    "FR": "Europe/Paris",
    "NZ": "Pacific/Auckland",
    "IN": "Asia/Kolkata",
    "SG": "Asia/Singapore",
    "JP": "Asia/Tokyo",
    "KR": "Asia/Seoul",
    "AE": "Asia/Dubai",
    "QA": "Asia/Qatar",
    "SA": "Asia/Riyadh",
    "BH": "Asia/Bahrain",
    "OM": "Asia/Muscat",
    "KW": "Asia/Kuwait",
    "BE": "Europe/Brussels",
    "AT": "Europe/Vienna",
    "CH": "Europe/Zurich",
    "SE": "Europe/Stockholm",
    "DK": "Europe/Copenhagen",
    "FI": "Europe/Helsinki",
    "NO": "Europe/Oslo",
    "IT": "Europe/Rome",
    "ES": "Europe/Madrid",
    "PL": "Europe/Warsaw",
    "CZ": "Europe/Prague",
    "HK": "Asia/Hong_Kong",
    "MY": "Asia/Kuala_Lumpur",
}

EASTERN = [
    "CT", "DE", "DC", "FL", "GA", "IN", "KY", "ME", "MD", "MA", "MI",
    "NH", "NJ", "NY", "NC", "OH", "PA", "RI", "SC", "VT", "VA", "WV",
]  # fmt: skip
CENTRAL = ["AL", "AR", "IL", "IA", "KS", "LA", "MN", "MS", "MO", "NE", "ND", "OK", "SD", "TN", "TX", "WI"]

REGIONAL = {
    "CA": {
        "BC": "America/Vancouver",
        "AB": "America/Edmonton",
        "SK": "America/Regina",
        "MB": "America/Winnipeg",
        "ON": "America/Toronto",
        "QC": "America/Toronto",
        "NB": "America/Moncton",
        "NS": "America/Halifax",
        "PE": "America/Halifax",
        "NL": "America/St_Johns",
        "YT": "America/Whitehorse",
        "NT": "America/Yellowknife",
        "NU": "America/Iqaluit",
    },
    "AU": {
        "NSW": "Australia/Sydney",
        "ACT": "Australia/Sydney",
        "VIC": "Australia/Melbourne",
        "QLD": "Australia/Brisbane",
        "SA": "Australia/Adelaide",
        "WA": "Australia/Perth",
        "TAS": "Australia/Hobart",
        "NT": "Australia/Darwin",
    },
    "US": {
        **dict.fromkeys(EASTERN, "America/New_York"),
        **dict.fromkeys(CENTRAL, "America/Chicago"),
        **dict.fromkeys(["CO", "ID", "MT", "NM", "UT", "WY"], "America/Denver"),
        "AZ": "America/Phoenix",
        **dict.fromkeys(["CA", "NV", "OR", "WA"], "America/Los_Angeles"),
        "AK": "America/Anchorage",
        "HI": "Pacific/Honolulu",
        "PR": "America/Puerto_Rico",
    },
}

# States that span more than one zone: the predominant one is used, with a warning.
SPLIT_REGIONS = {("US", s) for s in ["FL", "IN", "KY", "TN", "MI", "TX", "KS", "NE", "SD", "ND", "ID", "OR"]}


def zone_for(country: str, region: str | None) -> tuple[str | None, bool]:
    """(zone, certain). None when the country spans several zones and the region is unknown."""
    if country in SINGLE_ZONE:
        return SINGLE_ZONE[country], True
    regional = REGIONAL.get(country, {})
    if region and region in regional:
        return regional[region], (country, region) not in SPLIT_REGIONS
    return None, False
