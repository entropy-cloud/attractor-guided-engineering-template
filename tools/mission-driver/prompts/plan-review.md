Review the drafted plan at `{{forEachItem}}` — read it **completely**.

Read `{{planGuide}}` **completely**. It defines the plan format, required sections, checklist, and closure evidence rules.

## Review Checklist

1. **Format compliance**: Required sections exist, field names are correct, Phase structure is valid.
2. **Completeness**: Exit Criteria are clear and testable. Execution Plan covers all checklist items.
3. **Scope**: Work item boundaries are clear. No ambiguous "and also..." scope creep.
4. **Closure evidence**: Plan defines what evidence proves completion.

## Action

- Fix any Blocker/Major issues directly in the plan file.
- After fixing (or if no issues found), change `> Plan Status: draft` to `> Plan Status: active`.
- Minor issues may remain — downstream closure audit and deep audit will catch them during/after execution.

Return results in the following format:
```
<AI_STEP_RESULT>approved</AI_STEP_RESULT>
```
