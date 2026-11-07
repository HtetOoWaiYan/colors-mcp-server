import type { CellRecord } from "./record.js";
import { bootstrapMean, type Interval, mean } from "./stats.js";
import { mulberry32 } from "./tasks/build/common.js";
import type { Task } from "./tasks/types.js";

export const BASELINE_CONDITION = "no-tools";

export interface Agg {
	tasks: number;
	trials: number;
	pass: number; // mean over tasks of task pass proportion
	checkScore: number;
	toolCalls: number;
	inputTokens: number;
	outputTokens: number;
	elapsedSec: number;
	limitRate: number;
	formatFailRate: number;
	strictPassRate: number;
	zeroToolCallRateOnUseful: number | null;
}

export interface Report {
	runId: string;
	suite: string;
	suiteVersion: number;
	/** False for a dev-only suite: no held-out aggregates, no predeclared bar. */
	hasHeldout: boolean;
	categories: number[];
	devTasksPerCategory: number[];
	models: string[];
	conditions: string[];
	dev: Record<string, Record<string, Agg>>;
	heldout: Record<string, Record<string, Agg>>;
	paired: {
		dev: Record<string, Interval>; // per model and "pooled"
		heldout: Record<string, Interval>;
	};
	perCategoryDev: Record<string, Record<string, Record<number, number>>>;
	regressions: {
		model: string;
		taskId: string;
		serverPass: number;
		baselinePass: number;
		transcripts: string[];
	}[];
	dropped: Record<
		string,
		{ trials: number; total: number; incomplete: boolean }
	>;
	outcomes: Record<string, Record<string, Record<string, number>>>; // dev only
	toolUsage: Record<
		string,
		Record<string, { calls: number; errors: number; schemaRejections: number }>
	>; // dev only
	failureSample: {
		model: string;
		condition: string;
		category: number;
		taskId: string;
		cellId: string;
		outcome: string;
	}[];
	bar: {
		devPooled: Interval | null;
		heldoutPooled: Interval | null;
		meetsBar: boolean | null;
	};
}

interface Group {
	model: string;
	task: Task;
	trial: number;
	cells: Map<string, CellRecord>;
}

