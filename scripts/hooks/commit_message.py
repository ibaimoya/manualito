from __future__ import annotations

import argparse
import re
import subprocess
import sys
import unicodedata
from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

import emoji
from conventional_pre_commit.format import is_conventional  # type: ignore[import-untyped]

COMMIT_TYPES = (
    "build",
    "chore",
    "ci",
    "docs",
    "feat",
    "fix",
    "perf",
    "refactor",
    "revert",
    "style",
    "test",
)
BRANCH_TYPES = (*COMMIT_TYPES[:6], "hotfix", *COMMIT_TYPES[6:])
PROTECTED_BRANCHES = frozenset({"master", "development", "staging"})
MIN_DESCRIPTION_LENGTH = 10
MAX_HEADER_LENGTH = 72

BRANCH_PATTERN = re.compile(
    rf"^(?P<kind>{'|'.join(BRANCH_TYPES)})/"
    r"(?P<issue>[1-9]\d*)-"
    r"(?P<slug>[a-z0-9]+(?:-[a-z0-9]+)*)$"
)
HEADER_PATTERN = re.compile(
    rf"^(?P<kind>{'|'.join(COMMIT_TYPES)})"
    r"(?:\((?P<scope>[a-z0-9]+(?:-[a-z0-9]+)*)\))?"
    r"(?P<breaking>!)?: (?P<description>.+)$"
)
ISSUE_GROUP = r"\(#[1-9]\d*(?:\s*,\s*#[1-9]\d*)*\)"
ISSUE_SUFFIX_PATTERN = re.compile(rf" (?P<cluster>{ISSUE_GROUP}(?:\s*{ISSUE_GROUP})*)$")
ISSUE_NUMBER_PATTERN = re.compile(r"#([1-9]\d*)")
SHORT_ISSUE_REFERENCE_PATTERN = re.compile(r"(?<![\w/])#\d+\b")
REFS_CANDIDATE_PATTERN = re.compile(r"^refs[\s:]", re.IGNORECASE)
REFS_PATTERN = re.compile(r"^Refs: (?P<refs>#[1-9]\d*(?:, #[1-9]\d*)*)$")
BREAKING_FOOTER_PATTERN = re.compile(r"^BREAKING CHANGE: \S.*$")
TRAILER_LINE_PATTERN = re.compile(r"^(?:BREAKING CHANGE|[A-Za-z0-9-]+)(?:: | #)\S.*$")
NEWLINE_PATTERN = re.compile(r"\r\n|[\n\r]")
LINE_ENDING_PATTERN = re.compile(r"(?:\r\n|[\n\r])$")
REPEATED_SPACES_PATTERN = re.compile(r" {2,}")


@dataclass(frozen=True, slots=True)
class Violation:
    code: str
    detail: str

    def render(self) -> str:
        return f"[{self.code}] {self.detail}"


@dataclass(frozen=True, slots=True)
class ValidationResult:
    message: str
    changed: bool = False
    exempt: bool = False
    violations: tuple[Violation, ...] = ()

    @property
    def valid(self) -> bool:
        return not self.violations


@dataclass(frozen=True, slots=True)
class BranchInfo:
    name: str
    kind: str
    issue: str
    slug: str


@dataclass(frozen=True, slots=True)
class MessageParts:
    header: str
    separator: str
    remainder: str

    def replace_header(self, header: str) -> str:
        return f"{header}{self.separator}{self.remainder}"


@dataclass(frozen=True, slots=True)
class IssueSuffix:
    bare_header: str
    issues: tuple[str, ...] = ()
    present: bool = False
    malformed: bool = False


@dataclass(frozen=True, slots=True)
class RefsFooter:
    issues: tuple[str, ...] = ()
    text: str | None = None


@dataclass(frozen=True, slots=True)
class LineSpan:
    text: str
    start: int
    text_end: int
    end: int
    ending: str


