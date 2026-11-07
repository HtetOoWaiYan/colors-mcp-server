# Evals

Measures what the colors MCP server is worth to small models. Design and rationale:
`docs/superpowers/specs/2026-11-06-eval-harness-design.md`.

```bash
npm ci
npm test                      # reference math, graders, suite witnesses, runner, matrix, report
npm run build-suite           # regenerate the frozen suite (refuses to overwrite; --bump makes a new version)

# server under test: a git ref, or `working-tree` (snapshot of src/, package files; pinned under refs/evals/)
npm run cli -- preflight --server-ref main --cases baseline
npm run cli -- oracle    --server-ref working-tree         # tool-assisted ceiling, no model calls
npm run cli -- run --run-id baseline --server-ref main     # 2 models x 2 conditions x 56 tasks x 2 trials
npm run cli -- run --run-id v2 --server-ref working-tree --reuse-from baseline
npm run cli -- run --run-id v2i --server-ref working-tree --profile instructions --reuse-from baseline
npm run cli -- report --run-id v2
```

- Needs the local inference proxy (`~/.config/local-inference`): `run` and `preflight` start it if it is stopped and stop it afterwards only if they started it. HTTP 429 stops the matrix; re-run the same command to resume.
- Profiles: `tni` (default) forwards only tool-result text; `instructions` also appends the server's `instructions` to the system prompt.
- `results/` and `sealed/` are gitignored. Held-out cells go to `sealed/`; reports show held-out aggregates only. `results/holdout-log.jsonl` counts completed matrices (the held-out set is retired after 3).
- The `oracle` command answers every task by calling the tools exactly as the prompt implies and grading the result: the ceiling for a model that always picks the right tool. Held-out tasks are reported as an aggregate count only.

## Generalization suite

Suite v1 was written alongside the tools, so it shows only that the tools cover it. The `generalization` suite (28 tasks, categories 101-107) asks whether the tools help, do nothing or hurt on nearby color work they were not designed around. Its tasks were written from designer and front-end briefs, not from the tool list:

| # | Category | Asks for |
|---|---|---|
| 101 | constrained-pick | one brand color meeting an OKLCH hue band, a chroma floor, a lightness bound and contrast rules at once |
| 102 | scrim | the smallest overlay opacity that gives text a target contrast over the worst photo regions |
| 103 | dual-surface | one color with 3:1 on both a light and a dark surface, in a brand's hue family (some pairs leave a very narrow band) |
| 104 | composite-mix | the hex that alpha stacks and CSS `color-mix()` in srgb, srgb-linear and oklab render as |
| 105 | grayscale-safe | N chart colors whose Oklab lightness stays apart in black-and-white print |
| 106 | diverging-scale | a symmetric 7-step diverging scale whose ends stay apart under simulated deuteranopia |
| 107 | video-ycbcr | BT.709 limited-range and JFIF Y'CbCr encode, decode and legality (outside the tools' scope) |

- **Dev only, by design.** Nothing in it is ever tuned on, so it has no sealed split, the report makes no held-out comparison and shows no predeclared bar, and `holdout-log.jsonl` is not touched.
- Separate run identity: its resume keys hash its own task hashes (`src/tasks/gen/manifest-gen.json`) and a grader hash over `graders`, `reference`, `graders-gen` and `reference-gen`. v1's grader hash is unchanged. A run id holds one suite only.
- Thresholds and expected values come from the reference math in `src/reference-gen` and from searches at build time (`src/tasks/gen/search.ts`). Searched thresholds keep their inputs in `grader.params.derivation`.
- There is no `oracle`: no "right tool call" exists to replay. Witnesses and invalid answers are checked by `npm test`.

```bash
npm run build-suite-gen                                     # regenerate (frozen; --bump makes a new version)
npm run cli -- run --suite generalization --run-id gen-v2 --server-ref working-tree
npm run cli -- report --run-id gen-v2                       # the suite is read from the run manifest
```
