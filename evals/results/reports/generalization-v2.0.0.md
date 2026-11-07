# Eval report: gen

Suite: generalization, version 1. Client profile: **TNI** (text-only tool results, no server instructions). Server: `881ebc2b9034b5b81dfe95b8dce3b2442cfb52f4`. Node v26.13.0.

> Scope: generalization suite of adjacent and out-of-scope color tasks written from designer briefs, not around the tools; dev split only and never tuned on, so no held-out comparison is made. Two small hosted models, TNI client only. Descriptive; no significance claims.


## Dev split: per model and condition

| model | condition | tasks | trials | pass | check score | tool calls | in tok | out tok | sec | limit | format fail | strict pass | zero-tool-call (useful tasks) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| haiku-5-5 | no-tools | 28 | 56 | 58.9% | 58.9% | 0.0 | 522 | 2770 | 12.9 | 39.3% | 0.0% | 58.9% | n/a |
| haiku-5-5 | server@881ebc2b | 28 | 56 | 92.9% | 95.8% | 3.2 | 19658 | 2689 | 13.2 | 3.6% | 0.0% | 92.9% | 19.0% |
| gpt-6-luna | no-tools | 28 | 56 | 55.4% | 82.9% | 0.0 | 565 | 642 | 16.9 | 1.8% | 0.0% | 55.4% | n/a |
| gpt-6-luna | server@881ebc2b | 28 | 56 | 69.6% | 86.4% | 3.6 | 17274 | 440 | 17.6 | 5.4% | 0.0% | 69.6% | 0.0% |

## Paired per-task difference (server minus no-tools), dev

Task-clustered bootstrap 95% interval, 10,000 seeded resamples.

- **haiku-5-5**: +0.339 [0.161, 0.536] (28 tasks)
- **gpt-6-luna**: +0.143 [-0.018, 0.304] (28 tasks)
- **pooled**: +0.241 [0.089, 0.393] (28 tasks)

## Held-out split

None: this suite is dev-only by design (never tuned on), so there is no held-out comparison and no predeclared bar.

## Per category, dev only (descriptive; 4 tasks each)

| category | haiku-5-5 / no-tools | haiku-5-5 / server@881ebc2b | gpt-6-luna / no-tools | gpt-6-luna / server@881ebc2b |
|---|---|---|---|---|
| 101 | 87.5% | 100.0% | 75.0% | 75.0% |
| 102 | 100.0% | 87.5% | 100.0% | 87.5% |
| 103 | 75.0% | 100.0% | 75.0% | 87.5% |
| 104 | 62.5% | 75.0% | 37.5% | 87.5% |
| 105 | 0.0% | 100.0% | 25.0% | 25.0% |
| 106 | 0.0% | 87.5% | 12.5% | 62.5% |
| 107 | 87.5% | 100.0% | 62.5% | 62.5% |

## Regressions (dev tasks where the server condition is worse)

- haiku-5-5 g102-3: server 50.0% vs no-tools 100.0% (cells: haiku-5-5/server@881ebc2b/g102-3/t1, haiku-5-5/server@881ebc2b/g102-3/t2)
- haiku-5-5 g104-4: server 0.0% vs no-tools 50.0% (cells: haiku-5-5/server@881ebc2b/g104-4/t1, haiku-5-5/server@881ebc2b/g104-4/t2)
- gpt-6-luna g101-1: server 50.0% vs no-tools 100.0% (cells: gpt-6-luna/server@881ebc2b/g101-1/t1, gpt-6-luna/server@881ebc2b/g101-1/t2)
- gpt-6-luna g101-3: server 50.0% vs no-tools 100.0% (cells: gpt-6-luna/server@881ebc2b/g101-3/t1, gpt-6-luna/server@881ebc2b/g101-3/t2)
- gpt-6-luna g102-3: server 50.0% vs no-tools 100.0% (cells: gpt-6-luna/server@881ebc2b/g102-3/t1, gpt-6-luna/server@881ebc2b/g102-3/t2)
- gpt-6-luna g103-3: server 50.0% vs no-tools 100.0% (cells: gpt-6-luna/server@881ebc2b/g103-3/t1, gpt-6-luna/server@881ebc2b/g103-3/t2)
- gpt-6-luna g105-3: server 0.0% vs no-tools 50.0% (cells: gpt-6-luna/server@881ebc2b/g105-3/t1, gpt-6-luna/server@881ebc2b/g105-3/t2)

## Outcomes (dev)

- haiku-5-5 / no-tools: {"pass":33,"limit_exhausted":22,"semantic_failure":1}
- haiku-5-5 / server@881ebc2b: {"pass":52,"limit_exhausted":2,"semantic_failure":2}
- gpt-6-luna / no-tools: {"pass":31,"semantic_failure":24,"limit_exhausted":1}
- gpt-6-luna / server@881ebc2b: {"semantic_failure":14,"pass":39,"limit_exhausted":3}

## Dropped trials (pairwise infra exclusion)

