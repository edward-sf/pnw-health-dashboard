"""The tidy long format every source parser produces and every later stage consumes."""

LONG_COLUMNS: list[str] = [
    "fips",
    "indicator_id",
    "year",
    "value",
    "ci_low",
    "ci_high",
    "source",
]
