import { auditCss } from "../../reference/audit.js";
import { hexToRgb, rgbToHex } from "../../reference/color.js";
import { parseCss } from "../../reference/css.js";
import type { Task } from "../types.js";
import { FIX_SEEDS, fixParams, fixPrompt } from "./cat04-07.js";
import {
	buildRamp,
	buildTheme,
	searchDeutanSet,
	THEME_PAIRS,
	THEME_SURFACES,
	THEME_TOKENS,
	themePrompt,
} from "./cat08-11.js";
import {
	contract,
	HEX_SCHEMA,
	makeTask,
	objectSchema,
	round,
} from "./common.js";

const AUDIT_RULES = `Rules (a finding is reported once per rule and selector):
- "text-contrast-aa": a block that has both color and background-color whose WCAG 2 contrast ratio is below 4.5 (treat all text as normal size). selector = the block's selector.
- "nontext-contrast-3": a block that has both border-color and background-color whose contrast ratio is below 3. selector = the block's selector.
- "near-duplicate-token": two different custom properties in :root whose colors have a CIEDE2000 difference below 2 (D65 CIELAB). selector = ":root" and detail = the two property names sorted alphabetically and joined with "|" (for example "--a|--b").
Only report these rules. Do not include a detail field for the first two rules. Compute contrast from the colors rounded to 8-bit sRGB hex.`;

const CSS_SNIPPETS: string[] = [
	`:root { --brand: #2563eb; --brand-hover: #2a65ec; --ink: #111827; }
.btn { color: #ffffff; background-color: #5b9bd5; border-color: #5b9bd5; }
.card { color: #374151; background-color: #f9fafb; border-color: #9ca3af; }
.note { color: #9ca3af; background-color: #ffffff; }`,
	`body { color: #1f2937; background-color: #ffffff; }
a { color: #60a5fa; background-color: #ffffff; }
.badge { color: #92400e; background-color: #fef3c7; border-color: #fef3c7; }
.input { color: #111827; background-color: #ffffff; border-color: #d1d5db; }`,
	`:root { --bg: #ffffff; --fg: #111827; --accent: #1d4ed8; --warn: #b45309; }
body { color: #111827; background-color: #ffffff; }
.panel { color: #0f172a; background-color: #f1f5f9; border-color: #64748b; }
.btn { color: #ffffff; background-color: #1d4ed8; border-color: #bfdbfe; }`,
	`:root { --text: #1a1a1a; --text-soft: #666666; --text-softer: #696969; --line: #cccccc; }
.title { color: #1a1a1a; background-color: #fafafa; }
.hint { color: #888888; background-color: #fafafa; }
.box { color: #444444; background-color: #eeeeee; border-color: #e5e5e5; }`,
];

function auditTask(n: number, css: string) {
	const expected = auditCss(css);
	return makeTask({
		category: 12,
		n,
		prompt: `Audit this CSS for color problems.\n\n\`\`\`css\n${css}\n\`\`\`\n\n${AUDIT_RULES}\n\n${contract('{"findings": [{"rule": "...", "selector": "...", "detail": "... (only for near-duplicate-token)"}]}  (use an empty list if there are no findings)')}`,
		schema: objectSchema({
			findings: { type: "array", items: { type: "object" } },
		}),
		grader: { kind: "audit", params: { expected } },
		witness: { findings: expected },
		invalid: [
			{},
			{
				findings: [
					...expected.slice(1),
					{ rule: "text-contrast-aa", selector: ".nonexistent" },
				],
			},
		],
		toolUseful: true,
	});
}

export function cat12(): Task[] {
	return CSS_SNIPPETS.map((css, i) => auditTask(i + 1, css));
}

const E2E = [
	{
		brand: "#2563eb",
		warn: "#f59e0b",
		chartBg: "#ffffff",
		chartN: 4,
		brief: "a SaaS analytics dashboard",
	},
	{
		brand: "#0d9488",
		warn: "#eab308",
		chartBg: "#ffffff",
		chartN: 4,
		brief: "a health-tracking app",
	},
	{
		brand: "#9333ea",
		warn: "#fb923c",
		chartBg: "#ffffff",
		chartN: 5,
		brief: "a creator marketplace",
	},
	{
		brand: "#be185d",
		warn: "#f0b429",
		chartBg: "#ffffff",
		chartN: 4,
		brief: "a booking site",
	},
];

