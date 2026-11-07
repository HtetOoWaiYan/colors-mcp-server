# Eval report: v3-dev

Suite: v1, version 1. Client profile: **TNI** (text-only tool results, no server instructions). Server: `8aa7e0091a7eed79f4e94724687f6e51e2975b6d`. Node v26.13.0.

> Scope: bounded CSS, UI-token and chart-palette color tasks, two small hosted models, TNI client only. No claim is made about print, film, photo or game work. Baseline results are descriptive; no significance claims.


## Dev split: per model and condition

| model | condition | tasks | trials | pass | check score | tool calls | in tok | out tok | sec | limit | format fail | strict pass | zero-tool-call (useful tasks) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| haiku-5-5 | no-tools | 42 | 84 | 38.1% | 40.0% | 0.0 | 470 | 3122 | 14.4 | 59.5% | 0.0% | 38.1% | n/a |
| haiku-5-5 | server@8aa7e009 | 42 | 84 | 96.4% | 96.4% | 2.8 | 20024 | 1524 | 7.8 | 3.6% | 0.0% | 96.4% | 11.5% |
| gpt-6-luna | no-tools | 42 | 84 | 47.6% | 81.8% | 0.0 | 537 | 727 | 17.3 | 1.2% | 0.0% | 47.6% | n/a |
| gpt-6-luna | server@8aa7e009 | 42 | 84 | 98.8% | 100.0% | 1.6 | 11289 | 192 | 9.5 | 0.0% | 0.0% | 98.8% | 0.0% |

## Paired per-task difference (server minus no-tools), dev

Task-clustered bootstrap 95% interval, 10,000 seeded resamples.

- **haiku-5-5**: +0.583 [0.440, 0.726] (42 tasks)
- **gpt-6-luna**: +0.512 [0.393, 0.631] (42 tasks)
- **pooled**: +0.548 [0.440, 0.655] (42 tasks)

## Held-out split (sealed): full-split aggregates only

| model | condition | tasks | pass | check score |
|---|---|---|---|---|
| haiku-5-5 | no-tools | 0 | n/a | n/a |
| haiku-5-5 | server@8aa7e009 | 0 | n/a | n/a |
| gpt-6-luna | no-tools | 0 | n/a | n/a |
| gpt-6-luna | server@8aa7e009 | 0 | n/a | n/a |

Held-out paired difference (descriptive only, 14 tasks):

- **haiku-5-5**: n/a
- **gpt-6-luna**: n/a
- **pooled**: n/a

## Predeclared bar (for later milestones)

Dev pooled: +0.548 [0.440, 0.655] (42 tasks). Held-out pooled: n/a. Meets bar: no (needs dev mean >= +0.15 with lower bound > 0, held-out mean > 0 and >= half the dev mean). Not a claim at baseline.

## Per category, dev only (descriptive; 3 tasks each)

| category | haiku-5-5 / no-tools | haiku-5-5 / server@8aa7e009 | gpt-6-luna / no-tools | gpt-6-luna / server@8aa7e009 |
|---|---|---|---|---|
| 1 | 50.0% | 100.0% | 50.0% | 100.0% |
| 2 | 100.0% | 100.0% | 83.3% | 100.0% |
| 3 | 66.7% | 100.0% | 50.0% | 100.0% |
| 4 | 100.0% | 100.0% | 50.0% | 100.0% |
| 5 | 0.0% | 100.0% | 50.0% | 100.0% |
| 6 | 0.0% | 100.0% | 33.3% | 100.0% |
| 7 | 0.0% | 100.0% | 16.7% | 100.0% |
| 8 | 0.0% | 83.3% | 16.7% | 100.0% |
| 9 | 0.0% | 100.0% | 100.0% | 100.0% |
| 10 | 50.0% | 100.0% | 0.0% | 100.0% |
| 11 | 0.0% | 100.0% | 16.7% | 100.0% |
| 12 | 66.7% | 100.0% | 100.0% | 100.0% |
| 13 | 0.0% | 66.7% | 0.0% | 83.3% |
| 14 | 100.0% | 100.0% | 100.0% | 100.0% |

## Regressions (dev tasks where the server condition is worse)

None.

## Outcomes (dev)

- haiku-5-5 / no-tools: {"limit_exhausted":50,"pass":32,"semantic_failure":2}
- haiku-5-5 / server@8aa7e009: {"pass":81,"limit_exhausted":3}
- gpt-6-luna / no-tools: {"pass":40,"semantic_failure":43,"limit_exhausted":1}
- gpt-6-luna / server@8aa7e009: {"pass":83,"semantic_failure":1}

