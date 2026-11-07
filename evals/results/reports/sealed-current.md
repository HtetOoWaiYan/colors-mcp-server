# Eval report: fresh-new

Suite: fresh, version 1. Client profile: **TNI** (text-only tool results, no server instructions). Server: `8aa7e0091a7eed79f4e94724687f6e51e2975b6d`. Node v26.13.0.

> **Sealed suite.** Every task is held out. It was authored from designer briefs without sight of the tools or of any results, and it is the final judge, so this report shows whole-suite aggregates only: no per-task or per-category rows, no regressions, no outcomes per task, no transcripts. Descriptive; no significance claims.

## Aggregates per model and condition

| model | condition | tasks | trials | pass | check score | tool calls | in tok | out tok |
|---|---|---|---|---|---|---|---|---|
| haiku-5-5 | no-tools | 32 | 64 | 53.1% | 56.7% | 0.0 | 550 | 2892 |
| haiku-5-5 | server@8aa7e009 | 32 | 64 | 95.3% | 95.3% | 2.2 | 23104 | 2225 |
| gpt-6-luna | no-tools | 32 | 63 | 51.6% | 85.7% | 0.0 | 595 | 746 |
| gpt-6-luna | server@8aa7e009 | 32 | 63 | 76.6% | 87.3% | 1.7 | 11821 | 245 |

## Paired per-task difference (server minus no-tools)

Task-clustered bootstrap 95% interval, 10,000 seeded resamples.

- **haiku-5-5**: +0.422 [0.234, 0.594] (32 tasks)
- **gpt-6-luna**: +0.250 [0.063, 0.438] (32 tasks)
- **pooled**: +0.336 [0.172, 0.500] (32 tasks)

## Dropped trials (pairwise infra exclusion)

- haiku-5-5: 0/64 dropped
- gpt-6-luna: 1/64 dropped
