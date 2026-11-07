# Eval harness for the colors MCP server (sub-project 0)

Status: draft v4 for owner review (revised after three independent review rounds by gpt-6.1-sol). Date: 2026-11-06.

## 1. Program context

The overall goal: **any agent doing color work (UI/UX, graphic, web, print, film, photo, games, social, data viz) does it better just by connecting this MCP server, with the biggest gains for small and low-tier models** (Haiku 5.5, GPT-6 Luna, and later open-weight models such as DeepSeek Flash and GLM Flash).

Agreed during brainstorming. Items marked **(H)** are hypotheses this harness exists to test, not established facts.

- Frontier models already know color theory. The server's value is (a) deterministic computation small models do not do reliably (contrast, OKLCH conversion, gamut mapping, CIEDE2000), and (b) steering. **(H)**
- Of all MCP features, tool names, descriptions, schemas and result text are the most widely delivered to models across clients. Resources, prompts, Skills and Apps are delivered inconsistently, so they are expected to carry less of the weak-model value. They are still implemented for spec completeness. **(H)**
- Weak-model design: outcome tools that return finished, verified answers; verdict-first compact `content`; forgiving inputs; errors that teach; about 11 tools with batching folded in (a breaking change, so 2.0.0); engine moved from culori to Color.js. **(H)**
- Deferred until measured: image color extraction, print (CMYK/ICC), film and game specialties.

Build order (each its own spec, plan, implementation):

| # | Sub-project | Notes |
|---|---|---|
| **0** | **Eval harness + baseline (this spec)** | Measure before changing anything. |
| 1 | Foundation | SDK v2, `createServer()`, `serveStdio`, `outputSchema`, cache hints. |
| 2 | Tool redesign on Color.js | Outcome tools: check, fix, palette, audit; cleaned primitives. |
| 3 | Steering layer | `instructions`, resources, prompts, Skills. |
| 4 | Apps viewer | Optional, last. |

## 2. Purpose and scope

Build a reusable harness that answers: **does connecting this MCP server change small-model performance on color tasks, by how much, and where do they still fail?** First use: a baseline of the current server (v1.1.0) against no tools, on Haiku 5.5 and GPT-6 Luna. Later use: before/after for sub-projects 1–3.

**What the suite measures:** bounded CSS, UI-token and chart-palette color tasks. **Not measured:** print, film, photo and game work. Results make no claim about them.

**Non-goals:** protocol conformance (sub-project 1); a general LLM benchmark; frontier models; judging taste (all grading is deterministic, no LLM judge); open-weight models now.

## 3. Key decisions

