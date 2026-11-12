# Neutral benchmark, third version: clean measurement of the fixed server (2026-11-12)

Server under test: this repo at `56fc00a` (tag v2.1.0, the release with the `lab-d65`/BT.2020 fixes). Earlier reports: `neutral-suite-comparison-2026-11-10.md` (v1), `neutral-v2-final-2026-11-12.md` (v2).

## Headline

On 60 tasks written after the last server change and frozen before any server ran on them (neutral v3), your server passes 62.5% (mean over haiku-5-5 and gpt-6-luna), against 15.8% with no tools. The nearest competitor, color-theory-mcp, passes 45.8%. The paired difference is +0.167 [0.071, 0.271]; the interval excludes zero. The lead over the other three servers is larger (+0.26 to +0.43).

v3 is a harder suite than v2: every condition scored lower, including no tools (15.8% vs 25.4%). So compare ranks and paired differences, not the absolute 62.5% against v2's 76.7%. The lead over color-theory-mcp is the same on both suites (+0.171 on v2 for the pre-fix server, +0.167 on v3).

Order on v3: your server (62.5%), color-theory-mcp (45.8%), color-engine-mcp (36.3%), mcp-color-convert (23.3%), coolors-mcp (19.2%). Only coolors-mcp and mcp-color-convert are statistically indistinguishable from no tools.

## Why this measurement is clean

The server changed twice after reading failed transcripts (014fe97, then 56fc00a), and v1 and v2 were both written before the second change and v1 before both. A suite that has informed a fix cannot judge it. So v3 was built the same way as v2: three new blind authors in an isolated sandbox with no server code, standards named in every prompt, graders that accept any correct implementation, an independent red-team solver with only `colorjs.io`, a freshness test against v1 and v2, and a frozen manifest (hash `3a82735dce5a0762e3b2a53ab912828dbf7e2b9985c1af727f0fc0482fedce44`, commit `a2f2b12`) before any server ran. Nothing was tuned on v3, and the failure listing below was read after the run only to describe it.

## v3 results (clean judge)

### Overall (60 tasks x 2 trials x 2 models)

| condition | haiku-5-5 pass | gpt-6-luna pass | mean pass | check score | gain over no tools [95% CI] | mine minus this [95% CI] | tool calls/run | input tok/run | limit rate |
|---|---|---|---|---|---|---|---|---|---|
| no tools | 6.7% | 25.0% | 15.8% | 39.3% | - | - | 0.0 | 849 | 46.7% |
| your server (56fc00a) | 61.7% | 63.3% | 62.5% | 74.3% | +0.467 [0.362, 0.567] | - | 4.0 | 27170 | 20.0% |
| your server + instructions | 66.7% | 63.3% | 65.0% | 75.7% | +0.492 [0.392, 0.592] | -0.025 [-0.083, 0.033] | 4.5 | 28738 | 20.0% |
| coolors-mcp 1.1.0 | 12.5% | 25.8% | 19.2% | 40.8% | +0.033 [-0.033, 0.100] | +0.433 [0.321, 0.542] | 4.0 | 13576 | 46.7% |
| mcp-color-convert 0.1.3 | 22.5% | 24.2% | 23.3% | 42.7% | +0.075 [-0.004, 0.158] | +0.392 [0.287, 0.496] | 5.5 | 17476 | 44.2% |
| color-theory-mcp 95085b9 | 44.2% | 47.5% | 45.8% | 62.4% | +0.300 [0.208, 0.396] | +0.167 [0.071, 0.271] | 6.8 | 23480 | 32.9% |
| color-engine-mcp 1.0.1 | 33.3% | 39.2% | 36.3% | 50.9% | +0.204 [0.104, 0.308] | +0.263 [0.146, 0.375] | 6.4 | 10385 | 38.3% |
| color-engine-mcp + instructions | 29.2% | 34.2% | 31.7% | 50.1% | +0.158 [0.063, 0.263] | +0.308 [0.196, 0.417] | 5.8 | 10239 | 39.2% |

### v3: By capability group (mean pass over both models)

