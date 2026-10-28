"""uniguide-worker command line."""

from __future__ import annotations

import json
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Annotated, Any

import typer
from psycopg.types.json import Jsonb

from .config import get_settings
from .db import Connection, connect, is_local
from .fetch.fetcher import Fetcher

app = typer.Typer(help="Uniguide ingestion, extraction and seed tools.", no_args_is_help=True)
importer = typer.Typer(help="Import official registers (Listed tier).", no_args_is_help=True)
seed = typer.Typer(help="Hand-verified seed courses.", no_args_is_help=True)
research = typer.Typer(help="Consented outcomes: analytics and the admission model.", no_args_is_help=True)
app.add_typer(research, name="research")
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
    with_fees: Annotated[bool, typer.Option(help="Also propose register tuition as unverified facts.")] = False,
) -> None:
    """Australia: CRICOS register from data.gov.au."""
    from .fetch.fetcher import Fetcher
    from .importers import au_cricos

    files = (str(institutions_file), str(courses_file)) if institutions_file and courses_file else None
    fetcher = None if files else Fetcher(get_settings().user_agent)
    _report(
        _with_run(
            "import:au_cricos", lambda conn: au_cricos.run(conn, fetcher, limit=limit, files=files, with_fees=with_fees)
        )
    )


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


@importer.command("nl-duo")
def import_nl_duo(
    file: Annotated[Path | None, typer.Option(help="Local ho_opleidingsoverzicht.csv")] = None,
    limit: Annotated[int | None, typer.Option(help="Import at most this many programmes.")] = None,
) -> None:
    """Netherlands: DUO overview of accredited higher-education programmes."""
    from .fetch.fetcher import Fetcher
    from .importers import nl_duo

    fetcher = None if file else Fetcher(get_settings().user_agent)
    path = str(file) if file else None
    _report(_with_run("import:nl_duo", lambda conn: nl_duo.run(conn, fetcher, file=path, limit=limit)))


@importer.command("ror-match")
def import_ror_match(
    country: Annotated[str | None, typer.Option(help="Two-letter country code.")] = None,
    limit: Annotated[int, typer.Option(help="Institutions to look up.")] = 200,
) -> None:
    """Attach ROR identifiers using ROR's affiliation matcher (accepts only its chosen match)."""
    from .importers import ror

    ua = get_settings().user_agent
    _report(_with_run("import:ror_match", lambda conn: ror.run(conn, user_agent=ua, country=country, limit=limit)))


@importer.command("openalex-faculty")
def import_openalex_faculty(
    program: Annotated[str, typer.Option(help="Course slug; researchers at its institution in its field.")],
    limit: Annotated[int, typer.Option(help="Researchers to keep.")] = 40,
) -> None:
    """Research-degree faculty from OpenAlex (needs the institution's ROR id; OPENALEX_API_KEY recommended)."""
    from .importers import openalex

    settings = get_settings()

    def work(conn: Connection) -> object:
        row = conn.execute("select institution_id, isced_f from programs where slug = %s", (program,)).fetchone()
        if row is None:
            raise typer.BadParameter(f"No course {program}")
        return openalex.run(
            conn, institution_id=str(row["institution_id"]), contact=settings.crawler_contact,
            isced_f=row["isced_f"], limit=limit,
        )  # fmt: skip

    _report(_with_run("import:openalex_faculty", work))


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


@app.command("extract-program")
def extract_program_cmd(slug: Annotated[str, typer.Argument(help="Course slug.")]) -> None:
    """Read every registered official page of one course and queue what they state."""
    from .extract.extractor import Extractor
    from .monitor import extract_program

    fetcher = Fetcher(get_settings().user_agent)
    _report(_with_run("extract-program", lambda conn: extract_program(conn, fetcher, Extractor(), slug)))


@app.command("monitor")
def monitor_cmd(limit: Annotated[int, typer.Option(help="Pages to re-check this run.")] = 50) -> None:
    """Weekly in season: re-check pages by demand, re-extract changed ones, tell watchers."""
    from .extract.extractor import Extractor
    from .monitor import monitor

    fetcher = Fetcher(get_settings().user_agent)
    _report(_with_run("monitor", lambda conn: monitor(conn, fetcher, Extractor(), limit=limit)))


