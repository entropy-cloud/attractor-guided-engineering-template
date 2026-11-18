# Consumer Guards Need Real Coverage And Error Propagation

## Problem

Reference checks omitted normative entrypoints and relative registered skills. Timeliness could report success after a descendant traversal error or a malformed exemption prefix. Garbled reports used an unsanctioned scratch directory and the hook labelled diagnostic success as clean. Packaging/shared-guide changes did not run a consumer CI gate, and the delivered hook had no engine sections.

## Reproduction

Put a missing reference in a guide or skill registry; put a dangling directory junction beside a normative document; use a near-match timeliness exemption before a changelog heading. Run the old guards. Inspect the installed hook and source CI triggers after changing only the installer or shared guide.

The engine baseline separately failed on moved guide/backlog inputs and a Windows assertion that APPDATA alone implied an executable existed.

## Diagnostic Method

Read the guard control flow, manifest-delivered hook and CI before implementation. The outer bare traversal catch and substring exemption were direct smoking guns, so no broad hypothesis search was needed. Production CLI fixtures distinguished real broken consumer references from source-only/add-on/example paths; an all-profile/add-on scan additionally exposed a stale upgrade/operator-skill claim in the installed files guide. Inspected the resolver's existing env argument and existence test: the Windows failure was an uncontrolled test assumption, not authorization to change production routing.

## Root Cause

- Scan scope, resource classification and successful tool execution were mistaken for complete contract coverage.
- Optional-root handling covered the whole recursive operation, turning unreadable descendants into success.
- File existence/count checks lacked a stable suite identity and packaging-to-CI connection.

## Fix

Scan current normative entrypoints and registry-relative paths; classify explicit examples/external/source/add-on references without whole-file ignores. Timeliness skips only missing optional top-level targets and recognizes an exact reasoned first-line exemption. Garbled output stays diagnostic by default and writes `_tmp/`; replacement-character detection precedes general Unicode-symbol acceptance.

Keep the consumer gate small: fixed suites with file/input checks and nonempty results, installed-consumer smoke/negative controls, local-engine hook calls, and mechanically tested source CI trigger coverage. The source-wide legacy reference scan remains separate and can still fail. Repair only the four approved engine tests, retaining corpus floors and exact present/absent resolver assertions.

## Tests

- `tools/doc-guards.test.mjs`: unit/CLI controls for normative scope, missing roots/zero input, path classification, precise exemptions, real dangling junction traversal failure, garbled diagnostic/blocking behavior and output location.
- `tools/consumer-contract.test.mjs`: installed default/frontend/java/all document/command smoke and actual vendored-engine hook acceptance/refusal.
- `tools/verify-consumer.test.mjs`: fixed suite identities, child/input/coverage failures and real manifest/template/helper-to-CI path coverage.
- `tools/mission-driver/test/{field-wiring,ledger-corpus,ledger-sections,runner-routing}.test.js`: real corpus discovery and controlled executable selection without executing the dummy file or changing process-global APPDATA.

Exact commands, outcomes and remaining source diagnostics live in the WI3 plan.

## Affected Artifacts

- `tools/check-doc-references.mjs`, `tools/check-doc-timeliness.mjs`, `tools/check-docs-garbled.mjs` — guard scope/error/diagnostic contracts.
- `template/install/githooks/pre-commit` — installed local-engine sections.
- `tools/verify-consumer.mjs`, `.github/workflows/consumer-contract.yml` — source packaging gate, not downstream scaffolding.
- Current shared guides/template indexes — explicit example and source boundaries plus corrected routing.

## Notes For Future Refactors

- Catch optional absence before recursion, never around the entire traversal.
- Preserve suite identities and negative controls; a count-only glob or green diagnostic exit is not the consumer contract.
- Keep engine/law behavior outside this repair and retain source-wide diagnostic findings rather than globally ignoring documents.
