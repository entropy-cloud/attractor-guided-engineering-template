# Plans

Use this directory for non-trivial implementation plans. Format authority: `docs/guides/plan-authoring-and-execution.md`.

- plans live in a per-roadmap subdirectory: `docs/plans/<roadmap-slug>/` — create the subdirectory in the same change that creates the roadmap (`docs/guides/roadmap-authoring.md`)
- keep each plan focused on one result surface; 2–6 phases (oversized → successor plan + split the work item)
- every created plan is executed by an independent subagent and closed by a different independent subagent, with receipts in the plan
- this directory (the root level) holds only the subdirectories and this README — no loose plan files

Recommended filenames inside a roadmap subdirectory:

- `docs/plans/frontend-ui/2026-05-21-1000-user-list-plan.md` style: `YYYY-MM-DD-HHmm-topic-plan.md`