def validate_and_normalize(message: str, branch: str | None) -> ValidationResult:
    if is_generated_message(message):
        return ValidationResult(message=message, exempt=True)

    if branch is None:
        return _invalid(message, "branch-detached", "no se permiten commits en detached HEAD")
    if branch in PROTECTED_BRANCHES:
        return _invalid(
            message,
            "branch-protected",
            f"no se permiten commits directos en {branch!r}",
        )

    try:
        branch_info = parse_branch(branch)
    except ValueError as exc:
        return _invalid(message, "branch-format", str(exc))

    parts = split_message(message)
    normalized_input = parts.replace_header(REPEATED_SPACES_PATTERN.sub(" ", parts.header))
    parts = split_message(normalized_input)

    violations: list[Violation] = []
    suffix = extract_issue_suffix(parts.header)
    refs, secondary_issues = _validate_issue_references(
        normalized_input,
        suffix,
        branch_info.issue,
        violations,
    )

    header_match = HEADER_PATTERN.fullmatch(suffix.bare_header)
    if header_match is None:
        violations.append(
            Violation(
                "conventional-format",
                "usa type(scope)!: descripción con tipo y scope en minúsculas",
            )
        )
    else:
        _validate_description(header_match.group("description"), violations)
        _validate_breaking_change(
            normalized_input,
            header_match.group("breaking") is not None,
            violations,
        )

    candidate_header = f"{suffix.bare_header} (#{branch_info.issue})"
    header_length = len(unicodedata.normalize("NFC", candidate_header))
    if header_length > MAX_HEADER_LENGTH:
        violations.append(
            Violation(
                "header-length",
                f"la cabecera final tiene {header_length} caracteres; máximo {MAX_HEADER_LENGTH}",
            )
        )

    if violations:
        return ValidationResult(message=message, violations=tuple(violations))

    combined_refs = (*refs.issues, *secondary_issues)
    bare_message = parts.replace_header(suffix.bare_header)
    normalized_bare_message = normalize_refs_footer(
        bare_message,
        refs,
        combined_refs,
    )
    conventional_input = normalized_bare_message.replace("\r\n", "\n").replace("\r", "\n")
    if not is_conventional(conventional_input, types=list(COMMIT_TYPES)):
        return _invalid(
            message,
            "conventional-format",
            "el mensaje completo no cumple Conventional Commits",
        )

    normalized_message = split_message(normalized_bare_message).replace_header(candidate_header)
    return ValidationResult(
        message=normalized_message,
        changed=normalized_message != message,
    )


def parse_branch(branch: str) -> BranchInfo:
    match = BRANCH_PATTERN.fullmatch(branch)
    if match is None:
        raise ValueError(
            "la rama debe seguir <tipo>/<issue>-<slug> con issue positiva y slug kebab-case"
        )
    return BranchInfo(name=branch, **match.groupdict())


def current_branch() -> str | None:
    completed = subprocess.run(
        ["git", "symbolic-ref", "--quiet", "--short", "HEAD"],
        check=False,
        capture_output=True,
        encoding="utf-8",
        text=True,
    )
    if completed.returncode == 1:
        return None
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or "no se pudo consultar la rama actual")
    return completed.stdout.strip()


def split_message(message: str) -> MessageParts:
    match = NEWLINE_PATTERN.search(message)
    if match is None:
        return MessageParts(header=message, separator="", remainder="")
    return MessageParts(
        header=message[: match.start()],
        separator=match.group(),
        remainder=message[match.end() :],
    )


def is_generated_message(message: str) -> bool:
    header = split_message(message).header
    lowered = header.casefold()
    return (
        lowered.startswith("merge ")
        or header.startswith('Revert "')
        or lowered.startswith(("fixup! ", "squash! ", "amend! "))
    )


def extract_issue_suffix(header: str) -> IssueSuffix:
    match = ISSUE_SUFFIX_PATTERN.search(header)
    if match is not None:
        issues = tuple(ISSUE_NUMBER_PATTERN.findall(match.group("cluster")))
        return IssueSuffix(
            bare_header=header[: match.start()],
            issues=issues,
            present=True,
        )
    return IssueSuffix(
        bare_header=header,
        malformed=_has_issue_like_suffix(header),
    )


def parse_refs_footer(
    message: str,
    violations: list[Violation],
) -> RefsFooter:
    spans = line_spans(message)
    raw_lines = [
        (index, line.text)
        for index, line in enumerate(spans)
        if REFS_CANDIDATE_PATTERN.match(line.text)
    ]
    if len(raw_lines) > 1:
        violations.append(Violation("refs-duplicate", "solo se permite un footer Refs"))
    footer_indices = _footer_line_indices(spans)
    if any(index not in footer_indices for index, _ in raw_lines):
        violations.append(
            Violation(
                "refs-placement",
                "Refs debe ser un footer al final del mensaje y estar separado por una línea vacía",
            )
        )
    if not raw_lines:
        return RefsFooter()

    refs_text = raw_lines[0][1]
    match = REFS_PATTERN.fullmatch(refs_text)
    if match is None:
        violations.append(Violation("refs-format", "usa Refs: #N o Refs: #N, #N"))
        return RefsFooter(text=refs_text)
    issues = tuple(ISSUE_NUMBER_PATTERN.findall(match.group("refs")))
    return RefsFooter(issues=issues, text=refs_text)


