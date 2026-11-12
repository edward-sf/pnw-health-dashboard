"""Errors the CLI reports as a plain message; anything else keeps its traceback."""

from __future__ import annotations


class PipelineError(Exception):
    """A failure the pipeline expects and can explain: bad input, a missing stage, a fetch.

    ``stage`` is set by ``run_pipeline`` to the stage that raised it, so the CLI can say
    where the run stopped. It is ``None`` for errors raised before any stage starts.
    """

    stage: str | None = None


class InputError(PipelineError, ValueError):
    """Configuration or input data the pipeline cannot use (``.env``, catalog, source rows)."""
