# template/install/ — Consumer Install Artifacts

These files are the **consumer-facing versions** produced by `./install-age.sh`.
They are distinct from the dogfood versions at the repository root
(`missions/base.json`, `missions/demo.json`, `tools/mission-driver.sh`,
`docs/backlog/demo-roadmap.md`) which the template repo uses to run its own
missions on itself.

| File here | Consumer gets it at | Differs from dogfood twin because |
| --------- | ------------------- | --------------------------------- |
| `tools/mission-driver.sh` | `tools/mission-driver.sh` | Reads `MISSION_DRIVER_HOME` from `.env` (cross-repo reference); dogfood defaults to local `$DIR/mission-driver` |
| `.env.example` | `.env.example` | `__REL_MDH__` placeholder, interpolated at install; no dogfood twin |
| `missions/base.json` | `missions/base.json` | `REPLACE_WITH_YOUR_*` command placeholders + `parseModel`; dogfood has real `pnpm --prefix` commands |
| `missions/demo.json` | `missions/demo.json` | `moduleDir: "."`, isolated `docs/plans/demo`; dogfood uses `tools/mission-driver` + shared `docs/plans` |
| `missions/onboarding.json` | `missions/onboarding.json` | Consumer-only; no dogfood twin |
| `docs/backlog/demo-roadmap.md` | `docs/backlog/demo-roadmap.md` | 3 WIs all `done` (smoke test); dogfood has 4 WIs incl. `ready`/`todo` (dashboard demo) |

Do NOT edit these to match the dogfood root files — the divergence is intentional.
The `install-age.manifest` entries with `> dst` overrides copy from here.