export function cat13(
	cache: Record<string, { dStar: number; witness: string }>,
): Task[] {
	return E2E.map((e, i) => {
		const fix = fixParams(
			{ fg: e.warn, bg: "#ffffff", target: 4.5, label: "warning text" },
			cache,
		);
		const found = searchDeutanSet(e.chartBg, e.chartN);
		const threshold = round(0.8 * found.minDeutan, 3);
		const prompt = `You are setting up the color system for ${e.brief}. Brand color: ${e.brand}. Deliver four parts.\n\n1. "ramp": an 11-step tonal ramp of the brand color, lightest to darkest, keeping hue, vivid in the middle, evenly spaced in OKLCH lightness from at least 0.95 to at most 0.25, including the brand color itself as one step, all steps distinct.\n\n2. "theme": ${themePrompt(e.brand, "light and dark UI tokens.")}\n\n3. "chart": ${e.chartN} chart series colors on a ${e.chartBg} background that stay distinguishable under deuteranopia (Machado 2009, severity 1.0, linear sRGB): every pair at least ${threshold} CIEDE2000 apart after simulation and at least 10 apart under normal vision; each at least 3:1 contrast against the background; all distinct.\n\n4. "warning": the warning text color ${e.warn} on #ffffff fails 4.5:1; return the closest replacement (same hue, minimal change) that reaches at least 4.5:1, as opaque 8-bit sRGB hex.\n\n${contract('{"ramp": {"steps": [11 hex]}, "theme": {"light": {every token}, "dark": {every token}}, "chart": {"colors": [hex, ...]}, "warning": {"hex": "#rrggbb"}}')}`;
		return makeTask({
			category: 13,
			n: i + 1,
			prompt,
			schema: objectSchema({
				ramp: { type: "object" },
				theme: { type: "object" },
				chart: { type: "object" },
				warning: { type: "object" },
			}),
			grader: {
				kind: "composite",
				params: {
					parts: [
						{
							key: "ramp",
							grader: { kind: "ramp", params: { seed: e.brand } },
						},
						{
							key: "theme",
							grader: {
								kind: "theme",
								params: {
									brand: e.brand,
									tokens: THEME_TOKENS,
									surfaces: THEME_SURFACES,
									pairs: THEME_PAIRS,
								},
							},
						},
						{
							key: "chart",
							grader: {
								kind: "deutan",
								params: { background: e.chartBg, n: e.chartN, threshold },
							},
						},
						{
							key: "warning",
							grader: {
								kind: "fix",
								params: {
									fg: e.warn,
									bg: "#ffffff",
									target: 4.5,
									dStar: fix.dStar,
									hueConstrained: fix.hueConstrained,
								},
							},
						},
					],
				},
			},
			witness: {
				ramp: { steps: buildRamp(e.brand) },
				theme: buildTheme(e.brand),
				chart: { colors: found.colors },
				warning: { hex: fix.witnessHex },
			},
			invalid: [
				{},
				{
					ramp: { steps: [] },
					theme: {},
					chart: { colors: [] },
					warning: { hex: e.warn },
				},
			],
			toolUseful: true,
		});
	});
}

function trapTask(
	n: number,
	question: string,
	shape: string,
	mode: "hex" | "string" | "bool" | "rgb",
	expected: unknown,
	witnessAnswer: unknown,
	wrong: unknown,
) {
	return makeTask({
		category: 14,
		n,
		prompt: `${question}\n\n${contract(shape)}`,
		schema: objectSchema({ answer: {} }, ["answer"]),
		grader: { kind: "trap", params: { mode, expected } },
		witness: { answer: witnessAnswer },
		invalid: [{}, { answer: wrong }],
		toolUseful: false,
	});
}

export function cat14(): Task[] {
	return [
		trapTask(
			1,
			'What is the hex value of the CSS named color "rebeccapurple"?',
			'{"answer": "#rrggbb"}',
			"hex",
			"#663399",
			"#663399",
			"#800080",
		),
		trapTask(
			2,
			"Which has the higher contrast ratio against a white background: the CSS color navy or the CSS color gold? Answer with the color name.",
			'{"answer": "navy" or "gold"}',
			"string",
			"navy",
			"navy",
			"gold",
		),
		trapTask(
			3,
			"Convert the hex color #00ff00 to its rgb() channel values (0 to 255).",
			'{"answer": {"r": number, "g": number, "b": number}}',
			"rgb",
			[0, 255, 0],
			{ r: 0, g: 255, b: 0 },
			{ r: 0, g: 0, b: 255 },
		),
		trapTask(
			4,
			"Is white text (#ffffff) readable on a pure yellow (#ffff00) background at WCAG AA for normal text? Answer true or false.",
			'{"answer": true or false}',
			"bool",
			false,
			false,
			true,
		),
	];
}

export { HEX_SCHEMA, FIX_SEEDS, fixPrompt, hexToRgb, parseCss, rgbToHex };
