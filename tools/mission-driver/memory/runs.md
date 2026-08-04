# Mission-Driver Self-Memory — Analyzed Runs (episodic index)

One line per analyzed run: date · runId · result · top finding · postmortem link.

- 2026-07-29 · 2026-07-29-121842-mission-driver · aborted (SIGINT, 2/3 subflows hit max_cycles) · top: opencode empty-body exit=1 crashes starved the closure loop (F1/L001) · `docs/postmortems/2026-07-29-mission-driver-actionable-fixes-postmortem.md`
- 2026-08-03 · 2026-08-03-120149-mission-driver · completed (audit-gate clean short-circuit, round 1/3) · top: drafted plan shipped broken-regex Proof greps REVIEW_PLANS missed (F1/L005); `{{forEachItem}}` warning recurred (F2/L004 count→2) · `etd-age/tools/mission-driver/docs/postmortems/2026-08-03-onboarding-postmortem.md`
- 2026-08-04 · 2026-08-04-074850-mission-driver · completed (audit-gate clean short-circuit, round 1/3; 0 retries/failures) · top: `{{backlogDir}}` scope-leak in audit-loop prompt (F1/L006); `{{forEachItem}}` recurred 3rd run (F2/L004 count→3); host ran DEEP_AUDIT at ~0.2 GB free RAM (F3/L007) · `etd-age/tools/mission-driver/docs/postmortems/2026-08-04-docs-deepening-and-optimization-proposals-postmortem.md`
