from llm.exceptions import (
    EmptyLlmAnswerError,
    InvalidLlmResponseError,
    LlmError,
    LlmGenerationError,
    LlmTimeoutError,
    LlmUnavailableError,
)


def test_llm_exceptions_inherit_from_llm_error():
    """Todas las excepciones LLM heredan de su base de dominio."""
    assert issubclass(LlmUnavailableError, LlmError)
    assert issubclass(LlmTimeoutError, LlmError)
    assert issubclass(LlmGenerationError, LlmError)
    assert issubclass(InvalidLlmResponseError, LlmError)
    assert issubclass(EmptyLlmAnswerError, LlmError)
