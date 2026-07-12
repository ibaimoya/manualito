from __future__ import annotations

from pathlib import Path

import pytest

from scripts.hooks import commit_message
from scripts.hooks.commit_message import validate_and_normalize

BRANCH = "chore/63-standardize-development-workflow"


def violation_codes(message: str, branch: str | None = BRANCH) -> set[str]:
    result = validate_and_normalize(message, branch)
    assert not result.changed
    assert result.message == message
    return {violation.code for violation in result.violations}


def test_missing_issue_is_added_without_changing_the_body() -> None:
    message = "chore(tooling): añadida configuración\r\n\r\nCuerpo con áéíóú.\r\n"

    result = validate_and_normalize(message, BRANCH)

    assert result.valid
    assert result.changed
    assert result.message == (
        "chore(tooling): añadida configuración (#63)\r\n\r\nCuerpo con áéíóú.\r\n"
    )


def test_correct_issue_is_idempotent() -> None:
    message = "chore: añadido fichero (#63)"

    result = validate_and_normalize(message, BRANCH)

    assert result.valid
    assert not result.changed
    assert result.message == message


def test_repeated_spaces_in_the_header_are_collapsed() -> None:
    message = "chore:  actualizada  configuración  (#63)"

    result = validate_and_normalize(message, BRANCH)

    assert result.valid
    assert result.changed
    assert result.message == "chore: actualizada configuración (#63)"


def test_repeated_spaces_in_the_body_are_preserved() -> None:
    message = "chore: actualizada  configuración\n\nTexto  alineado"

    result = validate_and_normalize(message, BRANCH)

    assert result.valid
    assert result.message == "chore: actualizada configuración (#63)\n\nTexto  alineado"


@pytest.mark.parametrize(
    ("suffix", "refs"),
    [
        ("(#63)(#42)", "#42"),
        ("(#63, #42)", "#42"),
        ("(#63,#42)", "#42"),
        ("(#42, #63)", "#42"),
        ("(#63)(#42)(#7)", "#42, #7"),
    ],
)
def test_secondary_issues_are_moved_to_refs(suffix: str, refs: str) -> None:
    message = f"chore: actualizada configuración {suffix}"

    result = validate_and_normalize(message, BRANCH)

    assert result.valid
    assert result.changed
    assert result.message == (f"chore: actualizada configuración (#63)\n\nRefs: {refs}")


def test_secondary_issues_are_appended_to_existing_refs() -> None:
    message = "chore: actualizada configuración (#63, #42)\n\nRefs: #39"

    result = validate_and_normalize(message, BRANCH)

    assert result.valid
    assert result.message == ("chore: actualizada configuración (#63)\n\nRefs: #39, #42")


def test_existing_refs_are_preserved_when_only_the_primary_suffix_is_missing() -> None:
    message = "chore: actualizada configuración\n\nRefs: #42"

    result = validate_and_normalize(message, BRANCH)

    assert result.valid
    assert result.message == "chore: actualizada configuración (#63)\n\nRefs: #42"


def test_refs_are_added_after_other_footers_and_preserve_crlf() -> None:
    message = (
        "chore: actualizada configuración (#63)(#42)\r\n\r\n"
        "Cuerpo sin cambios.\r\n\r\n"
        "Reviewed-by: Ibai\r\n"
    )

    result = validate_and_normalize(message, BRANCH)

    assert result.valid
    assert result.message == (
        "chore: actualizada configuración (#63)\r\n\r\n"
        "Cuerpo sin cambios.\r\n\r\n"
        "Reviewed-by: Ibai\r\n"
        "Refs: #42\r\n"
    )


def test_refs_are_added_after_a_body_with_terminal_newline() -> None:
    message = "chore: actualizada configuración (#63, #42)\n\nCuerpo sin cambios.\n"

    result = validate_and_normalize(message, BRANCH)

    assert result.valid
    assert result.message == (
        "chore: actualizada configuración (#63)\n\nCuerpo sin cambios.\n\nRefs: #42\n"
    )


