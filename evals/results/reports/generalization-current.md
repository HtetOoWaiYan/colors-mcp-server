# Eval report: generalization suite, current server (a tuning set)

Suite: generalization, version 1. Client profile: **TNI** (text-only tool results, no server instructions). Server: `8aa7e0091a7eed79f4e94724687f6e51e2975b6d`. Node v26.13.0.

> Scope: generalization suite of adjacent and out-of-scope color tasks written from designer briefs, not around the tools; dev split only and never tuned on, so no held-out comparison is made. Two small hosted models, TNI client only. Descriptive; no significance claims.


## Dev split: per model and condition

| model | condition | tasks | trials | pass | check score | tool calls | in tok | out tok | sec | limit | format fail | strict pass | zero-tool-call (useful tasks) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| haiku-5-5 | no-tools | 28 | 56 | 58.9% | 58.9% | 0.0 | 522 | 2770 | 12.9 | 39.3% | 0.0% | 58.9% | n/a |
| haiku-5-5 | server@8aa7e009 | 28 | 56 | 96.4% | 98.0% | 1.6 | 17780 | 1279 | 6.7 | 0.0% | 0.0% | 96.4% | 0.0% |
| gpt-6-luna | no-tools | 28 | 56 | 55.4% | 82.9% | 0.0 | 565 | 642 | 16.9 | 1.8% | 0.0% | 55.4% | n/a |
| gpt-6-luna | server@8aa7e009 | 28 | 56 | 85.7% | 90.9% | 1.8 | 11939 | 270 | 11.1 | 3.6% | 0.0% | 85.7% | 0.0% |

## Paired per-task difference (server minus no-tools), dev

Task-clustered bootstrap 95% interval, 10,000 seeded resamples.

- **haiku-5-5**: +0.375 [0.196, 0.554] (28 tasks)
- **gpt-6-luna**: +0.304 [0.125, 0.482] (28 tasks)
- **pooled**: +0.339 [0.170, 0.509] (28 tasks)

## Held-out split

None: this suite is dev-only by design (never tuned on), so there is no held-out comparison and no predeclared bar.

## Per category, dev only (descriptive; 4 tasks each)

| category | haiku-5-5 / no-tools | haiku-5-5 / server@8aa7e009 | gpt-6-luna / no-tools | gpt-6-luna / server@8aa7e009 |
|---|---|---|---|---|
| 101 | 87.5% | 100.0% | 75.0% | 100.0% |
| 102 | 100.0% | 100.0% | 100.0% | 100.0% |
| 103 | 75.0% | 100.0% | 75.0% | 100.0% |
| 104 | 62.5% | 100.0% | 37.5% | 62.5% |
| 105 | 0.0% | 100.0% | 25.0% | 100.0% |
| 106 | 0.0% | 87.5% | 12.5% | 75.0% |
| 107 | 87.5% | 87.5% | 62.5% | 62.5% |

## Regressions (dev tasks where the server condition is worse)

- haiku-5-5 g107-2: server 50.0% vs no-tools 100.0% (cells: haiku-5-5/server@8aa7e009/g107-2/t1, haiku-5-5/server@8aa7e009/g107-2/t2)
- gpt-6-luna g104-2: server 0.0% vs no-tools 100.0% (cells: gpt-6-luna/server@8aa7e009/g104-2/t1, gpt-6-luna/server@8aa7e009/g104-2/t2)
- gpt-6-luna g107-2: server 0.0% vs no-tools 50.0% (cells: gpt-6-luna/server@8aa7e009/g107-2/t1, gpt-6-luna/server@8aa7e009/g107-2/t2)

## Outcomes (dev)

- haiku-5-5 / no-tools: {"pass":33,"limit_exhausted":22,"semantic_failure":1}
- haiku-5-5 / server@8aa7e009: {"pass":54,"semantic_failure":2}
- gpt-6-luna / no-tools: {"pass":31,"semantic_failure":24,"limit_exhausted":1}
- gpt-6-luna / server@8aa7e009: {"pass":48,"semantic_failure":6,"limit_exhausted":2}

## Dropped trials (pairwise infra exclusion)

- haiku-5-5: 0/56 dropped
- gpt-6-luna: 0/56 dropped

## Tool usage (dev, server condition)