def normalize_refs_footer(
    message: str,
    existing: RefsFooter,
    issues: tuple[str, ...],
) -> str:
    if not issues:
        return message

    refs_line = f"Refs: {', '.join(f'#{issue}' for issue in issues)}"
    if existing.text is not None:
        for line in line_spans(message):
            if line.text == existing.text:
                return f"{message[: line.start]}{refs_line}{message[line.text_end :]}"
        raise RuntimeError("no se encontró el footer Refs validado")

    newline = preferred_newline(message)
    spans = line_spans(message)
    footer_indices = _footer_line_indices(spans)
    if footer_indices:
        last_line = spans[max(footer_indices)]
        if last_line.ending:
            return (
                f"{message[: last_line.end]}{refs_line}{last_line.ending}{message[last_line.end :]}"
            )
        return f"{message}{newline}{refs_line}"

    last_nonempty = max(index for index, line in enumerate(spans) if line.text)
    has_blank_separator = any(not line.text for line in spans[last_nonempty + 1 :])
    if has_blank_separator:
        return f"{message}{refs_line}{newline}"
    if spans[-1].ending:
        return f"{message}{newline}{refs_line}{newline}"
    return f"{message}{newline}{newline}{refs_line}"


def preferred_newline(message: str) -> str:
    match = NEWLINE_PATTERN.search(message)
    return match.group() if match is not None else "\n"


def line_spans(message: str) -> tuple[LineSpan, ...]:
    raw_lines = message.splitlines(keepends=True) or [message]
    spans: list[LineSpan] = []
    position = 0
    for raw_line in raw_lines:
        ending_match = LINE_ENDING_PATTERN.search(raw_line)
        ending = ending_match.group() if ending_match is not None else ""
        text = raw_line[: -len(ending)] if ending else raw_line
        text_end = position + len(text)
        end = position + len(raw_line)
        spans.append(LineSpan(text, position, text_end, end, ending))
        position = end
    return tuple(spans)


def _validate_issue_references(
    message: str,
    suffix: IssueSuffix,
    primary_issue: str,
    violations: list[Violation],
) -> tuple[RefsFooter, tuple[str, ...]]:
    if suffix.malformed:
        violations.append(
            Violation(
                "issue-suffix-format",
                f"el sufijo debe contener issues positivas, por ejemplo (#{primary_issue})",
            )
        )

    header_duplicates = _duplicates(suffix.issues)
    if header_duplicates:
        violations.append(
            Violation(
                "issue-duplicate",
                f"issues duplicadas en la cabecera: {_format_issues(header_duplicates)}",
            )
        )
    elif suffix.present and primary_issue not in suffix.issues:
        violations.append(
            Violation(
                "issue-suffix-mismatch",
                f"la rama usa #{primary_issue}, pero el sufijo no la contiene",
            )
        )

    refs = parse_refs_footer(message, violations)
    refs_duplicates = _duplicates(refs.issues)
    if refs_duplicates:
        violations.append(
            Violation(
                "issue-duplicate",
                f"issues duplicadas en Refs: {_format_issues(refs_duplicates)}",
            )
        )

    secondary_issues = tuple(issue for issue in suffix.issues if issue != primary_issue)
    if primary_issue in refs.issues:
        violations.append(
            Violation(
                "issue-primary-in-refs",
                f"la issue principal #{primary_issue} no debe repetirse en Refs",
            )
        )
    repeated_between_locations = tuple(issue for issue in secondary_issues if issue in refs.issues)
    if repeated_between_locations:
        violations.append(
            Violation(
                "issue-duplicate",
                "issues repetidas entre la cabecera y Refs: "
                f"{_format_issues(repeated_between_locations)}",
            )
        )

    _validate_short_references(suffix.bare_header, message, refs.text, violations)
    return refs, secondary_issues


def _has_issue_like_suffix(header: str) -> bool:
    stripped = header.rstrip()
    if stripped.endswith(")"):
        opening = stripped.rfind("(")
        if opening >= 0:
            content = stripped[opening + 1 : -1]
            if "#" in content or content.strip().isdigit():
                return True

    hash_position = stripped.rfind("#")
    return hash_position >= 0 and stripped[hash_position + 1 :].isdigit()


