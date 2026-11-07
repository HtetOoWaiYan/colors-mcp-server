import { connectServer, type ServerSpec } from "./runner/mcp-bridge.js";
import type { Provider, ToolHost } from "./runner/types.js";

export interface PreflightResult {
	name: string;
	ok: boolean;
	detail: string;
}

interface ToolCase {
	valid: Record<string, unknown>;
	defaulted?: Record<string, unknown>;
	invalid: Record<string, unknown>;
	unknownColor?: Record<string, unknown>;
}

export const BASELINE_CASES: Record<string, ToolCase> = {
	colors_convert: {
		valid: { color: "#3b82f6", to: "oklch", precision: 3 },
		defaulted: { color: "#3b82f6", to: "rgb" },
		invalid: { color: "#3b82f6", to: "notaspace" },
		unknownColor: { color: "bluish", to: "hex" },
	},
	colors_batch_convert: {
		valid: { colors: ["#3b82f6", "red"], to: "hsl" },
		defaulted: { colors: ["#fff"], to: "hex" },
		invalid: { colors: [], to: "hex" },
		unknownColor: { colors: ["bluish"], to: "hex" },
	},
	colors_parse: {
		valid: { color: "tomato" },
		invalid: { color: 5 },
		unknownColor: { color: "bluish" },
	},
	colors_adjust: {
		valid: {
			color: "#3b82f6",
			mode: "lightness",
			amount: -0.1,
			relative: false,
		},
		defaulted: { color: "#3b82f6", mode: "chroma", amount: 0.02 },
		invalid: { color: "#3b82f6", mode: "sparkle", amount: 1 },
		unknownColor: { color: "bluish", mode: "hue", amount: 10 },
	},
	colors_batch_adjust: {
		valid: { colors: ["#3b82f6", "#f97316"], mode: "hue", amount: 30 },
		defaulted: { colors: ["#fff"], mode: "lightness", amount: -0.1 },
		invalid: { colors: "x", mode: "hue", amount: 1 },
		unknownColor: { colors: ["bluish"], mode: "hue", amount: 1 },
	},
	colors_mix: {
		valid: { color1: "#2563eb", color2: "#f97316", ratio: 0.5, mode: "oklch" },
		defaulted: { color1: "red", color2: "blue" },
		invalid: { color1: "red", color2: "blue", ratio: 2 },
		unknownColor: { color1: "bluish", color2: "red" },
	},
	colors_scale: {
		valid: { colors: ["#fff", "#2563eb"], steps: 5, mode: "oklch" },
		defaulted: { colors: ["#fff", "#000"] },
		invalid: { colors: ["#fff"] },
		unknownColor: { colors: ["bluish", "red"] },
	},
	colors_difference: {
		valid: { color1: "#fff", color2: "#000", metric: "deltaE" },
		defaulted: { color1: "red", color2: "blue" },
		invalid: { color1: "red", color2: "blue", metric: "vibes" },
		unknownColor: { color1: "bluish", color2: "red" },
	},
	colors_batch_difference: {
		valid: {
			reference: "#2563eb",
			candidates: ["#1d4ed8", "#f97316"],
			metric: "deltaE",
		},
		defaulted: { reference: "red", candidates: ["blue"] },
		invalid: { reference: "red", candidates: [] },
		unknownColor: { reference: "bluish", candidates: ["red"] },
	},
	colors_contrast: {
		valid: { foreground: "#767676", background: "#ffffff" },
		defaulted: { foreground: "#000", background: "#fff" },
		invalid: { foreground: 1, background: "#fff" },
		unknownColor: { foreground: "bluish", background: "#fff" },
	},
	colors_batch_contrast: {
		valid: { checks: [{ foreground: "#767676", background: "#ffffff" }] },
		defaulted: { foregrounds: ["#000"], backgrounds: ["#fff"] },
		invalid: { checks: "x" },
		unknownColor: { checks: [{ foreground: "bluish", background: "#fff" }] },
	},
};

