# Eval report: baseline

Suite v1. Client profile: **TNI** (text-only tool results, no server instructions). Server: `9f30d6c5c5283d416c1ed4108013ea2133c160c8`. Node v24.21.0.

> Scope: bounded CSS, UI-token and chart-palette color tasks, two small hosted models, TNI client only. No claim is made about print, film, photo or game work. Baseline results are descriptive; no significance claims.


## Dev split: per model and condition

| model | condition | tasks | trials | pass | check score | tool calls | in tok | out tok | sec | limit | format fail | strict pass | zero-tool-call (useful tasks) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| haiku-5-5 | no-tools | 42 | 84 | 44.0% | 46.8% | 0.0 | 470 | 3045 | 14.0 | 51.2% | 0.0% | 44.0% | n/a |
| haiku-5-5 | server@9f30d6c5 | 42 | 84 | 78.6% | 81.0% | 4.4 | 15366 | 2849 | 14.5 | 17.9% | 0.0% | 78.6% | 25.6% |
| gpt-6-luna | no-tools | 42 | 84 | 45.2% | 81.1% | 0.0 | 536 | 746 | 19.1 | 1.2% | 0.0% | 45.2% | n/a |
| gpt-6-luna | server@9f30d6c5 | 42 | 84 | 60.7% | 82.7% | 4.7 | 8726 | 390 | 16.2 | 6.0% | 0.0% | 60.7% | 5.1% |

## Paired per-task difference (server minus no-tools), dev

Task-clustered bootstrap 95% interval, 10,000 seeded resamples.

- **haiku-5-5**: +0.345 [0.202, 0.488] (42 tasks)
- **gpt-6-luna**: +0.155 [0.000, 0.310] (42 tasks)
- **pooled**: +0.250 [0.131, 0.381] (42 tasks)

## Held-out split (sealed): full-split aggregates only

| model | condition | tasks | pass | check score |
|---|---|---|---|---|
| haiku-5-5 | no-tools | 14 | 42.9% | 42.9% |
| haiku-5-5 | server@9f30d6c5 | 14 | 67.9% | 67.9% |
| gpt-6-luna | no-tools | 14 | 50.0% | 81.6% |
| gpt-6-luna | server@9f30d6c5 | 14 | 64.3% | 84.9% |

Held-out paired difference (descriptive only, 14 tasks):

- **haiku-5-5**: +0.250 [0.000, 0.500] (14 tasks)
- **gpt-6-luna**: +0.143 [-0.071, 0.393] (14 tasks)
- **pooled**: +0.196 [0.000, 0.411] (14 tasks)

## Predeclared bar (for later milestones)

Dev pooled: +0.250 [0.131, 0.381] (42 tasks). Held-out pooled: +0.196 [0.000, 0.411] (14 tasks). Meets bar: yes (needs dev mean >= +0.15 with lower bound > 0, held-out mean > 0 and >= half the dev mean). Not a claim at baseline.

## Per category, dev only (descriptive; 3 tasks each)

| category | haiku-5-5 / no-tools | haiku-5-5 / server@9f30d6c5 | gpt-6-luna / no-tools | gpt-6-luna / server@9f30d6c5 |
|---|---|---|---|---|
| 1 | 16.7% | 66.7% | 33.3% | 66.7% |
| 2 | 100.0% | 100.0% | 83.3% | 100.0% |
| 3 | 100.0% | 100.0% | 50.0% | 66.7% |
| 4 | 100.0% | 100.0% | 83.3% | 100.0% |
| 5 | 0.0% | 83.3% | 50.0% | 0.0% |
| 6 | 0.0% | 66.7% | 0.0% | 66.7% |
| 7 | 0.0% | 100.0% | 0.0% | 100.0% |
| 8 | 0.0% | 100.0% | 0.0% | 50.0% |
| 9 | 50.0% | 83.3% | 83.3% | 50.0% |
| 10 | 33.3% | 100.0% | 66.7% | 100.0% |
| 11 | 16.7% | 0.0% | 0.0% | 0.0% |
| 12 | 100.0% | 100.0% | 83.3% | 50.0% |
| 13 | 0.0% | 0.0% | 0.0% | 0.0% |
| 14 | 100.0% | 100.0% | 100.0% | 100.0% |

## Regressions (dev tasks where the server condition is worse)

