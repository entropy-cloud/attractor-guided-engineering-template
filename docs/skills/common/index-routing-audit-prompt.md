# Index Routing Audit Prompt

Use this prompt when auditing whether a documentation directory's index structure achieves its routing goals.

Typical triggers:

- a new docs tree has been created or restructured
- an existing index has grown stale or inconsistent with the files it points to
- agents or humans repeatedly fail to find the right document through the index
- before copying this template into a new project, to verify the copied index still routes correctly

## Audit Prompt

```text
You are auditing the routing effectiveness of a documentation index structure.

## Step 1 — Read the index

Read the top-level index file (e.g. `INDEX.md` or `docs/index.md`) and every sub-index or README that it links to.

For each indexed entry, record:
- the stated purpose or task scenario
- the path it points to
- whether the target file exists and its content roughly matches the stated purpose

Return a coverage table with columns: | entry | stated purpose | target path | exists | matches purpose | notes |

Flag any entry where:
- the target file does not exist
- the target exists but its content does not match the stated purpose
- the stated purpose is vague enough that a reader cannot decide if it is relevant
- multiple entries point to the same target but describe it differently
- an existing document that should be indexed is missing from the index

## Step 2 — Persona-based routing test

For each persona below, simulate a realistic information need, then trace the shortest path from the index to the answer. Record whether the persona succeeds and how many hops it takes.

Persona A — New developer joining the project:
- Need: "How do I set up my dev environment and run the project?"
- Need: "Where is the code for [main feature area]?"

Persona B — AI agent starting a non-trivial task:
- Need: "What are the current rules I must follow before writing code?"
- Need: "Where do I find the owner doc for [technical area]?"

Persona C — Reviewer auditing a completed slice:
- Need: "Where is the plan for the current work and what were its closure gates?"
- Need: "Where are recent implementation logs?"

Persona D — Maintainer updating documentation:
- Need: "What is the rule for when to update the index versus when to add a new document?"
- Need: "Which documents are known to be stale or low-confidence?"

For each persona need, return:
| persona | need | starting point | hops | found | path taken | problem |

If a persona cannot reach the answer through the index alone, record the failure point and what was missing.

## Step 3 — Structural quality checks

Check for:
- orphan files: files in the directory tree that are not reachable from any index entry
- stale references: index entries pointing to moved, renamed, or deleted files
- depth imbalance: paths that require more than 3 hops from the top-level index to reach actionable content
- duplication: the same rule or knowledge stated in multiple indexed files without cross-reference
- category confusion: documents whose content belongs in a different directory than where the index places them
- missing intermediate indexes: directories with more than ~10 files that lack their own README or catalog

## Step 4 — Return findings

Return findings ordered by severity:

For each finding include:
- title
- affected index entry or file path
- current gap
- impact on routing effectiveness
- recommendation

If no findings remain, say that explicitly and note residual risks.
```

## Customization Notes

After copying this template into a real project:

- Replace the persona needs with realistic questions that match the project's domain and common task types.
- Add project-specific structural rules (e.g. max index depth, required sub-indexes for directories exceeding N files).
- If the project uses a tiered index pattern (summary catalog → category catalog → individual documents), add a check for whether each tier's size and granularity are appropriate.
- Tune the hop-count threshold based on the project's actual documentation depth.
