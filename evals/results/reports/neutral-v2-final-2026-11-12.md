# Neutral benchmark after the server fix: final result (2026-11-12)

Branch `bench/third-party-servers`. Server under test: this repo at `014fe97` ("your server"). Earlier report: `neutral-suite-comparison-2026-11-10.md` (server at `86a9b68`, before the fix).

## Headline

On 60 fresh tasks that no server was ever tuned on (neutral v2), your server passes 72.5% (mean over haiku-5-5 and gpt-6-luna), against 25.4% with no tools. The nearest competitor, color-theory-mcp, passes 55.4%. The paired difference is +0.171 [0.067, 0.271] and the interval excludes zero, so the lead is established on this suite (it was +0.050 and not established on v1 before the fix).

## What was fixed in the server (commit 014fe97)

The first neutral run showed three weak categories. Reading the failed transcripts showed real gaps, not suite quirks:

| tool | gap | change |
|---|---|---|
| `colors_check` | APCA was computed but left out of the text the model reads, and was returned unsigned | the text line now carries the signed Lc (positive dark-on-light); the structured result is signed |
| `colors_convert` | no xyz, linear sRGB, Rec.2020 or HSV output; `hsv()` unreadable as input | added the four output formats (aliases accepted) and `hsv()`/`hsb()` input |
| `colors_compare` | only CIEDE2000 and Oklab, one metric per call | added CIE76, CIE94 (graphic arts) and `all` |

All 139 tests of the server pass; the evals suite (649 tests) passes.

## How the comparison was kept fair after the fix

The fix was written after reading the failures of neutral v1, so v1 can no longer judge your server: it was informed by that suite. Two measurements were therefore taken:

