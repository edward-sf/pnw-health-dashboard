import pytest

from pnw_health.cli import StageInputError
from pnw_health.errors import InputError, PipelineError
from pnw_health.export import ExportError
from pnw_health.fetch import FetchError
from pnw_health.model.features import ModelDataError
from pnw_health.validate import DataValidationError


@pytest.mark.parametrize(
    "error",
    [DataValidationError, FetchError, StageInputError, ExportError, ModelDataError, InputError],
)
def test_reported_errors_are_pipeline_errors(error: type[Exception]) -> None:
    assert issubclass(error, PipelineError)


@pytest.mark.parametrize("error", [InputError, ModelDataError])
def test_input_and_model_errors_stay_value_errors(error: type[Exception]) -> None:
    assert issubclass(error, ValueError)


def test_stage_unset_by_default() -> None:
    assert PipelineError("x").stage is None
