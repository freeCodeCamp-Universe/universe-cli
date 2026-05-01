---
name: workflow
description: Implements the todo implementation workflow. Finds next unchecked todo item, completes it using the correct method (CODE=TDD, TASK=direct), mark it done, and when a phase is complete creates a changelog entry and commit.
argument-hint: "[phases to complete, e.g. '2 and 3' or 'all remaining']"
---

# TODO Workflow

## Overview

This skill drives the phased delivery loop. Follow these steps exactly and in order.

## Step 1 — Find the next item

1. Read `design/todo.md`.
2. Find the **first incomplete phase** (a phase that has at least one unchecked item).
3. Find the **first unchecked item** in that phase.

## Step 2 — Complete the item

### If the item is `CODE:`

Use TDD:

1. **Write failing tests first.** Run `pnpm test` and confirm the new tests fail for the right reason. Do not write implementation yet.
2. **Write the minimum implementation** to make the failing tests pass. Work incrementally — one small piece at a time. Run `pnpm test` after each increment.
3. Continue until all tests pass.

### If the item is `TASK:`

Complete the work directly (config changes, type definitions, deletions, docs, etc.). No tests are required even if code or config is involved.

## Step 3 — Mark the item done

In `design/todo.md`, change `- [ ]` to `- [x]` for the completed item.

## Step 4 — Check if the phase is complete

- If there are still unchecked items in the current phase, go back to **Step 1** and continue with the next unchecked item.
- If all items in the phase are now checked, proceed to **Step 5**.

## Step 5 — Phase complete: quality gate + changelog + commit

Run the following checks **in order**, fixing errors before moving on:

1. `pnpm check` — fix TypeScript errors.
2. `pnpm test` — fix any broken tests (only modify tests that are obviously broken by the implementation change).
3. `pnpm lint:fix` — fix remaining lint errors.

Repeat the cycle (check → test → lint) until all three pass cleanly.

Then:

1. Increment the version in `package.json` following semver.
2. Add a new entry to `CHANGELOG.md`:
   ```
   ## [x.y.z] - YYYY-MM-DD
   ```
   Summarise the features implemented in the phase.
3. Commit with a conventional commit message. Include a brief summary in the commit body. Each phase gets its own commit — **never batch multiple phases into one commit**.

## Step 6 — Continue or stop

- If the user asked to complete multiple phases (e.g. "complete phases 2 and 3" or "complete all remaining phases"), go back to **Step 1** for the next phase.
- Otherwise **stop and request the user's input**.
