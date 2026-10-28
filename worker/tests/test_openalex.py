from uniguide_worker.importers.openalex import openalex_fields, parse_author, parse_works, research_text

AUTHOR = {
    "id": "https://openalex.org/A123",
    "display_name": "Ada Example",
    "orcid": "https://orcid.org/0000-0000-0000-0001",
    "works_count": 80,
    "cited_by_count": 4000,
    "topics": [
        {"display_name": "Stochastic optimisation", "count": 30, "field": {"display_name": "Computer Science"},
         "subfield": {"display_name": "Computational Theory"}},
        {"display_name": "Supply chain resilience", "count": 10, "field": {"display_name": "Decision Sciences"},
         "subfield": {"display_name": "Management Science"}},
    ],
}  # fmt: skip


def test_author_topics_and_fields() -> None:
    p = parse_author(AUTHOR)
    assert p["fields"] == ["Computer Science", "Decision Sciences"]
    assert p["topics"][0] == {
        "name": "Stochastic optimisation",
        "field": "Computer Science",
        "subfield": "Computational Theory",
        "count": 30,
    }


def test_recent_works_and_research_text() -> None:
    works = parse_works(
        {
            "results": [
                {"id": "W1", "title": "Robust scheduling", "publication_year": 2025, "doi": "https://doi.org/10.1/x"},
                {"id": "W2", "title": None},
            ]
        }
    )
    assert works == [{"title": "Robust scheduling", "year": 2025, "doi": "https://doi.org/10.1/x", "openalex_id": "W1"}]
    p = {**parse_author(AUTHOR), "recent_works": works}
    assert research_text(p) == "Stochastic optimisation. Supply chain resilience. Robust scheduling"


def test_field_mapping() -> None:
    assert openalex_fields("0613") == ["Computer Science"]
    assert openalex_fields(None) == []