## Dropped trials (pairwise infra exclusion)

- haiku-5-5: 28/112 dropped **INCOMPLETE (>10%)**
- gpt-6-luna: 28/112 dropped **INCOMPLETE (>10%)**

## Tool usage (dev, server condition)

| model | tool | calls | errors | schema rejections |
|---|---|---|---|---|
| haiku-5-5 | colors_adjust | 82 | 0 | 0 |
| haiku-5-5 | colors_convert | 29 | 0 | 0 |
| haiku-5-5 | colors_palette | 29 | 0 | 0 |
| haiku-5-5 | colors_check | 28 | 0 | 0 |
| haiku-5-5 | colors_info | 15 | 0 | 0 |
| haiku-5-5 | colors_fix | 12 | 0 | 0 |
| haiku-5-5 | colors_vision | 12 | 0 | 0 |
| haiku-5-5 | colors_compare | 7 | 0 | 0 |
| haiku-5-5 | colors_blend | 6 | 0 | 0 |
| haiku-5-5 | colors_harmony | 6 | 0 | 0 |
| haiku-5-5 | colors_audit | 5 | 0 | 0 |
| haiku-5-5 | colors_find | 3 | 0 | 0 |
| gpt-6-luna | colors_palette | 35 | 0 | 0 |
| gpt-6-luna | colors_convert | 27 | 0 | 0 |
| gpt-6-luna | colors_adjust | 13 | 0 | 0 |
| gpt-6-luna | colors_check | 12 | 0 | 0 |
| gpt-6-luna | colors_fix | 12 | 0 | 0 |
| gpt-6-luna | colors_info | 10 | 0 | 0 |
| gpt-6-luna | colors_blend | 6 | 0 | 0 |
| gpt-6-luna | colors_compare | 6 | 0 | 0 |
| gpt-6-luna | colors_harmony | 6 | 0 | 0 |
| gpt-6-luna | colors_audit | 6 | 0 | 0 |
| gpt-6-luna | colors_find | 3 | 0 | 0 |
| gpt-6-luna | colors_vision | 1 | 0 | 0 |

## Failure-analysis transcript sample (dev only, seeded)