export const V2_CASES: Record<string, ToolCase> = {
	colors_check: {
		valid: { foreground: "#767676", background: "#ffffff" },
		defaulted: { pairs: [{ foreground: "#000", background: "#fff" }] },
		invalid: { foreground: "#000", background: "#fff", level: "Z" },
		unknownColor: { foreground: "bluish", background: "#fff" },
	},
	colors_find: {
		valid: { hueMin: 140, hueMax: 165, chromaMin: 0.1 },
		defaulted: { hueMin: 200, hueMax: 220 },
		invalid: { count: 99 },
		unknownColor: { against: [{ color: "bluish" }] },
	},
	colors_scrim: {
		valid: { text: "#ffffff", overlay: "#000000", regions: ["#cccccc"] },
		defaulted: { text: "#fff", overlay: "#000", regions: ["#ddd"] },
		invalid: { text: "#fff", overlay: "#000", regions: [] },
		unknownColor: { text: "bluish", overlay: "#000", regions: ["#ddd"] },
	},
	colors_fix: {
		valid: { foreground: "#7a9bd1", background: "#ffffff", target: 4.5 },
		defaulted: { foreground: "#777", background: "#fff" },
		invalid: { foreground: "#777", background: "#fff", target: 99 },
		unknownColor: { foreground: "bluish", background: "#fff" },
	},
	colors_palette: {
		valid: { kind: "ramp", color: "#2563eb" },
		defaulted: { kind: "categorical" },
		invalid: { kind: "rainbow" },
		unknownColor: { kind: "theme", color: "bluish" },
	},
	colors_audit: {
		valid: { css: ".a { color: #999; background-color: #fff; }" },
		invalid: { css: 5 },
		unknownColor: { css: "" },
	},
	colors_info: {
		valid: { colors: ["tomato"] },
		invalid: { colors: "tomato" },
		unknownColor: { colors: [] },
	},
	colors_convert: {
		valid: { colors: ["#3b82f6"], to: "oklch" },
		defaulted: { colors: ["#fff"], to: "hex" },
		invalid: { colors: ["#fff"], to: "cmyk" },
		unknownColor: { colors: ["bluish"], to: "hex" },
	},
	colors_compare: {
		valid: { color: "#2563eb", candidates: ["#1d4ed8", "#f97316"] },
		defaulted: { color: "red", candidates: ["blue"] },
		invalid: { color: "red", candidates: [] },
		unknownColor: { color: "bluish", candidates: ["red"] },
	},
	colors_blend: {
		valid: { colors: ["#2563eb", "#f97316"], steps: 5 },
		defaulted: { colors: ["#000", "#fff"] },
		invalid: { colors: ["#000"] },
		unknownColor: { colors: ["bluish", "red"] },
	},
	colors_adjust: {
		valid: { colors: ["#3b82f6"], property: "lightness", amount: -0.1 },
		defaulted: { colors: ["#fff"], property: "chroma", amount: 0.01 },
		invalid: { colors: ["#fff"], property: "sparkle", amount: 1 },
		unknownColor: { colors: ["bluish"], property: "hue", amount: 10 },
	},
	colors_harmony: {
		valid: { color: "#cc7455", scheme: "triadic" },
		invalid: { color: "#cc7455", scheme: "rainbow" },
		unknownColor: { color: "bluish", scheme: "triadic" },
	},
	colors_vision: {
		valid: { colors: ["#d62728", "#2ca02c"], type: "deuteranopia" },
		defaulted: { colors: ["#ff0000"] },
		invalid: { colors: ["#fff"], type: "blindness" },
		unknownColor: { colors: ["bluish"] },
	},
};

