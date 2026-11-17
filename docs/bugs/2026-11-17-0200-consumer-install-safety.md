# Consumer Installation Safety And Capability Drift

## Problem

Consumers could receive a successful installation with a concatenated `.env` assignment, altered literal project name, unavailable skill registry entries or no advertised pi bridge. Reinstallation preserved individual old engine files but added new ones, silently creating an unverifiable mixed engine. Missing manifest resources only warned after partial copying. These defects affect first adoption, local configuration safety and reproducible engine delivery.

## Reproduction

- Use Node and an existing empty target directory. Write `.env` as `TOKEN=keep` without a final newline, then install with `--with-mission-driver`: the engine assignment attaches to the existing value.
- Pass the literal project name `Cash $& Co`, or pass `--profile frnotend`/an unknown flag. Inspect personalization and exit status.
- Install default skills and inspect frontend/java registry rows; use `--pi` and inspect the absent mirror.
- Seed a nonempty `tools/mission-driver/` with an old entry point and omit other engine files, then reinstall. Remove a selected manifest source in an isolated source fixture and observe partial target creation.

## Diagnostic Method

Diagnosis followed `common/bug-diagnosis-prompt.md`: read the requirement/owner baseline, installer/parser, actual manifest, canonical skills and existing unit/shell tests; compare their positive coverage with the report's negative cases. Straightforward smoking guns made broad hypothesis iteration unnecessary: the Node replacement argument, unconditional env append, permissive argument scan, empty bridge manifest section and file-by-file vendor skip are directly visible. This rules out the shell shim and engine runtime as causes; both delegate to or consume the installer's outputs. No engine/law change is needed.

Regression fixtures exercise the production CLI rather than imported signatures alone. The Pi discovery contract was inspected in upstream `skills.ts` at commit `25cc5c7bf4cbc76b2e134c729eb8d57d521ed749`; no Pi executable is installed here. Evidence therefore supports recursive file delivery/parity, not host loading or trust approval.

A new shell output assertion exposed an environment-probe error: a user-level `env` wrapper on PATH swallowed the command while returning success. A proposed Windows launcher-path explanation was disproved by direct launcher execution and argv inspection; no launcher behavior change is retained. The gate uses Bash's built-in `unset` and requires real help/list output rather than exit status alone.

## Root Cause

- `tools/install-age.mjs` used replacement-string semantics for user text and appended env content without a separator.
- CLI and manifest choices were not validated comprehensively before copying; missing resources were treated as optional warnings.
- The registry was copied wholesale despite shelf selection, and the advertised pi manifest section contained no files after operator-skill retirement.
- Vendoring checked individual file existence instead of engine origin/content/inventory. There was no durable source identity or installed-content baseline.
- The shell gate used fixed shared `/tmp` output files and separately allocated targets, making concurrent checks collide and cleanup/platform behavior fragile.

## Fix

- Literal callback substitution and newline-aware append preserve project names and existing env assignments, including exported assignments. Existing hooks and scaffold customizations are reported and preserved on initial adoption.
- Validate selected sources, destinations, flags, source/profile choices and capability parity before writes; reject duplicate/case-alias/reserved destinations. Invalid inputs fail visibly with no target mutation.
- Render installed versus optional registry entries from one canonical catalog. Mirror canonical operational skills into `.pi/skills/` only with `--pi`; preserve canonical consumer bytes on first adoption, reject conflicting mirrors, and never reinstate an engine operator skill.
- Record minimal source/options/path digests in `.age-origin.json`. A standalone zero-dependency tool inspects local managed-file drift read-only, without storing env values or paths to the source checkout. Unknown/incompatible nonempty engines and content/inventory conflicts block before any augmentation. Reinstallation is not an upgrade, forced overwrite or reconfiguration mechanism.
- Use unique repo-local `_tmp/` shell workspaces and an exit trap owning only generated artifacts; keep explicitly supplied targets. Exercise the installed launcher and validator.

## Tests

- `tools/install-age.test.mjs`: unit coverage for literal metacharacters, missing-newline gitignore handling, CLI/manifest negative controls, nonempty registry coverage and bridge/profile parity failures.
- `tools/install-age.integration.test.mjs`: production CLI integration across four profiles with/without engine; canonical/derived skill parity, existing config/hook safety, malformed/missing inputs with zero target writes, unknown/modified/incompatible engines, source/option-change refusal, no-secret metadata, read-only drift and installed guard-root negative probes.
- `tools/check-install-age.sh`: shell integration for default/add-on/frontend delivery plus consumer-local launcher help/list and mission validation. No model/API execution, external Pi host execution or full engine-suite success is implied. Exact outcomes belong to the delivering plan.

## Affected Artifacts

- `tools/install-age.mjs:53` — parser/validation; installation preflight, rendering and delivery.
- `tools/age-drift.mjs:1` — minimal origin validation, content inspection and standalone read-only CLI.
- `install-age.manifest:37` — derived pi bridge; standalone drift tool delivery.
- `tools/install-age.test.mjs:1`, `tools/install-age.integration.test.mjs:1`, `tools/check-install-age.sh:1` — regression proof.
- `docs/skills/README.md:9` — canonical profile-catalog semantics; owner docs and launcher comments align with local vendoring.

## Notes For Future Refactors

- Keep preflight and write phases separate. A missing resource or engine conflict must not be discovered after adding scaffold/engine files. This is not a transaction against concurrent edits or disk failure.
- Do not replace literal callbacks with a replacement string, rebaseline modified skills on reinstall, or record actual env/config values in provenance.
- Derive mirrors/catalog views from canonical sources and retain mechanical negative controls; copying retired skill text or unfiltered catalogs restores false capability claims.