export function computeReport(args: {
	runId: string;
	suiteVersion: number;
	tasks: Task[];
	cells: CellRecord[];
	models: string[];
	conditions: string[];
	serverCondition: string;
	seed?: number;
	suite?: { name: string; heldout: boolean; sealedOnly?: boolean };
}): Report {
	const { tasks, cells, models, conditions } = args;
	const suite = args.suite ?? { name: "v1", heldout: true };
	const categories = [
		...new Set(tasks.filter((t) => t.split === "dev").map((t) => t.category)),
	].sort((a, b) => a - b);
	const taskById = new Map(tasks.map((t) => [t.id, t]));
	const groups = new Map<string, Group>();
	for (const c of cells) {
		const task = taskById.get(c.taskId);
		if (!task) continue;
		const k = `${c.model}|${c.taskId}|${c.trial}`;
		const g = groups.get(k) ?? {
			model: c.model,
			task,
			trial: c.trial,
			cells: new Map(),
		};
		g.cells.set(c.condition, c);
		groups.set(k, g);
	}
	// An infra failure in any condition drops the whole trial, so comparisons stay paired.
	const eligible: Group[] = [];
	const dropped: Report["dropped"] = {};
	for (const m of models)
		dropped[m] = { trials: 0, total: 0, incomplete: false };
	for (const g of groups.values()) {
		const d = dropped[g.model] as Report["dropped"][string];
		d.total++;
		const ok = conditions.every((cond) => g.cells.get(cond)?.status === "done");
		if (ok) eligible.push(g);
		else d.trials++;
	}
	for (const m of models) {
		const d = dropped[m] as Report["dropped"][string];
		d.incomplete = d.total > 0 && d.trials / d.total > 0.1;
	}

	const agg = (model: string, cond: string, split: "dev" | "heldout"): Agg => {
		const gs = eligible.filter(
			(g) => g.model === model && g.task.split === split,
		);
		const byTask = new Map<string, CellRecord[]>();
		for (const g of gs) {
			const c = g.cells.get(cond) as CellRecord;
			byTask.set(g.task.id, [...(byTask.get(g.task.id) ?? []), c]);
		}
		const all = [...byTask.values()].flat();
		const taskPass = [...byTask.values()].map((cs) =>
			mean(cs.map((c) => (c.outcome === "pass" ? 1 : 0))),
		);
		const taskScore = [...byTask.values()].map((cs) =>
			mean(cs.map((c) => c.checkScore ?? 0)),
		);
		const useful = all.filter((c) => taskById.get(c.taskId)?.toolUseful);
		return {
			tasks: byTask.size,
			trials: all.length,
			pass: mean(taskPass),
			checkScore: mean(taskScore),
			toolCalls: mean(all.map((c) => c.run?.toolCalls.length ?? 0)),
			inputTokens: mean(all.map((c) => c.run?.inputTokens ?? 0)),
			outputTokens: mean(all.map((c) => c.run?.outputTokens ?? 0)),
			elapsedSec: mean(all.map((c) => (c.run?.elapsedMs ?? 0) / 1000)),
			limitRate: mean(
				all.map((c) => (c.outcome === "limit_exhausted" ? 1 : 0)),
			),
			formatFailRate: mean(
				all.map((c) => (c.outcome === "format_failure" ? 1 : 0)),
			),
			strictPassRate: mean(all.map((c) => (c.strictPass ? 1 : 0))),
			zeroToolCallRateOnUseful:
				cond === BASELINE_CONDITION
					? null
					: useful.length
						? mean(
								useful.map((c) =>
									(c.run?.toolCalls.length ?? 0) === 0 ? 1 : 0,
								),
							)
						: null,
		};
	};

	const dev: Report["dev"] = {};
	const heldout: Report["heldout"] = {};
	for (const m of models) {
		dev[m] = {};
		heldout[m] = {};
		for (const cond of conditions) {
			(dev[m] as Record<string, Agg>)[cond] = agg(m, cond, "dev");
			(heldout[m] as Record<string, Agg>)[cond] = agg(m, cond, "heldout");
		}
	}

	const taskProp = (
		model: string,
		cond: string,
		taskId: string,
	): number | null => {
		const gs = eligible.filter(
			(g) => g.model === model && g.task.id === taskId,
		);
		if (gs.length === 0) return null;
		return mean(
			gs.map((g) =>
				(g.cells.get(cond) as CellRecord).outcome === "pass" ? 1 : 0,
			),
		);
	};
	const diffsFor = (split: "dev" | "heldout", model?: string): number[] => {
		const out: number[] = [];
		for (const t of tasks.filter((x) => x.split === split)) {
			const perModel = (model ? [model] : models)
				.map((m) => {
					const s = taskProp(m, args.serverCondition, t.id);
					const b = taskProp(m, BASELINE_CONDITION, t.id);
					return s === null || b === null ? null : s - b;
				})
				.filter((x): x is number => x !== null);
			if (perModel.length > 0) out.push(mean(perModel));
		}
		return out;
	};
	const paired: Report["paired"] = { dev: {}, heldout: {} };
	for (const m of models) {
		paired.dev[m] = bootstrapMean(diffsFor("dev", m), args.seed);
		paired.heldout[m] = bootstrapMean(diffsFor("heldout", m), args.seed);
	}
	paired.dev.pooled = bootstrapMean(diffsFor("dev"), args.seed);
	paired.heldout.pooled = bootstrapMean(diffsFor("heldout"), args.seed);

	const perCategoryDev: Report["perCategoryDev"] = {};
	for (const m of models) {
		perCategoryDev[m] = {};
		for (const cond of conditions) {
			const row: Record<number, number> = {};
			for (const c of categories) {
				const ts = tasks.filter((t) => t.split === "dev" && t.category === c);
				const props = ts
					.map((t) => taskProp(m, cond, t.id))
					.filter((x): x is number => x !== null);
				if (props.length) row[c] = mean(props);
			}
			(perCategoryDev[m] as Record<string, Record<number, number>>)[cond] = row;
		}
	}

	const regressions: Report["regressions"] = [];
	for (const m of models) {
		for (const t of tasks.filter((x) => x.split === "dev")) {
			const s = taskProp(m, args.serverCondition, t.id);
			const b = taskProp(m, BASELINE_CONDITION, t.id);
			if (s !== null && b !== null && s < b) {
				const transcripts = eligible
					.filter((g) => g.model === m && g.task.id === t.id)
					.map((g) => (g.cells.get(args.serverCondition) as CellRecord).id);
				regressions.push({
					model: m,
					taskId: t.id,
					serverPass: s,
					baselinePass: b,
					transcripts,
				});
			}
		}
	}

	const outcomes: Report["outcomes"] = {};
	const toolUsage: Report["toolUsage"] = {};
	for (const c of cells) {
		if (c.split !== "dev") continue;
		const o = ((outcomes[c.model] ??= {})[c.condition] ??= {});
		const key =
			c.status === "infra_failed" ? "infra_failed" : (c.outcome ?? "unknown");
		o[key] = (o[key] ?? 0) + 1;
		for (const call of c.run?.toolCalls ?? []) {
			const u = ((toolUsage[c.model] ??= {})[call.name] ??= {
				calls: 0,
				errors: 0,
				schemaRejections: 0,
			});
			u.calls++;
			if (call.isError) u.errors++;
			if (call.schemaRejection) u.schemaRejections++;
		}
	}

	// Dev only, so held-out transcripts never leak.
	const rnd = mulberry32(args.seed ?? 20260611);
	const failureSample: Report["failureSample"] = [];
	const devFailing = cells.filter(
		(c) => c.split === "dev" && c.status === "done" && c.outcome !== "pass",
	);
	const cellKey = (c: CellRecord) =>
		`${c.model}|${c.condition}|${taskById.get(c.taskId)?.category}`;
	const buckets = new Map<string, CellRecord[]>();
	for (const c of devFailing.sort((a, b) => a.id.localeCompare(b.id)))
		buckets.set(cellKey(c), [...(buckets.get(cellKey(c)) ?? []), c]);
	for (const [, list] of buckets) {
		const byTask = new Map<string, CellRecord>();
		for (const c of list) if (!byTask.has(c.taskId)) byTask.set(c.taskId, c);
		const picks = [...byTask.values()].sort(() => rnd() - 0.5).slice(0, 2);
		for (const c of picks)
			failureSample.push({
				model: c.model,
				condition: c.condition,
				category: c.category,
				taskId: c.taskId,
				cellId: c.id,
				outcome: c.outcome as string,
			});
	}
	for (const c of devFailing.filter((x) => x.outcome === "limit_exhausted")) {
		if (!failureSample.some((f) => f.cellId === c.id))
			failureSample.push({
				model: c.model,
				condition: c.condition,
				category: c.category,
				taskId: c.taskId,
				cellId: c.id,
				outcome: "limit_exhausted",
			});
	}

	const dp = paired.dev.pooled as Interval;
	const hp = paired.heldout.pooled as Interval;
	const bar = {
		devPooled: dp,
		heldoutPooled: hp,
		meetsBar:
			!suite.heldout || Number.isNaN(dp.mean)
				? null
			: dp.mean >= 0.15 && dp.lo > 0 && hp.mean > 0 && hp.mean >= dp.mean / 2,
	};

	return {
		runId: args.runId,
		suite: suite.name,
		suiteVersion: args.suiteVersion,
		hasHeldout: suite.heldout,
		categories,
		devTasksPerCategory: [
			...new Set(
				categories.map(
					(c) =>
						tasks.filter((t) => t.split === "dev" && t.category === c).length,
				),
			),
		],
		models,
		conditions,
		dev,
		heldout,
		paired,
		perCategoryDev,
		regressions,
		dropped,
		outcomes,
		toolUsage,
		failureSample,
		bar,
	};
}