- haiku-5-5: 0/56 dropped
- gpt-6-luna: 0/56 dropped

## Tool usage (dev, server condition)

| model | tool | calls | errors | schema rejections |
|---|---|---|---|---|
| haiku-5-5 | colors_convert | 64 | 0 | 0 |
| haiku-5-5 | colors_vision | 42 | 0 | 0 |
| haiku-5-5 | colors_check | 35 | 0 | 0 |
| haiku-5-5 | colors_info | 26 | 0 | 0 |
| haiku-5-5 | colors_adjust | 6 | 0 | 0 |
| haiku-5-5 | colors_blend | 4 | 0 | 0 |
| haiku-5-5 | colors_palette | 2 | 0 | 0 |
| haiku-5-5 | colors_fix | 1 | 0 | 0 |
| gpt-6-luna | colors_info | 53 | 0 | 0 |
| gpt-6-luna | colors_check | 42 | 1 | 1 |
| gpt-6-luna | colors_convert | 42 | 0 | 0 |
| gpt-6-luna | colors_palette | 35 | 1 | 1 |
| gpt-6-luna | colors_adjust | 9 | 0 | 0 |
| gpt-6-luna | colors_blend | 9 | 0 | 0 |
| gpt-6-luna | colors_vision | 9 | 0 | 0 |
| gpt-6-luna | colors_harmony | 2 | 0 | 0 |
| gpt-6-luna | colors_fix | 2 | 0 | 0 |

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
- gpt-6-luna/server@881ebc2b/g101-1/t1 (category 101, semantic_failure)
- gpt-6-luna/server@881ebc2b/g101-3/t2 (category 101, limit_exhausted)
- gpt-6-luna/server@881ebc2b/g102-3/t1 (category 102, semantic_failure)
- gpt-6-luna/server@881ebc2b/g103-3/t1 (category 103, limit_exhausted)
- gpt-6-luna/server@881ebc2b/g104-4/t2 (category 104, semantic_failure)
- gpt-6-luna/server@881ebc2b/g105-4/t1 (category 105, limit_exhausted)
- gpt-6-luna/server@881ebc2b/g105-2/t2 (category 105, semantic_failure)
- gpt-6-luna/server@881ebc2b/g106-4/t1 (category 106, semantic_failure)
- gpt-6-luna/server@881ebc2b/g106-3/t2 (category 106, semantic_failure)
- gpt-6-luna/server@881ebc2b/g107-2/t1 (category 107, semantic_failure)
- gpt-6-luna/server@881ebc2b/g107-3/t1 (category 107, semantic_failure)
- haiku-5-5/no-tools/g101-2/t1 (category 101, limit_exhausted)
- haiku-5-5/no-tools/g103-4/t1 (category 103, limit_exhausted)
- haiku-5-5/no-tools/g104-4/t2 (category 104, limit_exhausted)
- haiku-5-5/no-tools/g104-3/t1 (category 104, limit_exhausted)
- haiku-5-5/no-tools/g105-1/t1 (category 105, limit_exhausted)
- haiku-5-5/no-tools/g105-4/t1 (category 105, limit_exhausted)
- haiku-5-5/no-tools/g106-4/t1 (category 106, limit_exhausted)
- haiku-5-5/no-tools/g106-3/t1 (category 106, limit_exhausted)
- haiku-5-5/no-tools/g107-4/t1 (category 107, semantic_failure)
- haiku-5-5/server@881ebc2b/g102-3/t2 (category 102, limit_exhausted)
- haiku-5-5/server@881ebc2b/g104-4/t1 (category 104, limit_exhausted)
- haiku-5-5/server@881ebc2b/g106-4/t1 (category 106, semantic_failure)
- haiku-5-5/no-tools/g103-4/t2 (category 103, limit_exhausted)
- haiku-5-5/no-tools/g104-3/t2 (category 104, limit_exhausted)
- haiku-5-5/no-tools/g105-1/t2 (category 105, limit_exhausted)
- haiku-5-5/no-tools/g105-2/t1 (category 105, limit_exhausted)
- haiku-5-5/no-tools/g105-2/t2 (category 105, limit_exhausted)
- haiku-5-5/no-tools/g105-3/t1 (category 105, limit_exhausted)
- haiku-5-5/no-tools/g105-3/t2 (category 105, limit_exhausted)
- haiku-5-5/no-tools/g105-4/t2 (category 105, limit_exhausted)
- haiku-5-5/no-tools/g106-1/t1 (category 106, limit_exhausted)
- haiku-5-5/no-tools/g106-1/t2 (category 106, limit_exhausted)
- haiku-5-5/no-tools/g106-2/t1 (category 106, limit_exhausted)
- haiku-5-5/no-tools/g106-2/t2 (category 106, limit_exhausted)
- haiku-5-5/no-tools/g106-3/t2 (category 106, limit_exhausted)
- haiku-5-5/no-tools/g106-4/t2 (category 106, limit_exhausted)
