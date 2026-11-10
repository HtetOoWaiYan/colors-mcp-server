# Your server vs third-party color MCP servers on a neutral suite

Run 2026-11-09 to 2026-11-10. This supersedes `third-party-servers-2026-11-09.md` for the question "is your server better", because that report used suites written alongside (v1), tuned against (generalization) or adjacent to (fresh) your tools.

## How the suite was made (so you can judge its fairness)

- **Categories:** 12 capability domains, chosen by me from the union of what every compared server advertises (APCA, color difference, space conversion, color properties, color-blindness simulation, interpolation, harmony, naming and text color, tonal scales, role tokens, constraint search, palette audit). I had seen the tool lists when choosing them, so this step is not blind. 8 of the 12 domains are measurement, simulation or lookup ones where the primitive-style servers are built to be strong; 4 are generation and search ones where yours is.
- **Tasks and graders:** 60 tasks (5 per category) written by three Opus authors working in an isolated copy of the harness that had no server code, no tool lists and no results. Prompts name standards (WCAG 2, APCA-W3 0.0.98G-4g, CSS Color 4, Machado 2009, CIEDE2000), never tools. Graders check the stated standard with justified tolerances and accept any correct implementation.
- **Review:** an independent Opus reviewer solved all 60 tasks using only `colorjs.io` and its own code (not the authors' references or witnesses), probed alternative implementations and lazy answers, and read every prompt. No blockers; 60/60 solved; no lazy answer passes a task. Its should-fix findings were applied (full APCA constants in the prompts, misleading n309 chroma wording and unfailable checks, an n311-3 that a well-known green passed, near-duplicate n310 tasks, wording that promised things the grader does not check) and the reviewer re-solved the changed tasks.
- **Freeze:** suite neutral v1, manifest hash `065aea47...`, committed (78eae7f) before any server ran on it. Nothing was tuned afterwards. Dev-only suite, so every task and category is visible.
- **Run:** `haiku-5-5` and `gpt-6-luna`, harness defaults, 2 trials, TNI client (tool-result text only), plus an "instructions" profile for the two servers that ship server instructions (yours and color-engine-mcp). Limits identical for every condition (12 turns, 20 tool calls, 4096 output tokens per turn, 180 s). All 16 condition-and-model combinations have 120/120 finished cells.
- **Data repair:** 237 `gpt-6-luna` cells failed with upstream 503 (the Codex provider was unhealthy for a stretch). They are infrastructure failures, not results; I cleared them and re-ran them, in two rounds, until every cell finished. The harness would otherwise have dropped those trials.

### Overall (60 tasks x 2 trials x 2 models)

| condition | haiku-5-5 pass | gpt-6-luna pass | mean pass | check score | gain over no tools [95% CI] | mine minus this [95% CI] | tool calls/run | input tok/run | limit rate |
|---|---|---|---|---|---|---|---|---|---|
| no tools | 19.2% | 42.5% | 30.8% | 47.3% | - | - | 0.0 | 733 | 39.6% |
| your server (v2.0.0) | 71.7% | 65.0% | 68.3% | 80.5% | +0.375 [0.271, 0.475] | - | 2.6 | 18674 | 13.3% |
| your server + instructions | 75.0% | 74.2% | 74.6% | 82.9% | +0.438 [0.338, 0.533] | -0.063 [-0.121, 0.000] | 3.5 | 23629 | 13.3% |
| coolors-mcp 1.1.0 | 27.5% | 43.3% | 35.4% | 51.2% | +0.046 [-0.046, 0.142] | +0.329 [0.225, 0.433] | 3.5 | 12014 | 37.5% |
| mcp-color-convert 0.1.3 | 35.0% | 45.0% | 40.0% | 55.9% | +0.092 [0.017, 0.171] | +0.283 [0.175, 0.392] | 5.1 | 17440 | 31.7% |
| color-theory-mcp 95085b9 | 55.8% | 70.8% | 63.3% | 73.5% | +0.325 [0.225, 0.421] | +0.050 [-0.042, 0.146] | 5.4 | 19643 | 21.7% |
| color-engine-mcp 1.0.1 | 48.3% | 55.8% | 52.1% | 63.7% | +0.212 [0.125, 0.304] | +0.163 [0.050, 0.275] | 4.9 | 8640 | 27.5% |
| color-engine-mcp + instructions | 43.3% | 51.7% | 47.5% | 62.1% | +0.167 [0.071, 0.263] | +0.208 [0.096, 0.321] | 5.2 | 9668 | 27.9% |

### By capability group (mean pass over both models)

| condition | Measurement and lookup (301-304, 308) | Simulation, interpolation, harmony (305-307) | Design-system generation (309-310) | Constraint search and audit (311-312) |
|---|---|---|---|---|
| no tools | 31.0% | 28.3% | 22.5% | 42.5% |
| your server (v2.0.0) | 59.0% | 73.3% | 72.5% | 80.0% |
| your server + instructions | 63.0% | 83.3% | 77.5% | 87.5% |
| coolors-mcp 1.1.0 | 41.0% | 43.3% | 17.5% | 27.5% |
| mcp-color-convert 0.1.3 | 43.0% | 50.0% | 17.5% | 40.0% |
| color-theory-mcp 95085b9 | 68.0% | 65.0% | 45.0% | 67.5% |
| color-engine-mcp 1.0.1 | 52.0% | 51.7% | 37.5% | 67.5% |
| color-engine-mcp + instructions | 50.0% | 50.0% | 35.0% | 50.0% |

### By category (mean pass over both models)

| condition | 301 apca-contrast | 302 delta-e | 303 space-conversion | 304 color-properties | 305 cvd-simulation | 306 interpolation | 307 harmony | 308 naming-and-text-color | 309 tonal-scale | 310 role-tokens | 311 constraint-search | 312 palette-audit |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| no tools | 25.0% | 5.0% | 35.0% | 50.0% | 10.0% | 20.0% | 55.0% | 40.0% | 20.0% | 25.0% | 35.0% | 50.0% |
| your server (v2.0.0) | 10.0% | 75.0% | 40.0% | 95.0% | 75.0% | 55.0% | 90.0% | 75.0% | 95.0% | 50.0% | 85.0% | 75.0% |
| your server + instructions | 25.0% | 80.0% | 35.0% | 90.0% | 70.0% | 80.0% | 100.0% | 85.0% | 95.0% | 60.0% | 90.0% | 85.0% |
| coolors-mcp 1.1.0 | 15.0% | 70.0% | 25.0% | 25.0% | 60.0% | 10.0% | 60.0% | 70.0% | 15.0% | 20.0% | 15.0% | 40.0% |
| mcp-color-convert 0.1.3 | 30.0% | 0.0% | 30.0% | 95.0% | 10.0% | 45.0% | 95.0% | 60.0% | 10.0% | 25.0% | 35.0% | 45.0% |
| color-theory-mcp 95085b9 | 10.0% | 90.0% | 80.0% | 85.0% | 55.0% | 45.0% | 95.0% | 75.0% | 40.0% | 50.0% | 70.0% | 65.0% |
| color-engine-mcp 1.0.1 | 60.0% | 0.0% | 25.0% | 95.0% | 10.0% | 50.0% | 95.0% | 80.0% | 65.0% | 10.0% | 90.0% | 45.0% |
| color-engine-mcp + instructions | 60.0% | 0.0% | 30.0% | 80.0% | 5.0% | 50.0% | 95.0% | 80.0% | 60.0% | 10.0% | 75.0% | 25.0% |

### Per model: gain over no tools [95% CI]

| condition | haiku-5-5 | gpt-6-luna |
|---|---|---|
| your server (v2.0.0) | +0.525 [0.408, 0.642] | +0.225 [0.083, 0.367] |
| your server + instructions | +0.558 [0.433, 0.675] | +0.317 [0.183, 0.442] |
| coolors-mcp 1.1.0 | +0.083 [0.008, 0.167] | +0.008 [-0.133, 0.150] |
| mcp-color-convert 0.1.3 | +0.158 [0.058, 0.258] | +0.025 [-0.083, 0.133] |
| color-theory-mcp 95085b9 | +0.367 [0.250, 0.483] | +0.283 [0.142, 0.417] |
| color-engine-mcp 1.0.1 | +0.292 [0.183, 0.400] | +0.133 [0.025, 0.242] |
| color-engine-mcp + instructions | +0.242 [0.125, 0.358] | +0.092 [-0.033, 0.208] |

### Cells and exclusions

- haiku-5-5 / no tools: 120/120 cells done
- haiku-5-5 / your server (v2.0.0): 120/120 cells done
- haiku-5-5 / your server + instructions: 120/120 cells done
- haiku-5-5 / coolors-mcp 1.1.0: 120/120 cells done
- haiku-5-5 / mcp-color-convert 0.1.3: 120/120 cells done
- haiku-5-5 / color-theory-mcp 95085b9: 120/120 cells done
- haiku-5-5 / color-engine-mcp 1.0.1: 120/120 cells done
- haiku-5-5 / color-engine-mcp + instructions: 120/120 cells done
- gpt-6-luna / no tools: 120/120 cells done
- gpt-6-luna / your server (v2.0.0): 120/120 cells done
- gpt-6-luna / your server + instructions: 120/120 cells done
- gpt-6-luna / coolors-mcp 1.1.0: 120/120 cells done
- gpt-6-luna / mcp-color-convert 0.1.3: 120/120 cells done
- gpt-6-luna / color-theory-mcp 95085b9: 120/120 cells done
- gpt-6-luna / color-engine-mcp 1.0.1: 120/120 cells done
- gpt-6-luna / color-engine-mcp + instructions: 120/120 cells done

## Reading it

- **Your server is first overall but the lead over the best competitor is not established.** 68.3% (74.6% with its instructions on) against 63.3% for color-theory-mcp; the paired gap to color-theory-mcp is +0.050 [-0.042, 0.146]. By model: on haiku-5-5 yours is ahead by 0.158 [0.058, 0.267] (0.192 [0.092, 0.292] with instructions); on gpt-6-luna color-theory-mcp is slightly ahead (-0.058 [-0.175, 0.067]; +0.033 [-0.083, 0.150] with instructions). Both are within noise on gpt-6-luna.
- **Your server clearly beats the other three:** coolors-mcp +0.329 [0.225, 0.433], mcp-color-convert +0.283 [0.175, 0.392], color-engine-mcp +0.163 [0.050, 0.275]. coolors-mcp (+0.046 [-0.046, 0.142] over no tools) and mcp-color-convert (+0.092 [0.017, 0.171]) barely move the needle on this suite either.
- **The earlier margins shrank a lot.** On the earlier suites the gap to color-theory-mcp was about +0.2 to +0.3; here it is +0.05. That is the size of the advantage the earlier suites' proximity to your tools was buying.
- **Where yours leads:** design-system generation (72.5% vs 45.0% for color-theory-mcp) and constraint search / audit (80.0% vs 67.5%), and CVD simulation, tonal scales and harmony. It also lowers the rate of runs that exhaust their limits (13% vs 22-38% for the others, 40% with no tools).
- **Where yours trails:** APCA contrast (n301: 10%, below the 25% of no tools; color-engine-mcp 60%), space conversion (n303: 40% vs color-theory-mcp 80%), and color difference (n302: 75% vs color-theory-mcp 90%). Measurement and lookup overall: 59.0% vs 68.0% for color-theory-mcp.
- **Why APCA fails (checked in code and transcripts):** `colors_check` returns APCA as an unsigned magnitude (`Math.abs(apcaContrast(...))` in `src/tools/check.ts`) while the tasks ask for the signed Lc, and haiku-5-5 made no tool call at all on any of the 10 n301 runs. I did not look at why n303 is weak.
- **Instructions help yours (+6.3 points, gap [-0.121, 0.000]) and did not help color-engine-mcp** (47.5% vs 52.1% without).

## Caveats

- 2 models, 2 trials, 60 tasks; the paired intervals are task-clustered bootstrap (10,000 resamples). Categories are 5 tasks each, descriptive only.
- The category list is mine and was made after seeing every server's tools. Group weights favour primitive-style servers (8 of 12 domains), which is deliberate, but the choice of the 12 domains is a judgement.
- Authors and reviewer worked in a sandbox without server code, but their session context carried the repository name and a commit message mentioning third-party color MCP servers. No tool names or results reached them.
- TNI profile only for everything except the two instructions runs. Servers that rely on `structuredContent` are not credited for it.
- Tasks require the model to choose to use the tools: haiku-5-5 skipped tools often with coolors-mcp and on your APCA tasks, which counts against the server's steering, not the model.
- Only two models; both are small. Nothing here says anything about frontier models or other clients.
- Reproduce: `python3 scripts/bench-neutral.py` (start the proxy first; re-run after `node scripts/clear-infra.mjs` until nothing is cleared), then `npx tsx scripts/bench-neutral-compare.ts`.
