// Collates the bench-* runs into one comparison table. Usage: node scripts/bench-compare.mjs > out.md
import { readFileSync } from "node:fs";
const rd = (run) => JSON.parse(readFileSync(`results/${run}/results.json`, "utf8"));
const SERVERS = [
	["your server (main, v2.0.0)", "base", "server@86a9b681"],
	["coolors-mcp 1.1.0 (25 tools)", "coolors-mcp", "coolors-mcp"],
	["mcp-color-convert 0.1.3 (20 tools)", "mcp-color-convert", "mcp-color-convert"],
	["color-theory-mcp 95085b9 (27 tools)", "color-theory-mcp", "color-theory-mcp"],
];
const MODELS = ["haiku-5-5", "gpt-6-luna"];
const pct = (x) => (x == null ? "n/a" : `${(x * 100).toFixed(1)}%`);
const sgn = (p) => (p?.mean == null ? "n/a" : `${p.mean >= 0 ? "+" : ""}${p.mean.toFixed(3)} [${p.lo.toFixed(3)}, ${p.hi.toFixed(3)}]`);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

function cell(suiteKey, id, cond) {
	const r = rd(`bench-${id}-${suiteKey}`);
	const per = (m, c) =>
		r.sealed ? r.aggregates[m][c] : r.dev[m][c];
	const out = { paired: r.sealed ? r.paired : r.paired.dev, models: {} };
	for (const m of MODELS) {
		out.models[m] = { s: per(m, cond), nt: per(m, "no-tools") };
		if (r.heldout) out.models[m].h = r.heldout[m]?.[cond];
		if (r.heldout) out.models[m].hnt = r.heldout[m]?.["no-tools"];
	}
	return out;
}
const lines = [];
const suites = [
	["v1", "Suite v1 (dev split, 42 tasks x 2 trials per model)"],
	["gen", "Generalization suite (dev only, 28 tasks)"],
	["fresh", "Fresh suite (sealed, 32 tasks, aggregates only)"],
];
for (const [key, title] of suites) {
	lines.push(`### ${title}`, "", "| condition | haiku-5-5 pass | gpt-6-luna pass | mean pass | paired diff vs no-tools, pooled [95% CI] | tool calls/run | input tok/run |", "|---|---|---|---|---|---|---|");
	const first = cell(key, "base", "server@86a9b681");
	const nt = MODELS.map((m) => first.models[m].nt);
	lines.push(`| no tools | ${nt.map((x) => pct(x.pass)).join(" | ")} | ${pct(mean(nt.map((x) => x.pass)))} | - | 0 | ${Math.round(mean(nt.map((x) => x.inputTokens)))} |`);
	for (const [label, id, cond] of SERVERS) {
		const c = cell(key, id, cond);
		const s = MODELS.map((m) => c.models[m].s);
		lines.push(`| ${label} | ${s.map((x) => pct(x.pass)).join(" | ")} | ${pct(mean(s.map((x) => x.pass)))} | ${sgn(c.paired.pooled)} | ${mean(s.map((x) => x.toolCalls)).toFixed(1)} | ${Math.round(mean(s.map((x) => x.inputTokens)))} |`);
	}
	lines.push("");
}
// v1 held-out aggregate (14 tasks)
lines.push("### Suite v1 held-out split (14 tasks, aggregate only)", "", "| condition | haiku-5-5 pass | gpt-6-luna pass | mean pass |", "|---|---|---|---|");
const f = cell("v1", "base", "server@86a9b681");
const hn = MODELS.map((m) => f.models[m].hnt);
lines.push(`| no tools | ${hn.map((x) => pct(x.pass)).join(" | ")} | ${pct(mean(hn.map((x) => x.pass)))} |`);
for (const [label, id, cond] of SERVERS) {
	const h = MODELS.map((m) => cell("v1", id, cond).models[m].h);
	lines.push(`| ${label} | ${h.map((x) => pct(x.pass)).join(" | ")} | ${pct(mean(h.map((x) => x.pass)))} |`);
}
lines.push("", "### Per model: paired difference vs no-tools (server minus no-tools, per-task, task-clustered bootstrap)", "", "| condition | suite | haiku-5-5 | gpt-6-luna |", "|---|---|---|---|");
for (const [label, id] of SERVERS)
	for (const [key] of suites) {
		const c = cell(key, id, SERVERS.find((s) => s[1] === id)[2]);
		lines.push(`| ${label} | ${key} | ${sgn(c.paired["haiku-5-5"])} | ${sgn(c.paired["gpt-6-luna"])} |`);
	}
console.log(lines.join("\n"));
