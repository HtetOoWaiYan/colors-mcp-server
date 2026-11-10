# Your server vs third-party color MCP servers

> **Superseded for fairness:** see `neutral-suite-comparison-2026-11-10.md`. The suites used below were written alongside or tuned against your tools; on a neutral suite the lead over the best competitor is much smaller.

Run on 2026-11-09 with the existing eval harness, `haiku-5-5` and `gpt-6-luna` through the local inference proxy, harness-default generation settings, 2 trials per task, TNI client profile (only tool-result text reaches the model, no server instructions). The same no-tools cells serve as the baseline for every server (`--reuse-from`).

Servers: this repo at `main` (86a9b68, v2.0.0), and three third-party servers picked because they cover more than yours on paper, pinned in `external-servers.json`:

| server | source | tools |
|---|---|---|
| coolors-mcp | npm `@trishchuk/coolors-mcp` 1.1.0 | 25 (CIEDE2000, WCAG + APCA, colour-blindness simulation, HCT / Material 3, gradients, palettes) |
| mcp-color-convert | npm `mcp-color-convert` 0.1.3 | 20 (colorizr: OKLCH/OKLab conversion, adjust, harmonies, WCAG contrast) |
| color-theory-mcp | git JoshuaRamirez/color-theory-mcp @ 95085b9, built with tsc | 27 (many colour spaces, WCAG + APCA, delta-E, gamut, CVD, harmonies, themes) |

Not run, because narrower than yours: color-engine-mcp (6 tools), @colorsandfonts/mcp (6), hueshift-mcp (8), ohqay/color-tools (8), contrast-only servers. color-engine-mcp ships server instructions, which the TNI profile would ignore.

Third-party servers were installed with install scripts disabled and started with only PATH, LANG and a private HOME. Their packages contain no network or process-spawning code (grep over the shipped JS), and I did not audit them beyond that.

### Suite v1 (dev split, 42 tasks x 2 trials per model)

| condition | haiku-5-5 pass | gpt-6-luna pass | mean pass | paired diff vs no-tools, pooled [95% CI] | tool calls/run | input tok/run |
|---|---|---|---|---|---|---|
| no tools | 42.9% | 54.8% | 48.8% | - | 0 | 506 |
| your server (main, v2.0.0) | 92.9% | 100.0% | 96.4% | +0.476 [0.357, 0.595] | 2.1 | 16272 |
| coolors-mcp 1.1.0 (25 tools) | 52.4% | 51.2% | 51.8% | +0.030 [-0.065, 0.131] | 3.4 | 15152 |
| mcp-color-convert 0.1.3 (20 tools) | 64.3% | 51.2% | 57.7% | +0.089 [0.000, 0.179] | 5.2 | 21900 |
| color-theory-mcp 95085b9 (27 tools) | 76.2% | 56.0% | 66.1% | +0.173 [0.060, 0.286] | 5.0 | 19401 |

### Generalization suite (dev only, 28 tasks)

| condition | haiku-5-5 pass | gpt-6-luna pass | mean pass | paired diff vs no-tools, pooled [95% CI] | tool calls/run | input tok/run |
|---|---|---|---|---|---|---|
| no tools | 60.7% | 46.4% | 53.6% | - | 0 | 548 |
| your server (main, v2.0.0) | 98.2% | 76.8% | 87.5% | +0.339 [0.188, 0.500] | 1.8 | 15324 |
| coolors-mcp 1.1.0 (25 tools) | 58.9% | 48.2% | 53.6% | +0.000 [-0.071, 0.080] | 2.3 | 12815 |
| mcp-color-convert 0.1.3 (20 tools) | 66.1% | 57.1% | 61.6% | +0.071 [-0.036, 0.179] | 5.9 | 22793 |
| color-theory-mcp 95085b9 (27 tools) | 85.7% | 62.5% | 74.1% | +0.205 [0.080, 0.339] | 5.5 | 25193 |

### Fresh suite (sealed, 32 tasks, aggregates only)

| condition | haiku-5-5 pass | gpt-6-luna pass | mean pass | paired diff vs no-tools, pooled [95% CI] | tool calls/run | input tok/run |
|---|---|---|---|---|---|---|
| no tools | 53.1% | 53.1% | 53.1% | - | 0 | 567 |
| your server (main, v2.0.0) | 95.3% | 84.4% | 89.8% | +0.367 [0.227, 0.516] | 1.9 | 16985 |
| coolors-mcp 1.1.0 (25 tools) | 51.6% | 42.2% | 46.9% | -0.063 [-0.133, 0.000] | 3.1 | 14063 |
| mcp-color-convert 0.1.3 (20 tools) | 62.5% | 67.2% | 64.8% | +0.117 [0.016, 0.234] | 6.2 | 23599 |
| color-theory-mcp 95085b9 (27 tools) | 71.9% | 53.1% | 62.5% | +0.094 [-0.008, 0.203] | 6.0 | 25312 |

### Suite v1 held-out split (14 tasks, aggregate only)

| condition | haiku-5-5 pass | gpt-6-luna pass | mean pass |
|---|---|---|---|
| no tools | 39.3% | 50.0% | 44.6% |
| your server (main, v2.0.0) | 100.0% | 96.4% | 98.2% |
| coolors-mcp 1.1.0 (25 tools) | 50.0% | 50.0% | 50.0% |
| mcp-color-convert 0.1.3 (20 tools) | 67.9% | 57.1% | 62.5% |
| color-theory-mcp 95085b9 (27 tools) | 82.1% | 67.9% | 75.0% |

### Per model: paired difference vs no-tools (server minus no-tools, per-task, task-clustered bootstrap)