| condition | Measurement and lookup (301-304, 308) | Simulation, interpolation, harmony (305-307) | Design-system generation (309-310) | Constraint search and audit (311-312) |
|---|---|---|---|---|
| no tools | 13.0% | 15.0% | 15.0% | 25.0% |
| your server (56fc00a) | 60.0% | 71.7% | 45.0% | 72.5% |
| your server + instructions | 61.0% | 85.0% | 42.5% | 67.5% |
| coolors-mcp 1.1.0 | 15.0% | 30.0% | 7.5% | 25.0% |
| mcp-color-convert 0.1.3 | 19.0% | 43.3% | 2.5% | 25.0% |
| color-theory-mcp 95085b9 | 33.0% | 70.0% | 30.0% | 57.5% |
| color-engine-mcp 1.0.1 | 37.0% | 41.7% | 15.0% | 47.5% |
| color-engine-mcp + instructions | 34.0% | 36.7% | 10.0% | 40.0% |

### v3: By category (mean pass over both models)

| condition | 301 apca-contrast | 302 delta-e | 303 space-conversion | 304 color-properties | 305 cvd-simulation | 306 interpolation | 307 harmony | 308 naming-and-text-color | 309 tonal-scale | 310 role-tokens | 311 constraint-search | 312 palette-audit |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| no tools | 5.0% | 5.0% | 5.0% | 0.0% | 20.0% | 10.0% | 15.0% | 50.0% | 5.0% | 25.0% | 25.0% | 25.0% |
| your server (56fc00a) | 40.0% | 40.0% | 75.0% | 65.0% | 75.0% | 60.0% | 80.0% | 80.0% | 60.0% | 30.0% | 75.0% | 70.0% |
| your server + instructions | 45.0% | 45.0% | 70.0% | 80.0% | 90.0% | 70.0% | 95.0% | 65.0% | 60.0% | 25.0% | 70.0% | 65.0% |
| coolors-mcp 1.1.0 | 10.0% | 15.0% | 5.0% | 0.0% | 60.0% | 10.0% | 20.0% | 45.0% | 10.0% | 5.0% | 15.0% | 35.0% |
| mcp-color-convert 0.1.3 | 15.0% | 10.0% | 0.0% | 30.0% | 10.0% | 45.0% | 75.0% | 40.0% | 5.0% | 0.0% | 30.0% | 20.0% |
| color-theory-mcp 95085b9 | 0.0% | 5.0% | 50.0% | 55.0% | 50.0% | 75.0% | 85.0% | 55.0% | 45.0% | 15.0% | 65.0% | 50.0% |
| color-engine-mcp 1.0.1 | 70.0% | 10.0% | 5.0% | 35.0% | 10.0% | 50.0% | 65.0% | 65.0% | 20.0% | 10.0% | 70.0% | 25.0% |
| color-engine-mcp + instructions | 75.0% | 5.0% | 10.0% | 25.0% | 10.0% | 40.0% | 60.0% | 55.0% | 20.0% | 0.0% | 65.0% | 15.0% |

### v3: Per model: gain over no tools [95% CI]

| condition | haiku-5-5 | gpt-6-luna |
|---|---|---|
| your server (56fc00a) | +0.550 [0.433, 0.658] | +0.383 [0.250, 0.517] |
| your server + instructions | +0.600 [0.483, 0.708] | +0.383 [0.242, 0.525] |
| coolors-mcp 1.1.0 | +0.058 [-0.008, 0.133] | +0.008 [-0.100, 0.117] |
| mcp-color-convert 0.1.3 | +0.158 [0.058, 0.258] | -0.008 [-0.117, 0.100] |
| color-theory-mcp 95085b9 | +0.375 [0.267, 0.483] | +0.225 [0.092, 0.358] |
| color-engine-mcp 1.0.1 | +0.267 [0.158, 0.383] | +0.142 [0.017, 0.267] |
| color-engine-mcp + instructions | +0.225 [0.125, 0.333] | +0.092 [-0.042, 0.225] |

### v3: Cells and exclusions

- haiku-5-5 / no tools: 120/120 cells done
- haiku-5-5 / your server (56fc00a): 120/120 cells done
- haiku-5-5 / your server + instructions: 120/120 cells done
- haiku-5-5 / coolors-mcp 1.1.0: 120/120 cells done
- haiku-5-5 / mcp-color-convert 0.1.3: 120/120 cells done
- haiku-5-5 / color-theory-mcp 95085b9: 120/120 cells done
- haiku-5-5 / color-engine-mcp 1.0.1: 120/120 cells done
- haiku-5-5 / color-engine-mcp + instructions: 120/120 cells done
- gpt-6-luna / no tools: 120/120 cells done
- gpt-6-luna / your server (56fc00a): 120/120 cells done
- gpt-6-luna / your server + instructions: 120/120 cells done
- gpt-6-luna / coolors-mcp 1.1.0: 120/120 cells done
- gpt-6-luna / mcp-color-convert 0.1.3: 120/120 cells done
- gpt-6-luna / color-theory-mcp 95085b9: 120/120 cells done
- gpt-6-luna / color-engine-mcp 1.0.1: 120/120 cells done
- gpt-6-luna / color-engine-mcp + instructions: 120/120 cells done