- haiku-5-5 c11-2: server 0.0% vs no-tools 50.0% (cells: haiku-5-5/server@9f30d6c5/c11-2/t1, haiku-5-5/server@9f30d6c5/c11-2/t2)
- gpt-6-luna c03-3: server 0.0% vs no-tools 50.0% (cells: gpt-6-luna/server@9f30d6c5/c03-3/t1, gpt-6-luna/server@9f30d6c5/c03-3/t2)
- gpt-6-luna c05-1: server 0.0% vs no-tools 100.0% (cells: gpt-6-luna/server@9f30d6c5/c05-1/t1, gpt-6-luna/server@9f30d6c5/c05-1/t2)
- gpt-6-luna c05-2: server 0.0% vs no-tools 50.0% (cells: gpt-6-luna/server@9f30d6c5/c05-2/t1, gpt-6-luna/server@9f30d6c5/c05-2/t2)
- gpt-6-luna c09-1: server 50.0% vs no-tools 100.0% (cells: gpt-6-luna/server@9f30d6c5/c09-1/t1, gpt-6-luna/server@9f30d6c5/c09-1/t2)
- gpt-6-luna c09-2: server 50.0% vs no-tools 100.0% (cells: gpt-6-luna/server@9f30d6c5/c09-2/t1, gpt-6-luna/server@9f30d6c5/c09-2/t2)
- gpt-6-luna c12-2: server 0.0% vs no-tools 100.0% (cells: gpt-6-luna/server@9f30d6c5/c12-2/t1, gpt-6-luna/server@9f30d6c5/c12-2/t2)

## Outcomes (dev)

- haiku-5-5 / no-tools: {"pass":37,"semantic_failure":4,"limit_exhausted":43}
- haiku-5-5 / server@9f30d6c5: {"pass":66,"limit_exhausted":15,"semantic_failure":3}
- gpt-6-luna / no-tools: {"pass":38,"semantic_failure":45,"limit_exhausted":1}
- gpt-6-luna / server@9f30d6c5: {"pass":51,"semantic_failure":28,"limit_exhausted":5}

## Dropped trials (pairwise infra exclusion)

- haiku-5-5: 0/112 dropped
- gpt-6-luna: 0/112 dropped

## Tool usage (dev, server condition)

| model | tool | calls | errors | schema rejections |
|---|---|---|---|---|
| haiku-5-5 | colors_convert | 155 | 0 | 0 |
| haiku-5-5 | colors_difference | 63 | 2 | 2 |
| haiku-5-5 | colors_contrast | 60 | 0 | 0 |
| haiku-5-5 | colors_batch_convert | 56 | 1 | 1 |
| haiku-5-5 | colors_adjust | 21 | 0 | 0 |
| haiku-5-5 | colors_batch_difference | 7 | 0 | 0 |
| haiku-5-5 | colors_batch_contrast | 4 | 4 | 4 |
| haiku-5-5 | colors_scale | 2 | 0 | 0 |
| haiku-5-5 | colors_batch_adjust | 2 | 0 | 0 |
| gpt-6-luna | colors_contrast | 189 | 0 | 0 |
| gpt-6-luna | colors_convert | 109 | 0 | 0 |
| gpt-6-luna | colors_scale | 19 | 2 | 2 |
| gpt-6-luna | colors_parse | 17 | 6 | 0 |
| gpt-6-luna | colors_batch_contrast | 15 | 14 | 14 |
| gpt-6-luna | colors_batch_convert | 12 | 0 | 0 |
| gpt-6-luna | colors_difference | 11 | 0 | 0 |
| gpt-6-luna | colors_batch_difference | 9 | 0 | 0 |
| gpt-6-luna | colors_adjust | 8 | 0 | 0 |
| gpt-6-luna | colors_mix | 6 | 0 | 0 |

## Failure-analysis transcript sample (dev only, seeded)

