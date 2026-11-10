// Collates the nb-* runs (scripts/bench-neutral.py) into one comparison. Run: npx tsx scripts/bench-neutral-compare.ts > out.md
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { bootstrapMean, mean } from "../src/stats.js";

const RESULTS = join(import.meta.dirname, "..", "results");
const MODELS = ["haiku-5-5", "gpt-6-luna"] as const;
const MODEL_TAG = { "haiku-5-5": "h", "gpt-6-luna": "l" } as const;
const MINE = "server@86a9b681";

interface Cond {
	label: string;
	tag: string; // run-id stem: nb-<tag>-<m>
	cond: string; // condition name inside that run
}
const CONDS: Cond[] = [
	{ label: "no tools", tag: "base", cond: "no-tools" },
	{ label: "your server (v2.0.0)", tag: "base", cond: MINE },
	{ label: "your server + instructions", tag: "mine-instr", cond: `${MINE}+instr` },
	{ label: "coolors-mcp 1.1.0", tag: "coolors-mcp", cond: "coolors-mcp" },
	{ label: "mcp-color-convert 0.1.3", tag: "mcp-color-convert", cond: "mcp-color-convert" },
	{ label: "color-theory-mcp 95085b9", tag: "color-theory-mcp", cond: "color-theory-mcp" },
	{ label: "color-engine-mcp 1.0.1", tag: "color-engine-mcp", cond: "color-engine-mcp" },
	{ label: "color-engine-mcp + instructions", tag: "color-engine-mcp-instr", cond: "color-engine-mcp+instr" },
];

interface Cell {
	status: string;
	outcome: string;
	checkScore?: number;
	taskId: string;
	trial: number;
	category: number;
	run?: { toolCalls: unknown[]; inputTokens: number; elapsedMs: number };
}

function walk(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
		e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
	);
}

// cells[model][cond label][taskId][trial] = Cell
const cells: Record<string, Record<string, Record<string, Record<number, Cell>>>> = {};
for (const m of MODELS) {
	cells[m] = {};
	for (const c of CONDS) {
		const dir = join(RESULTS, `nb-${c.tag}-${MODEL_TAG[m]}`, "cells", m, c.cond);
		const byTask: Record<string, Record<number, Cell>> = {};
		let files: string[] = [];
		try {
			files = walk(dir);
		} catch {
			/* run not present */
		}
		for (const f of files) {
			if (!f.endsWith(".json")) continue;
			const cell = JSON.parse(readFileSync(f, "utf8")) as Cell;
			(byTask[cell.taskId] ??= {})[cell.trial] = cell;
		}
		cells[m][c.label] = byTask;
	}
}

const tasks = JSON.parse(
	readFileSync(join(import.meta.dirname, "..", "src", "tasks", "neutral", "suite-neutral.json"), "utf8"),
) as { id: string; category: number; categoryName: string }[];
const catName = new Map(tasks.map((t) => [t.category, t.categoryName]));
const categories = [...new Set(tasks.map((t) => t.category))].sort();

const ok = (c: Cell | undefined) => c?.status === "done";

/** Per task, per model: mean pass and check score over trials where BOTH the condition and no-tools finished. */
function perTask(model: string, label: string, metric: "pass" | "score"): Map<string, number> {
	const out = new Map<string, number>();
	const nt = cells[model]?.["no tools"] ?? {};
	for (const t of tasks) {
		const xs: number[] = [];
		for (const trial of [1, 2]) {
			const c = cells[model]?.[label]?.[t.id]?.[trial];
			const b = nt[t.id]?.[trial];
			if (!ok(c) || !ok(b)) continue;
			xs.push(metric === "pass" ? (c?.outcome === "pass" ? 1 : 0) : (c?.checkScore ?? 0));
		}
		if (xs.length) out.set(t.id, mean(xs));
	}
	return out;
}

/** Task-level value pooled over both models (mean of the models' per-task values). */
function pooled(label: string, metric: "pass" | "score"): Map<string, number> {
	const out = new Map<string, number>();
	const per = MODELS.map((m) => perTask(m, label, metric));
	for (const t of tasks) {
		const vs = per.map((p) => p.get(t.id)).filter((v): v is number => v !== undefined);
		if (vs.length === MODELS.length) out.set(t.id, mean(vs));
	}
	return out;
}

const pct = (x: number) => (Number.isNaN(x) ? "n/a" : `${(x * 100).toFixed(1)}%`);
const sg = (i: { mean: number; lo: number; hi: number }) =>
	Number.isNaN(i.mean) ? "n/a" : `${i.mean >= 0 ? "+" : ""}${i.mean.toFixed(3)} [${i.lo.toFixed(3)}, ${i.hi.toFixed(3)}]`;
