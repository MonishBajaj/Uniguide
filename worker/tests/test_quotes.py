from uniguide_worker.validate.quotes import quote_in_text


def test_exact_quote_is_found() -> None:
    assert quote_in_text(
        "Applications close on 15 January 2027.", "Intro. Applications close on 15 January 2027. More."
    )


def test_whitespace_case_and_typography_are_normalised() -> None:
    page = "Applicants’ deadline:\n  15 January – 2027"
    assert quote_in_text("applicants' deadline: 15 January - 2027", page)


def test_paraphrase_is_rejected() -> None:
    assert not quote_in_text("The deadline is January 15th, 2027", "Applications close on 15 January 2027.")


def test_tiny_quotes_are_rejected() -> None:
    assert not quote_in_text("2027", "Applications close on 15 January 2027.")
