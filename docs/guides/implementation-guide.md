# Implementation Guide

## Purpose

This guide captures day-to-day coding expectations for AI and humans.

## Core Rules

- prefer the smallest correct change
- follow existing patterns before inventing new abstractions
- keep state ownership explicit
- avoid demo-only placeholders unless the active requirement explicitly allows them
- add tests when a bug or contract could regress silently
- do not put code-level technical details into plan files unless they are needed for scope, proof, or contract reasoning
- prefer no comments by default; add only rare, high-value comments when a local constraint is easy to misread

## Review Lens

When reviewing work, check for:

- boundary violations
- hidden assumptions not written to files
- fake completion based only on UI shape or chat claims
- missing verification for user-visible behavior

## Collaboration Rule

If a repeated instruction keeps reappearing in chat, promote it into `AGENTS.md`, `docs/architecture/`, or `docs/references/`.

If a repeated review pattern keeps finding the same class of issue, promote it into `docs/skills/` or `docs/audits/`.

If the same defect pattern keeps recurring after that, evaluate whether it should be promoted further into a heuristic script, static check, lint rule, CI guard, or codemod. Prefer lightweight checks first, and tune them to the copied project's real conventions, naming patterns, and false-positive tolerance.
