import type { ThemeParams } from "../../graders/color-tasks.js";
import {
	contrastRatio,
	deutanDeltaE,
	hexDeltaE2000,
	hexOkDistance,
	hexToRgb,
	minPairwise,
	type Oklch,
	rgbToHex,
} from "../../reference/color.js";
import type { Task } from "../types.js";
import {
	contract,
	HEX_SCHEMA,
	hexOfOklch,
	makeTask,
	mapped,
	objectSchema,
	oklchOf,
	round,
} from "./common.js";

export function buildRamp(seed: string): string[] {
	const s = oklchOf(seed);
	const top = 0.97;
	const bottom = 0.2;
	let k = Math.round((10 * (top - s.L)) / (top - bottom));
	k = Math.min(9, Math.max(1, k));
	const steps: string[] = [];
	for (let i = 0; i <= 10; i++) {
		if (i === k) {
			steps.push(rgbToHex(hexToRgb(seed)));
			continue;
		}
		const L =
			i < k
				? top - ((top - s.L) * i) / k
				: s.L - ((s.L - bottom) * (i - k)) / (10 - k);
		steps.push(mapped({ L, C: s.C, H: s.H }).hex);
	}
	return steps;
}

function rampTask(n: number, seed: string) {
	const witness = { steps: buildRamp(seed) };
	return makeTask({
		category: 8,
		n,
		prompt: `Build an 11-step tonal ramp (a design-system color scale) for the brand color ${seed}. Step 1 is the lightest and step 11 the darkest. The ramp should keep the brand hue, include the brand color itself as one of the steps, use evenly spaced lightness (perceptually, in OKLCH) from very light (OKLCH lightness at least 0.95) to dark (at most 0.25), keep the color vivid in the middle rather than turning gray, and every step must be a distinct opaque sRGB hex.\n\n${contract('{"steps": [11 hex strings, lightest to darkest]}')}`,
		schema: objectSchema({ steps: { type: "array", items: HEX_SCHEMA } }),
		grader: { kind: "ramp", params: { seed } },
		witness,
		invalid: [
			{},
			// grayscale ramp: right count and lightness, no color
			{
				steps: Array.from({ length: 11 }, (_, i) =>
					hexOfOklch(0.97 - (0.77 * i) / 10, 0, 0),
				),
			},
		],
		toolUseful: true,
	});
}

export function cat8(): Task[] {
	return [
		rampTask(1, "#2563eb"),
		rampTask(2, "#16a34a"),
		rampTask(3, "#e11d48"),
		rampTask(4, "#9333ea"),
	];
}

export const THEME_TOKENS = [
	"background",
	"surface",
	"surface-raised",
	"text",
	"text-muted",
	"primary",
	"on-primary",
];
export const THEME_SURFACES = ["background", "surface", "surface-raised"];
export const THEME_PAIRS = [
	{ text: "text", surface: "background", min: 7 },
	{ text: "text", surface: "surface-raised", min: 4.5 },
	{ text: "text-muted", surface: "surface", min: 4.5 },
	{ text: "on-primary", surface: "primary", min: 4.5 },
	{ text: "primary", surface: "background", min: 3 },
];

const bestText = (bg: string) =>
	contrastRatio("#ffffff", bg) >= contrastRatio("#000000", bg)
		? "#ffffff"
		: "#000000";

export function buildTheme(brand: string): {
	light: Record<string, string>;
	dark: Record<string, string>;
} {
	const light = {
		background: "#ffffff",
		surface: "#f4f6f9",
		"surface-raised": "#e8ecf1",
		text: "#0f172a",
		"text-muted": "#475569",
		primary: rgbToHex(hexToRgb(brand)),
		"on-primary": bestText(brand),
	};
	const dark: Record<string, string> = {
		background: "#0b1120",
		surface: "#151c2c",
		"surface-raised": "#1f2937",
		text: "#f1f5f9",
		"text-muted": "#aab4c3",
	};
	const b = oklchOf(brand);
	for (let L = Math.min(b.L, 0.9); L <= 0.95; L += 0.01) {
		const hex = mapped({ ...b, L }).hex;
		if (
			contrastRatio(hex, dark.background as string) >= 3 &&
			contrastRatio(bestText(hex), hex) >= 4.5
		) {
			dark.primary = hex;
			dark["on-primary"] = bestText(hex);
			break;
		}
	}
	return { light, dark };
}

export function themePrompt(brand: string, intro: string): string {
	return `${intro} Define design tokens for a light theme and a dark theme with the brand color ${brand}. Tokens (all opaque sRGB hex): ${THEME_TOKENS.join(", ")}.\nRequirements in BOTH themes: text on background at least 7:1; text on surface-raised at least 4.5:1; text-muted on surface at least 4.5:1; on-primary on primary at least 4.5:1; primary against background at least 3:1; background, surface and surface-raised must be three clearly different lightness levels (at least 0.02 apart in OKLCH lightness). In the light theme, primary must be the brand color or a barely adjusted version of it (within 0.04 in Oklab distance).`;
}

function themeTask(n: number, brand: string) {
	const params: ThemeParams = {
		brand,
		tokens: THEME_TOKENS,
		surfaces: THEME_SURFACES,
		pairs: THEME_PAIRS,
	};
	return makeTask({
		category: 9,
		n,
		prompt: `${themePrompt(brand, "Create a UI theme.")}\n\n${contract('{"light": {"background": "#rrggbb", ... every token}, "dark": {... every token}}')}`,
		schema: objectSchema({
			light: { type: "object" },
			dark: { type: "object" },
		}),
		grader: { kind: "theme", params },
		witness: buildTheme(brand),
		toolUseful: true,
	});
}

