# <project-name> Onboarding Roadmap

> Drive the AI to read this project's codebase and fill in the copied AGE template docs based on actual tech stack, entry points, and verification commands. Run after `./install-age.sh --with-mission-driver` to personalize the workspace. Format rules: `docs/guides/roadmap-authoring.md`.

## Work Item Status

### M1 — Onboarding

- [ ] WI1 项目扫描 + 引擎冒烟 (Deliverable: `docs/input/project-scan.md`; reuse: `./tools/mission-driver.sh list`)
- [ ] WI2 填 docs/context/project-context.md (Owner: `docs/context/project-context.md`; deps: WI1)
- [ ] WI3 填 docs/context/ai-autonomy-policy.md (Owner: `docs/context/ai-autonomy-policy.md`; deps: WI1)
- [ ] WI4 填 docs/context/codebase-map.md (Owner: `docs/context/codebase-map.md`; deps: WI1)
- [ ] WI5 填 docs/index.md + 校验项目名占位符全替换 (Owner: `docs/index.md`; deps: WI2)
- [ ] WI6 填 docs/architecture 四件 README/module-boundaries/project-vision/system-baseline (Owner: `docs/architecture/`; deps: WI1, WI2)
- [ ] WI7 填 docs/guides/application-development-workflow.md + docs/roadmaps/README.md (Owner: `docs/guides/application-development-workflow.md`; deps: WI2)
- [ ] WI8 记录首个 green verification baseline 到日志 + 校验 docs/logs/{year}/ 存在 (Owner: `docs/guides/log-writing.md`; deps: WI2; reuse: run verification)

## Current Baseline

- scaffold copied, `<project-name>` substituted by the installer
- context/architecture files are skeletons awaiting onboarding content

## Framework / Platform Reuse

- the AGE scaffold itself: guides, skills shelves, hygiene tools, pre-commit hook — do not rebuild equivalents
- `./tools/mission-driver.sh` for engine operations

## Rules

- one work item = one plan under `docs/plans/onboarding/`
- WI1 creates `docs/input/` with its first real content (the project scan) — on-demand directory rule per `docs/guides/doc-organization.md`
- tick a checkbox only after the delivering plan's closure audit passes
