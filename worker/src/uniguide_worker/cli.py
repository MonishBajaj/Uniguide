"""uniguide-worker command line."""

from __future__ import annotations

import json
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Annotated, Any

import typer
from psycopg.types.json import Jsonb

from .config import REPO_ROOT, get_settings
from .db import Connection, connect, is_local

app = typer.Typer(help="Uniguide ingestion, extraction and seed tools.", no_args_is_help=True)
importer = typer.Typer(help="Import official registers (Listed tier).", no_args_is_help=True)
seed = typer.Typer(help="Hand-verified seed courses.", no_args_is_help=True)
app.add_typer(importer, name="import")
app.add_typer(seed, name="seed")


def _worker_conn() -> Connection:
    url = get_settings().worker_database_url
    if not url:
        raise typer.BadParameter("Set WORKER_DATABASE_URL (see .env.example)")
    return connect(url)


@contextmanager
def _run(conn: Connection, job: str) -> Iterator[dict[str, Any]]:
    """Record the job in ingest_runs, with its stats or its error."""
    row = conn.execute("insert into ingest_runs (job) values (%s) returning id", (job,)).fetchone()
    assert row is not None
    conn.commit()
    stats: dict[str, Any] = {}
    try:
        yield stats
    except Exception as exc:
        conn.rollback()
        conn.execute(
            "update ingest_runs set finished_at = now(), status = 'failed', error = %s where id = %s",
            (str(exc), row["id"]),
        )
        conn.commit()
        raise
    conn.execute(
        "update ingest_runs set finished_at = now(), status = 'succeeded', stats = %s where id = %s",
        (Jsonb(stats), row["id"]),
    )
    conn.commit()


def _report(result: Any) -> None:
    data = result.as_dict() if hasattr(result, "as_dict") else result.__dict__
    typer.echo(json.dumps(data, indent=2, default=str))


def _with_run[T](job: str, work: Callable[[Connection], T]) -> T:
    with _worker_conn() as conn, _run(conn, job) as stats:
        result = work(conn)
        stats.update(result.as_dict() if hasattr(result, "as_dict") else result.__dict__)
        return result


@importer.command("au-cricos")
def import_au_cricos(
    limit: Annotated[int | None, typer.Option(help="Import at most this many courses.")] = None,
    institutions_file: Annotated[Path | None, typer.Option(help="Local cricos-institutions.csv")] = None,
    courses_file: Annotated[Path | None, typer.Option(help="Local cricos-courses.csv")] = None,
) -> None:
    """Australia: CRICOS register from data.gov.au."""
    from .fetch.fetcher import Fetcher
    from .importers import au_cricos

    files = (str(institutions_file), str(courses_file)) if institutions_file and courses_file else None
    fetcher = None if files else Fetcher(get_settings().user_agent)
    _report(_with_run("import:au_cricos", lambda conn: au_cricos.run(conn, fetcher, limit=limit, files=files)))


@importer.command("us-scorecard")
def import_us_scorecard(
    state: Annotated[str | None, typer.Option(help="Two-letter state code to limit the import.")] = None,
    limit: Annotated[int | None, typer.Option(help="Import at most this many programs.")] = None,
) -> None:
    """United States: College Scorecard API (needs DATA_GOV_API_KEY)."""
    from .importers import us_scorecard

    settings = get_settings()
    if not settings.data_gov_api_key:
        raise typer.BadParameter("Set DATA_GOV_API_KEY (free at https://api.data.gov/signup/)")
    key = settings.data_gov_api_key
    _report(
        _with_run(
            "import:us_scorecard",
            lambda conn: us_scorecard.run(conn, api_key=key, user_agent=settings.user_agent, state=state, limit=limit),
        )
    )


@importer.command("uk-discover-uni")
def import_uk_discover_uni(
    institution_file: Annotated[Path, typer.Option(help="INSTITUTION.csv from the Discover Uni dataset")],
    course_file: Annotated[Path, typer.Option(help="KISCOURSE.csv from the Discover Uni dataset")],
    limit: Annotated[int | None, typer.Option()] = None,
) -> None:
    """United Kingdom: Discover Uni dataset files (undergraduate)."""
    from .importers import uk_discover_uni

    _report(
        _with_run(
            "import:uk_discover_uni",
            lambda conn: uk_discover_uni.run(
                conn, institution_file=str(institution_file), course_file=str(course_file), limit=limit
            ),
        )
    )


@importer.command("de-hochschulkompass")
def import_de_hochschulkompass() -> None:
    """Germany: Hochschulkompass (waits for an HRK partner export)."""
    from .importers import de_hochschulkompass
    from .importers.base import AccessPendingError

    try:
        de_hochschulkompass.run()
    except AccessPendingError as exc:
        typer.echo(str(exc), err=True)
        raise typer.Exit(2) from exc


@app.command()
def extract(
    url: Annotated[str, typer.Argument(help="Official course, admissions, fees or requirements page.")],
    cycle: Annotated[str, typer.Option(help="program_cycles.id the page describes.")],
    publish: Annotated[bool, typer.Option(help="Publish clean extractions as unverified.")] = True,
) -> None:
    """Fetch one official page, extract facts with Claude Haiku 5.5 and queue them for review."""
    from .extract.extractor import Extractor
    from .fetch.fetcher import Fetcher
    from .pipeline import extract_page

    fetcher = Fetcher(get_settings().user_agent)
    _report(_with_run("extract", lambda conn: extract_page(conn, fetcher, Extractor(), url, cycle, publish=publish)))


@seed.command("load")
def seed_load(
    root: Annotated[Path, typer.Option(help="Folder of course YAML files.")] = REPO_ROOT / "data" / "seed" / "courses",
    publish_placeholders: Annotated[
        bool, typer.Option(help="Local development only: show placeholder courses as unverified.")
    ] = False,
) -> None:
    """Load hand-verified courses (connects as the operator, OPERATOR_DATABASE_URL)."""
    from .seed.loader import SeedError, load

    url = get_settings().operator_database_url
    if not url:
        raise typer.BadParameter("Set OPERATOR_DATABASE_URL (see .env.example)")
    try:
        with connect(url) as conn:
            report = load(conn, root, hosted=not is_local(url), publish_placeholders=publish_placeholders)
    except SeedError as exc:
        typer.echo(str(exc), err=True)
        raise typer.Exit(1) from exc
    _report(report)


@seed.command("check")
def seed_check(
    root: Annotated[Path, typer.Option()] = REPO_ROOT / "data" / "seed" / "courses",
    hosted: Annotated[bool, typer.Option(help="Fail on placeholder files, as a hosted load would.")] = False,
) -> None:
    """Validate seed files without touching a database (used in CI)."""
    from .seed.loader import SeedError, check_placeholders, read_seed_files

    try:
        docs = read_seed_files(root)
        check_placeholders(docs, hosted=hosted)
    except SeedError as exc:
        typer.echo(str(exc), err=True)
        raise typer.Exit(1) from exc
    typer.echo(f"{len(docs)} seed files valid ({sum(bool(d.get('placeholder')) for _, d in docs)} placeholders)")
