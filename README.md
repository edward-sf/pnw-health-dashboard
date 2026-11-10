# pnw-health-dashboard
Website for data exploration and machine learning with open public health data in Washington, Oregon, Idaho, and Alaska.

## Run the pipeline

Requires [uv](https://docs.astral.sh/uv/) and a free [Census API key](https://api.census.gov/data/key_signup.html), set as `CENSUS_API_KEY` in your environment or in a git-ignored `.env` file at the repo root.

```bash
cd pipeline && uv run pnw-health run --root ..
```

Stages can run separately (`--stage fetch|harmonize|export`). Raw downloads are cached in `data/raw/` (use `--refresh` to re-download), and the web artifacts are written to `web/public/data/`. Run the tests with `cd pipeline && uv run pytest`.
