# Eval report: fresh-v2

Suite: fresh, version 1. Client profile: **TNI** (text-only tool results, no server instructions). Server: `2a2bcf6b784f34606bb47757a4ddff61361e69c4`. Node v26.13.0.

> **Sealed suite.** Every task is held out. It was authored from designer briefs without sight of the tools or of any results, and it is the final judge, so this report shows whole-suite aggregates only: no per-task or per-category rows, no regressions, no outcomes per task, no transcripts. Descriptive; no significance claims.

## Aggregates per model and condition

| model | condition | tasks | trials | pass | check score | tool calls | in tok | out tok |
|---|---|---|---|---|---|---|---|---|
| haiku-5-5 | no-tools | 32 | 64 | 53.1% | 56.7% | 0.0 | 550 | 2892 |
| haiku-5-5 | server@2a2bcf6b | 32 | 64 | 85.9% | 89.6% | 3.3 | 20677 | 3283 |
| gpt-6-luna | no-tools | 31 | 60 | 54.8% | 85.5% | 0.0 | 600 | 734 |
| gpt-6-luna | server@2a2bcf6b | 31 | 60 | 61.3% | 78.5% | 4.6 | 20770 | 508 |

## Paired per-task difference (server minus no-tools)

Task-clustered bootstrap 95% interval, 10,000 seeded resamples.

- **haiku-5-5**: +0.328 [0.141, 0.516] (32 tasks)
- **gpt-6-luna**: +0.065 [-0.129, 0.258] (31 tasks)
- **pooled**: +0.211 [0.063, 0.367] (32 tasks)

## Dropped trials (pairwise infra exclusion)

- haiku-5-5: 0/64 dropped
- gpt-6-luna: 4/64 dropped