const pct = (x: number | null) =>
	x === null || Number.isNaN(x) ? "n/a" : `${(x * 100).toFixed(1)}%`;
const num = (x: number, d = 2) => (Number.isNaN(x) ? "n/a" : x.toFixed(d));
const ci = (i: Interval) =>
	i.n === 0
		? "n/a"
		: `${i.mean >= 0 ? "+" : ""}${num(i.mean, 3)} [${num(i.lo, 3)}, ${num(i.hi, 3)}] (${i.n} tasks)`;

function renderHeldout(r: Report, L: string[]): void {
	L.push("", "## Held-out split (sealed): full-split aggregates only", "");
	L.push(
		"| model | condition | tasks | pass | check score |",
		"|---|---|---|---|---|",
	);
	for (const m of r.models) {
		for (const c of r.conditions) {
			const a = (r.heldout[m] as Record<string, Agg>)[c] as Agg;
			L.push(
				`| ${m} | ${c} | ${a.tasks} | ${pct(a.pass)} | ${pct(a.checkScore)} |`,
			);
		}
	}
	L.push("", "Held-out paired difference (descriptive only, 14 tasks):", "");
	for (const k of [...r.models, "pooled"])
		L.push(`- **${k}**: ${ci(r.paired.heldout[k] as Interval)}`);
	L.push(
		"",
		"## Predeclared bar (for later milestones)",
		"",
		`Dev pooled: ${r.bar.devPooled ? ci(r.bar.devPooled) : "n/a"}. Held-out pooled: ${r.bar.heldoutPooled ? ci(r.bar.heldoutPooled) : "n/a"}. Meets bar: ${r.bar.meetsBar === null ? "n/a" : r.bar.meetsBar ? "yes" : "no"} (needs dev mean >= +0.15 with lower bound > 0, held-out mean > 0 and >= half the dev mean). Not a claim at baseline.`,
	);
}

