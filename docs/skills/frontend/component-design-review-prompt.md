# Component Design Review Prompt (Frontend)

Use when a component's design or implementation needs an independent review before landing. Works for both new components and material changes to existing ones.

## Project Customization Layer

<!-- Customize after copying: design-system paths, framework/version constraints, state rules, a11y bar, known failure modes. -->

- Protected areas:
- Known failure modes:
- Verification commands:
- Naming conventions:

## Inputs

- the component code (and its diff if a change)
- the owner/design doc that defines expected behavior
- usage sites (parents, siblings, route entries)
- the design-system / component-library conventions doc

## Review Dimensions

Challenge the component across these dimensions; every finding cites file and evidence:

1. **Contract**: are props/stores/events typed, minimal, and free of hidden coupling? Does any prop leak internal state? Is the public surface stable under the parent's real usage?
2. **State ownership**: who owns each piece of state? Any duplicated source of truth, derived state not derived, or effect doing what a derivation should?
3. **All UI states**: loading, empty, error, partial data, boundary values, overflow, long strings, RTL/i18n where applicable. Missing states are findings.
4. **Rendering boundaries**: unnecessary re-render surface, key discipline in lists, memoization justified (not cargo-cult), list virtualization where warranted.
5. **Interaction & accessibility**: keyboard paths, focus management, aria only where semantics fall short, contrast hit against the bar.
6. **Error containment**: does a failure in this component take down the subtree? Async errors handled where they can be recovered?
7. **Design-system alignment**: does it reuse existing primitives, or re-implement spacing/typography/color locally? Local re-implementation is a finding unless justified.
8. **Naming & placement**: component name matches its responsibility; file placed per project structure conventions.

## Output

Severity-ordered findings (P0 blocker … P3 nit), each with: dimension, evidence (file:anchor or reproduced behavior), and a concrete revision target. End with a verdict: `approve | approve-with-follow-ups | revise`.

Do not approve a component whose error/empty/loading states are unverified assertions — require a proof path (story, test, or manual evidence pointer).
