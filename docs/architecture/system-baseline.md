# System Baseline

Record the current supported implementation baseline for `mission-driver`.

## Runtime Stack

| Layer | Technology | Version Pin / Notes |
| --- | --- | --- |
| Engine runtime | Node.js | ≥ 18 (uses native fetch, `node:test`, `import.meta.url`) |
| Engine module system | ESM (`.js` / `.mjs`) | Pure ESM; no CommonJS fallback |
| Engine npm dependencies | **zero** | `commander` is vendored under `tools/mission-driver/vendor/commander/`. `tools/mission-driver/package.json` has empty `dependencies`. |
| Monitor server | Node.js native `http` / `fs` / `path` / `url` | No Express / Fastify / etc. |
| Frontend framework | Vue 3 | Composition API + `<script setup>` |
| Frontend UI library | Naive UI 2 | Imported on-demand via `unplugin-vue-components` + `NaiveUiResolver` (no global `app.use(naive)`) |
| Frontend language | TypeScript | `vue-tsc --noEmit` runs as part of `check:dist` |
| Frontend build | Vite | `web/dist/` is committed; CI verifies freshness |
| Frontend terminal | xterm.js | Lazy-loaded per `RunDetail` route |
| Frontend state | Pinia | Resource-monitor store |
| Frontend icons | Ionicons 5 (via `@vicons/ionicons5`) | ArrowDownOutline, PauseOutline, ChevronDownOutline, ChevronUpOutline, SettingsSharp |

## Package Manager

- Engine: package-manager-agnostic at runtime (zero deps). `tools/package.json` declares `"packageManager": "pnpm@10.0.0"` as intent; both `npm --prefix` and `pnpm --prefix` work for engine commands.
- Frontend: **pnpm-locked** (`tools/mission-driver/web/pnpm-lock.yaml` is the only committed lockfile in the repo). `tools/mission-driver/web/package.json` declares `"packageManager": "pnpm@10.27.0"`. CI `.github/workflows/web-dist-check.yml` enforces pnpm.
- Recommended project-wide: `pnpm` (consistency with declared intent + frontend lock).

## Data / State Sources

| Concern | Source | Format |
| --- | --- | --- |
| Mission config | `missions/<name>.json` (+ `extends` chain via `base.json` → `base.local.json`) | JSON |
| Engine runtime state | `_tmp/<runDir>/run-state.json` | JSON (mutable; engine is sole writer) |
| Engine events | `_tmp/<runDir>/events.jsonl` | JSON Lines (append-only) |
| Draft state | `_tmp/<runDir>/draft-state.json` | JSON |
| Per-step logs | `_tmp/<runDir>/oc-<STEP>-*.log` | Plain text |
| Reflexion memory | `tools/mission-driver/memory/_index.md` + `lessons.md` + `runs.md` | Markdown with YAML frontmatter |
| Per-module memory | `docs/memory/<MODULE>/...` | Same schema as engine memory |

## Deployment / Distribution

- **Distribution channel**: GitHub releases. Consumers `git clone` (or download Source code zip) of a tag, then run `./install-age.sh` from a clone. Pre-built `web/dist/` ships in the repo → zero install, zero build for consumers.
- **CI**: `.github/workflows/release.yml` (tag-triggered packaging) + `.github/workflows/web-dist-check.yml` (pnpm + `git diff --exit-code -- dist` freshness guard, scoped to `tools/mission-driver/web/**`).
- **Consumer integration**: thin `tools/mission-driver.sh` shim per consumer repo, references the engine via `MISSION_DRIVER_HOME`. Engine is NOT copied.

## Observability

- Monitor dashboard: `./tools/mission-driver.sh monitor` → http://localhost:9300 (auto-increments on conflict).
- Live SSE event stream: `GET /api/runs/:id/events`.
- Per-step logs browsable in dashboard via xterm.js; click filename → Blob URL opens full log in new tab.
- `--analyze-run` produces postmortem Markdown under `tools/mission-driver/docs/postmortems/` + memory updates.

## Known-good Verification Baseline

See `docs/testing/known-good-baselines.md` for the latest dated green verification. As of 2026-07-24, `pnpm --prefix tools/mission-driver test` was green (per `docs/logs/2026/07-24.md`).