export function renderMarkdown(
	r: Report,
	meta: { serverSha?: string; nodeVersion?: string; notes?: string[] },
): string {
	const L: string[] = [];
	L.push(`# Eval report: ${r.runId}`, "");
	L.push(
		`Suite: ${r.suite}, version ${r.suiteVersion}. Client profile: **TNI** (text-only tool results, no server instructions). Server: \`${meta.serverSha ?? "n/a"}\`. Node ${meta.nodeVersion ?? "n/a"}.`,
	);
	L.push(
		"",
		r.hasHeldout
			? "> Scope: bounded CSS, UI-token and chart-palette color tasks, two small hosted models, TNI client only. No claim is made about print, film, photo or game work. Baseline results are descriptive; no significance claims."
			: "> Scope: generalization suite of adjacent and out-of-scope color tasks written from designer briefs, not around the tools; dev split only and never tuned on, so no held-out comparison is made. Two small hosted models, TNI client only. Descriptive; no significance claims.",
		"",
	);
	for (const n of meta.notes ?? []) L.push(`- ${n}`);
	L.push("", "## Dev split: per model and condition", "");
	L.push(
		"| model | condition | tasks | trials | pass | check score | tool calls | in tok | out tok | sec | limit | format fail | strict pass | zero-tool-call (useful tasks) |",
		"|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
	);
	for (const m of r.models) {
		for (const c of r.conditions) {
			const a = (r.dev[m] as Record<string, Agg>)[c] as Agg;
			L.push(
				`| ${m} | ${c} | ${a.tasks} | ${a.trials} | ${pct(a.pass)} | ${pct(a.checkScore)} | ${num(a.toolCalls, 1)} | ${num(a.inputTokens, 0)} | ${num(a.outputTokens, 0)} | ${num(a.elapsedSec, 1)} | ${pct(a.limitRate)} | ${pct(a.formatFailRate)} | ${pct(a.strictPassRate)} | ${pct(a.zeroToolCallRateOnUseful)} |`,
			);
		}
	}
	L.push(
		"",
		"## Paired per-task difference (server minus no-tools), dev",
		"",
		"Task-clustered bootstrap 95% interval, 10,000 seeded resamples.",
		"",
	);
	for (const k of [...r.models, "pooled"])
		L.push(`- **${k}**: ${ci(r.paired.dev[k] as Interval)}`);
	if (r.hasHeldout) renderHeldout(r, L);
	else
		L.push(
			"",
			"## Held-out split",
			"",
			"None: this suite is dev-only by design (never tuned on), so there is no held-out comparison and no predeclared bar.",
		);
	const perCat = r.devTasksPerCategory;
	L.push(
		"",
		`## Per category, dev only (descriptive; ${perCat.length === 1 ? perCat[0] : perCat.join(" or ")} tasks each)`,
		"",
	);
	L.push(
		`| category | ${r.models.flatMap((m) => r.conditions.map((c) => `${m} / ${c}`)).join(" | ")} |`,
		`|---|${r.models.flatMap(() => r.conditions.map(() => "---")).join("|")}|`,
	);
	for (const c of r.categories) {
		L.push(
			`| ${c} | ${r.models.flatMap((m) => r.conditions.map((cond) => pct(((r.perCategoryDev[m] as Record<string, Record<number, number>>)[cond] as Record<number, number>)[c] ?? null))).join(" | ")} |`,
		);
	}
	L.push(
		"",
		"## Regressions (dev tasks where the server condition is worse)",
		"",
	);
	if (r.regressions.length === 0) L.push("None.");
	for (const g of r.regressions)
		L.push(
			`- ${g.model} ${g.taskId}: server ${pct(g.serverPass)} vs no-tools ${pct(g.baselinePass)} (cells: ${g.transcripts.join(", ")})`,
		);
	L.push("", "## Outcomes (dev)", "");
	for (const m of r.models)
		for (const c of r.conditions)
			L.push(
				`- ${m} / ${c}: ${JSON.stringify((r.outcomes[m] ?? {})[c] ?? {})}`,
			);
	L.push("", "## Dropped trials (pairwise infra exclusion)", "");
	for (const m of r.models) {
		const d = r.dropped[m] as Report["dropped"][string];
		L.push(
			`- ${m}: ${d.trials}/${d.total} dropped${d.incomplete ? " **INCOMPLETE (>10%)**" : ""}`,
		);
	}
	L.push(
		"",
		"## Tool usage (dev, server condition)",
		"",
		"| model | tool | calls | errors | schema rejections |",
		"|---|---|---|---|---|",
	);
	for (const m of r.models)
		for (const [t, u] of Object.entries(r.toolUsage[m] ?? {}).sort(
			(a, b) => b[1].calls - a[1].calls,
		))
			L.push(
				`| ${m} | ${t} | ${u.calls} | ${u.errors} | ${u.schemaRejections} |`,
			);
	L.push("", "## Failure-analysis transcript sample (dev only, seeded)", "");
	for (const f of r.failureSample)
		L.push(`- ${f.cellId} (category ${f.category}, ${f.outcome})`);
	L.push("");
	return L.join("\n");
}