| condition | suite | haiku-5-5 | gpt-6-luna |
|---|---|---|---|
| your server (main, v2.0.0) | v1 | +0.500 [0.345, 0.655] | +0.452 [0.321, 0.583] |
| your server (main, v2.0.0) | gen | +0.375 [0.196, 0.554] | +0.304 [0.125, 0.482] |
| your server (main, v2.0.0) | fresh | +0.422 [0.234, 0.594] | +0.313 [0.156, 0.469] |
| coolors-mcp 1.1.0 (25 tools) | v1 | +0.095 [-0.024, 0.226] | -0.036 [-0.155, 0.083] |
| coolors-mcp 1.1.0 (25 tools) | gen | -0.018 [-0.107, 0.071] | +0.018 [-0.071, 0.107] |
| coolors-mcp 1.1.0 (25 tools) | fresh | -0.016 [-0.078, 0.031] | -0.109 [-0.250, 0.016] |
| mcp-color-convert 0.1.3 (20 tools) | v1 | +0.214 [0.083, 0.357] | -0.036 [-0.155, 0.083] |
| mcp-color-convert 0.1.3 (20 tools) | gen | +0.054 [-0.071, 0.179] | +0.089 [-0.071, 0.250] |
| mcp-color-convert 0.1.3 (20 tools) | fresh | +0.094 [-0.031, 0.219] | +0.141 [0.000, 0.297] |
| color-theory-mcp 95085b9 (27 tools) | v1 | +0.333 [0.179, 0.500] | +0.012 [-0.131, 0.155] |
| color-theory-mcp 95085b9 (27 tools) | gen | +0.250 [0.089, 0.429] | +0.161 [0.018, 0.304] |
| color-theory-mcp 95085b9 (27 tools) | fresh | +0.188 [0.094, 0.297] | +0.000 [-0.172, 0.172] |

## Reading it

- Your server wins every suite by a wide margin: 96.4% / 87.5% / 89.8% mean pass against 51.8-66.1% / 53.6-74.1% / 46.9-64.8% for the others. Its paired gain over no tools is +0.34 to +0.48 and every interval excludes zero. Only color-theory-mcp (v1, generalization) and mcp-color-convert (fresh) have pooled intervals above zero.
- coolors-mcp, the biggest third-party server by popularity, does not beat no-tools on any suite (v1 +0.03, generalization 0.00, fresh -0.06). On gpt-6-luna it is neutral or negative everywhere.
- Per-category (v1 dev, mean of both models, no tools / yours / coolors / convert / theory): the third-party servers help on a few categories (7 distance: 17 -> 100 for coolors and theory, which have CIEDE2000; 10 harmony: 75 -> 100 for convert and theory) but not on 1 convert (33 -> 33, 67, 33), 8 palette ramp (8 -> 8, 8, 50), 11 deuteranopia-safe set (0 -> 25, 0, 8) or 13 end to end (0 -> 0, 0, 0). Yours reaches 100 / 83 / 100 / 75 on those.
- Their tool calls rarely error (3-8 per 570-870 calls, all schema rejections), so failures are not broken tools. The tools are primitives (convert, adjust, contrast number); the model still has to search for a passing answer, which is what your outcome tools (check, fix, palette, audit) do for it. Cost: third-party runs make 2-3x the tool calls of yours (3.4-5.2 on v1 against 2.1) and send more input tokens.
- gpt-6-luna gains little from any third-party server (outcome mix: about 38 of 84 v1 dev runs fail semantically with coolors, roughly the same as no tools).

## Caveats

- **Bias in the suites (read this before trusting the margins).** Suite v1 was written alongside your tools (evals/README says so). The generalization suite is not independent either: the repo's own report calls it "a tuning set", the README describes fresh as the final judge "after the tools are tuned on the generalization suite", and `colors_scrim` exists for generalization category 102 (the README line saying it is never tuned on is out of date). Only the fresh suite was written without sight of the tools, and even it reuses the generalization task kinds with new parameters (category 208 is the one new kind) and was run on earlier server versions with aggregates visible. Treat fresh as the least biased number (89.8% vs 46.9-64.8%), and v1 / generalization as 'the tools cover what they were built for'.
- **Asymmetry in tuning.** Your server's tool names, descriptions and result text were iterated against these two models on these task kinds. The third-party servers got no tuning, no steering and no instructions profile. The suites also measure 'returns a finished answer for a constraint-search task', which outcome tools are built for. They do not test what the other servers are built for (Material themes, Tailwind export, image extraction, colour names, APCA), so this is not a ranking of which server is better overall.
- **Harness limits are not the cause.** Limits are 12 turns, 20 tool calls, 4096 output tokens per turn, 180 s, identical for every condition. Of coolors-mcp's 38 haiku limit_exhausted runs on v1 dev, 34 made zero tool calls (the model reasoned by hand until truncated, as it does with no tools), so haiku mostly did not use that server.
- TNI profile only. Servers that put value in `structuredContent` or in `instructions` are not credited for it. I checked that no third-party tool result came back with empty text in v1.
- 2 models, 2 trials, 28-56 tasks per suite. Intervals are task-clustered bootstrap, 10,000 resamples; compare servers by eye on non-overlapping intervals, not by a formal test.
- Held-out accounting: the base runs of this repo spent held-out evaluations on v1 and fresh (logged). The third-party runs were wrongly logged by the first version of the CLI change and were removed from `results/holdout-log.jsonl` afterwards; the code now skips them.
- Reproduce: `python3 scripts/bench-matrix.py coolors-mcp,mcp-color-convert,color-theory-mcp` (start the proxy first), then `node scripts/bench-compare.mjs`.
