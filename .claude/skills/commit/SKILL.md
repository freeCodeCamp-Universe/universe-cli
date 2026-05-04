---
name: commit
description: Creates a git commit when the user asks to commit their changes. Reviews the current diff first, then writes a brief commit message that explains why the changes were made.
allowed-tools: Bash(git status *) Bash(git diff *) Bash(git add *) Bash(git commit *)
---

# Commit Changes

## Goal

Create a git commit for the current work with a short message that explains the reason or intent behind the changes, not just a file-by-file summary.

## Workflow

1. Inspect the repository state with `git status`.
2. Review the relevant changes with `git diff` and `git diff --staged` before writing the message.
3. Stage only the intended files explicitly by name.
   - Never use `git add .`.
   - Never use `git add -A`.
4. Write a brief commit message focused on why the changes were made.
   - Prefer intent, outcome, or user benefit.
   - Keep it concise.
   - If the user provided an exact commit message, use it.
5. Create the commit.

## Message guidance

Good commit titles:

- `docs: adds commit skill for repeatable repository workflows`
- `feat: adds menu button to toggle sidebar visibility`
- `fix: corrected spelling mistakes in FAQ`

Sample commit titles and bodies:

- `docs: adds commit skill for repeatable repository workflows`

  ```
  Adds a reusable commit workflow so commits are consistent across sessions.
  Prioritize intent-first messages to make history easier to scan.
  ```

- `feat: adds menu button to toggle sidebar visibility`

  ```
  Add a quick toggle so users can reclaim space when focusing on content.
  Improve navigation ergonomics on smaller screens and dense layouts.
  ```

- `fix: corrected spelling mistakes in FAQ`

If the intention is obvious from the title, as in the last example, the body can be omitted.

Avoid messages that only restate low-level edits, such as:

- `Update SKILL.md` -- This is obvious from the diff, so does not need restating.
- `Change some files` -- Vague.
- `Fix stuff` -- Vague.

Avoid describing how the code was written

- `Strict TDD, lint, and type-check compliance enforced.` -- This is unhelpful because it doesn't tell us anything about what was created or why, only how it was created. Also, lint/type-check compliance should be enforced by tooling, so does not need to be mentioned.

## Safety rules

- Do not include unrelated changes in the commit.
- If this is running in a sandbox, you will see all of untracked files (.env, .bash_profile, .claude, .bash_profile, .gitconfig, .gitmodules, .idea, .mcp.json, .profile, .ripgreprc, .zprofile and .zshrc, typically). If you think you need to include any of these files in the commit, check with the user first.
- If the repository contains mixed, ambiguous, or unexpected edits, inspect them before committing.
- If there is not enough context to understand the reason for the changes, gather more context before committing.
- Respect repository-specific commit conventions when they are documented.
- Do not add co-authors or other metadata to the commit message unless explicitly instructed by the user.
