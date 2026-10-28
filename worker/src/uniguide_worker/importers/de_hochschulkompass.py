"""Germany: Hochschulkompass (HRK). Reuse needs a partner export agreed with HRK.

Until access is granted this importer refuses to run rather than scraping the site, whose terms
restrict automated reuse. Apply early: https://www.hochschulkompass.de/
"""

from __future__ import annotations

from typing import NoReturn

from .base import AccessPendingError


def run(*_args: object, **_kwargs: object) -> NoReturn:
    raise AccessPendingError(
        "Hochschulkompass data needs a partner export from HRK. Request access; do not scrape the site."
    )