@pytest.mark.parametrize(
    "message",
    [
        "chore: actualizada configuración (#63,#63)",
        "chore: actualizada configuración (#63)(#42)(#42)",
        "chore: actualizada configuración (#42, #42)",
        "chore: actualizada configuración (#63, #42)\n\nRefs: #42",
        "chore: actualizada configuración (#63)\n\nRefs: #42, #42",
    ],
)
def test_duplicate_issues_are_rejected(message: str) -> None:
    assert "issue-duplicate" in violation_codes(message)


@pytest.mark.parametrize(
    "message",
    [
        "chore: actualizada configuración (#42)",
        "chore: actualizada configuración (#42, #7)",
    ],
)
def test_suffix_without_the_branch_issue_is_rejected(message: str) -> None:
    assert "issue-suffix-mismatch" in violation_codes(message)


@pytest.mark.parametrize(
    "message",
    [
        "chore: actualizada configuración (#0)",
        "chore: actualizada configuración (#63,)",
        "chore: actualizada configuración #63",
        "chore: actualizada configuración (63)",
    ],
)
def test_malformed_issue_suffix_is_rejected(message: str) -> None:
    codes = violation_codes(message)
    assert any(code.startswith("issue-") for code in codes)


def test_primary_issue_cannot_also_be_in_refs() -> None:
    message = "chore: actualizada configuración (#63)\n\nRefs: #63"

    assert "issue-primary-in-refs" in violation_codes(message)


@pytest.mark.parametrize(
    ("message", "expected_code"),
    [
        ("chore: actualizada configuración\nRefs: #42", "refs-placement"),
        ("chore: actualizada configuración\n\nRefs:#42", "refs-format"),
        ("chore: actualizada configuración\n\nrefs: #42", "refs-format"),
        ("chore: actualizada configuración\n\nRefs: #42\nRefs: #43", "refs-duplicate"),
    ],
)
def test_refs_must_be_one_canonical_footer(message: str, expected_code: str) -> None:
    assert expected_code in violation_codes(message)


def test_short_issue_reference_outside_refs_is_rejected() -> None:
    message = "chore: actualizada configuración\n\nRelacionado con #42"

    assert "issue-short-reference" in violation_codes(message)


def test_full_issue_url_in_the_body_is_allowed() -> None:
    message = (
        "chore: actualizada configuración\n\n"
        "Relacionado con https://github.com/ibaimoya/manualito/issues/42"
    )

    result = validate_and_normalize(message, BRANCH)

    assert result.valid
    assert result.message.startswith("chore: actualizada configuración (#63)")


@pytest.mark.parametrize(
    ("description", "expected_code"),
    [
        ("corto1234", "subject-length"),
        ("Actualizada configuración", "subject-case"),
        ("actualizada configuración.", "subject-period"),
        ("actualizada configuración ✅", "subject-emoji"),
        ("actualizada configuración ", "subject-whitespace"),
    ],
)
def test_description_policy_is_enforced(description: str, expected_code: str) -> None:
    assert expected_code in violation_codes(f"chore: {description}")


@pytest.mark.parametrize(("length", "valid"), [(9, False), (10, True), (11, True)])
def test_description_minimum_boundary(length: int, valid: bool) -> None:
    result = validate_and_normalize(f"chore: {'a' * length}", BRANCH)

    assert result.valid is valid
    assert ("subject-length" in {item.code for item in result.violations}) is (not valid)


def message_with_final_header_length(length: int, issue: str = "63") -> str:
    fixed_length = len(f"chore:  (#{issue})")
    return f"chore: {'x' * (length - fixed_length)}"


@pytest.mark.parametrize(("length", "valid"), [(71, True), (72, True), (73, False)])
def test_final_header_maximum_boundary(length: int, valid: bool) -> None:
    result = validate_and_normalize(message_with_final_header_length(length), BRANCH)

    assert result.valid is valid
    assert ("header-length" in {item.code for item in result.violations}) is (not valid)
    if valid:
        assert len(result.message) == length