const diffs = (a: Map<string, number>, b: Map<string, number>) =>
	[...a.keys()].filter((k) => b.has(k)).map((k) => (a.get(k) as number) - (b.get(k) as number));

const L: string[] = [];
const present = CONDS.filter((c) => Object.keys(cells["haiku-5-5"]?.[c.label] ?? {}).length > 0);

L.push("### Overall (60 tasks x 2 trials x 2 models)", "");
L.push("| condition | haiku-5-5 pass | gpt-6-luna pass | mean pass | check score | gain over no tools [95% CI] | mine minus this [95% CI] | tool calls/run | input tok/run | limit rate |");
L.push("|---|---|---|---|---|---|---|---|---|---|");
const noTools = pooled("no tools", "pass");
const mine = pooled("your server (v2.0.0)", "pass");
for (const c of present) {
	const pp = pooled(c.label, "pass");
	const ps = pooled(c.label, "score");
	const perModel = MODELS.map((m) => mean([...perTask(m, c.label, "pass").values()]));
	const all = MODELS.flatMap((m) => Object.values(cells[m]?.[c.label] ?? {}).flatMap((t) => Object.values(t))).filter(ok);
	const calls = mean(all.map((x) => x.run?.toolCalls.length ?? 0));
	const tok = mean(all.map((x) => x.run?.inputTokens ?? 0));
	const lim = mean(all.map((x) => (x.outcome === "limit_exhausted" ? 1 : 0)));
	const gain = c.label === "no tools" ? "-" : sg(bootstrapMean(diffs(pp, noTools)));
	const vsMine = c.label === "your server (v2.0.0)" || c.label === "no tools" ? "-" : sg(bootstrapMean(diffs(mine, pp)));
	L.push(`| ${c.label} | ${pct(perModel[0] as number)} | ${pct(perModel[1] as number)} | ${pct(mean([...pp.values()]))} | ${pct(mean([...ps.values()]))} | ${gain} | ${vsMine} | ${calls.toFixed(1)} | ${Math.round(tok)} | ${pct(lim)} |`);
}

const GROUPS: [string, number[]][] = [
	["Measurement and lookup (301-304, 308)", [301, 302, 303, 304, 308]],
	["Simulation, interpolation, harmony (305-307)", [305, 306, 307]],
	["Design-system generation (309-310)", [309, 310]],
	["Constraint search and audit (311-312)", [311, 312]],
];
L.push("", "### By capability group (mean pass over both models)", "");
L.push(`| condition | ${GROUPS.map((g) => `${g[0]}`).join(" | ")} |`, `|---|${GROUPS.map(() => "---").join("|")}|`);
for (const c of present) {
	const pp = pooled(c.label, "pass");
	const cols = GROUPS.map(([, cats]) => {
		const ids = tasks.filter((t) => cats.includes(t.category)).map((t) => t.id);
		return pct(mean(ids.map((i) => pp.get(i)).filter((v): v is number => v !== undefined)));
	});
	L.push(`| ${c.label} | ${cols.join(" | ")} |`);
}

L.push("", "### By category (mean pass over both models)", "");
L.push(`| condition | ${categories.map((c) => `${c} ${catName.get(c)}`).join(" | ")} |`, `|---|${categories.map(() => "---").join("|")}|`);
for (const c of present) {
	const pp = pooled(c.label, "pass");
	const cols = categories.map((cat) => {
		const ids = tasks.filter((t) => t.category === cat).map((t) => t.id);
		return pct(mean(ids.map((i) => pp.get(i)).filter((v): v is number => v !== undefined)));
	});
	L.push(`| ${c.label} | ${cols.join(" | ")} |`);
}

L.push("", "### Per model: gain over no tools [95% CI]", "");
L.push("| condition | haiku-5-5 | gpt-6-luna |", "|---|---|---|");
for (const c of present.filter((x) => x.label !== "no tools")) {
	const cols = MODELS.map((m) => sg(bootstrapMean(diffs(perTask(m, c.label, "pass"), perTask(m, "no tools", "pass")))));
	L.push(`| ${c.label} | ${cols.join(" | ")} |`);
}

L.push("", "### Cells and exclusions", "");
for (const m of MODELS)
	for (const c of present) {
		const all = Object.values(cells[m]?.[c.label] ?? {}).flatMap((t) => Object.values(t));
		const done = all.filter(ok).length;
		L.push(`- ${m} / ${c.label}: ${done}/${all.length} cells done`);
	}
console.log(L.join("\n"));
