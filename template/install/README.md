# template/install/ — Consumer Install Artifacts

Files here are the **consumer-facing versions** produced by `./install-age.sh`. They are distinct from the dogfood versions at the repository root.

## Always-Installed Artifacts

| File here | Consumer gets it at |
| --------- | ------------------- |
| `githooks/pre-commit` | `.githooks/pre-commit` (document hygiene, fail-open) |

The mission-driver engine and its mission configs are NOT part of the consumer
distribution: the standalone `tools/` helper chain (`plan-status.mjs`,
`commit-plan.mjs`, doc guards) is the only execution machinery a consumer
installs. See `docs/guides/roadmap-goal-execution.md` for the coordinator
contract and `docs/design/age-autonomy/` for the engine's in-repo status.