@pytest.mark.parametrize(
    ("bang", "footer", "valid"),
    [
        (False, False, True),
        (True, False, False),
        (False, True, False),
        (True, True, True),
    ],
)
def test_breaking_change_requires_bang_and_footer(
    bang: bool,
    footer: bool,
    valid: bool,
) -> None:
    marker = "!" if bang else ""
    body = "\n\nBREAKING CHANGE: eliminada compatibilidad" if footer else ""
    message = f"feat{marker}: eliminada API antigua{body}"

    result = validate_and_normalize(message, "feat/63-remove-old-api")

    assert result.valid is valid
    assert ("breaking-pair" in {item.code for item in result.violations}) is (not valid)


@pytest.mark.parametrize(
    "footer",
    [
        "BREAKING CHANGE:",
        "BREAKING-CHANGE: eliminada compatibilidad",
        "Texto\nBREAKING CHANGE: eliminada compatibilidad",
    ],
)
def test_breaking_footer_must_be_canonical_and_in_the_footer_block(footer: str) -> None:
    message = f"feat!: eliminada API antigua\n\n{footer}"

    assert "breaking-footer-format" in violation_codes(
        message,
        "feat/63-remove-old-api",
    )


def test_secondary_issue_is_added_to_the_breaking_footer_block() -> None:
    message = "feat!: eliminada API antigua (#63, #42)\n\nBREAKING CHANGE: eliminada compatibilidad"

    result = validate_and_normalize(message, "feat/63-remove-old-api")

    assert result.valid
    assert result.message == (
        "feat!: eliminada API antigua (#63)\n\nBREAKING CHANGE: eliminada compatibilidad\nRefs: #42"
    )


def test_refs_and_breaking_change_can_share_the_footer_block() -> None:
    message = "feat!: eliminada API antigua\n\nBREAKING CHANGE: eliminada compatibilidad\nRefs: #42"

    result = validate_and_normalize(message, "feat/63-remove-old-api")

    assert result.valid
    assert result.message.startswith("feat!: eliminada API antigua (#63)")


@pytest.mark.parametrize(
    ("branch", "expected_code"),
    [
        (None, "branch-detached"),
        ("master", "branch-protected"),
        ("development", "branch-protected"),
        ("staging", "branch-protected"),
        ("chore/no-number", "branch-format"),
        ("chore/0-invalid", "branch-format"),
        ("chore/63_Invalid", "branch-format"),
    ],
)
def test_invalid_branch_states_are_rejected(branch: str | None, expected_code: str) -> None:
    assert violation_codes("chore: actualizada configuración", branch) == {expected_code}


@pytest.mark.parametrize(
    "message",
    [
        "Merge branch 'feature' into master",
        'Revert "mensaje no convencional"',
        "fixup! mensaje no convencional",
        "squash! mensaje no convencional",
        "amend! mensaje no convencional",
    ],
)
def test_generated_messages_are_exempt(message: str) -> None:
    result = validate_and_normalize(message, None)

    assert result.valid
    assert result.exempt
    assert not result.changed
    assert result.message == message


@pytest.mark.parametrize(
    "message",
    [
        "chore actualizada configuración",
        "unknown: actualizada configuración",
        "chore(BACKEND): actualizada configuración",
        "chore(two words): actualizada configuración",
    ],
)
def test_non_conventional_headers_are_rejected(message: str) -> None:
    assert "conventional-format" in violation_codes(message)


def test_infinitives_are_not_treated_specially() -> None:
    result = validate_and_normalize("chore: añadir configuración", BRANCH)

    assert result.valid
    assert result.message == "chore: añadir configuración (#63)"


def test_cli_rewrites_a_valid_message(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    message_file = tmp_path / "COMMIT_EDITMSG"
    message_file.write_text("chore: actualizada configuración", encoding="utf-8")
    monkeypatch.setattr(commit_message, "current_branch", lambda: BRANCH)

    assert commit_message.main([str(message_file)]) == 0
    assert message_file.read_text(encoding="utf-8") == ("chore: actualizada configuración (#63)")


def test_cli_does_not_rewrite_an_invalid_message(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    message_file = tmp_path / "COMMIT_EDITMSG"
    original = "chore: corto"
    message_file.write_text(original, encoding="utf-8")
    monkeypatch.setattr(commit_message, "current_branch", lambda: BRANCH)

    assert commit_message.main([str(message_file)]) == 1
    assert message_file.read_text(encoding="utf-8") == original
