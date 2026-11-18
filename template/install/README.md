# template/install/ — Consumer Install Artifacts

Files here are the **consumer-facing versions** produced by `./install-age.sh`. They are distinct from the dogfood versions at the repository root.

## Engine Add-On Kit (`--with-mission-driver` only)

The engine is not installed by default (see `docs/guides/mission-driver-add-on.md`). These entries are gated by the `mdh-only` manifest flag:

| File here | Consumer gets it at | Differs from dogfood twin because |
| --------- | ------------------- | --------------------------------- |
| `tools/mission-driver.sh` | `tools/mission-driver.sh` | Reads `MISSION_DRIVER_HOME` from `.env`; dogfood defaults to local `$DIR/mission-driver` |
| `.env.example` | `.env.example` | `__REL_MDH__` placeholder, interpolated at install; no dogfood twin |
| `missions/base.json` | `missions/base.json` | `REPLACE_WITH_YOUR_*` command placeholders + `parseModel`; dogfood has real `pnpm --prefix` commands |
| `missions/onboarding.json` | `missions/onboarding.json` | Consumer-only; no dogfood twin |

Do NOT edit these to match the dogfood root files — the divergence is intentional. The `install-age.manifest` entries with `> dst` overrides and `mdh-only` flags copy from here.

## Always-Installed Artifacts

| File here | Consumer gets it at |
| --------- | ------------------- |
| `githooks/pre-commit` | `.githooks/pre-commit` (document hygiene, fail-open) |

## Narrative Reference

`AGE-FILES-GUIDE.md` documents what each copied file is for (engine-oriented; also `mdh-only`).
