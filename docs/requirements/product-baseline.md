# Product Baseline Requirements

## Purpose

Define the product baseline that guides implementation slices. This project may start from small complete loops, but each loop is implemented as formal product behavior rather than temporary or demo-only behavior.

## Product Capabilities

- <capability>
- <capability>

## First Complete Loop

The first complete loop should prove the formal end-to-end path:

- <step>
- <step>

This first loop is not a disposable prototype. Unsupported capabilities remain product areas whose implementation order is tracked outside stable design docs.

## Manual Operations Allowed During Early Slices

- <manual operation, e.g. schema creation on first start>
- <manual operation, e.g. default admin provisioning when no self-service provisioning exists>

## Development Or Local Integration Substitutes

- A local or simulated path for an external dependency may exist only as development/test support or as an explicitly documented non-production mode.
- <other substitute>

## Completion Criteria For The First Loop

- All must-have features implemented and testable
- Application builds and runs without errors
- <other criterion>

## Rule

This file owns the implementation-ready product baseline and first complete loop.

Do not duplicate long-term vision from `docs/architecture/project-vision.md` or stable app behavior from `docs/design/app-overview.md`. Put implementation sequencing into `docs/roadmaps/` or a roadmap, not into every design doc.
