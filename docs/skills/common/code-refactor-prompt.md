# Code Refactor Prompt

> Input: the ranked candidate list produced by `code-refactor-discovery-prompt.md` - this prompt executes one candidate; discovery finds them.

Use this skill when the task is to improve structure without changing supported behavior.

## Guardrails

- no intentional behavior change
- no hidden contract expansion
- prefer small, reviewable steps
- verify after each structural slice when possible
- preserve existing public names unless rename is part of the task

## Allowed Moves

- split oversized files
- extract coherent helpers or modules
- merge artificial wrappers
- remove dead compatibility paths
- normalize duplicated logic behind one contract

## Execution Pattern

1. confirm the live baseline and protected behavior - protected behavior comes from the owner doc and the delivering plan closure criteria (never from memory)
2. define the exact structural target
3. make the smallest safe structural slice
4. run focused verification
5. stop if behavior and structure start changing at the same time

## Expected Output

- refactor summary
- proof that behavior stayed intact - minimum standard: the full relevant test suite plus the owner-doc verification commands from `docs/context/project-context.md`, all actually run with exit codes recorded (a successful compile is not proof)
- remaining structural debt, if any