// ---- sealed-only suites (fresh): whole-suite aggregates, nothing per task or per category ----

export type SealedAgg = Pick<
	Agg,
	| "tasks"
	| "trials"
	| "pass"
	| "checkScore"
	| "toolCalls"
	| "inputTokens"
	| "outputTokens"
>;

export interface SealedReport {
	runId: string;
	suite: string;
	suiteVersion: number;
	sealed: true;
	models: string[];
	conditions: string[];
	aggregates: Record<string, Record<string, SealedAgg>>;
	/** Task-clustered bootstrap of the per-task server minus no-tools difference, per model and pooled. */
	paired: Record<string, Interval>;
	dropped: Report["dropped"];
}

/** Built from the full computation, then cut down to an allow-list, so no per-task field can slip through. */
export function computeSealedReport(
	args: Parameters<typeof computeReport>[0],
): SealedReport {
	const full = computeReport(args);
	const aggregates: SealedReport["aggregates"] = {};
	for (const m of full.models) {
		aggregates[m] = {};
		for (const c of full.conditions) {
			const a = (full.heldout[m] as Record<string, Agg>)[c] as Agg;
			(aggregates[m] as Record<string, SealedAgg>)[c] = {
				tasks: a.tasks,
				trials: a.trials,
				pass: a.pass,
				checkScore: a.checkScore,
				toolCalls: a.toolCalls,
				inputTokens: a.inputTokens,
				outputTokens: a.outputTokens,
			};
		}
	}
	return {
		runId: full.runId,
		suite: full.suite,
		suiteVersion: full.suiteVersion,
		sealed: true,
		models: full.models,
		conditions: full.conditions,
		aggregates,
		paired: full.paired.heldout,
		dropped: full.dropped,
	};
}

export function renderSealedMarkdown(
	r: SealedReport,
	meta: { serverSha?: string; nodeVersion?: string },
): string {
	const L: string[] = [];
	L.push(`# Eval report: ${r.runId}`, "");
	L.push(
		`Suite: ${r.suite}, version ${r.suiteVersion}. Client profile: **TNI** (text-only tool results, no server instructions). Server: \`${meta.serverSha ?? "n/a"}\`. Node ${meta.nodeVersion ?? "n/a"}.`,
		"",
		"> **Sealed suite.** Every task is held out. It was authored from designer briefs without sight of the tools or of any results, and it is the final judge, so this report shows whole-suite aggregates only: no per-task or per-category rows, no regressions, no outcomes per task, no transcripts. Descriptive; no significance claims.",
		"",
		"## Aggregates per model and condition",
		"",
		"| model | condition | tasks | trials | pass | check score | tool calls | in tok | out tok |",
		"|---|---|---|---|---|---|---|---|---|",
	);
	for (const m of r.models)
		for (const c of r.conditions) {
			const a = (r.aggregates[m] as Record<string, SealedAgg>)[c] as SealedAgg;
			L.push(
				`| ${m} | ${c} | ${a.tasks} | ${a.trials} | ${pct(a.pass)} | ${pct(a.checkScore)} | ${num(a.toolCalls, 1)} | ${num(a.inputTokens, 0)} | ${num(a.outputTokens, 0)} |`,
			);
		}
	L.push(
		"",
		"## Paired per-task difference (server minus no-tools)",
		"",
		"Task-clustered bootstrap 95% interval, 10,000 seeded resamples.",
		"",
	);
	for (const k of [...r.models, "pooled"])
		L.push(`- **${k}**: ${ci(r.paired[k] as Interval)}`);
	L.push("", "## Dropped trials (pairwise infra exclusion)", "");
	for (const m of r.models) {
		const d = r.dropped[m] as Report["dropped"][string];
		L.push(
			`- ${m}: ${d.trials}/${d.total} dropped${d.incomplete ? " **INCOMPLETE (>10%)**" : ""}`,
		);
	}
	L.push("");
	return L.join("\n");
}