1. **Location:** `evals/` in this repo, an isolated package with its own `package.json` and `node_modules`. It is not in the npm `files` list. Root lint, tsconfig and tests are untouched.
2. **MCP client:** `@modelcontextprotocol/sdk` v1 client over stdio. The server under test is given as `command` + `args` + `cwd`. The negotiated protocol version is logged per run and not assumed.
3. **Model access:** the local-inference proxy at `127.0.0.1:8317` (counts against the owner's subscriptions). `claude-haiku-5-5` via `/v1/messages`, `gpt-6-luna` via `/v1/chat/completions`. A one-call tool-use smoke test passed on both on 2026-11-06. If the service is already active the harness attaches and leaves it running; it stops it only if it started it.
4. **Client profile "text-only / no-instructions" (TNI):** only the `content` text of a tool result reaches the model, never `structuredContent`, and server `instructions` are not forwarded. This is a deliberately conservative profile, not a claim that it is the typical one. **Conclusions apply to this profile.** Sub-project 3 compares instructions off vs on on the same frozen suite. Other host behavior is evaluated separately.
5. **Conditions and build identity:** conditions are `no-tools` and `server@<sha>`. The server is run from a fresh `git worktree` at the resolved commit SHA (a dirty tree is refused), with dependencies installed from the lockfile (`npm ci`). The baseline runs from source through `tsx`, so no ignored build artifact can differ from the SHA. A later compiled build is cleaned and rebuilt, and the hash of `dist/` is recorded. Node version and lockfile hash are recorded. The baseline is the current `main` (v1.1.0).
6. **Independent graders:** graders never import from `src/`. Critical paths use hand-written references, not only a library (section 8). After sub-project 2 the server and graders may both use `colorjs.io`, so shared-library bugs are mitigated by reference vectors, not by independence.
7. **Statistical unit is the task** (section 7). Trials per task are 2; the task count is 56, because independent tasks, not repeated trials, drive what can be concluded.
8. **Frozen suite:** the task list, prompts and graders are frozen and content-hashed in `evals/src/tasks/manifest.json` before the first baseline run. Any later change creates a new suite version. Old results are never merged with a new version.

## 4. Architecture

```
evals/
  package.json            own deps (sdk v1 client, colorjs.io, tsx, vitest)
  src/
    cli.ts                preflight / run / report commands
    tasks/                task files (one per category) + manifest.json
    graders/              pure functions: (extractedAnswer, task) -> checks[]
    reference/            hand-written WCAG, sRGB<->OKLab, CIEDE2000, Machado CVD
    runner/
      agent-loop.ts       provider-neutral loop and limits
      providers/anthropic.ts   /v1/messages tool_use adapter
      providers/openai.ts      /v1/chat/completions tool_calls adapter
      mcp-bridge.ts       spawn server, listTools -> provider tool defs, callTool
    extract.ts            answer extraction (section 5)
    record.ts             atomic cell files, manifests
    report.ts             statistics + markdown report
  results/                gitignored, except curated reports
```

One run is `(model, condition, task, trial)`. Flow:

1. Condition `server@sha`: spawn the server over stdio, `listTools`, convert the MCP tool definitions to the provider's tool format.
2. Send the fixed system prompt (identical in both conditions: a neutral design-assistant role plus "use any available tools when helpful") and the task prompt. A fresh conversation per run. Prompts hold the required semantics and an output contract only: no reference answers, no tool names or hints, no grader details.
3. Loop: model response, run any tool calls through the bridge, return the `content` text, continue. Provider tool-call IDs are preserved, several calls per turn are supported, assistant/tool message order is kept, malformed JSON arguments produce an error message back to the model, and truncation (`max_tokens`/`length`) is recorded.
4. Extract the answer (section 5), grade it, write the cell.

**Run manifest and resume key.** Each cell records: resolved SHA, a hash of the task, grader code, system prompt, tool definitions as served, client profile and generation config (`max_tokens`, temperature recorded as "provider default"), the model ID returned by the provider, the dependency lock hash, timestamps and stop reason. The resume key is a hash of those inputs, so a changed prompt, grader or server build never reuses an old result. Condition order is randomized within each `(model, task, trial)` block using a seeded RNG.

## 5. Output contract and extraction

All task outputs are **JSON** with a per-task schema stated in the prompt. Extraction is identical for all conditions:

1. **Candidates:** every fenced code block (any language tag) in the final assistant message, in order. If there are none, the whole message if it parses as JSON; otherwise every non-nested top-level JSON object or array found by a balanced-bracket scan that parses.
2. **Strict:** exactly one candidate, parsing as JSON and valid against the task schema. Otherwise a strict failure (format).
3. **Lenient:** the last candidate that parses as JSON. Graders run on it directly: missing required fields make those checks fail; extra fields are ignored. No candidate at all is a lenient **format failure**.

The **headline metric is the lenient semantic pass**, so a formatting quirk is not read as a color failure; strict contract success is reported beside it.

## 6. Task suite: 14 categories × 4 tasks = 56 tasks

Each category has 3 dev tasks and 1 held-out task (**42 dev, 14 held-out**). In one trial the **check score** is the fraction of the task's named checks passed, and the trial **passes** when all are passed. The four tasks of a category use distinct inputs and at least two scenario templates; they are still correlated within a category, and category results are descriptive only.

**Witness rule.** Every task includes a witness answer that passes **all** of its checks, and at least two deliberately invalid answers that must fail. A unit test runs each grader on them. A task without a passing witness is rejected, which guarantees feasibility of every contract below (for example, harmony bases are chosen so the required chroma is reachable inside the sRGB gamut with at least 15% margin).

Shared definitions: `OK` means Oklab/OKLCH (Ottosson). "In gamut" means all sRGB channels within [-0.0005, 1.0005] before rounding. Contrast is WCAG 2 relative luminance from the **rounded hex**, not rounded up. Hue differences are circular. "Gamut mapped" means preserving L and H and taking the largest in-gamut chroma C ≤ the input chroma, found to within 1e-6. All CIEDE2000 calculations use D65-referenced Lab without chromatic adaptation and kL = kC = kH = 1.

| # | Category | Precise grading contract |
|---|---|---|
| 1 | **Convert** | Includes out-of-gamut conversions and achromatic/hue-wrap cases. Output parses; each channel within 0.002 (sRGB/p3), 0.005 (OKLab L, a, b), 0.5° (hue; skipped when chroma < 0.02). |
| 2 | **Parse / robustness** | Mixed list of valid, malformed and unsupported color strings plus alpha cases. Answer is `{input, valid, hex\|null}[]`; checks per input against a frozen expected table. Inventing a value for an invalid input fails that check. |
| 3 | **Contrast verdict** | Includes alpha compositing over a stated base and threshold edge cases (e.g. 4.49 vs 4.50). Checks: boolean verdict matches; ratio within ±0.05 of the reference from rounded hex. |
| 4 | **Contrast fix** | Editable: foreground only, opaque sRGB hex. Checks: ratio ≥ target T; OKLCH hue drift ≤ 15° when the original chroma ≥ 0.04 (skipped otherwise); Oklab distance d ≤ 2·d\* + 0.01. d\* is computed offline by exhaustive enumeration of all opaque 8-bit sRGB colors that satisfy the contrast target and the hue constraint, taking the minimum Oklab distance from the original; d\* and its witness color are stored in the task file. An accepted answer must itself be 8-bit hex, so the enumeration is exact. |
| 5 | **Adjust** | Stated operation, e.g. "lower OKLCH L by 0.10 keeping C and H". Result within OK distance 0.02 of the reference, gamut mapped. |
| 6 | **Blend / gradient** | Stated endpoints whose hue difference is not within 20° of 180°, N stops, interpolation in OKLCH. Checks: stop count = N; every stop (endpoints included) within OK distance 0.03 of the reference stop, where the reference is OKLCH interpolation along the shorter hue arc at t = i/(N−1), gamut mapped; all stops in gamut. An sRGB-interpolated gradient between far-apart hues drifts to gray and fails: this is the "mud" check. |
| 7 | **Distance / nearest match** | Prompt names the metric (CIEDE2000). Candidate sets have adjacent gaps ≥ 1.0 ΔE₀₀ and the Oklab-Euclid ordering equals the CIEDE2000 ordering, except explicitly flagged metric-sensitive tasks. Checks: nearest correct; full ordering correct. The current server's `deltaE` is Euclid-in-Oklab, not CIEDE2000, and the report says so. |
| 8 | **Palette ramp** | Chromatic seed (C ≥ 0.08), 11 steps. Checks: count; L strictly decreasing; first L ≥ 0.95 and last L ≤ 0.25; each adjacent ΔL within 0.5×–1.5× of the median adjacent ΔL; **some step within OK distance 0.05 of the seed**; **max chroma across steps ≥ 0.8 × seed chroma**; hue within ±12° of the seed for every step with chroma ≥ 0.02; steps distinct (OK distance ≥ 0.02); in gamut. A grayscale ramp therefore fails. |
| 9 | **Theme tokens** | Stated brand color and a fixed token list. Checks: all tokens present and valid; every listed (text, surface, min ratio) pair passes in **both** light and dark themes; `primary` within OK distance 0.04 of the brand; at least 3 distinct surface levels (ΔL ≥ 0.02); no text token equal to its surface. |
| 10 | **Harmony** | Base color with chroma ≥ 0.08. Checks: required number of colors; hue offsets from the base within ±8° of the scheme's offsets; chroma ≥ 0.6 × base; L within ±0.08 of the base; in gamut. Feasibility is guaranteed by the witness rule. |
| 11 | **Deuteranopia-safe set** | N colors on a stated background. Simulation: Machado 2009 deuteranopia severity 1.0, matrix applied in linear sRGB, result clipped to [0,1]; CIEDE2000 computed in Lab with the D65 sRGB white, no adaptation; numeric tolerance 1e-6. Checks: min pairwise CIEDE2000 under deuteranopia ≥ the task threshold; under normal vision ≥ 10; each color has contrast ≥ 3 against the background; distinct; in gamut. The threshold is 0.8 × the value achieved by the witness palette. This measures deuteranopia separation only, not general color-blind safety. |
| 12 | **Audit** | CSS from a documented subset: simple class, tag or `:root` selectors; declarations `color`, `background-color`, `border-color` and custom properties; values in hex, rgb(), hsl() or named colors, all opaque; no `var()` resolution. Rule IDs and detection: `text-contrast-aa` (a rule with `color` and `background-color` whose WCAG ratio is < 4.5, all text treated as normal size); `nontext-contrast-3` (a rule with `border-color` and `background-color` whose ratio is < 3); `near-duplicate-token` (two distinct `:root` custom-property colors with CIEDE2000 < 2, reported with `detail` = the two names sorted and joined by `\|`). Answer: `{rule, selector, detail?}[]`. Matching is exact on `(rule, selector, detail)`. Predictions are deduplicated; unmatched ones are false positives. Pass = recall 1 and zero false positives. One task has zero seeded defects (an empty list is correct). |
| 13 | **End-to-end** | A short brief yielding a token set, graded by named constraint checks drawn from categories 4, 8, 9 and 11. |
| 14 | **Trap / no tool needed** | Simple facts (e.g. a named color's hex). Checks correctness, and that tools did not make it worse. |

Recovery from tool errors is not a separate category. It is measured by the `recovered_tool_error` event annotation (section 7), mainly on categories 2, 3 and 4.

Task files carry: id, category, split, prompt, output schema, graders, witness, invalid answers, and whether a tool is **useful** (informational only).

## 7. Metrics, statistics and outcomes

**Terminal outcome of each run** (exactly one; the first terminal event decides, then this order):

1. `infra_failed`: provider 5xx, proxy or transport error, a server process crash not caused by the arguments, or a connection-level timeout that occurred before the run deadline. Excluded from rates and re-queued up to 2 times. HTTP 429 is the exception: it stops the whole matrix (section 9), leaves the cell `pending`, and is never auto-re-queued.
2. `limit_exhausted`: the turn, tool-call or token limit was reached with no final answer, or the 180 s run deadline expired (including cancellation of pending requests). A 30 s tool-call timeout is not a terminal event: it returns a tool error to the model, which may recover within the remaining limits.
3. `format_failure`: no lenient candidate.
4. `semantic_failure`: a candidate exists and at least one check failed.
5. `pass`.

**Event annotations** (non-exclusive, never outcomes by themselves): `schema_rejection_count` (MCP invalid-params errors), `tool_error_count` (`isError` results), `recovered_tool_error` (a tool error followed by a successful tool call), `zero_tool_calls` (informational, never a failure), `truncation`.

**Statistics.** The unit of analysis is the task; trials measure repeatability only. A task's **pass proportion** is the mean binary all-checks-pass outcome over its eligible trials; it feeds the paired differences and the bootstrap. Its **check score** is the mean fraction of checks passed over those trials, reported separately.

- Report, per model and condition, over the dev split and per category (dev only): pass proportion, mean check score, mean tool calls, input/output tokens, elapsed time, `limit_exhausted` rate. Held-out results appear only as the full-split aggregates below.
- **Primary comparison:** paired per-task difference (server minus no-tools), averaged over tasks, with a task-clustered bootstrap 95% interval (10,000 seeded resamples; all trials of a task stay together).
- **Infra exclusions are pairwise:** if either condition's cell for a `(model, task, trial)` is `infra_failed` after the re-queues, that trial is dropped from both conditions. A task needs at least one complete trial pair to count. The report lists dropped trials per model and flags a model as incomplete if more than 10% were dropped.
- **Regressions:** dev tasks where the server condition is worse than no-tools are listed with transcript IDs.

**Held-out handling (sealed).** All 56 tasks run in each baseline, but held-out transcripts and cells are written to a separate `sealed/` directory that the report and the transcript sampling never read. Held-out reporting is limited to full-split aggregates per model and condition plus the pooled confirmation result; category-level diagnostics are dev-only, because each category contains a single held-out task. Redesign agents and reviewers must not inspect held-out prompts, witnesses, task-level cells or transcripts. Diagnostic claims, failure patterns and redesign evidence come from **dev tasks only**. One completed matrix, the baseline included, counts as one held-out evaluation; re-running its unfinished cells does not count as another.

**Predeclared bar for later sub-projects.** A gain is practically meaningful when the pooled (both models) dev mean paired difference is ≥ +0.15 with a bootstrap lower bound above 0. A held-out check guards against overfitting: the pooled held-out mean paired difference must be positive and at least half of the dev difference. With 14 held-out tasks the held-out interval is reported descriptively, not as a test. Each held-out evaluation is logged; after 3 evaluations, or after any task-level information leaks, the held-out tasks are retired and replaced by fresh ones as a new suite version. If intervals are too wide at a milestone, add independent tasks (a new suite version), not trials. The baseline report is descriptive and makes no significance claims.

**Transcript sample for failure analysis (dev only):** for each (model, condition, category) with failures, the first failing trial of up to 2 failing tasks chosen by a seeded RNG, plus all `limit_exhausted` runs. Each reviewed failure is tagged with a pattern and linked to a transcript ID.

## 8. Grader trust

- References hand-written from published formulas: WCAG 2 contrast, sRGB↔XYZ↔OKLab (Ottosson matrices), CIEDE2000, Machado 2009 matrices.
- Tests: known vectors (black on white 21:1; `#777` on white ≈ 4.48:1; the CIEDE2000 test pairs from Sharma et al.), a randomized cross-check of `colorjs.io` against the hand-written references, and the witness and invalid-answer tests from section 6.
- Documented limit: after sub-project 2, shared use of `colorjs.io` can hide a library bug on both sides. The reference cross-check is the guard.

## 9. Preflight, limits and operations

**Preflight (must pass before any matrix run):**
1. Spawn the baseline server over stdio with the v1 client; log the negotiated protocol version; enumerate all 11 tools.
2. Call each tool with valid input and with defaulted inputs; call with invalid input and with an unknown color; check that result text and error text are forwarded as `content` text.
3. Verify clean process exit and cleanup.
4. For each model, one multi-tool-call turn and one malformed-argument case through its adapter.

**Limits per run:** concurrency 1 by default (the dev machine is memory-constrained; one server process per run); 12 model turns; 20 tool calls; 4096 output tokens per response; tool results truncated at 25,000 characters; 180 s wall time per run and 30 s per tool call. Truncations are recorded.

**Resilience:** cells are written atomically (temp file, rename). Statuses: `pending`, `running`, `done`, `infra_failed`. On SIGINT the child server is killed and `running` returns to `pending`. HTTP 429 stops the whole matrix and reports progress; the interrupted cell stays `pending`, and work resumes only on a later invocation. There is no retry loop. Tokens and elapsed time are recorded. No monetary claim is made, because the usage is subscription-based.

**Budget:** baseline = 2 models × 2 conditions × 56 tasks × 2 trials = 448 runs.

## 10. Risks

- **Representativeness:** the TNI profile, two small hosted models, and bounded CSS/UI/chart tasks. Stated in every report.
- **Proxy quirks or rate limits:** mitigated by preflight, resume and stopping on 429.
- **Variance and power:** a paired design with a task bootstrap, no significance claims at baseline; 4 tasks per category are descriptive only.
- **Grader bugs:** reference vectors, hand-written references, witness and invalid-answer tests.
- **Overfitting:** frozen suite, sealed held-out tasks, a stated retirement policy.
- **Future models:** open-weight models need the same preflight and adapter conformance before their results count.

## 11. Acceptance criteria

1. The preflight command passes for the baseline server and for both model adapters.
2. One command runs the matrix and writes the manifests, transcripts, `results.json` and `report.md`.
3. Grader unit tests (vectors, witness and invalid-answer tests, reference cross-checks) and runner tests (fake provider, fake MCP server) pass.
4. A baseline report exists for Haiku 5.5 and GPT-6 Luna under `no-tools` and `server@<sha>`, containing: paired per-task dev results with bootstrap intervals, held-out aggregates only, regressions, infra-failure and `limit_exhausted` counts, strict vs lenient results, and a ranked list of failure patterns, each with transcript evidence and a proposed tool or description change for sub-project 2.
5. Interrupted runs resume without repeating finished cells, and a changed prompt, grader or server build does not reuse old results.

## 12. Addendum (2026-11-07): generalization suite

A second, independent suite named `generalization` (v1 of that suite, 28 tasks in 7 categories numbered 101-107) measures whether the tools help, do nothing or hurt on adjacent and out-of-scope color work. Its tasks were designed from designer briefs, not from the tool list. **All of its tasks are in the dev split:** it is never tuned on, so it has no sealed split, no held-out comparison and no predeclared bar. Its run identity includes its own task hashes and a grader hash over `graders/`, `reference/`, `graders-gen/` and `reference-gen/`. Suite v1, its graders and its grader hash are unchanged. Thresholds are derived from reference math (see `evals/README.md` and each task's `grader.params.derivation`). At least 6 tasks (7 in v1 of the suite) are ones the tools give no direct help with.

## 13. Follow-ups, not in this spec

- Add open-weight models (after adapter conformance).
- Instructions off/on ablation (sub-project 3).
- Re-run on later sub-projects using the same frozen suite, or a new suite version if tasks must change.