@seed.command("load")
def seed_load(
    publish_placeholders: Annotated[
        bool, typer.Option(help="Local development only: show placeholder courses as unverified.")
    ] = False,
) -> None:
    """Load hand-verified courses from data/seed/courses (connects as the operator, OPERATOR_DATABASE_URL).

    With --publish-placeholders, the fictional courses in data/seed/placeholders load too (local only).
    """
    from .seed.loader import PLACEHOLDER_ROOT, SEED_ROOT, SeedError, load

    url = get_settings().operator_database_url
    if not url:
        raise typer.BadParameter("Set OPERATOR_DATABASE_URL (see .env.example)")
    try:
        with connect(url) as conn:
            report = load(
                conn,
                [SEED_ROOT, PLACEHOLDER_ROOT] if publish_placeholders else [SEED_ROOT],
                hosted=not is_local(url),
                publish_placeholders=publish_placeholders,
            )
    except SeedError as exc:
        typer.echo(str(exc), err=True)
        raise typer.Exit(1) from exc
    _report(report)


@seed.command("check")
def seed_check(
    hosted: Annotated[bool, typer.Option(help="Check only real courses, as a hosted load would.")] = False,
) -> None:
    """Validate seed files without touching a database (used in CI)."""
    from .seed.loader import (
        PLACEHOLDER_ROOT,
        SEED_ROOT,
        SeedError,
        check_placeholders,
        check_second_look,
        check_sources,
        read_seed_files,
    )

    try:
        check_placeholders(read_seed_files(SEED_ROOT), hosted=True)
        docs = read_seed_files(SEED_ROOT) if hosted else read_seed_files(SEED_ROOT, PLACEHOLDER_ROOT)
        check_sources(docs)
        check_second_look(docs)
    except SeedError as exc:
        typer.echo(str(exc), err=True)
        raise typer.Exit(1) from exc
    typer.echo(f"{len(docs)} seed files valid ({sum(bool(d.get('placeholder')) for _, d in docs)} placeholders)")


@seed.command("status")
def seed_status_cmd(
    stale_days: Annotated[int, typer.Option(help="Re-check deadlines not verified in this many days.")] = 30,
) -> None:
    """Report real course coverage by country and deadlines due for re-checking."""
    from datetime import date

    from .seed.loader import SEED_ROOT, read_seed_files
    from .seed.status import seed_status

    status = seed_status(read_seed_files(SEED_ROOT), date.today(), stale_days=stale_days)
    typer.echo(f"Real courses: {status.total} of {status.target}")
    for country, count in status.by_country.items():
        typer.echo(f"  {country}: {count}")
    for fact in status.stale:
        typer.echo(f"Stale: {fact.path} · {fact.slug} · {fact.cycle} · verified {fact.verified_at}")


@app.command()
def notify() -> None:
    """Send due deadline reminders and update emails (connects as the notifier role)."""
    from .mailer import Mailer
    from .notify import send_reminders

    settings = get_settings()
    if not settings.notifier_database_url:
        raise typer.BadParameter("Set NOTIFIER_DATABASE_URL (see .env.example)")
    mailer = Mailer.from_env()
    with connect(settings.notifier_database_url) as conn:
        report = send_reminders(conn, mailer, settings.site_url)
    if mailer.dry_run:
        for m in mailer.sent:
            typer.echo(f"[dry run] to {m.to}: {m.subject}")
    _report(report)


def _analyst_conn() -> Connection:
    url = get_settings().analyst_database_url
    if not url:
        raise typer.BadParameter("Set ANALYST_DATABASE_URL (see .env.example)")
    return connect(url)


@research.command("outcomes")
def research_outcomes(
    min_n: Annotated[int, typer.Option(help="Suppress groups smaller than this.")] = 10,
) -> None:
    """Admit shares by destination and course, from consented outcomes only."""
    from .research.outcomes import build_report, load_rows

    with _analyst_conn() as conn:
        _report(build_report(load_rows(conn), min_n=min_n))


@research.command("train-admission")
def research_train_admission(
    dry_run: Annotated[bool, typer.Option(help="Evaluate without storing the run.")] = False,
) -> None:
    """Fit the admission model, test it on the latest intake, and publish it only if it passes the gate."""
    from .research.admission import evaluate, publish
    from .research.outcomes import load_rows

    with _analyst_conn() as conn:
        ev = evaluate(load_rows(conn))
        if ev is None:
            typer.echo("Need outcomes from at least two intake years; nothing to train.")
            return
        summary = {k: v for k, v in ev.__dict__.items() if k != "fit"}
        if not dry_run:
            summary["model_id"] = publish(conn, ev)
    typer.echo(json.dumps(summary, indent=2, default=str))