- gpt-6-luna/no-tools/c01-3/t1 (category 1, semantic_failure)
- gpt-6-luna/no-tools/c01-2/t1 (category 1, semantic_failure)
- gpt-6-luna/no-tools/c02-1/t2 (category 2, semantic_failure)
- gpt-6-luna/no-tools/c03-3/t1 (category 3, semantic_failure)
- gpt-6-luna/no-tools/c03-2/t1 (category 3, semantic_failure)
- gpt-6-luna/no-tools/c04-1/t1 (category 4, semantic_failure)
- gpt-6-luna/no-tools/c05-2/t1 (category 5, semantic_failure)
- gpt-6-luna/no-tools/c05-3/t1 (category 5, semantic_failure)
- gpt-6-luna/no-tools/c06-1/t1 (category 6, semantic_failure)
- gpt-6-luna/no-tools/c06-3/t1 (category 6, semantic_failure)
- gpt-6-luna/no-tools/c07-2/t1 (category 7, semantic_failure)
- gpt-6-luna/no-tools/c07-3/t1 (category 7, semantic_failure)
- gpt-6-luna/no-tools/c08-1/t1 (category 8, semantic_failure)
- gpt-6-luna/no-tools/c08-2/t1 (category 8, semantic_failure)
- gpt-6-luna/no-tools/c09-3/t1 (category 9, limit_exhausted)
- gpt-6-luna/no-tools/c10-3/t1 (category 10, semantic_failure)
- gpt-6-luna/no-tools/c10-1/t1 (category 10, semantic_failure)
- gpt-6-luna/no-tools/c11-2/t1 (category 11, semantic_failure)
- gpt-6-luna/no-tools/c11-3/t1 (category 11, semantic_failure)
- gpt-6-luna/no-tools/c12-1/t2 (category 12, semantic_failure)
- gpt-6-luna/no-tools/c13-3/t1 (category 13, semantic_failure)
- gpt-6-luna/no-tools/c13-2/t1 (category 13, semantic_failure)
- gpt-6-luna/server@9f30d6c5/c01-3/t1 (category 1, semantic_failure)
- gpt-6-luna/server@9f30d6c5/c03-3/t1 (category 3, semantic_failure)
- gpt-6-luna/server@9f30d6c5/c05-2/t1 (category 5, semantic_failure)
- gpt-6-luna/server@9f30d6c5/c05-1/t1 (category 5, semantic_failure)
- gpt-6-luna/server@9f30d6c5/c06-2/t1 (category 6, semantic_failure)
- gpt-6-luna/server@9f30d6c5/c08-2/t1 (category 8, semantic_failure)
- gpt-6-luna/server@9f30d6c5/c08-1/t1 (category 8, semantic_failure)
- gpt-6-luna/server@9f30d6c5/c09-1/t1 (category 9, limit_exhausted)
- gpt-6-luna/server@9f30d6c5/c09-2/t1 (category 9, limit_exhausted)
- gpt-6-luna/server@9f30d6c5/c11-2/t1 (category 11, semantic_failure)
- gpt-6-luna/server@9f30d6c5/c11-1/t1 (category 11, semantic_failure)
- gpt-6-luna/server@9f30d6c5/c12-2/t1 (category 12, semantic_failure)
- gpt-6-luna/server@9f30d6c5/c12-1/t1 (category 12, semantic_failure)
- gpt-6-luna/server@9f30d6c5/c13-3/t1 (category 13, semantic_failure)
- gpt-6-luna/server@9f30d6c5/c13-2/t1 (category 13, semantic_failure)
- haiku-5-5/no-tools/c01-2/t1 (category 1, limit_exhausted)
- haiku-5-5/no-tools/c01-3/t1 (category 1, limit_exhausted)
- haiku-5-5/no-tools/c05-1/t1 (category 5, limit_exhausted)
- haiku-5-5/no-tools/c05-2/t1 (category 5, limit_exhausted)
- haiku-5-5/no-tools/c06-3/t1 (category 6, limit_exhausted)
- haiku-5-5/no-tools/c06-2/t1 (category 6, limit_exhausted)
- haiku-5-5/no-tools/c07-3/t1 (category 7, limit_exhausted)
- haiku-5-5/no-tools/c07-2/t1 (category 7, limit_exhausted)
- haiku-5-5/no-tools/c08-3/t1 (category 8, limit_exhausted)
- haiku-5-5/no-tools/c08-2/t1 (category 8, limit_exhausted)
- haiku-5-5/no-tools/c09-2/t1 (category 9, limit_exhausted)
- haiku-5-5/no-tools/c09-3/t1 (category 9, semantic_failure)
- haiku-5-5/no-tools/c10-3/t1 (category 10, limit_exhausted)
- haiku-5-5/no-tools/c10-2/t1 (category 10, limit_exhausted)
- haiku-5-5/no-tools/c11-1/t1 (category 11, limit_exhausted)
- haiku-5-5/no-tools/c11-2/t1 (category 11, semantic_failure)
- haiku-5-5/no-tools/c13-1/t1 (category 13, limit_exhausted)
- haiku-5-5/no-tools/c13-2/t1 (category 13, limit_exhausted)
- haiku-5-5/server@9f30d6c5/c01-3/t1 (category 1, limit_exhausted)
- haiku-5-5/server@9f30d6c5/c05-1/t2 (category 5, semantic_failure)
- haiku-5-5/server@9f30d6c5/c06-2/t1 (category 6, semantic_failure)
- haiku-5-5/server@9f30d6c5/c09-2/t2 (category 9, limit_exhausted)
- haiku-5-5/server@9f30d6c5/c11-3/t1 (category 11, limit_exhausted)
- haiku-5-5/server@9f30d6c5/c11-2/t1 (category 11, limit_exhausted)
- haiku-5-5/server@9f30d6c5/c13-1/t1 (category 13, limit_exhausted)
- haiku-5-5/server@9f30d6c5/c13-2/t1 (category 13, limit_exhausted)
- gpt-6-luna/server@9f30d6c5/c05-3/t2 (category 5, limit_exhausted)
- gpt-6-luna/server@9f30d6c5/c09-3/t1 (category 9, limit_exhausted)
- gpt-6-luna/server@9f30d6c5/c13-1/t1 (category 13, limit_exhausted)
- haiku-5-5/no-tools/c01-2/t2 (category 1, limit_exhausted)
- haiku-5-5/no-tools/c01-3/t2 (category 1, limit_exhausted)
- haiku-5-5/no-tools/c05-1/t2 (category 5, limit_exhausted)
- haiku-5-5/no-tools/c05-2/t2 (category 5, limit_exhausted)
- haiku-5-5/no-tools/c05-3/t1 (category 5, limit_exhausted)
- haiku-5-5/no-tools/c05-3/t2 (category 5, limit_exhausted)
- haiku-5-5/no-tools/c06-1/t1 (category 6, limit_exhausted)
- haiku-5-5/no-tools/c06-1/t2 (category 6, limit_exhausted)
- haiku-5-5/no-tools/c06-2/t2 (category 6, limit_exhausted)
- haiku-5-5/no-tools/c06-3/t2 (category 6, limit_exhausted)
- haiku-5-5/no-tools/c07-1/t1 (category 7, limit_exhausted)
- haiku-5-5/no-tools/c07-1/t2 (category 7, limit_exhausted)
- haiku-5-5/no-tools/c07-2/t2 (category 7, limit_exhausted)
- haiku-5-5/no-tools/c07-3/t2 (category 7, limit_exhausted)
- haiku-5-5/no-tools/c08-1/t1 (category 8, limit_exhausted)
- haiku-5-5/no-tools/c08-1/t2 (category 8, limit_exhausted)
- haiku-5-5/no-tools/c08-2/t2 (category 8, limit_exhausted)
- haiku-5-5/no-tools/c08-3/t2 (category 8, limit_exhausted)
- haiku-5-5/no-tools/c09-2/t2 (category 9, limit_exhausted)
- haiku-5-5/no-tools/c10-2/t2 (category 10, limit_exhausted)
- haiku-5-5/no-tools/c10-3/t2 (category 10, limit_exhausted)
- haiku-5-5/no-tools/c11-3/t1 (category 11, limit_exhausted)
- haiku-5-5/no-tools/c11-3/t2 (category 11, limit_exhausted)
- haiku-5-5/no-tools/c13-1/t2 (category 13, limit_exhausted)
- haiku-5-5/no-tools/c13-2/t2 (category 13, limit_exhausted)
- haiku-5-5/no-tools/c13-3/t1 (category 13, limit_exhausted)
- haiku-5-5/no-tools/c13-3/t2 (category 13, limit_exhausted)
- haiku-5-5/server@9f30d6c5/c01-3/t2 (category 1, limit_exhausted)
- haiku-5-5/server@9f30d6c5/c11-1/t1 (category 11, limit_exhausted)
- haiku-5-5/server@9f30d6c5/c11-1/t2 (category 11, limit_exhausted)
- haiku-5-5/server@9f30d6c5/c11-2/t2 (category 11, limit_exhausted)
- haiku-5-5/server@9f30d6c5/c11-3/t2 (category 11, limit_exhausted)
- haiku-5-5/server@9f30d6c5/c13-1/t2 (category 13, limit_exhausted)
- haiku-5-5/server@9f30d6c5/c13-2/t2 (category 13, limit_exhausted)
- haiku-5-5/server@9f30d6c5/c13-3/t1 (category 13, limit_exhausted)
- haiku-5-5/server@9f30d6c5/c13-3/t2 (category 13, limit_exhausted)
