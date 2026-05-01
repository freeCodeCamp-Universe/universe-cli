---
name: changelog
description: Guides changelog updates whenever the user mentions a changelog or CHANGELOG.md, release notes, or update notes. Review the current changes first, then add entries that explain why the changes were made more than what changed.
---

# Changelog

## Core principle

Focus on the **why** more than the **what**. The code already describes what changed, so the changelog should explain the reason behind the change.

## Workflow

1. Inspect the current changes (use `git diff`) before drafting an entry.
2. Reuse the repository's existing changelog format, headings, and ordering.
3. Write concise entries that reflect the actual changes only.
4. Prefer motivations, tradeoffs, and user impact over implementation detail.
5. If the reason for a change is unclear from the code or diff, gather more context before writing.

## Writing guidance

- Describe intent, benefit, or rationale.
- Keep entries specific and accurate.
- Avoid repeating low-level file-by-file edits unless that detail matters to readers.
- Do not invent work that is not present in the diff.

## Core rules

- All updates to existing changelogs are additive. NEVER replace any existing entries.
- New entries appear at the top of the document.

## Examples

- Bad: Combined error tests into one file.
- Better: Combined error tests into one file for readability.

- Bad: Refactored to use ports and adapters.
- Better: How this project integrates with other services is still uncertain. The ports and adapters pattern is used to reduce coupling and isolate the unknown behaviour inside adapters.
