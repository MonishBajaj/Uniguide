import pytest
from pytest_httpserver import HTTPServer

from uniguide_worker.fetch.fetcher import Fetcher, FetchRefused, html_to_text, is_blocked
from uniguide_worker.fetch.ratelimit import HostRateLimiter

UA = "UniguideBot/test"


def fetcher() -> Fetcher:
    return Fetcher(UA, limiter=HostRateLimiter(min_interval=0))


def test_aggregators_are_refused() -> None:
    assert is_blocked("https://www.yocket.com/universities/x")
    assert is_blocked("https://usnews.com/best-graduate-schools")
    assert not is_blocked("https://www.ed.ac.uk/studying/postgraduate")
    with pytest.raises(FetchRefused, match="Aggregator"):
        fetcher().fetch("https://www.studyportals.com/x")


def test_robots_txt_is_respected(httpserver: HTTPServer) -> None:
    httpserver.expect_request("/robots.txt").respond_with_data("User-agent: *\nDisallow: /private/\n")
    httpserver.expect_request("/private/fees").respond_with_data("<p>secret</p>")
    with pytest.raises(FetchRefused, match="robots"):
        fetcher().fetch(httpserver.url_for("/private/fees"))


def test_unreadable_robots_means_stay_away(httpserver: HTTPServer) -> None:
    httpserver.expect_request("/robots.txt").respond_with_data("oops", status=503)
    with pytest.raises(FetchRefused):
        fetcher().fetch(httpserver.url_for("/fees"))


def test_page_is_reduced_to_text_and_hashed(httpserver: HTTPServer) -> None:
    httpserver.expect_request("/robots.txt").respond_with_data("", status=404)
    httpserver.expect_request("/fees").respond_with_data(
        "<html><script>track()</script><body><h1>Fees</h1><p>£31,500 per year</p></body></html>",
        content_type="text/html",
        headers={"ETag": '"v1"'},
    )
    result = fetcher().fetch(httpserver.url_for("/fees"))
    assert result.text == "Fees £31,500 per year"
    assert len(result.content_hash) == 64
    assert result.etag == '"v1"'


def test_conditional_get_reports_not_modified(httpserver: HTTPServer) -> None:
    httpserver.expect_request("/robots.txt").respond_with_data("", status=404)
    httpserver.expect_request("/fees", headers={"If-None-Match": '"v1"'}).respond_with_data("", status=304)
    result = fetcher().fetch(httpserver.url_for("/fees"), etag='"v1"')
    assert result.not_modified and result.text == ""


def test_login_walls_are_refused(httpserver: HTTPServer) -> None:
    with pytest.raises(FetchRefused, match="login"):
        fetcher().fetch(httpserver.url_for("/account/login"))
    httpserver.expect_request("/robots.txt").respond_with_data("", status=404)
    httpserver.expect_request("/portal").respond_with_data("no", status=403)
    with pytest.raises(FetchRefused, match="restricted"):
        fetcher().fetch(httpserver.url_for("/portal"))


def test_rate_limiter_spaces_requests_per_host() -> None:
    now = [0.0]
    slept: list[float] = []

    def sleep(seconds: float) -> None:
        slept.append(seconds)
        now[0] += seconds

    limiter = HostRateLimiter(min_interval=5, clock=lambda: now[0], sleep=sleep)
    limiter.wait("a.example")
    now[0] += 1
    limiter.wait("a.example")
    limiter.wait("b.example")
    assert slept == [4]


def test_html_to_text_drops_scripts_and_styles() -> None:
    assert html_to_text("<style>p{}</style><p>Hello <b>there</b></p><script>x()</script>") == "Hello there"


def test_page_links_are_returned_absolute(httpserver: HTTPServer) -> None:
    httpserver.expect_request("/robots.txt").respond_with_data("", status=404)
    httpserver.expect_request("/course").respond_with_data(
        '<body><a href="/fees">Tuition fees</a><a href="mailto:a@b.c">Mail</a><a href="https://x.org/y">Out</a></body>',
        content_type="text/html",
    )
    result = fetcher().fetch(httpserver.url_for("/course"))
    assert result.links == (("Tuition fees", httpserver.url_for("/fees")), ("Out", "https://x.org/y"))
