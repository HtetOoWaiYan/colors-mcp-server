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
