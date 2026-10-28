"""What the model may return for one official page. Every item carries a verbatim quote.

Numeric ranges are not enforced here (structured outputs do not support bounds); the
deterministic validators check them afterwards.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

ApplicantCategory = Literal["all", "domestic", "international", "eu_eea", "uk_home"]
LanguageExam = Literal[
    "ielts_academic",
    "ielts_ukvi",
    "toefl_ibt",
    "toefl_ibt_home",
    "pte_academic",
    "duolingo",
    "cambridge_c1_c2",
    "testdaf",
    "dsh",
    "goethe",
    "delf_dalf",
    "tcf",
]
AdmissionsExam = Literal["gre", "gmat", "sat", "act"]
TestPolicy = Literal["required", "recommended", "optional", "not_accepted", "waived_conditional"]
DeadlineKind = Literal["application", "priority", "funding", "scholarship", "documents", "deposit"]
OwningSystem = Literal["direct", "ucas", "uni_assist", "common_app", "ouac", "uac", "cao", "other"]
CostKind = Literal["tuition", "fees", "insurance", "living", "application_fee", "other"]
CostBasis = Literal["per_credit", "per_term", "per_year", "per_month", "total", "one_off"]


class _Item(BaseModel):
    model_config = ConfigDict(extra="forbid")

    quote: str = Field(description="Verbatim sentence or table cell from the page that states this fact.")


class SectionMinimum(BaseModel):
    model_config = ConfigDict(extra="forbid")

    section: str = Field(description="reading, writing, listening, speaking, verbal, quantitative, ...")
    minimum: float


class LanguageTest(_Item):
    applicant_category: ApplicantCategory
    exam: LanguageExam
    exam_version: str | None = Field(description="Only if the page names it, e.g. 'TOEFL iBT (from January 2026)'.")
    min_total: float | None
    min_sections: list[SectionMinimum]


class EntryQualification(_Item):
    applicant_category: ApplicantCategory
    qualification: str = Field(
        description="Code such as a_levels, ib, cbse, isc, atar, abitur, bachelor_3yr, bachelor_4yr, bachelor_any."
    )
    min_grade_text: str | None = Field(description="The minimum exactly as written, e.g. 'AAA', '2:1', '36 points'.")
    min_grade_numeric: float | None
    grade_scale: str | None = Field(description="percent, gpa_4, gpa_10, ib_45, atar, uk_class, ...")
    is_desirable: bool = Field(description="True when the page calls it preferred/desirable rather than required.")


class AdmissionsTest(_Item):
    applicant_category: ApplicantCategory
    exam: AdmissionsExam
    test_policy: TestPolicy
    min_total: float | None


class Deadline(_Item):
    applicant_category: ApplicantCategory
    round: str | None
    kind: DeadlineKind
    owning_system: OwningSystem
    date: str = Field(description="YYYY-MM-DD as stated on the page.")
    time: str | None = Field(description="HH:MM in 24h if the page states a time.")
    timezone: str | None = Field(description="IANA zone if the page states one, e.g. Europe/London.")
    original_text: str


class Cost(_Item):
    applicant_category: ApplicantCategory
    kind: CostKind
    basis: CostBasis
    amount: float
    amount_high: float | None = Field(description="Upper end when the page gives a range.")
    currency: str = Field(description="ISO 4217 code, e.g. GBP, USD, EUR, AUD, CAD.")
    fee_year: str | None = Field(description="e.g. '2027-28' if stated.")


class PageExtraction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    effective_intake: str | None = Field(
        description="The intake/cycle the page says these facts apply to, quoted, e.g. 'for Fall 2027 entry'."
    )
    effective_intake_year: int | None
    language_tests: list[LanguageTest]
    entry_qualifications: list[EntryQualification]
    admissions_tests: list[AdmissionsTest]
    deadlines: list[Deadline]
    costs: list[Cost]