| model | tool | calls | errors | schema rejections |
|---|---|---|---|---|
| haiku-5-5 | colors_find | 28 | 0 | 0 |
| haiku-5-5 | colors_convert | 19 | 0 | 0 |
| haiku-5-5 | colors_vision | 17 | 0 | 0 |
| haiku-5-5 | colors_blend | 11 | 0 | 0 |
| haiku-5-5 | colors_scrim | 8 | 0 | 0 |
| haiku-5-5 | colors_info | 3 | 0 | 0 |
| haiku-5-5 | colors_check | 3 | 0 | 0 |
| haiku-5-5 | colors_palette | 1 | 0 | 0 |
| gpt-6-luna | colors_find | 41 | 0 | 0 |
| gpt-6-luna | colors_blend | 18 | 0 | 0 |
| gpt-6-luna | colors_convert | 16 | 3 | 0 |
| gpt-6-luna | colors_vision | 13 | 0 | 0 |
| gpt-6-luna | colors_scrim | 8 | 0 | 0 |
| gpt-6-luna | colors_palette | 5 | 0 | 0 |

## Failure-analysis transcript sample (dev only, seeded)

- gpt-6-luna/no-tools/g101-4/t2 (category 101, semantic_failure)
- gpt-6-luna/no-tools/g101-2/t2 (category 101, semantic_failure)
- gpt-6-luna/no-tools/g103-4/t1 (category 103, semantic_failure)
- gpt-6-luna/no-tools/g104-3/t1 (category 104, semantic_failure)
- gpt-6-luna/no-tools/g104-1/t1 (category 104, semantic_failure)
- gpt-6-luna/no-tools/g105-3/t2 (category 105, semantic_failure)
- gpt-6-luna/no-tools/g105-1/t1 (category 105, semantic_failure)
- gpt-6-luna/no-tools/g106-1/t1 (category 106, limit_exhausted)
- gpt-6-luna/no-tools/g106-3/t1 (category 106, semantic_failure)
- gpt-6-luna/no-tools/g107-4/t1 (category 107, semantic_failure)
- gpt-6-luna/no-tools/g107-2/t2 (category 107, semantic_failure)
- gpt-6-luna/server@8aa7e009/g104-2/t1 (category 104, semantic_failure)
- gpt-6-luna/server@8aa7e009/g104-4/t2 (category 104, semantic_failure)
- gpt-6-luna/server@8aa7e009/g106-4/t1 (category 106, limit_exhausted)
- gpt-6-luna/server@8aa7e009/g107-4/t2 (category 107, semantic_failure)
- gpt-6-luna/server@8aa7e009/g107-2/t1 (category 107, semantic_failure)
- haiku-5-5/no-tools/g101-2/t1 (category 101, limit_exhausted)
- haiku-5-5/no-tools/g103-4/t1 (category 103, limit_exhausted)
- haiku-5-5/no-tools/g104-3/t1 (category 104, limit_exhausted)
- haiku-5-5/no-tools/g104-4/t2 (category 104, limit_exhausted)
- haiku-5-5/no-tools/g105-3/t1 (category 105, limit_exhausted)
- haiku-5-5/no-tools/g105-2/t1 (category 105, limit_exhausted)
- haiku-5-5/no-tools/g106-2/t1 (category 106, limit_exhausted)
- haiku-5-5/no-tools/g106-1/t1 (category 106, limit_exhausted)
- haiku-5-5/no-tools/g107-4/t1 (category 107, semantic_failure)
- haiku-5-5/server@8aa7e009/g106-4/t2 (category 106, semantic_failure)
- haiku-5-5/server@8aa7e009/g107-2/t2 (category 107, semantic_failure)
- gpt-6-luna/server@8aa7e009/g106-4/t2 (category 106, limit_exhausted)
- haiku-5-5/no-tools/g103-4/t2 (category 103, limit_exhausted)
- haiku-5-5/no-tools/g104-3/t2 (category 104, limit_exhausted)
- haiku-5-5/no-tools/g105-1/t1 (category 105, limit_exhausted)
- haiku-5-5/no-tools/g105-1/t2 (category 105, limit_exhausted)
- haiku-5-5/no-tools/g105-2/t2 (category 105, limit_exhausted)
- haiku-5-5/no-tools/g105-3/t2 (category 105, limit_exhausted)
- haiku-5-5/no-tools/g105-4/t1 (category 105, limit_exhausted)
- haiku-5-5/no-tools/g105-4/t2 (category 105, limit_exhausted)
- haiku-5-5/no-tools/g106-1/t2 (category 106, limit_exhausted)
- haiku-5-5/no-tools/g106-2/t2 (category 106, limit_exhausted)
- haiku-5-5/no-tools/g106-3/t1 (category 106, limit_exhausted)
- haiku-5-5/no-tools/g106-3/t2 (category 106, limit_exhausted)
- haiku-5-5/no-tools/g106-4/t1 (category 106, limit_exhausted)
- haiku-5-5/no-tools/g106-4/t2 (category 106, limit_exhausted)
