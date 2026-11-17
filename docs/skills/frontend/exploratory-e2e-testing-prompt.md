# Exploratory E2E Testing Prompt (Frontend)

Use when a feature needs an adversarial end-to-end pass beyond scripted tests — before closure, or when scripted coverage is thin for the changed surface.

## Project Customization Layer

<!-- Customize after copying: app URL / start commands, accounts & roles, browser matrix, test data reset procedure, where evidence goes. -->

- App start / URL:
- Roles & test accounts:
- Data reset:
- Evidence destination: `docs/testing/{year}/{month}-{day}.md`

## Procedure

1. **Read the intent first**: feature docs, the plan's exit criteria, known failure modes. List the user journeys the feature promises — the happy paths are the entry points, not the test.
2. **Enumerate adversarial classes** per journey:
   - data states: empty / single / many / boundary values / corrupt or truncated responses
   - timing: slow network, stale caches, double submits, rapid navigation, mid-flow refresh
   - identity/permissions: wrong role, expired session, cross-tenant access attempts
   - integration failures: backend 5xx, partial saves, offline
3. **Execute and capture evidence**: screenshots or clips for every defect-class hit, with steps to reproduce and observed vs expected.
4. **Probe the seams** scripted tests cannot reach: browser back/forward, deep links, concurrent tabs, viewport extremes, zoom, input method edge cases (paste, IME, autofill).
5. **Stop conditions**: journey × adversarial-class matrix exhausted, or a P0 found (stop and report immediately).

## Output

A dated testing note under `docs/testing/` (timeliness document): matrix coverage summary, defects found (each: repro steps, evidence, severity), and explicitly-listed uncovered cells with the reason. Every claim about behavior links its evidence.

Never report "all passed" from memory — the note's evidence pointers are the proof.