## v2 rerun with the same server build (context, not a judge)

v2 was rerun for your server only, at `56fc00a`. v2's failures informed the lab-d65/BT.2020 fixes, so this is a before/after, not a judge.

| condition | haiku-5-5 pass | gpt-6-luna pass | mean pass | gain over no tools [95% CI] | paired difference vs 014fe97 |
|---|---|---|---|---|---|
| your server, 014fe97 | 77.5% | 67.5% | 72.5% | +0.471 [0.367, 0.571] | - |
| your server, 56fc00a | 78.3% | 75.0% | 76.7% | +0.512 [0.417, 0.604] | +0.042 [-0.042, 0.129], not established |
| 56fc00a + instructions | 83.3% | 77.5% | 80.4% | +0.550 [0.458, 0.642] | +0.079 [0.000, 0.163] |

The two description defects found earlier (lab shown as D65 but D50; rec2020 shown as BT.2020 but 2.4 gamma) were corrected in the tool text and explicit D65/BT.2020 formats were added. The change on v2 is positive but within noise.

## Where your server is weak on v3

Read after the run, not used to tune.

- By category (mean of both models): 301 apca-contrast 40%, 302 delta-e 40%, 310 role-tokens 30%. color-engine-mcp is better than your server on 301 (70% vs 40%).
- A large share of the haiku-5-5 failures are `limit_exhausted`: the run ended with no final answer (often after 0 to 1 tool calls on 301/302, or a long find/check loop on 310). Your server's limit rate is 20.0% on v3 against 11.7% on v2 (no tools: 46.7%).
- gpt-6-luna on 302 often did the arithmetic itself with `colors_convert` instead of calling `colors_compare`, and its values were off; on 301 some APCA Lc values were wrong or unsigned-looking. On 310 it was a near miss (80 to 97% of the checks pass) rather than a total failure.
- What to look at next if you improve the server: how the model is steered to `colors_compare`/`colors_check` for ΔE and APCA, and the step count of the role-token search loop. I did not change anything.
- Instructions made no measurable difference on v3 (65.0% vs 62.5%, -0.025 [-0.083, 0.033]).

## Caveats

- The 12 categories were chosen by me after seeing the compared servers' feature lists; 8 of 12 favour primitive-style servers, 4 favour yours.
- Two small hosted models, 2 trials, 5 tasks per category; category figures are descriptive only.
- Client profile: tool-result text only. Only your server and color-engine-mcp ship instructions, so only they got an instructions run.
- The v3 authors' and reviewer's session context included the repository's recent commit messages (which name the new capabilities, including lab-d65 and BT.2020). They were told to ignore them, and the v1 and v2 specs already required those capabilities, but a possible, unquantified leak remains. A sandbox that hides the repo history entirely would remove it.
- v3 reuses v1/v2 domains, grader kinds and several task templates with new inputs. v3 includes four new grader kinds and reference code (CIE94 params, CMC, xyY, u'v', McCamy, BT.2020 narrow-range codes).
- 53 cells in v3 failed with provider errors (rate limit or upstream outage). They were deleted and rerun in one extra round, then none were left; every combination has 120 of 120 cells and no result is a provider error.
- The independent reviewer found no blockers; its non-blocking notes on individual tasks are in the authoring sandbox (`neutral-authoring-v3/evals/review3/`), which is outside the repo and is lost when this machine is deleted.
- A fixed-ref scheduler ran everything against the pinned `56fc00a` snapshot, so the server under test equals the npm 2.1.0 code (README text aside).

## Reproduce

```
~/.config/local-inference/start
cd evals
python3 scripts/bench-suite.py --suite neutral3 --prefix n3 --mine-ref 56fc00a --conds mine,mine-instr,coolors-mcp,mcp-color-convert,color-theory-mcp,color-engine-mcp,color-engine-mcp-instr --jobs 3
node scripts/clear-infra.mjs        # rerun the scheduler while it clears anything
npx tsx scripts/bench-neutral-compare.ts v3
~/.config/local-inference/stop
```
