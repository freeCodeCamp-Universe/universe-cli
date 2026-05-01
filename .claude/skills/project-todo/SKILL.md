---
name: project-todo
description: Generates an implementation-ready phased TODO plan from a requirements document. Use when requirements already exist (PRD, spec, RFC, ADR, or equivalent) and the user needs executable tasks or asks for a requirements document to be broken into TODOs
argument-hint: "[requirements-document-path] [output-directory]"
compatibility: Requires ability to read markdown files and write markdown output.
---

# Project TODO Planner

Generate TODO planning artifacts only. Do not implement product code.

You can configure inputs via arguments:

- first argument: requirements document path (for example `./plans/my-project/prd.md`)
- second argument (optional): output directory

If arguments are missing, ask for the requirements document location before proceeding.

## When to use this skill

Use this skill when the user asks for:

- implementation-ready TODO decomposition
- phased delivery plan from an existing spec
- traceable tasks mapped to requirements

Do **not** use this skill when:

- direct coding, bug fixes, or test/debug/build assistance is required

## Required output

Write:

1. `<output-directory>/todo.md`

Where:

- `<output-directory>` = second argument if provided; otherwise the directory containing the requirements document

Use template:

- `assets/todo-template.md`

If user preferences conflict with template wording, preserve user intent while keeping all required sections.

## Workflow

Follow this sequence exactly:

1. Input Validation
2. Requirements Extraction
3. TODO Plan Generation
4. Validation Gate
5. Final Consistency Check

### Input Validation

Confirm:

- requirements document path exists and is readable
- target output location is clear
- documents referenced by the requirements document exist

### Requirements Extraction

Extract:

- functional requirements
- non-functional requirements
- constraints and dependencies
- out-of-scope statements

If ambiguity blocks planning quality, ask concise clarifying questions.

### TODO Plan Generation

Create `todo.md` from the requirements document using `assets/todo-template.md`.

The TODO list must use explicit task types:

- `CODE:` for coding work that adds or changes runtime behaviour (e.g. functions, classes, logic, UI interactions)
- `TASK:` for non-coding work (validation, docs, review, configuration, release checks) and any code change that has no observable runtime behaviour to drive a failing test (e.g. adding a TypeScript interface file, a pure refactor with no logic changes, or adding a comment)

Rules for TODO generation:

- one feature per `CODE` item
- every `CODE` item includes exactly one `Feature:` line
- every `CODE` item includes at least one concrete `Acceptance` bullet
- `CODE:` and `TASK:` items must be TODOs. e.g. `- [ ] CODE:`
- if it's unclear whether a task is `CODE` or `TASK`, ask for clarification before proceeding
- avoid vague verbs like "improve", "optimize", or "handle better" without measurable criteria
- group TODOs into phases
- the first phase includes all TODOs needed for a trivial working prototype
- each subsequent phase focuses on one small, coherent increment

### Validation Gate

- every requirement maps to at least one TODO item
- dependencies are reflected in phase ordering
- acceptance criteria are testable from output behavior
- each TODO is clear and unambiguous; ask for input if additional planning is required
- each phase is self-contained; if recurring work is needed each phase, repeat explicit tasks
- references to external documents are allowed if explicit (for example `plans/assets.md`)
- references to external documents are not allowed if vague (for example "ADR7" without a path)
- each TODO item should make sense without needing to read the requirements document; if a TODO item is not self-contained, add necessary context

### Final Consistency Check

Run this checklist before stopping:

1. every requirement reference appears in the Traceability Matrix
2. no TODO item introduces out-of-scope work
3. terminology is consistent with the requirements document
4. `todo.md` only contains the phased TODO list and a Traceability Matrix

If inconsistencies exist, list them clearly and propose exact corrections.

## Formatting

The Traceability Matrix must be shown as:

| Requirement ID | TODO Item               | Status |
| -------------- | ----------------------- | ------ |
| REQ-1          | Phase 1 / CODE: <title> | mapped |

The last row is an example.
