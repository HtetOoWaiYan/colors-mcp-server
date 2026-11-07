// Ceiling for a model that always picks the right tool; also exposes server-vs-grader disagreements.
// Held-out tasks report an aggregate pass count only, never itemised failures.
import { grade } from "./graders/index.js";
import { connectServer, type ServerSpec } from "./runner/mcp-bridge.js";
import { loadSuite } from "./tasks/load.js";
import type { Task } from "./tasks/types.js";

type Answer = unknown;
type Json = Record<string, any>;

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// The TNI bridge drops structuredContent, which the oracle needs.
async function rawClient(spec: ServerSpec) {
	const transport = new StdioClientTransport({
		command: spec.command,
		args: spec.args,
		cwd: spec.cwd,
		stderr: "ignore",
	});
	const client = new Client({ name: "oracle", version: "0" });
	await client.connect(transport);
	const sc = async (name: string, args: Json): Promise<Json> => {
		const r = (await client.callTool({ name, arguments: args })) as {
			isError?: boolean;
			structuredContent?: Json;
			content?: { text?: string }[];
		};
		if (r.isError) throw new Error(`${name}: ${r.content?.[0]?.text}`);
		return r.structuredContent ?? {};
	};
	return { sc, close: () => client.close() };
}

function oklchParts(s: string): [number, number, number] {
	const m = /oklch\(([-\d.]+) ([-\d.]+) ([-\d.]+)/.exec(s);
	if (!m) throw new Error(`not oklch: ${s}`);
	return [Number(m[1]), Number(m[2]), Number(m[3])];
}
function oklabParts(s: string): [number, number, number] {
	const m = /oklab\(([-\d.]+) ([-\d.]+) ([-\d.]+)/.exec(s);
	if (!m) throw new Error(`not oklab: ${s}`);
	return [Number(m[1]), Number(m[2]), Number(m[3])];
}
function p3Parts(s: string): [number, number, number] {
	const m = /display-p3 ([-\d.]+) ([-\d.]+) ([-\d.]+)/.exec(s);
	if (!m) throw new Error(`not p3: ${s}`);
	return [Number(m[1]), Number(m[2]), Number(m[3])];
}

type Tool = (name: string, args: Json) => Promise<Json>;

const solvers: Record<number, (t: Task, tool: Tool) => Promise<Answer>> = {
	1: async (t, tool) => {
		const lines = [
			...t.prompt.matchAll(/^\d+\. (.+?) -> (hex|oklch|oklab|p3):/gm),
		];
		const results = [];
		for (const m of lines) {
			const to = m[2] as string;
			const r = await tool("colors_convert", {
				colors: [m[1]],
				to: to === "p3" ? "p3" : to,
				precision: 4,
			});
			const out = String(r.results[0].output);
			if (to === "hex") results.push({ hex: out });
			else if (to === "oklch") {
				const [l, c, h] = oklchParts(out);
				results.push({ l, c, h });
			} else if (to === "oklab") {
				const [l, a, b] = oklabParts(out);
				results.push({ l, a, b });
			} else {
				const [r1, g, b] = p3Parts(out);
				results.push({ r: r1, g, b });
			}
		}
		return { results };
	},
	2: async (t, tool) => {
		const inputs = [...t.prompt.matchAll(/^\d+\. (".*")$/gm)].map(
			(m) => JSON.parse(m[1] as string) as string,
		);
		const info = await tool("colors_info", { colors: inputs });
		return {
			results: info.results.map((r: Json) => ({
				input: r.input,
				valid: r.valid,
				hex: r.valid ? String(r.hex).slice(0, 7) : null,
				alpha: r.valid ? r.alpha : null,
			})),
		};
	},
	3: async (t, tool) => {
		const results = [];
		for (const m of t.prompt.matchAll(
			/^\d+\. text (#[0-9a-f]{6})(?: at ([\d.]+) opacity)? on background (#[0-9a-f]{6}), required ratio ([\d.]+):1$/gm,
		)) {
			const fg = m[2]
				? `rgba(${[1, 3, 5].map((i) => Number.parseInt((m[1] as string).slice(i, i + 2), 16)).join(",")},${m[2]})`
				: (m[1] as string);
			const r = await tool("colors_check", {
				foreground: fg,
				background: m[3],
				size: "normal",
				level: "AA",
			});
			// The prompt states its own thresholds, so judge the ratio rather than the tool's level.
			const ratio = r.results[0].ratio as number;
			results.push({ pass: ratio >= Number(m[4]), ratio });
		}
		return { results };
	},
	4: async (t, tool) => {
		const m =
			/text color (#[0-9a-f]{6}) on background (#[0-9a-f]{6}) and must reach a WCAG 2 contrast ratio of at least ([\d.]+):1/.exec(
				t.prompt,
			);
		if (!m) throw new Error("c4 prompt shape");
		const r = await tool("colors_fix", {
			foreground: m[1],
			background: m[2],
			target: Number(m[3]),
		});
		return { hex: r.color };
	},
	5: async (t, tool) => {
		const results = [];
		for (const m of t.prompt.matchAll(/^\d+\. (#[0-9a-f]{6}): (.+)$/gm)) {
			let color = m[1] as string;
			for (const part of (m[2] as string).split(", then ")) {
				let property: string;
				let mode: string;
				let amount: number;
				let x: RegExpExecArray | null;
				if ((x = /^(lower|raise) OKLCH lightness by ([\d.]+)/.exec(part))) {
					property = "lightness";
					mode = "add";
					amount = (x[1] === "lower" ? -1 : 1) * Number(x[2]);
				} else if ((x = /^set OKLCH lightness to ([\d.]+)/.exec(part))) {
					property = "lightness";
					mode = "set";
					amount = Number(x[1]);
				} else if (
					(x = /^rotate the OKLCH hue by ([-+\d.]+) degrees/.exec(part))
				) {
					property = "hue";
					mode = "add";
					amount = Number(x[1]);
				} else if ((x = /^multiply the OKLCH chroma by ([\d.]+)/.exec(part))) {
					property = "chroma";
					mode = "multiply";
					amount = Number(x[1]);
				} else throw new Error(`unparsed op: ${part}`);
				const r = await tool("colors_adjust", {
					colors: [color],
					property,
					mode,
					amount,
				});
				color = r.results[0].output;
			}
			results.push({ hex: color });
		}
		return { results };
	},
	6: async (t, tool) => {
		const m = /(\d+)-stop gradient from (#[0-9a-f]{6}) to (#[0-9a-f]{6})/.exec(
			t.prompt,
		);
		if (!m) throw new Error("c6 prompt shape");
		const r = await tool("colors_blend", {
			colors: [m[2], m[3]],
			steps: Number(m[1]),
		});
		return { stops: r.colors };
	},
	7: async (t, tool) => {
		const ref = /reference (#[0-9a-f]{6})/.exec(t.prompt)?.[1];
		const cands = /Candidates: ([^\n]+)/.exec(t.prompt)?.[1]?.split(", ");
		const r = await tool("colors_compare", { color: ref, candidates: cands });
		return { nearest: r.nearest, order: r.ranking.map((x: Json) => x.color) };
	},
	8: async (t, tool) => {
		const seed = /brand color (#[0-9a-f]{6})/.exec(t.prompt)?.[1];
		const r = await tool("colors_palette", {
			kind: "ramp",
			color: seed,
			steps: 11,
		});
		return { steps: r.colors };
	},
	9: async (t, tool) => {
		const brand = /brand color (#[0-9a-f]{6})/.exec(t.prompt)?.[1];
		const r = await tool("colors_palette", { kind: "theme", color: brand });
		return r.theme;
	},
	10: async (t, tool) => {
		const base = /base color (#[0-9a-f]{6})/.exec(t.prompt)?.[1];
		const scheme = /Build a ([a-z-]+) color scheme/.exec(t.prompt)?.[1];
		const r = await tool("colors_harmony", { color: base, scheme });
		return { colors: r.colors.map((c: Json) => c.color) };
	},
	11: async (t, tool) => {
		const m = /Choose (\d+) colors .* on a (#[0-9a-f]{6}) background/.exec(
			t.prompt,
		);
		if (!m) throw new Error("c11 prompt shape");
		const r = await tool("colors_palette", {
			kind: "categorical",
			count: Number(m[1]),
			background: m[2],
			cvd: "deuteranopia",
		});
		return { colors: r.colors };
	},
	12: async (t, tool) => {
		const css = /```css\n([\s\S]*?)\n```/.exec(t.prompt)?.[1];
		const r = await tool("colors_audit", { css });
		return {
			findings: r.findings.map((f: Json) => ({
				rule: f.rule,
				selector: f.selector,
				...(f.detail ? { detail: f.detail } : {}),
			})),
		};
	},
	13: async (t, tool) => {
		const brand = /Brand color: (#[0-9a-f]{6})/.exec(t.prompt)?.[1];
		const warn = /warning text color (#[0-9a-f]{6}) on #ffffff/.exec(
			t.prompt,
		)?.[1];
		const chart =
			/"chart": (\d+) chart series colors on a (#[0-9a-f]{6}) background/.exec(
				t.prompt,
			);
		const ramp = await tool("colors_palette", {
			kind: "ramp",
			color: brand,
			steps: 11,
		});
		const theme = await tool("colors_palette", { kind: "theme", color: brand });
		const cat = await tool("colors_palette", {
			kind: "categorical",
			count: Number(chart?.[1]),
			background: chart?.[2],
			cvd: "deuteranopia",
		});
		const fix = await tool("colors_fix", {
			foreground: warn,
			background: "#ffffff",
			target: 4.5,
		});
		return {
			ramp: { steps: ramp.colors },
			theme: theme.theme,
			chart: { colors: cat.colors },
			warning: { hex: fix.color },
		};
	},
	14: async (t) => {
		const g = t.grader.params;
		return {
			answer:
				g.mode === "rgb"
					? { r: g.expected[0], g: g.expected[1], b: g.expected[2] }
					: g.expected,
		};
	},
};

export interface OracleResult {
	byCategory: Record<
		number,
		{
			dev: { id: string; pass: boolean; failed: string[] }[];
			heldoutPassed: number;
			heldoutTotal: number;
		}
	>;
}

export async function runOracle(spec: ServerSpec): Promise<OracleResult> {
	const { tasks } = loadSuite();
	const { sc, close } = await rawClient(spec);
	const out: OracleResult = { byCategory: {} };
	try {
		for (const t of tasks) {
			const cat = (out.byCategory[t.category] ??= {
				dev: [],
				heldoutPassed: 0,
				heldoutTotal: 0,
			});
			let checks;
			try {
				const answer = await (
					solvers[t.category] as (t: Task, tool: Tool) => Promise<Answer>
				)(t, sc);
				checks = grade(t.grader, answer);
			} catch (e) {
				checks = [
					{
						name: `oracle_error: ${(e as Error).message.slice(0, 120)}`,
						pass: false,
					},
				];
			}
			const pass = checks.every((c) => c.pass);
			if (t.split === "dev")
				cat.dev.push({
					id: t.id,
					pass,
					failed: checks.filter((c) => !c.pass).map((c) => c.name),
				});
			else {
				cat.heldoutTotal++;
				if (pass) cat.heldoutPassed++;
			}
		}
	} finally {
		await close();
	}
	return out;
}

export function formatOracle(r: OracleResult): string {
	const lines: string[] = [];
	let devPass = 0;
	let devTotal = 0;
	let hPass = 0;
	let hTotal = 0;
	for (const c of Object.values(r.byCategory)) {
		for (const d of c.dev) {
			devTotal++;
			if (d.pass) devPass++;
			else lines.push(`dev FAIL ${d.id}: ${d.failed.join(", ")}`);
		}
		hPass += c.heldoutPassed;
		hTotal += c.heldoutTotal;
	}
	lines.push(
		`oracle: dev ${devPass}/${devTotal}, held-out ${hPass}/${hTotal} (aggregate only)`,
	);
	return lines.join("\n");
}