export function cat9(): Task[] {
	return [
		themeTask(1, "#2563eb"),
		themeTask(2, "#0d9488"),
		themeTask(3, "#9333ea"),
		themeTask(4, "#be185d"),
	];
}

const SCHEMES: Record<string, number[]> = {
	complementary: [0, 180],
	triadic: [0, 120, 240],
	analogous: [-30, 0, 30],
	"split-complementary": [0, 150, 210],
	tetradic: [0, 90, 180, 270],
};

function harmonyTask(n: number, base: Oklch, scheme: keyof typeof SCHEMES) {
	const baseHex = hexOfOklch(base.L, base.C, base.H);
	const b = oklchOf(baseHex);
	const offsets = SCHEMES[scheme] as number[];
	const colors = offsets.map((o) =>
		hexOfOklch(b.L, b.C, (b.H + o + 360) % 360),
	);
	return makeTask({
		category: 10,
		n,
		prompt: `Build a ${scheme} color scheme from the base color ${baseHex}. Use OKLCH hue offsets of ${offsets.join(", ")} degrees from the base hue (so ${offsets.length} colors, one per offset, including the base itself at offset 0 when it is listed). Keep each color's lightness within 0.08 of the base and its chroma at least 60% of the base chroma; use opaque sRGB hex.\n\n${contract(`{"colors": [${offsets.length} hex strings]}`)}`,
		schema: objectSchema({ colors: { type: "array", items: HEX_SCHEMA } }),
		grader: { kind: "harmony", params: { base: baseHex, offsets } },
		witness: { colors },
		invalid: [{}, { colors: offsets.map(() => baseHex) }],
		toolUseful: true,
	});
}

export function cat10(): Task[] {
	return [
		harmonyTask(1, { L: 0.65, C: 0.12, H: 40 }, "complementary"),
		harmonyTask(2, { L: 0.7, C: 0.1, H: 200 }, "triadic"),
		harmonyTask(3, { L: 0.6, C: 0.14, H: 300 }, "split-complementary"),
		harmonyTask(4, { L: 0.68, C: 0.11, H: 120 }, "tetradic"),
	];
}

// Best-effort: greedy maximin over a coarse sRGB grid.
export function searchDeutanSet(
	background: string,
	n: number,
): { colors: string[]; minDeutan: number } {
	const pool: string[] = [];
	const levels = [0, 51, 102, 153, 204, 255];
	for (const r of levels) {
		for (const g of levels) {
			for (const b of levels) {
				const hex = rgbToHex([r / 255, g / 255, b / 255]);
				if (contrastRatio(hex, background) >= 3) pool.push(hex);
			}
		}
	}
	const chosen: string[] = [];
	const first = [...pool].sort(
		(a, b) => hexDeltaE2000(b, background) - hexDeltaE2000(a, background),
	)[0] as string;
	chosen.push(first);
	while (chosen.length < n) {
		let best = "";
		let bestScore = -1;
		for (const c of pool) {
			if (chosen.includes(c)) continue;
			if (chosen.some((x) => hexDeltaE2000(c, x) < 10)) continue;
			const score = Math.min(...chosen.map((x) => deutanDeltaE(c, x)));
			if (score > bestScore) {
				bestScore = score;
				best = c;
			}
		}
		if (!best) throw new Error("deutan search ran out of candidates");
		chosen.push(best);
	}
	return { colors: chosen, minDeutan: minPairwise(chosen, deutanDeltaE) };
}

function deutanTask(
	n: number,
	background: string,
	count: number,
	usage: string,
) {
	const found = searchDeutanSet(background, count);
	const threshold = round(0.8 * found.minDeutan, 3);
	return makeTask({
		category: 11,
		n,
		prompt: `Choose ${count} colors for ${usage} on a ${background} background that stay distinguishable for people with deuteranopia (red-green color blindness). Simulate deuteranopia with the Machado 2009 matrix at severity 1.0 applied to linear sRGB (clip to 0..1); then every pair of your colors must differ by CIEDE2000 (D65 CIELAB, no chromatic adaptation) of at least ${threshold} after simulation, and by at least 10 under normal vision. Each color needs a WCAG contrast of at least 3:1 against the background, and all colors must be distinct opaque sRGB hex.\n\n${contract(`{"colors": [${count} hex strings]}`)}`,
		schema: objectSchema({ colors: { type: "array", items: HEX_SCHEMA } }),
		grader: { kind: "deutan", params: { background, n: count, threshold } },
		witness: { colors: found.colors },
		invalid: [
			{},
			{
				colors: [
					"#ff0000",
					"#00aa00",
					"#ff6600",
					"#aa8800",
					"#cc0000",
					"#009900",
				].slice(0, count),
			},
		],
		toolUseful: true,
	});
}

export function cat11(): Task[] {
	return [
		deutanTask(1, "#ffffff", 4, "chart series"),
		deutanTask(2, "#111827", 5, "status badges"),
		deutanTask(3, "#f5f5f4", 4, "map regions"),
		deutanTask(4, "#ffffff", 6, "chart series"),
	];
}

export { hexOkDistance };