1. **v1 rerun, frozen tasks.** Only your server changed, so only it was rerun (other servers' v1 results are unchanged and reused). Useful as a before/after, not as a clean judge.
2. **v2, fresh tasks.** Three new blind authors wrote 60 new tasks for the same 12 domains, a fourth agent re-solved all 60 independently with only `colorjs.io` and found no blockers, and the suite was frozen (hash `0127e52e…`, commit `beeeeb9`) before any server ran on it. Every server (including both profiles) was then run on v2. Nobody tuned anything on v2.

## v2 results (clean judge)

| condition | haiku-5-5 pass | gpt-6-luna pass | mean pass | check score | gain over no tools [95% CI] | mine minus this [95% CI] | tool calls/run | input tok/run | limit rate |
|---|---|---|---|---|---|---|---|---|---|
| no tools | 15.8% | 35.0% | 25.4% | 45.0% | - | - | 0.0 | 799 | 42.9% |
| your server (014fe97) | 77.5% | 67.5% | 72.5% | 84.9% | +0.471 [0.367, 0.571] | - | 3.8 | 25129 | 9.2% |
| your server + instructions | 75.8% | 68.3% | 72.1% | 83.6% | +0.467 [0.367, 0.567] | +0.004 [-0.071, 0.075] | 4.4 | 28089 | 11.7% |
| coolors-mcp 1.1.0 | 21.7% | 37.5% | 29.6% | 48.5% | +0.042 [-0.046, 0.133] | +0.429 [0.329, 0.529] | 3.9 | 14410 | 42.5% |
| mcp-color-convert 0.1.3 | 32.5% | 40.0% | 36.3% | 52.3% | +0.108 [0.029, 0.192] | +0.362 [0.250, 0.475] | 4.9 | 17385 | 35.4% |
| color-theory-mcp 95085b9 | 57.5% | 53.3% | 55.4% | 70.4% | +0.300 [0.192, 0.408] | +0.171 [0.067, 0.271] | 6.5 | 22426 | 23.8% |
| color-engine-mcp 1.0.1 | 45.8% | 49.2% | 47.5% | 58.8% | +0.221 [0.125, 0.317] | +0.250 [0.142, 0.362] | 5.5 | 9653 | 30.0% |
| color-engine-mcp + instructions | 43.3% | 43.3% | 43.3% | 56.4% | +0.179 [0.083, 0.275] | +0.292 [0.179, 0.404] | 5.5 | 10297 | 32.5% |

### By capability group (mean pass over both models)

| condition | Measurement and lookup (301-304, 308) | Simulation, interpolation, harmony (305-307) | Design-system generation (309-310) | Constraint search and audit (311-312) |
|---|---|---|---|---|
| no tools | 23.0% | 18.3% | 25.0% | 42.5% |
| your server (014fe97) | 70.0% | 75.0% | 67.5% | 80.0% |
| your server + instructions | 71.0% | 76.7% | 62.5% | 77.5% |
| coolors-mcp 1.1.0 | 33.0% | 25.0% | 15.0% | 42.5% |
| mcp-color-convert 0.1.3 | 32.0% | 45.0% | 30.0% | 40.0% |
| color-theory-mcp 95085b9 | 59.0% | 60.0% | 32.5% | 62.5% |
| color-engine-mcp 1.0.1 | 55.0% | 35.0% | 27.5% | 67.5% |
| color-engine-mcp + instructions | 56.0% | 35.0% | 12.5% | 55.0% |

### By category (mean pass over both models)

| condition | 301 apca-contrast | 302 delta-e | 303 space-conversion | 304 color-properties | 305 cvd-simulation | 306 interpolation | 307 harmony | 308 naming-and-text-color | 309 tonal-scale | 310 role-tokens | 311 constraint-search | 312 palette-audit |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| no tools | 25.0% | 0.0% | 15.0% | 40.0% | 10.0% | 10.0% | 35.0% | 35.0% | 20.0% | 30.0% | 35.0% | 50.0% |
| your server (014fe97) | 60.0% | 100.0% | 25.0% | 85.0% | 65.0% | 60.0% | 100.0% | 80.0% | 60.0% | 75.0% | 90.0% | 70.0% |
| your server + instructions | 45.0% | 90.0% | 40.0% | 100.0% | 70.0% | 65.0% | 95.0% | 80.0% | 80.0% | 45.0% | 95.0% | 60.0% |
| coolors-mcp 1.1.0 | 5.0% | 65.0% | 35.0% | 25.0% | 45.0% | 5.0% | 25.0% | 35.0% | 25.0% | 5.0% | 30.0% | 55.0% |
| mcp-color-convert 0.1.3 | 5.0% | 0.0% | 30.0% | 90.0% | 10.0% | 55.0% | 70.0% | 35.0% | 10.0% | 50.0% | 35.0% | 45.0% |
| color-theory-mcp 95085b9 | 5.0% | 55.0% | 80.0% | 100.0% | 50.0% | 40.0% | 90.0% | 55.0% | 35.0% | 30.0% | 75.0% | 50.0% |
| color-engine-mcp 1.0.1 | 90.0% | 0.0% | 40.0% | 85.0% | 0.0% | 30.0% | 75.0% | 60.0% | 35.0% | 20.0% | 95.0% | 40.0% |
| color-engine-mcp + instructions | 90.0% | 0.0% | 30.0% | 90.0% | 5.0% | 30.0% | 70.0% | 70.0% | 20.0% | 5.0% | 70.0% | 40.0% |

### By category (mean pass over both models)

| condition | 301 apca-contrast | 302 delta-e | 303 space-conversion | 304 color-properties | 305 cvd-simulation | 306 interpolation | 307 harmony | 308 naming-and-text-color | 309 tonal-scale | 310 role-tokens | 311 constraint-search | 312 palette-audit |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| no tools | 25.0% | 0.0% | 15.0% | 40.0% | 10.0% | 10.0% | 35.0% | 35.0% | 20.0% | 30.0% | 35.0% | 50.0% |
| your server (014fe97) | 60.0% | 100.0% | 25.0% | 85.0% | 65.0% | 60.0% | 100.0% | 80.0% | 60.0% | 75.0% | 90.0% | 70.0% |
| your server + instructions | 45.0% | 90.0% | 40.0% | 100.0% | 70.0% | 65.0% | 95.0% | 80.0% | 80.0% | 45.0% | 95.0% | 60.0% |
| coolors-mcp 1.1.0 | 5.0% | 65.0% | 35.0% | 25.0% | 45.0% | 5.0% | 25.0% | 35.0% | 25.0% | 5.0% | 30.0% | 55.0% |
| mcp-color-convert 0.1.3 | 5.0% | 0.0% | 30.0% | 90.0% | 10.0% | 55.0% | 70.0% | 35.0% | 10.0% | 50.0% | 35.0% | 45.0% |
| color-theory-mcp 95085b9 | 5.0% | 55.0% | 80.0% | 100.0% | 50.0% | 40.0% | 90.0% | 55.0% | 35.0% | 30.0% | 75.0% | 50.0% |
| color-engine-mcp 1.0.1 | 90.0% | 0.0% | 40.0% | 85.0% | 0.0% | 30.0% | 75.0% | 60.0% | 35.0% | 20.0% | 95.0% | 40.0% |
| color-engine-mcp + instructions | 90.0% | 0.0% | 30.0% | 90.0% | 5.0% | 30.0% | 70.0% | 70.0% | 20.0% | 5.0% | 70.0% | 40.0% |

### Per model: gain over no tools [95% CI]

| condition | haiku-5-5 | gpt-6-luna |
|---|---|---|
| your server (014fe97) | +0.617 [0.483, 0.742] | +0.325 [0.192, 0.458] |
| your server + instructions | +0.600 [0.483, 0.708] | +0.333 [0.192, 0.475] |
| coolors-mcp 1.1.0 | +0.058 [-0.008, 0.133] | +0.025 [-0.108, 0.167] |
| mcp-color-convert 0.1.3 | +0.167 [0.083, 0.258] | +0.050 [-0.058, 0.167] |
| color-theory-mcp 95085b9 | +0.417 [0.300, 0.533] | +0.183 [0.025, 0.333] |
| color-engine-mcp 1.0.1 | +0.300 [0.183, 0.417] | +0.142 [0.033, 0.250] |
| color-engine-mcp + instructions | +0.275 [0.175, 0.375] | +0.083 [-0.042, 0.200] |

All 16 condition-model combinations have 120 of 120 cells.

## v1 rerun (frozen tasks, informed by this suite's failures)

| condition | haiku-5-5 pass | gpt-6-luna pass | mean pass | check score | gain over no tools [95% CI] | mine minus this [95% CI] | tool calls/run | input tok/run | limit rate |
|---|---|---|---|---|---|---|---|---|---|
| no tools | 19.2% | 42.5% | 30.8% | 47.3% | - | - | 0.0 | 733 | 39.6% |
| your server, before fix (86a9b68) | 71.7% | 65.0% | 68.3% | 80.5% | +0.375 [0.271, 0.475] | +0.096 [0.029, 0.167] | 2.6 | 18674 | 13.3% |
| your server, fixed (014fe97) | 75.0% | 80.8% | 77.9% | 86.1% | +0.471 [0.375, 0.563] | - | 3.0 | 20480 | 10.4% |
| your server, before fix + instructions | 75.0% | 74.2% | 74.6% | 82.9% | +0.438 [0.338, 0.533] | +0.033 [-0.025, 0.100] | 3.5 | 23629 | 13.3% |
| your server, fixed + instructions | 78.3% | 78.3% | 78.3% | 86.7% | +0.475 [0.371, 0.571] | -0.004 [-0.050, 0.042] | 3.6 | 24522 | 9.6% |
| coolors-mcp 1.1.0 | 27.5% | 43.3% | 35.4% | 51.2% | +0.046 [-0.046, 0.142] | +0.425 [0.325, 0.529] | 3.5 | 12014 | 37.5% |
| mcp-color-convert 0.1.3 | 35.0% | 45.0% | 40.0% | 55.9% | +0.092 [0.017, 0.171] | +0.379 [0.283, 0.475] | 5.1 | 17440 | 31.7% |
| color-theory-mcp 95085b9 | 55.8% | 70.8% | 63.3% | 73.5% | +0.325 [0.225, 0.421] | +0.146 [0.063, 0.229] | 5.4 | 19643 | 21.7% |
| color-engine-mcp 1.0.1 | 48.3% | 55.8% | 52.1% | 63.7% | +0.212 [0.125, 0.304] | +0.258 [0.163, 0.362] | 4.9 | 8640 | 27.5% |
| color-engine-mcp + instructions | 43.3% | 51.7% | 47.5% | 62.1% | +0.167 [0.071, 0.263] | +0.304 [0.212, 0.400] | 5.2 | 9668 | 27.9% |

Before the fix 68.3%, after 77.9% (paired +0.096 [0.029, 0.167]). Read this as a before/after, not as a result for your server.

## Two defects in my own fix, found while reading the v2 transcripts

**Status: fixed after the measurement and re-measured.** v2 rerun at `56fc00a`: 76.7% (+0.042 over 72.5%, not established); clean judge on new tasks (neutral v3): `neutral-v3-final-2026-11-12.md`. The numbers on this page come from the server at `014fe97`, which still had both defects. The follow-up commit keeps CSS `lab`/`lch` (D50) and `rec2020` (2.4 gamma) as they are, describes them correctly, and adds `lab-d65`, `lch-d65`, `rec2020-oetf` (BT.2020 transfer) and `rec2020-linear` as formats and as input notations. The clean re-measurement used a new fresh suite (v3), because v2 had informed the fix.

1. **`lab` and `lch` output is D50 (CSS Color 4), not D65.** `colors_convert` gives `lab(43.342 66.305 37.52)` for `#c8102e`; the engine's own ΔE and the tasks use D65 (`lab(42.538 65.893 35.714)`). The description I wrote for `colors_convert` says "lch (CIELAB, D65)", which is wrong. Tasks that say "D65, no adaptation" therefore get misleading numbers when the model trusts the tool.
2. **`rec2020` output uses a pure 2.4 power curve, not the BT.2020 transfer function.** For `#ff5a1f` it gives 0.8419; BT.2020 gives 0.8136. The description I wrote says "BT.2020 with its transfer curve", which is wrong. My unit test pinned the 2.4-gamma numbers, so it agreed with the bug.

They explain most of the weakness in 302 delta-e transfer and 303 space-conversion (303 is 25% on v2). Both lower the measured result for your server, so the headline is conservative.

## Other weak spots on v2

- 303 space-conversion 25%: the two defects above, plus haiku-5-5 often produces no tool call and runs out of output tokens when it computes by hand.
- 301 apca-contrast 60%, 309 tonal-scale 60%, 312 palette-audit 70%.
- Instructions made no difference on v2 (72.1% vs 72.5%); they helped slightly on v1.

## Caveats

- Category list chosen by me after seeing the tools' feature lists; 8 of 12 domains favour primitive-style servers, 4 favour yours.
- Two small hosted models, 2 trials, 5 tasks per category; category figures are descriptive only.
- Client profile: tool-result text only. Only your server and color-engine-mcp ship instructions, so only they got an instructions run.
- The v2 authors' and reviewer's session context included the repository's recent commit messages, which name the new capabilities (signed APCA, xyz/linear/Rec.2020/HSV, CIE76/CIE94). All of these were already required by the v1 specs they were given; the authors report that they ignored the messages and nothing in the tasks was designed around them. Treat as a possible, unquantified leak.
- v2 deliberately reuses v1's domains, grader kinds and several task templates with new inputs (the reviewer listed 7 near-template pairs). A model that had seen v1 would know the task shapes.
- Rate limits and upstream outages: 143 cells in the v2 matrix and 18 in the v1 rerun failed with provider errors (rate limit or upstream outage); they were deleted and rerun until every combination reached 120/120, so no infra-failed cell appears in any result. 429 waits slowed the run but lost nothing.
- Known grader leniency (reviewer): p302-2, p306-5 and p308-1 accept a D50 answer within tolerance; p311-1/2 accept a simple constant-chroma shift.

## Reproduce

```
~/.config/local-inference/start
cd evals
python3 scripts/bench-suite.py --suite neutral2 --prefix n2 --mine-ref 014fe97   --conds mine,mine-instr,coolors-mcp,mcp-color-convert,color-theory-mcp,color-engine-mcp,color-engine-mcp-instr --jobs 3
node scripts/clear-infra.mjs        # rerun the scheduler while it clears anything
npx tsx scripts/bench-neutral-compare.ts v2
npx tsx scripts/bench-neutral-compare.ts v1
~/.config/local-inference/stop
```
