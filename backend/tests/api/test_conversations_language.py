import pytest

from api.conversations.dto import MessageSnapshot
from api.conversations.language import resolve_conversation_language


@pytest.mark.parametrize(
    ("current_message", "history", "accept_language", "expected"),
    [
        (
            "How can I win?",
            [MessageSnapshot(role="user", content="¿Cómo se prepara?")],
            "es",
            "en",
        ),
        (
            "¿How can I win?",
            [MessageSnapshot(role="user", content="What is setup?")],
            "en",
            "es",
        ),
        (
            "ok",
            [
                MessageSnapshot(role="user", content="¿Cómo se prepara?"),
                MessageSnapshot(role="user", content="What is setup?"),
                MessageSnapshot(role="assistant", content="¿Quieres un ejemplo?"),
            ],
            "es",
            "en",
        ),
        (
            "🎲",
            [
                MessageSnapshot(role="user", content="How does scoring work?"),
                MessageSnapshot(role="user", content="123"),
            ],
            None,
            "en",
        ),
        ("ok", [], "en", "en"),
        ("ok", [], "es", "es"),
        ("ok", [], None, "es"),
    ],
)
def test_resolve_conversation_language_uses_the_priority_table(
    current_message,
    history,
    accept_language,
    expected,
):
    """La resolución recorre mensaje, historial, cabecera y valor final."""
    assert (
        resolve_conversation_language(
            current_message=current_message,
            history=history,
            accept_language=accept_language,
        )
        == expected
    )