export async function preflightServer(
	spec: ServerSpec,
	cases: Record<string, ToolCase> = BASELINE_CASES,
	expectedTools: number | null = 11,
): Promise<{
	results: PreflightResult[];
	protocolVersion?: string;
	tools: string[];
}> {
	const results: PreflightResult[] = [];
	const push = (name: string, ok: boolean, detail: string) =>
		results.push({ name, ok, detail });
	let host: ToolHost;
	try {
		host = await connectServer(spec);
	} catch (e) {
		push("spawn+listTools", false, (e as Error).message);
		return { results, tools: [] };
	}
	const tools = host.tools.map((t) => t.name);
	push(
		"protocol negotiated",
		Boolean(host.protocolVersion),
		host.protocolVersion ?? "not captured",
	);
	push(
		"tool count",
		expectedTools === null || tools.length === expectedTools,
		`${tools.length} tools: ${tools.join(", ")}`,
	);
	for (const name of tools) {
		const c = cases[name];
		if (!c) {
			push(`${name}: case defined`, false, "no preflight case for this tool");
			continue;
		}
		const run = async (
			label: string,
			args: Record<string, unknown>,
			expectError: boolean,
		) => {
			const out = await host.call(name, args, 15_000);
			const forwarded = out.text.trim().length > 0;
			push(
				`${name}: ${label}`,
				out.isError === expectError && forwarded,
				`isError=${out.isError} schemaRejection=${out.schemaRejection} text=${JSON.stringify(out.text.slice(0, 80))}`,
			);
		};
		await run("valid input", c.valid, false);
		if (c.defaulted) await run("defaulted input", c.defaulted, false);
		await run("invalid input", c.invalid, true);
		if (c.unknownColor) await run("unknown color", c.unknownColor, true);
	}
	await host.close();
	push("clean close", true, "close() resolved");
	return { results, protocolVersion: host.protocolVersion, tools };
}

export async function preflightProvider(
	provider: Provider,
): Promise<PreflightResult[]> {
	const results: PreflightResult[] = [];
	const tools = [
		{
			name: "get_alpha",
			description: "Returns the value of alpha.",
			inputSchema: {
				type: "object",
				properties: {},
				additionalProperties: false,
			},
		},
		{
			name: "get_beta",
			description: "Returns the value of beta.",
			inputSchema: {
				type: "object",
				properties: {},
				additionalProperties: false,
			},
		},
	];
	try {
		const t1 = await provider.chat({
			system: "Use tools when needed.",
			messages: [
				{
					role: "user",
					text: "Call get_alpha and get_beta now, both in the same response, then wait for the results.",
				},
			],
			tools,
			maxTokens: 512,
		});
		results.push({
			name: `${provider.id}: tool call round-trip`,
			ok: t1.toolCalls.length >= 1,
			detail: `calls=${t1.toolCalls.length} model=${t1.model} stop=${t1.stop}`,
		});
		results.push({
			name: `${provider.id}: multi-call turn (informational)`,
			ok: true,
			detail: `calls in one turn: ${t1.toolCalls.length}`,
		});
		const results1 = t1.toolCalls.map((c) => ({
			id: c.id,
			name: c.name,
			text: c.name === "get_alpha" ? "alpha=1" : "beta=2",
			isError: false,
		}));
		const t2 = await provider.chat({
			system: "Use tools when needed.",
			messages: [
				{
					role: "user",
					text: "Call get_alpha and get_beta now, both in the same response, then wait for the results.",
				},
				{ role: "assistant", text: t1.text, toolCalls: t1.toolCalls },
				{ role: "tool", results: results1 },
			],
			tools,
			maxTokens: 512,
		});
		results.push({
			name: `${provider.id}: tool results accepted`,
			ok: t2.text.length > 0 || t2.toolCalls.length > 0,
			detail: `stop=${t2.stop} text=${JSON.stringify(t2.text.slice(0, 60))}`,
		});
	} catch (e) {
		results.push({
			name: `${provider.id}: tool call round-trip`,
			ok: false,
			detail: (e as Error).message,
		});
	}
	try {
		const t = await provider.chat({
			system: "Use tools when needed.",
			messages: [
				{ role: "user", text: "Call get_alpha." },
				{
					role: "assistant",
					text: "",
					toolCalls: [
						{
							id: "call_bad_1",
							name: "get_alpha",
							args: "{oops",
							argsError: "Unexpected token o",
						},
					],
				},
				{
					role: "tool",
					results: [
						{
							id: "call_bad_1",
							name: "get_alpha",
							text: "Tool call rejected: the arguments were not valid JSON. Send a JSON object.",
							isError: true,
						},
					],
				},
			],
			tools,
			maxTokens: 512,
		});
		results.push({
			name: `${provider.id}: malformed-argument turn accepted`,
			ok: true,
			detail: `stop=${t.stop} calls=${t.toolCalls.length}`,
		});
	} catch (e) {
		results.push({
			name: `${provider.id}: malformed-argument turn accepted`,
			ok: false,
			detail: (e as Error).message,
		});
	}
	return results;
}
