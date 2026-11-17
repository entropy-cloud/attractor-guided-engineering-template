# Input Processing Guide

## Purpose

This guide explains how to handle raw source material before it becomes requirements.

## Rule

Do not ask AI to code directly from a large raw input dump when the source still mixes:

- business goals
- UI examples
- implementation guesses
- missing assumptions
- half-settled scope

## Recommended Flow

1. Store the raw material in `docs/input/`.
2. Mark the source type: PM note, card-set doc, prototype, article, or mixed source.
3. Write unresolved questions into `docs/discussions/`.
4. Write the synthesized result into `docs/requirements/`.

## Useful Source Classification

- `source-pm-*.md` - product-manager notes
- `source-prototype-*.md` - prototype interpretation
- `source-cardset-*.md` - card-set or structured requirement docs
- `source-article-*.md` - external articles or references

## Caution

Strongly structured source material is useful, but it still may not answer:

- actual scope boundary for the current iteration
- domain judgment needed for a business decision
- which interactions are core versus optional
- whether the prototype is complete enough to build from directly

## File Header Convention

Every input file placed in this directory SHOULD start with a header:

    status: new | supplement | supersedes <filename>
    processed: pending | partial | done

- `status` describes the file's relationship to other inputs:
  - `new` — a standalone new input that does not replace an existing one
  - `supplement` — additional context for an existing input file
  - `supersedes <filename>` — replaces a prior input file; the named file is now stale
- `processed` tracks whether this input has been consumed:
  - `pending` — not yet processed; agents SHOULD pick this up
  - `partial` — some questions resolved but unresolved items remain
  - `done` — fully processed into requirements or discussions; agents may skip this file

If a human places a file without this header, AI SHOULD:

1. Read the file content.
2. Infer the status from content and context.
3. Add the inferred header and note it was AI-inferred.
4. Proceed with processing.