def _validate_description(description: str, violations: list[Violation]) -> None:
    normalized = unicodedata.normalize("NFC", description)
    if description != description.strip():
        violations.append(Violation("subject-whitespace", "elimina espacios sobrantes"))
    if len(normalized) < MIN_DESCRIPTION_LENGTH:
        violations.append(
            Violation(
                "subject-length",
                f"la descripción debe tener al menos {MIN_DESCRIPTION_LENGTH} caracteres",
            )
        )
    if description and not description[0].islower():
        violations.append(Violation("subject-case", "la descripción debe comenzar en minúscula"))
    if description.endswith("."):
        violations.append(Violation("subject-period", "la descripción no debe acabar en punto"))
    if emoji.emoji_list(description):
        violations.append(Violation("subject-emoji", "la descripción no debe contener emojis"))


def _validate_breaking_change(
    message: str,
    has_bang: bool,
    violations: list[Violation],
) -> None:
    spans = line_spans(message)
    raw_candidates = [
        (index, line.text)
        for index, line in enumerate(spans[1:], start=1)
        if line.text.startswith(("BREAKING CHANGE:", "BREAKING-CHANGE:"))
    ]
    exact_raw = [
        (index, line) for index, line in raw_candidates if BREAKING_FOOTER_PATTERN.fullmatch(line)
    ]
    footer_indices = _footer_line_indices(spans)
    exact_footers = [line for index, line in exact_raw if index in footer_indices]
    if len(raw_candidates) != len(exact_raw) or len(exact_raw) != len(exact_footers):
        violations.append(
            Violation(
                "breaking-footer-format",
                "usa exactamente BREAKING CHANGE: <descripción> como footer",
            )
        )
    if len(exact_footers) > 1:
        violations.append(
            Violation("breaking-footer-duplicate", "solo se permite un footer BREAKING CHANGE")
        )
    if has_bang != bool(exact_footers):
        violations.append(
            Violation(
                "breaking-pair",
                "un breaking change debe incluir simultáneamente ! y BREAKING CHANGE:",
            )
        )


def _footer_line_indices(spans: tuple[LineSpan, ...]) -> frozenset[int]:
    nonempty_indices = [index for index, line in enumerate(spans) if line.text]
    if not nonempty_indices:
        return frozenset()

    footer_start = nonempty_indices[-1]
    while footer_start > 0 and TRAILER_LINE_PATTERN.fullmatch(spans[footer_start].text):
        footer_start -= 1
    footer_start += 1
    if footer_start >= len(spans) or footer_start == 0:
        return frozenset()
    if spans[footer_start - 1].text:
        return frozenset()

    return frozenset(range(footer_start, nonempty_indices[-1] + 1))


def _validate_short_references(
    bare_header: str,
    message: str,
    refs_text: str | None,
    violations: list[Violation],
) -> None:
    invalid_locations = [bare_header]
    invalid_locations.extend(
        line.text for line in line_spans(message)[1:] if line.text != refs_text
    )
    if any(SHORT_ISSUE_REFERENCE_PATTERN.search(text) for text in invalid_locations):
        violations.append(
            Violation(
                "issue-short-reference",
                "usa #N solo en el sufijo principal o en el footer Refs",
            )
        )


def _duplicates(values: tuple[str, ...]) -> tuple[str, ...]:
    return tuple(value for value, count in Counter(values).items() if count > 1)


def _format_issues(issues: tuple[str, ...]) -> str:
    return ", ".join(f"#{issue}" for issue in issues)


def _invalid(message: str, code: str, detail: str) -> ValidationResult:
    return ValidationResult(message=message, violations=(Violation(code, detail),))


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Valida mensajes de commit de Manualito")
    parser.add_argument("message_file", type=Path)
    args = parser.parse_args(argv)

    try:
        original = args.message_file.read_bytes().decode("utf-8")
        result = validate_and_normalize(original, current_branch())
    except (OSError, UnicodeError, RuntimeError) as exc:
        print(f"manualito-hooks: error interno: {exc}", file=sys.stderr)
        return 2

    if not result.valid:
        print("manualito-hooks: commit rechazado", file=sys.stderr)
        for violation in result.violations:
            print(f"  {violation.render()}", file=sys.stderr)
        return 1
    if result.changed:
        try:
            args.message_file.write_bytes(result.message.encode("utf-8"))
        except OSError as exc:
            print(f"manualito-hooks: no se pudo actualizar el mensaje: {exc}", file=sys.stderr)
            return 2
        print("manualito-hooks: mensaje normalizado")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