- gpt-6-luna/no-tools/c01-3/t1 (category 1, semantic_failure)
- gpt-6-luna/no-tools/c01-2/t2 (category 1, semantic_failure)
- gpt-6-luna/no-tools/c02-1/t1 (category 2, semantic_failure)
- gpt-6-luna/no-tools/c03-2/t1 (category 3, semantic_failure)
- gpt-6-luna/no-tools/c03-1/t2 (category 3, semantic_failure)
- gpt-6-luna/no-tools/c04-3/t2 (category 4, semantic_failure)
- gpt-6-luna/no-tools/c04-1/t1 (category 4, semantic_failure)
- gpt-6-luna/no-tools/c05-1/t2 (category 5, semantic_failure)
- gpt-6-luna/no-tools/c05-3/t2 (category 5, semantic_failure)
- gpt-6-luna/no-tools/c06-3/t1 (category 6, semantic_failure)
- gpt-6-luna/no-tools/c06-2/t1 (category 6, semantic_failure)
- gpt-6-luna/no-tools/c07-1/t1 (category 7, semantic_failure)
- gpt-6-luna/no-tools/c07-2/t1 (category 7, semantic_failure)
- gpt-6-luna/no-tools/c08-2/t1 (category 8, semantic_failure)
- gpt-6-luna/no-tools/c08-1/t2 (category 8, semantic_failure)
- gpt-6-luna/no-tools/c10-2/t1 (category 10, semantic_failure)
- gpt-6-luna/no-tools/c10-3/t1 (category 10, semantic_failure)
- gpt-6-luna/no-tools/c11-2/t1 (category 11, semantic_failure)
- gpt-6-luna/no-tools/c11-1/t1 (category 11, semantic_failure)
- gpt-6-luna/no-tools/c13-3/t1 (category 13, semantic_failure)
- gpt-6-luna/no-tools/c13-2/t1 (category 13, semantic_failure)
- gpt-6-luna/server@8aa7e009/c13-1/t1 (category 13, semantic_failure)
- haiku-5-5/no-tools/c01-1/t1 (category 1, limit_exhausted)
- haiku-5-5/no-tools/c01-3/t1 (category 1, limit_exhausted)
- haiku-5-5/no-tools/c03-3/t1 (category 3, limit_exhausted)
- haiku-5-5/no-tools/c05-1/t1 (category 5, limit_exhausted)
- haiku-5-5/no-tools/c05-3/t1 (category 5, limit_exhausted)
- haiku-5-5/no-tools/c06-1/t1 (category 6, limit_exhausted)
- haiku-5-5/no-tools/c06-3/t1 (category 6, limit_exhausted)
- haiku-5-5/no-tools/c07-3/t1 (category 7, limit_exhausted)
- haiku-5-5/no-tools/c07-1/t1 (category 7, limit_exhausted)
- haiku-5-5/no-tools/c08-2/t1 (category 8, limit_exhausted)
- haiku-5-5/no-tools/c08-3/t1 (category 8, limit_exhausted)
- haiku-5-5/no-tools/c09-2/t1 (category 9, limit_exhausted)
- haiku-5-5/no-tools/c09-1/t1 (category 9, limit_exhausted)
- haiku-5-5/no-tools/c10-2/t1 (category 10, limit_exhausted)
- haiku-5-5/no-tools/c10-3/t2 (category 10, limit_exhausted)
- haiku-5-5/no-tools/c11-2/t1 (category 11, limit_exhausted)
- haiku-5-5/no-tools/c11-1/t1 (category 11, limit_exhausted)
- haiku-5-5/no-tools/c12-1/t1 (category 12, limit_exhausted)
- haiku-5-5/no-tools/c13-3/t1 (category 13, limit_exhausted)
- haiku-5-5/no-tools/c13-2/t1 (category 13, limit_exhausted)
- haiku-5-5/server@8aa7e009/c08-2/t2 (category 8, limit_exhausted)
- haiku-5-5/server@8aa7e009/c13-3/t1 (category 13, limit_exhausted)
- haiku-5-5/server@8aa7e009/c13-1/t2 (category 13, limit_exhausted)
- gpt-6-luna/no-tools/c11-3/t2 (category 11, limit_exhausted)
- haiku-5-5/no-tools/c01-3/t2 (category 1, limit_exhausted)
- haiku-5-5/no-tools/c05-1/t2 (category 5, limit_exhausted)
- haiku-5-5/no-tools/c05-2/t1 (category 5, limit_exhausted)
- haiku-5-5/no-tools/c05-2/t2 (category 5, limit_exhausted)
- haiku-5-5/no-tools/c05-3/t2 (category 5, limit_exhausted)
- haiku-5-5/no-tools/c06-1/t2 (category 6, limit_exhausted)
- haiku-5-5/no-tools/c06-2/t1 (category 6, limit_exhausted)
- haiku-5-5/no-tools/c06-2/t2 (category 6, limit_exhausted)
- haiku-5-5/no-tools/c06-3/t2 (category 6, limit_exhausted)
- haiku-5-5/no-tools/c07-1/t2 (category 7, limit_exhausted)
- haiku-5-5/no-tools/c07-2/t1 (category 7, limit_exhausted)
- haiku-5-5/no-tools/c07-2/t2 (category 7, limit_exhausted)
- haiku-5-5/no-tools/c07-3/t2 (category 7, limit_exhausted)
- haiku-5-5/no-tools/c08-1/t1 (category 8, limit_exhausted)
- haiku-5-5/no-tools/c08-1/t2 (category 8, limit_exhausted)
- haiku-5-5/no-tools/c08-2/t2 (category 8, limit_exhausted)
- haiku-5-5/no-tools/c08-3/t2 (category 8, limit_exhausted)
- haiku-5-5/no-tools/c09-1/t2 (category 9, limit_exhausted)
- haiku-5-5/no-tools/c09-2/t2 (category 9, limit_exhausted)
- haiku-5-5/no-tools/c09-3/t1 (category 9, limit_exhausted)
- haiku-5-5/no-tools/c09-3/t2 (category 9, limit_exhausted)
- haiku-5-5/no-tools/c11-1/t2 (category 11, limit_exhausted)
- haiku-5-5/no-tools/c11-2/t2 (category 11, limit_exhausted)
- haiku-5-5/no-tools/c11-3/t1 (category 11, limit_exhausted)
- haiku-5-5/no-tools/c11-3/t2 (category 11, limit_exhausted)
- haiku-5-5/no-tools/c12-1/t2 (category 12, limit_exhausted)
- haiku-5-5/no-tools/c13-1/t1 (category 13, limit_exhausted)
- haiku-5-5/no-tools/c13-1/t2 (category 13, limit_exhausted)
- haiku-5-5/no-tools/c13-2/t2 (category 13, limit_exhausted)
- haiku-5-5/no-tools/c13-3/t2 (category 13, limit_exhausted)
