/**
 * Neutral suite, author C: categories 309-312 (tonal-scale, role-tokens, constraint-search,
 * palette-audit). These are generation and search tasks with many valid answers, so every grader
 * checks constraints measured on the answer's own hex values (src/graders-neutral/c-graders.ts).
 * Witnesses come from the hand-written references in src/reference-neutral/c-*.ts; every witness
 * and every invalid answer is graded at build time, and margins are asserted, so a change of inputs
 * that breaks a task fails the build. Optima and feasibility numbers of the search tasks were derived
 * by exhaustive search over all 16.7M opaque 8-bit colors; c-search.test.ts re-derives them.
 */
import {
	type AuditParams,
	gradeAudit,
	gradeRoles,
	gradeScale,
	gradeSearch,
	type Pair,
	type RolesParams,
	type ScaleParams,
	type SearchParams,
} from "../../graders-neutral/c-graders.js";
import {
	contrast,
	de2000Hex,
	hexOfOklch,
	hexToRgb,
	oklchOfHex,
	oklchOfRgb,
	p3ToSrgb,
	reduceChroma,
	rgbToHex,
} from "../../reference-neutral/c-color.js";
import { buildScale, cssLines, lightnessLadder, SCALE_KEYS, tokensFrom } from "../../reference-neutral/c-scale.js";
import { contract, round } from "../build/common.js";
import { CATEGORY_NAMES, type Check, type Task } from "../types.js";

// ---------- small builders ----------

function assert(cond: boolean, msg: string): void {
	if (!cond) throw new Error(`neutralC build: ${msg}`);
}

const KIND: Record<number, string> = {
	309: "neutral-tonal-scale",
	310: "neutral-role-tokens",
	311: "neutral-constraint-search",
	312: "neutral-palette-audit",
};
const GRADE: Record<number, (a: unknown, p: never) => Check[]> = {
	309: gradeScale as (a: unknown, p: never) => Check[],
	310: gradeRoles as (a: unknown, p: never) => Check[],
	311: gradeSearch as (a: unknown, p: never) => Check[],
	312: gradeAudit as (a: unknown, p: never) => Check[],
};

interface TaskBody {
	prompt: string;
	schema: Record<string, unknown>;
	params: object;
	witness: unknown;
	invalid: unknown[];
	toolUseful?: boolean;
}

function task(category: number, n: number, t: TaskBody): Task {
	const grade = GRADE[category] as (a: unknown, p: unknown) => Check[];
	const failing = grade(t.witness, t.params).filter((c) => !c.pass);
	assert(failing.length === 0, `n${category}-${n} witness fails ${failing.map((c) => c.name).join(", ")}`);
	t.invalid.forEach((inv, i) =>
		assert(grade(inv, t.params).some((c) => !c.pass), `n${category}-${n} invalid[${i}] passes every check`),
	);
	return {
		id: `n${category}-${n}`,
		category,
		categoryName: CATEGORY_NAMES[category] as string,
		split: "dev",
		prompt: t.prompt,
		schema: t.schema,
		grader: { kind: KIND[category] as string, params: t.params },
		witness: t.witness,
		invalid: t.invalid,
		toolUseful: t.toolUseful ?? true,
	};
}

const HEX = { type: "string", pattern: "^#[0-9a-fA-F]{6}$" };
const STR = { type: "string" };
const obj = (properties: Record<string, unknown>) => ({
	type: "object",
	properties,
	required: Object.keys(properties),
});
const arr = (items: unknown, n?: number) =>
	n === undefined ? { type: "array", items } : { type: "array", items, minItems: n, maxItems: n };
const hexObj = (keys: readonly string[]) => obj(Object.fromEntries(keys.map((k) => [k, HEX])));
const r2 = (v: number) => round(v, 2);
const r4 = (v: number) => round(v, 4);
const hueSigned = (a: number, b: number) => ((((a - b) % 360) + 540) % 360) - 180;

// ---------- shared prompt fragments ----------

const SRGB_CURVE = "the IEC 61966-2-1 sRGB transfer curve (the piecewise one with the linear segment below 0.04045)";
const OKLCH = `Oklch here is Björn Ottosson's Oklab in polar form (L from 0 to 1, chroma C, hue h in degrees), computed from linear-light sRGB; decode each 8-bit channel with ${SRGB_CURVE}.`;
const OKLAB_DIST = "Oklab distance is the plain Euclidean distance between two colors' Oklab (L, a, b) coordinates, with L on the 0-1 scale.";
const WCAG =
	"Contrast is the WCAG 2.x contrast ratio: (L1 + 0.05) / (L2 + 0.05), L1 being the lighter relative luminance, with L = 0.2126 R + 0.7152 G + 0.0722 B on channels linearized with the sRGB curve.";
const ON_HEX = "Every requirement is measured on the 8-bit hex values you return, not on any unrounded intermediate.";
const DE_STD =
	"Color difference is CIEDE2000 (kL = kC = kH = 1) on CIELAB computed from sRGB via XYZ with the D65 reference white (Xn = 0.95047, Yn = 1, Zn = 1.08883) and no chromatic adaptation to D50.";
const CVD_STD = `Simulate deuteranopia with the Machado, Oliveira & Fernandes (2009) model at severity 1.0 (their full-dichromat deuteranopia matrix), applied in linear-light sRGB: decode each channel with ${SRGB_CURVE}, multiply by the 3×3 matrix, clamp each channel to [0, 1], re-encode with the same curve.`;
const keyList = SCALE_KEYS.join(", ");

// =====================================================================================
// 309 tonal-scale
// =====================================================================================

interface ScaleSpec {
	seed: string;
	seedKey: string | null;
	top: number;
	bottom: number;
	chroma: number[];
	params: Omit<ScaleParams, "keys" | "stepRatio" | "hue"> & { hueTol: number };
}

function scaleParams(s: ScaleSpec): { params: ScaleParams; witness: Record<string, string> } {
	const seed = oklchOfHex(s.seed);
	const seedIdx = s.seedKey ? SCALE_KEYS.indexOf(s.seedKey as (typeof SCALE_KEYS)[number]) : 5;
	const Ls = lightnessLadder(s.top, seedIdx, s.seedKey ? seed.L : (s.top + s.bottom) / 2, s.bottom);
	const witness = buildScale(s.seed, s.seedKey, Ls, s.chroma);
	const { hueTol, ...rest } = s.params;
	const params: ScaleParams = {
		keys: [...SCALE_KEYS],
		stepRatio: [0.5, 1.8],
		hue: { seedHue: r2(seed.H), tol: hueTol, minChroma: 0.02 },
		...rest,
	};
	return { params, witness };
}

/** Rule bullets generated from the params, so the prompt and the grader cannot drift apart. */
function scaleRules(p: ScaleParams, seedName: string): string {
	const lines = [
		`exactly the eleven keys ${keyList}, each an opaque #rrggbb color;`,
		`Oklch L strictly decreases from 50 to 950, with step 50 at L ≥ ${p.lightFloor} and step 950 at L ≤ ${p.darkCeiling};`,
		`even rhythm: each of the ten lightness drops between neighbouring steps is between ${p.stepRatio[0]}× and ${p.stepRatio[1]}× the median of those ten drops;`,
		`every step whose Oklch chroma is ${p.hue.minChroma} or more has a hue within ${p.hue.tol}° of ${seedName}'s hue (${p.hue.seedHue}°);`,
	];
	if (p.seed)
		lines.push(
			`${seedName} itself appears at step ${p.seed.steps.join(" or ")} (an Oklab distance of at most ${p.seed.tol} from ${p.seed.hex} counts, so using the exact hex is fine);`,
		);
	if (p.midChroma) {
		const mc = p.midChroma;
		const thr = r4(mc.ratio * mc.seedChroma);
		const rel = mc.ratio === 1 ? `${seedName}'s own chroma` : `${mc.ratio} × ${seedName}'s chroma of ${mc.seedChroma}`;
		lines.push(
			`no washed-out middle: among steps ${mc.steps.join(", ")}, leaving out the step that holds ${seedName} itself, the most chromatic one has Oklch chroma of at least ${thr}, which is ${rel};`,
		);
	}
	if (p.maxChroma !== undefined) lines.push(`no step has Oklch chroma above ${p.maxChroma};`);
	if (p.tint)
		lines.push(
			`steps ${p.tint.steps.join(", ")} each carry a visible tint: Oklch chroma at least ${p.tint.minChroma} and hue within ${p.tint.hueTol}° of ${seedName}'s hue;`,
		);
	if (p.contrast) lines.push(`step ${p.contrast.fg} on step ${p.contrast.bg} reaches a WCAG 2 contrast ratio of at least ${p.contrast.min}:1;`);
	lines.push("all eleven colors are different.");
	return lines.map((l) => `- ${l}`).join("\n");
}

const SCALE_SHAPE = `{"scale": {"50": "#rrggbb", "100": "#rrggbb", ..., "950": "#rrggbb"}}`;
const scaleSchema = (withCss = false) =>
	withCss ? obj({ scale: hexObj(SCALE_KEYS), css: STR }) : obj({ scale: hexObj(SCALE_KEYS) });

const reversed = (s: Record<string, string>) =>
	Object.fromEntries(SCALE_KEYS.map((k, i) => [k, s[SCALE_KEYS[10 - i] as string] as string]));
const dropKey = (s: Record<string, string>, k: string) => Object.fromEntries(Object.entries(s).filter(([x]) => x !== k));

/**
 * The washed-out wrong answer: every step of the middle band except the seed's drops to 0.6 x the
 * mid-chroma bar, keeping L and hue. It must fail mid-chroma-kept and nothing else.
 */
function washedOut(w: Record<string, string>, p: ScaleParams, seedKey: string): Record<string, string> {
	const mc = p.midChroma as NonNullable<ScaleParams["midChroma"]>;
	const thr = mc.ratio * mc.seedChroma;
	const out = { ...w };
	for (const k of mc.steps) {
		if (k === seedKey) continue;
		const c = oklchOfHex(w[k] as string);
		out[k] = hexOfOklch(c.L, Math.min(c.C, 0.6 * thr), p.hue.seedHue);
	}
	const answer = p.css ? { scale: out, css: cssLines(p.css.prefix, out) } : { scale: out };
	const f = gradeScale(answer, p)
		.filter((c) => !c.pass)
		.map((c) => c.name);
	assert(f.length === 1 && f[0] === "mid-chroma-kept", `washed-out scale must fail only mid-chroma-kept (fails ${f.join(", ")})`);
	return out;
}

function cat309(): Task[] {
	const tasks: Task[] = [];

	// n309-1: product brand blue, standard Tailwind-style scale.
	{
		const seed = "#3a5bd9";
		const { params, witness } = scaleParams({
			seed,
			seedKey: "600",
			top: 0.975,
			bottom: 0.27,
			chroma: [0.012, 0.03, 0.06, 0.1, 0.14, 0.18, 0, 0.17, 0.14, 0.11, 0.08],
			params: {
				hueTol: 20,
				lightFloor: 0.95,
				darkCeiling: 0.3,
				seed: { hex: seed, steps: ["500", "600"], tol: 0.02 },
				midChroma: { steps: ["300", "400", "500", "600", "700"], ratio: 0.75, seedChroma: r4(oklchOfHex(seed).C) },
				derivation: {
					witness: "piecewise-linear Oklch L 0.975 -> seed L at 600 -> 0.27, seed hue, chroma profile peaking at the seed, gamut-mapped by chroma reduction",
					hueTol: "20°: real scales drift a little in hue; 8-bit rounding moves hue by up to ~6° at chroma 0.02",
					seedTol: "0.02 Oklab: the exact seed hex is 0; leaves room for a re-rounded seed",
				},
			},
		});
		const s = oklchOfHex(seed);
		const hueShifted = Object.fromEntries(
			SCALE_KEYS.map((k) => {
				const c = oklchOfHex(witness[k] as string);
				return [k, k === "600" ? seed : hexOfOklch(c.L, c.C, s.H + 35)];
			}),
		);
		tasks.push(
			task(309, 1, {
				prompt: `We're setting up color tokens for a new product and I want a Tailwind-style tonal scale built from our brand blue ${seed}: eleven steps keyed ${keyList}, lightest (50) to darkest (950).

The scale has to satisfy all of these:
${scaleRules(params, "the brand blue")}

${OKLCH} ${OKLAB_DIST} ${ON_HEX}

${contract(SCALE_SHAPE)}`,
				schema: scaleSchema(),
				params,
				witness: { scale: witness },
				invalid: [
					{ scale: reversed(witness) },
					{ scale: dropKey(witness, "950") },
					{ scale: hueShifted },
					{ scale: washedOut(witness, params, "600") },
				],
			}),
		);
	}

	// n309-2: pale mint seed, scale plus CSS custom properties.
	{
		const seed = "#a8d8c8";
		const { params, witness } = scaleParams({
			seed,
			seedKey: "200",
			top: 0.975,
			bottom: 0.27,
			chroma: [0.015, 0.035, 0, 0.075, 0.09, 0.1, 0.095, 0.085, 0.07, 0.055, 0.045],
			params: {
				hueTol: 20,
				lightFloor: 0.95,
				darkCeiling: 0.3,
				seed: { hex: seed, steps: ["100", "200", "300"], tol: 0.02 },
				midChroma: { steps: ["300", "400", "500", "600", "700"], ratio: 1, seedChroma: r4(oklchOfHex(seed).C) },
				css: { prefix: "mint" },
				derivation: {
					witness: "seed at 200; L 0.975 -> seed L -> 0.27; chroma rising past the pastel seed in the middle",
					midChroma: "ratio 1.0: a pastel seed's middle steps should be at least as colorful as the seed",
					css: "every --mint-<key> declaration must appear once and equal the JSON hex (case-insensitive, #rgb expanded)",
				},
			},
		});
		const css = cssLines("mint", witness);
		const wrongCss = css.replace(witness["500"] as string, witness["400"] as string);
		// The common lazy answer: put the pastel seed at 500 and build lighter/darker steps around it.
		const atFive = buildScale(
			seed,
			"500",
			lightnessLadder(0.975, 5, oklchOfHex(seed).L, 0.27),
			[0.015, 0.025, 0.035, 0.045, 0.05, 0, 0.06, 0.07, 0.07, 0.06, 0.05],
		);
		tasks.push(
			task(309, 2, {
				prompt: `Design wants our wellness app's accent to be the soft mint ${seed}. I need a full 50-950 tonal scale around it (keys ${keyList}, light to dark) so we also have darker mints for text and borders, delivered both as JSON and as CSS custom properties I can paste into :root.

Rules for the scale:
${scaleRules(params, "the mint")}

The CSS text must contain exactly one declaration per step in the form \`--mint-50: #rrggbb;\` (keys as above; one per line is preferred) with the same colors as the JSON.

${OKLCH} ${OKLAB_DIST} ${ON_HEX}

${contract(`{"scale": {"50": "#rrggbb", ..., "950": "#rrggbb"}, "css": "--mint-50: #rrggbb;\\n--mint-100: #rrggbb;\\n..."}`)}`,
				schema: scaleSchema(true),
				params,
				witness: { scale: witness, css },
				invalid: [
					{ scale: witness, css: wrongCss },
					{ scale: atFive, css: cssLines("mint", atFive) },
					{ scale: reversed(witness), css },
					{ scale: washedOut(witness, params, "200"), css: cssLines("mint", washedOut(witness, params, "200")) },
				],
			}),
		);
	}

	// n309-3: very dark seed at the bottom of the scale.
	{
		const seed = "#2b1d4f";
		const { params, witness } = scaleParams({
			seed,
			seedKey: "900",
			top: 0.975,
			bottom: 0.2,
			chroma: [0.012, 0.03, 0.06, 0.09, 0.12, 0.14, 0.15, 0.14, 0.12, 0, 0.07],
			params: {
				hueTol: 20,
				lightFloor: 0.95,
				darkCeiling: 0.3,
				seed: { hex: seed, steps: ["800", "900", "950"], tol: 0.02 },
				midChroma: { steps: ["300", "400", "500", "600", "700"], ratio: 1, seedChroma: r4(oklchOfHex(seed).C) },
				derivation: {
					witness: "seed at 900 (L 0.278); L 0.975 -> seed -> 0.20 at 950",
					midChroma: "ratio 1.0: the middle of a scale grown from a near-black seed must not stay grayish",
				},
			},
		});
		// Wrong: a scale that keeps the dark seed's low chroma all the way up (washed-out middle).
		const flat = buildScale(
			seed,
			"900",
			lightnessLadder(0.975, 9, oklchOfHex(seed).L, 0.2),
			SCALE_KEYS.map((_, i) => Math.min(0.06, 0.012 + 0.006 * i)),
		);
		tasks.push(
			task(309, 3, {
				prompt: `Our studio's identity color is a deep aubergine, ${seed}. It's almost black, and I need to grow it into a usable 11-step tonal scale (${keyList}; 50 lightest, 950 darkest) for backgrounds, borders and tinted surfaces. The aubergine should land near the dark end.

Constraints:
${scaleRules(params, "the aubergine")}

${OKLCH} ${OKLAB_DIST} ${ON_HEX}

${contract(SCALE_SHAPE)}`,
				schema: scaleSchema(),
				params,
				witness: { scale: witness },
				invalid: [{ scale: flat }, { scale: reversed(witness) }, { scale: washedOut(witness, params, "900") }],
			}),
		);
	}

	// n309-4: highly chromatic seed with a gamut-limited peak, plus a contrast pairing.
	{
		const seed = "#ff1f8e";
		const chroma = [0.012, 0.035, 0.07, 0.13, 0, 0.24, 0.22, 0.19, 0.16, 0.13, 0.1];
		const { params, witness } = scaleParams({
			seed,
			seedKey: "400",
			top: 0.975,
			bottom: 0.22,
			chroma,
			params: {
				hueTol: 20,
				lightFloor: 0.95,
				darkCeiling: 0.3,
				seed: { hex: seed, steps: ["400", "500"], tol: 0.02 },
				midChroma: { steps: ["300", "400", "500", "600", "700"], ratio: 0.75, seedChroma: r4(oklchOfHex(seed).C) },
				contrast: { fg: "700", bg: "50", min: 7 },
				derivation: {
					witness: "seed at 400; L 0.975 -> seed (0.657) -> 0.22, so 700 lands near L 0.44 and clears 7:1 on 50",
					contrast: "binding: a ladder ending at 0.30 with the seed at 400 puts 700 near L 0.50 and misses 7:1",
				},
			},
		});
		const even = buildScale(seed, "400", lightnessLadder(0.975, 4, oklchOfHex(seed).L, 0.3), chroma);
		assert(contrast(even["700"] as string, even["50"] as string) < 7, "n309-4 shallow ladder must miss the contrast");
		tasks.push(
			task(309, 4, {
				prompt: `Brand gave us an electric pink, ${seed}, which is about as saturated as sRGB gets. I need a 50-950 tonal scale (${keyList}, light to dark) for our UI kit. One pairing matters a lot: body text in step 700 sits on step 50 backgrounds, and it has to pass WCAG AAA.

The scale must meet all of these:
${scaleRules(params, "the pink")}

${WCAG} ${OKLCH} ${OKLAB_DIST} ${ON_HEX}

${contract(SCALE_SHAPE)}`,
				schema: scaleSchema(),
				params,
				witness: { scale: witness },
				invalid: [
					{ scale: even },
					{ scale: reversed(witness) },
					{ scale: { ...witness, "300": witness["400"] } },
					{ scale: washedOut(witness, params, "400") },
				],
			}),
		);
	}

	// n309-5: tinted neutral (gray) scale.
	{
		const seed = "#0f766e";
		const { params, witness } = scaleParams({
			seed,
			seedKey: null,
			top: 0.975,
			bottom: 0.2,
			chroma: [0.006, 0.01, 0.014, 0.017, 0.019, 0.021, 0.021, 0.02, 0.018, 0.016, 0.013],
			params: {
				hueTol: 20,
				lightFloor: 0.96,
				darkCeiling: 0.25,
				maxChroma: 0.035,
				tint: { steps: ["200", "300", "400", "500", "600", "700", "800"], minChroma: 0.01, hueTol: 25 },
				derivation: {
					witness: "uniform L 0.975 -> 0.20 at the teal's hue, chroma 0.006-0.021",
					tint: "chroma >= 0.01 keeps the tint visible; 25° hue tolerance because 8-bit rounding moves hue by up to ~9° at chroma 0.01",
					cap: "0.035: still reads as gray next to the teal (chroma 0.086)",
				},
			},
		});
		const pureGray = Object.fromEntries(
			SCALE_KEYS.map((k) => {
				const c = oklchOfHex(witness[k] as string);
				return [k, hexOfOklch(c.L, 0, 0)];
			}),
		);
		const tooColorful = Object.fromEntries(
			SCALE_KEYS.map((k) => {
				const c = oklchOfHex(witness[k] as string);
				return [k, hexOfOklch(c.L, Math.min(0.08, c.C * 4), c.H)];
			}),
		);
		tasks.push(
			task(309, 5, {
				prompt: `For our design system's neutrals I don't want dead grays: the gray scale should lean very slightly toward our teal, ${seed}, so surfaces feel related to the brand. Please build an 11-step neutral scale (${keyList}, lightest to darkest). The teal itself doesn't need to appear in the scale.

What counts as done:
${scaleRules(params, "the teal")}

${OKLCH} ${ON_HEX}

${contract(SCALE_SHAPE)}`,
				schema: scaleSchema(),
				params,
				witness: { scale: witness },
				invalid: [{ scale: pureGray }, { scale: tooColorful }, { scale: reversed(witness) }],
			}),
		);
	}
	return tasks;
}

// =====================================================================================
// 310 role-tokens
// =====================================================================================

const BASE_ROLES = [
	"primary",
	"on-primary",
	"primary-container",
	"on-primary-container",
	"secondary",
	"surface",
	"on-surface",
	"surface-variant",
	"outline",
	"error",
	"on-error",
] as const;
const BASE_PAIRS = (min: number): Pair[] => [
	["on-primary", "primary", min],
	["on-primary-container", "primary-container", min],
	["on-surface", "surface", min],
	["on-surface", "surface-variant", min],
	["on-error", "error", min],
];

type Table = Record<string, [number, number, number]>;

function lightTable(h: number, c: number, sec: number, aaa: boolean): Table {
	return {
		primary: [aaa ? 0.44 : 0.5, Math.min(c, 0.17), h],
		"on-primary": [1, 0, h],
		"primary-container": [0.91, Math.min(c, 0.06), h],
		"on-primary-container": [aaa ? 0.27 : 0.32, Math.min(c, 0.1), h],
		secondary: [aaa ? 0.46 : 0.52, 0.08, sec],
		surface: [0.985, 0.006, h],
		"on-surface": [0.24, 0.012, h],
		"surface-variant": [0.925, 0.014, h],
		outline: [0.56, 0.02, h],
		error: [aaa ? 0.45 : 0.52, 0.19, 27],
		"on-error": [1, 0, 27],
	};
}
function darkTable(h: number, c: number, sec: number, aaa: boolean): Table {
	return {
		primary: [0.8, Math.min(c, 0.13), h],
		"on-primary": [aaa ? 0.22 : 0.3, Math.min(c, 0.08), h],
		"primary-container": [aaa ? 0.34 : 0.4, Math.min(c, 0.12), h],
		"on-primary-container": [0.93, Math.min(c, 0.05), h],
		secondary: [0.8, 0.08, sec],
		surface: [0.19, 0.008, h],
		"on-surface": [0.93, 0.008, h],
		"surface-variant": [0.3, 0.014, h],
		outline: [0.66, 0.02, h],
		error: [0.8, 0.1, 25],
		"on-error": [aaa ? 0.24 : 0.32, 0.09, 25],
	};
}

function roleRules(p: RolesParams, seed: string): string {
	const both = p.themes.length === 2 ? "in both themes" : "in the dark theme";
	const off = r2(hueSigned(p.secondary.hue, p.primary.seedHue));
	const lines = [
		`every role listed above is present ${both}, as #rrggbb;`,
		...p.pairs.map(([fg, bg, m]) => `${fg} on ${bg} has a WCAG 2 contrast ratio of at least ${m}:1 ${both};`),
		p.themes.length === 2
			? `primary-container is lighter than primary in the light theme and darker than primary in the dark theme, by at least ${p.containerMargin} in Oklab L;`
			: `primary-container is darker than primary by at least ${p.containerMargin} in Oklab L;`,
		`primary keeps the seed's character: Oklch chroma at least ${p.primary.minChroma} and hue within ${p.primary.tol}° of the seed ${seed} (seed hue ${p.primary.seedHue}°);`,
		`secondary is a related accent: Oklch chroma at least ${p.secondary.minChroma} and hue within ${p.secondary.tol}° of ${p.secondary.hue}° (the seed hue ${off >= 0 ? "plus" : "minus"} ${Math.abs(off)}°);`,
		`${p.surfaces.roles.join(", ")} are near-neutral: Oklch chroma at most ${p.surfaces.maxChroma};`,
		p.themes.length === 2
			? `surface has Oklab L ≥ ${p.surfaces.lightMinL} in the light theme and ≤ ${p.surfaces.darkMaxL} in the dark theme;`
			: `surface has Oklab L ≤ ${p.surfaces.darkMaxL};`,
		`error reads as red: Oklch hue between ${p.error.band[0]}° and ${p.error.band[1]}°, chroma at least ${p.error.minChroma};`,
		...(p.bands ?? []).map((b) => `${b.role}: Oklch hue between ${b.band[0]}° and ${b.band[1]}°, chroma at least ${b.minChroma};`),
	];
	for (const lr of p.lightness ?? [])
		lines.push(
			`${lr.role} in the ${lr.theme} theme has Oklab L ${lr.min !== undefined ? `≥ ${lr.min}` : `≤ ${lr.max}`};`,
		);
	if (p.levels)
		lines.push(
			`${p.levels.roles.join(" → ")} are three distinct elevation levels, each lighter than the previous by at least ${p.levels.minStep} in Oklab L;`,
		);
	return lines.map((l) => `- ${l}`).join("\n");
}

function rolesTask(
	n: number,
	o: {
		seed: string;
		secOffset: number;
		aaa: boolean;
		themes: ("light" | "dark")[];
		extraRoles?: string[];
		extraPairs?: Pair[];
		extraLight?: Table;
		extraDark?: Table;
		bands?: RolesParams["bands"];
		levels?: RolesParams["levels"];
		lightness?: RolesParams["lightness"];
		extraSurfaces?: string[];
		primaryMinChroma?: number;
		intro: string;
		outro?: string;
	},
): Task {
	const s = oklchOfHex(o.seed);
	const sec = (((s.H + o.secOffset) % 360) + 360) % 360;
	const min = o.aaa ? 7 : 4.5;
	const roles = [...BASE_ROLES, ...(o.extraRoles ?? [])];
	const params: RolesParams = {
		themes: o.themes,
		roles,
		pairs: [...BASE_PAIRS(min), ...(o.extraPairs ?? [])],
		containerMargin: 0.15,
		primary: { seedHue: r2(s.H), tol: 15, minChroma: o.primaryMinChroma ?? 0.04 },
		secondary: { hue: r2(sec), tol: 20, minChroma: 0.03 },
		surfaces: {
			roles: ["surface", "surface-variant", ...(o.levels ? o.levels.roles.slice(1) : []), ...(o.extraSurfaces ?? [])],
			maxChroma: 0.03,
			lightMinL: 0.94,
			darkMaxL: 0.28,
		},
		error: { band: [15, 45], minChroma: 0.06 },
		...(o.bands ? { bands: o.bands } : {}),
		...(o.levels ? { levels: o.levels } : {}),
		...(o.lightness ? { lightness: o.lightness } : {}),
		derivation: {
			witness:
				"Oklch tone tables per theme at the seed hue (light: primary L 0.50 or 0.44 for AAA, container 0.91, surface 0.985; dark: primary 0.80, container 0.40 or 0.34, surface 0.19), gamut-mapped by chroma reduction",
			tolerances:
				"hue checks: 15° for primary, 20° for secondary (8-bit rounding moves hue by < 4° at chroma >= 0.03); container margin 0.15 Oklab L (Material-style containers differ from primary by ~0.4)",
		},
	};
	const light = tokensFrom({ ...lightTable(s.H, s.C, sec, o.aaa), ...(o.extraLight ?? {}) });
	const dark = tokensFrom({ ...darkTable(s.H, s.C, sec, o.aaa), ...(o.extraDark ?? {}) });
	const witness = Object.fromEntries(o.themes.map((t) => [t, t === "light" ? light : dark]));
	const swapped = Object.fromEntries(o.themes.map((t) => [t, t === "light" ? dark : light]));
	const orangeError = Object.fromEntries(
		o.themes.map((t) => {
			const set = { ...(t === "light" ? light : dark) };
			const e = oklchOfHex(set.error as string);
			set.error = hexOfOklch(e.L, e.C, 60);
			return [t, set];
		}),
	);
	const shape =
		o.themes.length === 2
			? `{"light": {"primary": "#rrggbb", "on-primary": "#rrggbb", ...every role}, "dark": {...the same roles}}`
			: `{"dark": {"primary": "#rrggbb", "on-primary": "#rrggbb", ...every role}}`;
	const schema = obj(Object.fromEntries(o.themes.map((t) => [t, hexObj(roles)])));
	return task(310, n, {
		prompt: `${o.intro}

Roles: ${roles.join(", ")}.

Requirements:
${roleRules(params, o.seed)}
${o.outro ? `\n${o.outro}\n` : ""}
${WCAG} ${OKLCH} Oklab L is the same L. ${ON_HEX}

${contract(shape)}`,
		schema,
		params,
		witness,
		invalid: [
			swapped,
			orangeError,
			Object.fromEntries(o.themes.map((t) => [t, { primary: light.primary }])),
			// Each lightness-bound role copied from surface (an "inverse" that is not inverted).
			...(o.lightness
				? [
						Object.fromEntries(
							o.themes.map((t) => {
								const set = { ...(t === "light" ? light : dark) };
								for (const lr of o.lightness ?? []) set[lr.role] = set.surface as string;
								return [t, set];
							}),
						),
					]
				: []),
		],
	});
}

function cat310(): Task[] {
	const teal = oklchOfHex("#0f9d8a").H;
	const orange = oklchOfHex("#e0742b").H;
	return [
		rolesTask(1, {
			seed: "#7b4fd6",
			secOffset: -40,
			aaa: false,
			themes: ["light", "dark"],
			intro: `I'm generating a Material-style color system for our note-taking app from the seed violet #7b4fd6. I need a light theme and a dark theme, each with the same set of color roles, and both must meet WCAG AA for text (4.5:1).`,
		}),
		rolesTask(2, {
			seed: "#6b7f73",
			secOffset: 90,
			aaa: false,
			themes: ["light", "dark"],
			primaryMinChroma: 0.02,
			extraPairs: [["outline", "surface", 3]],
			intro: `Our banking client's brand color is a muted sage gray, #6b7f73, very low in chroma. They want a light and a dark theme of semantic color roles derived from it. Text pairs must meet WCAG AA (4.5:1), and since outlines mark input boundaries they also need the 3:1 non-text contrast against the surface.`,
			outro: "Keep the primary recognizably sage even though the seed is close to gray: the chroma floor for primary is deliberately low.",
		}),
		rolesTask(3, {
			seed: "#e0742b",
			secOffset: 60,
			aaa: true,
			themes: ["light", "dark"],
			extraRoles: ["inverse-surface", "on-inverse-surface"],
			extraSurfaces: ["inverse-surface"],
			extraPairs: [
				["on-inverse-surface", "inverse-surface", 7],
				["primary", "surface", 3],
			],
			extraLight: {
				"inverse-surface": [0.3, 0.01, orange],
				"on-inverse-surface": [0.95, 0.01, orange],
			},
			extraDark: {
				"inverse-surface": [0.92, 0.01, orange],
				"on-inverse-surface": [0.25, 0.01, orange],
			},
			lightness: [
				{ role: "inverse-surface", theme: "light", max: 0.35 },
				{ role: "inverse-surface", theme: "dark", min: 0.85 },
			],
			intro: `We're building a public-sector service whose accessibility statement promises WCAG AAA text contrast. From the seed orange #e0742b I need color roles for a light theme and a dark theme. Every text-on-background pair listed below must reach 7:1. Toasts and tooltips sit on an inverse surface, which flips with the theme: dark in the light theme, light in the dark theme. The brand team also insists that the primary color, used bare for icons and focus outlines, keeps at least 3:1 against surface in both themes.`,
		}),
		rolesTask(4, {
			seed: "#0f9d8a",
			secOffset: -50,
			aaa: false,
			themes: ["dark"],
			extraRoles: ["surface-container", "surface-container-high"],
			extraPairs: [
				["primary", "surface", 3],
				["on-surface", "surface-container", 4.5],
				["on-surface", "surface-container-high", 4.5],
			],
			extraDark: {
				"surface-container": [0.235, 0.008, teal],
				"surface-container-high": [0.28, 0.01, teal],
			},
			levels: { roles: ["surface", "surface-container", "surface-container-high"], minStep: 0.02 },
			intro: `Our media player is dark-only. From the seed teal #0f9d8a, give me the dark theme's color roles, including two raised surface levels for cards and sheets. Text pairs need WCAG AA (4.5:1), and the primary color itself is used for icons and the progress bar directly on the surface, so it needs at least 3:1 against surface.`,
		}),
		rolesTask(5, {
			seed: "#d6336c",
			secOffset: 30,
			aaa: false,
			themes: ["light", "dark"],
			extraRoles: ["success", "on-success", "warning", "on-warning"],
			extraPairs: [
				["on-success", "success", 4.5],
				["on-warning", "warning", 4.5],
			],
			extraLight: {
				success: [0.5, 0.13, 150],
				"on-success": [1, 0, 150],
				warning: [0.8, 0.15, 75],
				"on-warning": [0.26, 0.05, 70],
			},
			extraDark: {
				success: [0.8, 0.14, 150],
				"on-success": [0.28, 0.06, 150],
				warning: [0.83, 0.14, 75],
				"on-warning": [0.27, 0.05, 70],
			},
			bands: [
				{ role: "success", band: [125, 165], minChroma: 0.06 },
				{ role: "warning", band: [50, 95], minChroma: 0.06 },
			],
			intro: `Our e-commerce admin uses the raspberry #d6336c as its seed. Besides the usual roles I need status roles (success and warning, each with an on- color for text and icons on top of them) in both a light and a dark theme. All text pairs must meet WCAG AA (4.5:1).`,
		}),
	];
}

// =====================================================================================
// 311 constraint-search
// =====================================================================================

/**
 * Stored results of the exhaustive searches (all 16,777,216 opaque 8-bit colors). c-search.test.ts
 * recomputes each by brute force and fails if these drift.
 */
export const SEARCH_311 = {
	fixLight: { background: "#1b2433", original: "#3d6fd9", target: 4.5, hueTol: 6, optimum: 0.072944, best: "#4988f0" },
	fixDark: { background: "#fff7ed", original: "#c2410c", target: 7, hueTol: 8, optimum: 0.084952, best: "#a81b00" },
	dual: {
		light: "#f8f7f4",
		dark: "#16181d",
		min: 3,
		band: [152, 180] as [number, number],
		maxChroma: 0.166091,
		best: "#00a554",
		floor: 0.14,
		/** Highest-chroma color clearing 3.08:1 on both surfaces with hue in [155, 175]: slack on every rule. */
		witness: "#00a25d",
		/** Common design-system greens; every one must fail (asserted in c-search.test.ts). */
		commonGreens: ["#22c55e", "#16a34a", "#15803d", "#10b981", "#059669", "#047857", "#4caf50", "#388e3c", "#2e7d32", "#43a047"],
		current: "#10b981",
	},
};

const FIX_FACTOR = 2;
const FIX_SLACK = 0.01;

function cat311(): Task[] {
	const tasks: Task[] = [];

	// n311-1: light link text on a dark card fails AA; lighten minimally.
	{
		const f = SEARCH_311.fixLight;
		assert(contrast(f.original, f.background) < f.target, "n311-1 original must fail");
		const params: SearchParams = {
			shape: "fix",
			field: "link",
			background: f.background,
			original: f.original,
			target: f.target,
			hueTol: f.hueTol,
			optimum: f.optimum,
			factor: FIX_FACTOR,
			slack: FIX_SLACK,
			derivation: {
				method: "exhaustive search over all opaque 8-bit sRGB colors: minimum Oklab distance to the original among colors with WCAG ratio >= target and Oklch hue within hueTol",
				best: f.best,
				bound: `distance <= ${FIX_FACTOR} x optimum + ${FIX_SLACK} = ${r4(FIX_FACTOR * f.optimum + FIX_SLACK)}`,
				originalRatio: r2(contrast(f.original, f.background)),
			},
		};
		const o = oklchOfHex(f.original);
		tasks.push(
			task(311, 1, {
				prompt: `Accessibility audit flagged our link color on dark cards: links are ${f.original} on the card background ${f.background}, which is only ${r2(contrast(f.original, f.background))}:1. I need a replacement link color that passes WCAG AA for body text (at least ${f.target}:1 against ${f.background}) and stays as close as possible to the current blue, so it still reads as the same brand link.

What I'll accept:
- WCAG 2 contrast against ${f.background} of at least ${f.target}:1;
- Oklch hue within ${f.hueTol}° of the original's (${r2(o.H)}°);
- as close to ${f.original} as you can get: I'll check the Oklab distance from ${f.original}, and it has to be within ${FIX_FACTOR}× the smallest distance any 8-bit color meeting the two rules above can achieve, plus ${FIX_SLACK}.

${WCAG} ${OKLCH} ${OKLAB_DIST} ${ON_HEX}

${contract(`{"link": "#rrggbb"}`)}`,
				schema: obj({ link: HEX }),
				params,
				witness: { link: f.best },
				invalid: [{ link: f.original }, { link: "#ffffff" }, { link: "#7fd1ff" }, { link: "#a7b6ff" }],
			}),
		);
	}

	// n311-2: dark orange text on a cream page must reach AAA 7:1.
	{
		const f = SEARCH_311.fixDark;
		assert(contrast(f.original, f.background) < f.target, "n311-2 original must fail");
		const params: SearchParams = {
			shape: "fix",
			field: "text",
			background: f.background,
			original: f.original,
			target: f.target,
			hueTol: f.hueTol,
			optimum: f.optimum,
			factor: FIX_FACTOR,
			slack: FIX_SLACK,
			derivation: {
				method: "exhaustive search over all opaque 8-bit sRGB colors (as n311-1)",
				best: f.best,
				bound: `distance <= ${FIX_FACTOR} x optimum + ${FIX_SLACK} = ${r4(FIX_FACTOR * f.optimum + FIX_SLACK)}`,
				originalRatio: r2(contrast(f.original, f.background)),
			},
		};
		const o = oklchOfHex(f.original);
		tasks.push(
			task(311, 2, {
				prompt: `Our recipe site prints step headings in burnt orange ${f.original} on a cream page (${f.background}). That's ${r2(contrast(f.original, f.background))}:1, fine for AA, but the client now wants AAA: at least ${f.target}:1. Darken it as little as possible; it should stay in the same hue family rather than turn into a different color.

Acceptance rules:
- WCAG 2 contrast of at least ${f.target}:1 against ${f.background};
- Oklch hue within ${f.hueTol}° of ${f.original}'s hue (${r2(o.H)}°);
- Oklab distance from ${f.original} no more than ${FIX_FACTOR}× the minimum achievable by any 8-bit color meeting the first two rules, plus ${FIX_SLACK}.

${WCAG} ${OKLCH} ${OKLAB_DIST} ${ON_HEX}

${contract(`{"text": "#rrggbb"}`)}`,
				schema: obj({ text: HEX }),
				params,
				witness: { text: f.best },
				invalid: [{ text: f.original }, { text: "#000000" }, { text: "#8b1a1a" }],
			}),
		);
	}

	// n311-3: one brand green that works on a light and a dark surface.
	{
		const d = SEARCH_311.dual;
		const cur = oklchOfHex(d.current);
		assert(contrast(d.current, d.light) < d.min && cur.C >= d.floor, "n311-3 current color must fail only the light surface");
		assert(d.maxChroma >= 1.15 * d.floor, "n311-3 feasibility margin");
		const params: SearchParams = {
			shape: "dual",
			field: "brand",
			light: d.light,
			dark: d.dark,
			min: d.min,
			band: d.band,
			minChroma: d.floor,
			derivation: {
				method: "exhaustive search over all opaque 8-bit sRGB colors meeting both contrasts and the hue band",
				maxChroma: d.maxChroma,
				maxChromaColor: d.best,
				feasibleAtFloor: 12687,
				commonGreensRejected: d.commonGreens,
				floor: `${d.floor} = max achievable chroma / ${r2(d.maxChroma / d.floor)} (>= 15% margin)`,
			},
		};
		tasks.push(
			task(311, 3, {
				prompt: `We need a single brand green for status pills that sit on both our light surface ${d.light} and our dark surface ${d.dark}. Our current green ${d.current} looks great on dark but is only ${r2(contrast(d.current, d.light))}:1 on the light surface. Find one color that works on both.

Requirements for the color:
- WCAG 2 contrast of at least ${d.min}:1 against ${d.light} and at least ${d.min}:1 against ${d.dark};
- Oklch hue between ${d.band[0]}° and ${d.band[1]}° (green to teal-green);
- Oklch chroma of at least ${d.floor}, so it doesn't go muddy.

${WCAG} ${OKLCH} ${ON_HEX}

${contract(`{"brand": "#rrggbb"}`)}`,
				schema: obj({ brand: HEX }),
				params,
				witness: { brand: d.witness },
				invalid: [{ brand: d.current }, { brand: "#5f8f7a" }, { brand: "#2f9e44" }],
			}),
		);
	}

	// Gamut-mapping tolerances for the out-of-gamut colors of n311-4 and n311-5. The CSS Color 4
	// algorithm (binary search on chroma with a 0.02 deltaEOK just-noticeable-difference clip) lands up
	// to ~0.027 Oklab, ~0.015 L and ~3.3° hue away from pure chroma reduction on these inputs (5.3° for
	// n311-5 "pressed", see there); per-channel clipping of the big excursions lands 0.055-0.076 away.
	// All of this is checked against colorjs.io in c-search.test.ts.
	const D_TOL = 0.032;
	const L_TOL = 0.02;
	const H_TOL = 5;
	const mapDerivation = {
		reference: "Oklch chroma reduction at constant L and h (bisection) to the sRGB boundary, then 8-bit rounding",
		tolerance: `Oklab distance <= ${D_TOL}, |ΔL| <= ${L_TOL}, Δh <= ${H_TOL}°: accepts the CSS Color 4 JND-clip and ray-trace algorithms; rejects per-channel clipping`,
	};

	// n311-4: Display P3 values to sRGB fallbacks. One token is outside sRGB (gamut-mapped, loose
	// tolerance); one is inside (plain conversion, tight tolerance: only rounding differs). The second
	// one also catches the answer that reads the P3 numbers as if they were sRGB.
	{
		const IN_TOL = { dTol: 0.008, lTol: 0.008, hTol: 2 };
		const inputs: [string, [number, number, number], boolean][] = [
			["badge-green", [0, 0.95, 0.45], true],
			["promo-pink", [0.85, 0.3, 0.55], false],
		];
		const refs = inputs.map(([field, p, out]) => {
			const raw = p3ToSrgb(p);
			const mapped = rgbToHex(reduceChroma(oklchOfRgb(raw)).rgb);
			const inside = raw.every((v) => v >= 0 && v <= 1);
			assert(inside !== out, `n311-4 ${field} gamut status`);
			const tol = out ? { dTol: D_TOL, lTol: L_TOL, hTol: H_TOL } : IN_TOL;
			return { field, p, raw, mapped, clip: rgbToHex(raw), out, tol };
		});
		assert(refs[0]?.mapped !== refs[0]?.clip, "n311-4 green must need mapping");
		const params: SearchParams = {
			shape: "map",
			targets: refs.map((r) => ({ field: r.field, ref: r.mapped, ...r.tol })),
			derivation: {
				...mapDerivation,
				insideTolerance: `promo-pink is inside sRGB, so only 8-bit rounding and matrix precision differ: Oklab ${IN_TOL.dTol}, L ${IN_TOL.lTol}, hue ${IN_TOL.hTol}°`,
				inputs: refs.map((r) => ({ field: r.field, p3: r.p, reference: r.mapped, outOfGamut: r.out })),
			},
		};
		const cssP3 = (p: readonly number[]) => `color(display-p3 ${p.join(" ")})`;
		tasks.push(
			task(311, 4, {
				prompt: `Our design tokens are authored in Display P3 and I need sRGB hex fallbacks for older browsers and for email. Two tokens:
${refs.map((r) => `- ${r.field}: \`${cssP3(r.p)}\``).join("\n")}

Convert each to sRGB: Display P3 uses the D65 white point and the same transfer curve as sRGB, ${SRGB_CURVE}; go through linear light and CIE XYZ. If a color falls outside sRGB, gamut-map it the way CSS Color 4 intends: keep its Oklch lightness and hue and reduce Oklch chroma until it just fits (the reference behaviour is that plain chroma reduction; CSS Color 4's own JND-based mapping algorithm is also acceptable). Do not clip channels independently. A color already inside sRGB is just converted. Give 8-bit hex.

${OKLCH} Each result is compared with the reference by Oklab distance, Oklch lightness and Oklch hue: within ${D_TOL}, ${L_TOL} and ${H_TOL}° for a color that needed gamut mapping, and within ${IN_TOL.dTol}, ${IN_TOL.lTol} and ${IN_TOL.hTol}° for a color that was already inside sRGB.

${contract(`{"badge-green": "#rrggbb", "promo-pink": "#rrggbb"}`)}`,
				schema: hexObj(refs.map((r) => r.field)),
				params,
				witness: Object.fromEntries(refs.map((r) => [r.field, r.mapped])),
				invalid: [
					Object.fromEntries(refs.map((r) => [r.field, r.clip])),
					// P3 numbers misread as sRGB.
					Object.fromEntries(refs.map((r) => [r.field, rgbToHex(r.p)])),
				],
			}),
		);
	}

	// n311-5: lighten/darken by an Oklch L delta, keeping chroma and hue, with gamut mapping.
	{
		const base = "#ea580c";
		const b = oklchOfHex(base);
		const outs: [string, number][] = [
			["dark-mode", 0.18],
			["pressed", -0.1],
		];
		const refs = outs.map(([field, dl]) => {
			const m = reduceChroma({ L: b.L + dl, C: b.C, H: b.H });
			return { field, dl, mapped: rgbToHex(m.rgb), mappedC: r4(m.oklch.C) };
		});
		assert(refs.every((r) => r.mappedC < b.C - 0.01), "n311-5 both results must need gamut mapping");
		// CSS Color 4 returns the plain clip when the clip is within one JND (0.02 deltaEOK) of the shifted
		// color; for "pressed" that clip turns the hue by 5.3°, so the hue tolerance here is 6.5°.
		const H_TOL5 = 6.5;
		const params: SearchParams = {
			shape: "map",
			targets: refs.map((r) => ({ field: r.field, ref: r.mapped, dTol: D_TOL, lTol: L_TOL, hTol: H_TOL5 })),
			derivation: {
				...mapDerivation,
				hueTolerance: `${H_TOL5}°: CSS Color 4's early exit returns the clipped color for "pressed" (5.3° hue turn), which must be accepted`,
				base,
				refs,
			},
		};
		// Wrong variants: clip channels independently after the L shift; shift HSL lightness instead of Oklch L.
		const clip = Object.fromEntries(
			outs.map(([field, dl]) => {
				const h = (b.H * Math.PI) / 180;
				return [field, rgbToHex(oklabToRgbUnclamped(b.L + dl, b.C * Math.cos(h), b.C * Math.sin(h)))];
			}),
		);
		const hslShift = Object.fromEntries(outs.map(([field, dl]) => [field, hslLightnessShift(base, dl)]));
		tasks.push(
			task(311, 5, {
				prompt: `Our call-to-action orange is ${base}. I need two derived tokens:
- dark-mode: the same orange with Oklch L raised by ${outs[0]?.[1]} (it's too dark on our charcoal background);
- pressed: the same orange with Oklch L lowered by ${Math.abs(outs[1]?.[1] as number)} for the pressed state.

Keep Oklch chroma and hue exactly as the base has them and change only L. If the shifted color doesn't fit in sRGB, gamut-map it the way CSS Color 4 intends: keep that new L and the hue and reduce chroma until it just fits (plain chroma reduction is the reference; CSS Color 4's JND-based mapping algorithm is also acceptable). Don't clip RGB channels independently. Give 8-bit hex.

${OKLCH} Results are compared with the reference by Oklab distance (${D_TOL}), Oklch lightness (${L_TOL}) and hue (${H_TOL5}°).

${contract(`{"dark-mode": "#rrggbb", "pressed": "#rrggbb"}`)}`,
				schema: hexObj(outs.map(([f]) => f)),
				params,
				witness: Object.fromEntries(refs.map((r) => [r.field, r.mapped])),
				invalid: [clip, hslShift, { "dark-mode": base, pressed: base }],
			}),
		);
	}
	return tasks;
}

/** Oklab -> encoded sRGB with per-channel clipping (the wrong-variant answer for gamut tasks). */
function oklabToRgbUnclamped(L: number, a: number, bb: number): [number, number, number] {
	const l_ = L + 0.3963377774 * a + 0.2158037573 * bb;
	const m_ = L - 0.1055613458 * a - 0.0638541728 * bb;
	const s_ = L - 0.0894841775 * a - 1.291485548 * bb;
	const [l, m, s] = [l_ ** 3, m_ ** 3, s_ ** 3];
	const lin = [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
	];
	return lin.map((v) => {
		const c = Math.min(1, Math.max(0, v));
		return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
	}) as [number, number, number];
}

/** CSS hsl(): shift L by dl, keep H and S. */
function hslLightnessShift(hex: string, dl: number): string {
	const [r, g, b] = hexToRgb(hex);
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;
	const d = max - min;
	const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
	let h = 0;
	if (d !== 0) h = max === r ? 60 * (((g - b) / d + 6) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
	const L2 = Math.min(1, Math.max(0, l + dl));
	const C2 = (1 - Math.abs(2 * L2 - 1)) * s;
	const X = C2 * (1 - Math.abs(((h / 60) % 2) - 1));
	const m0 = L2 - C2 / 2;
	const seg = Math.floor(h / 60);
	const [r1, g1, b1] = [
		[C2, X, 0],
		[X, C2, 0],
		[0, C2, X],
		[0, X, C2],
		[X, 0, C2],
		[C2, 0, X],
	][seg % 6] as [number, number, number];
	return rgbToHex([r1 + m0, g1 + m0, b1 + m0]);
}

// =====================================================================================
// 312 palette-audit
// =====================================================================================

const MARGIN_RATIO = 0.15;

/**
 * 312-2 derivation, from the exhaustive 5-subset search in c-search.ts (re-run in c-search.test.ts).
 * normalVisionBest is the best set by plain CIEDE2000 without simulation: a plausible wrong answer.
 */
export const CHART_312 = {
	background: "#ffffff",
	candidates: ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", "#8c564b", "#e377c2", "#7f7f7f", "#a16207", "#0e7490", "#f4c430", "#0b6e4f"],
	best: ["#2ca02c", "#9467bd", "#8c564b", "#7f7f7f", "#0e7490"],
	bestScore: 9.7516,
	threshold: 8.2888,
	normalVisionBest: ["#1f77b4", "#2ca02c", "#d62728", "#9467bd", "#a16207"],
};

function cat312(): Task[] {
	const tasks: Task[] = [];

	// n312-1: which text/background pairs fail WCAG AA (normal 4.5, large 3).
	{
		const pairs: [string, string, string, "normal" | "large"][] = [
			["hero-heading", "#ffffff", "#2563eb", "large"],
			["hero-body", "#e0e7ff", "#4f46e5", "normal"],
			["footer-text", "#94a3b8", "#1e293b", "normal"],
			["badge-label", "#ffffff", "#16a34a", "normal"],
			["price-tag", "#ea580c", "#ffffff", "large"],
			["caption", "#7c8391", "#f3f4f6", "normal"],
			["promo-banner", "#ffffff", "#f97316", "large"],
			["muted-note", "#9ca3af", "#ffffff", "normal"],
		];
		const rows = pairs.map(([id, fg, bg, size]) => {
			const t = size === "large" ? 3 : 4.5;
			const cr = contrast(fg, bg);
			assert(Math.abs(cr - t) >= MARGIN_RATIO, `n312-1 ${id} within ${MARGIN_RATIO} of ${t} (${cr})`);
			return { id, fg, bg, size, t, cr, fails: cr < t };
		});
		const failing = rows.filter((r) => r.fails).map((r) => r.id);
		const allNormal = rows.filter((r) => r.cr < 4.5).map((r) => r.id);
		assert(allNormal.length !== failing.length, "n312-1 large-text rule must matter");
		const params: AuditParams = {
			shape: "set",
			field: "failing",
			item: { k: "id" },
			universe: rows.map((r) => r.id),
			expected: failing,
			mode: "per-item",
			derivation: {
				ratios: rows.map((r) => ({ id: r.id, ratio: r4(r.cr), threshold: r.t })),
				margin: `every ratio at least ${MARGIN_RATIO} from its threshold`,
			},
		};
		tasks.push(
			task(312, 1, {
				prompt: `Quick accessibility pass on our landing page before launch. Below are the text/background pairs in use; tell me which ones fail WCAG 2 AA. "normal" text needs 4.5:1, "large" text (at least 24px, or at least 18.66px bold) needs 3:1.

${rows.map((r) => `- ${r.id}: text ${r.fg} on ${r.bg} (${r.size})`).join("\n")}

${WCAG}

List the ids of the failing pairs (an empty list if none fail).
${contract(`{"failing": ["<id>", ...]}`)}`,
				schema: obj({ failing: arr(STR) }),
				params,
				witness: { failing },
				invalid: [{ failing: allNormal }, { failing: [] }, { failing: rows.map((r) => r.id) }],
			}),
		);
	}

	// n312-2: pick 5 of 12 chart colors, maximizing separation for deuteranopes.
	{
		const { background: bg, candidates } = CHART_312;
		const params: AuditParams = {
			shape: "chart",
			field: "picks",
			candidates,
			background: bg,
			k: 5,
			minContrast: 3,
			threshold: CHART_312.threshold,
			derivation: {
				method: "exhaustive search over all 5-subsets of the candidates with >= 3:1 on the background; score = min pairwise CIEDE2000 between deuteranopia simulations (unrounded)",
				best: CHART_312.best,
				bestScore: CHART_312.bestScore,
				threshold: "0.85 x best score",
			},
		};
		const wrongLowContrast = ["#ff7f0e", "#2ca02c", "#d62728", "#9467bd", "#0b6e4f"];
		tasks.push(
			task(312, 2, {
				prompt: `I'm choosing a 5-color categorical palette for line charts on a white (${bg}) dashboard. Pick 5 different colors from the 12 candidates below. Every line must have at least 3:1 WCAG 2 contrast against the background (non-text contrast), and the five must stay as distinguishable as possible for viewers with deuteranopia: maximize the smallest pairwise color difference between the simulated colors. I'll accept any set whose smallest pairwise difference is at least 85% of the best achievable from these candidates.

Candidates: ${candidates.join(", ")}

${CVD_STD} ${DE_STD} Measure on the unrounded simulated colors. ${WCAG}

${contract(`{"picks": ["#rrggbb", "#rrggbb", "#rrggbb", "#rrggbb", "#rrggbb"]}`)}`,
				schema: obj({ picks: arr(HEX, 5) }),
				params,
				witness: { picks: CHART_312.best },
				invalid: [{ picks: CHART_312.normalVisionBest }, { picks: wrongLowContrast }, { picks: CHART_312.best.slice(0, 4) }],
			}),
		);
	}

	// n312-3: near-duplicate tokens (CIEDE2000 < 3).
	{
		const T = 3;
		const tokens: [string, string][] = [
			["blue-500", "#3b82f6"],
			["brand-primary", "#3a7ff3"],
			["link", "#2563eb"],
			["gray-100", "#f3f4f6"],
			["surface-muted", "#e8eaee"],
			["danger", "#dc2626"],
			["error-text", "#d32c2c"],
			["success", "#16a34a"],
			["accent", "#8b5cf6"],
			["focus", "#5b7cf7"],
		];
		const universe: string[] = [];
		const dupes: string[] = [];
		const all: { pair: string; de: number }[] = [];
		for (let i = 0; i < tokens.length; i++)
			for (let j = i + 1; j < tokens.length; j++) {
				const [a, ha] = tokens[i] as [string, string];
				const [b, hb] = tokens[j] as [string, string];
				const key = [a, b].sort().join("|");
				const de = de2000Hex(ha, hb);
				assert(de <= T * (1 - MARGIN_RATIO) || de >= T * (1 + MARGIN_RATIO), `n312-3 ${key} within 15% of ${T} (${de})`);
				universe.push(key);
				all.push({ pair: key, de: r2(de) });
				if (de < T) dupes.push(key);
			}
		assert(dupes.length >= 3, "n312-3 needs several duplicates");
		const params: AuditParams = {
			shape: "set",
			field: "nearDuplicates",
			item: { k: "pair" },
			universe,
			expected: dupes,
			mode: "per-expected",
			derivation: {
				threshold: T,
				margin: "every pair at least 15% from the threshold",
				closest: [...all].sort((x, y) => x.de - y.de).slice(0, 6),
			},
		};
		const asPairs = (keys: string[]) => [...keys].sort().map((k) => k.split("|"));
		tasks.push(
			task(312, 3, {
				prompt: `Our token file has grown by accretion and I suspect several tokens are visually the same color under different names. Find every pair of tokens whose CIEDE2000 difference is below ${T}.

${tokens.map(([n, h]) => `- ${n}: ${h}`).join("\n")}

${DE_STD}

List each near-duplicate pair once as a two-element array of token names (order within a pair and order of the pairs do not matter).
${contract(`{"nearDuplicates": [["<name-a>", "<name-b>"], ...]}`)}`,
				schema: obj({ nearDuplicates: arr(arr(STR, 2)) }),
				params,
				witness: { nearDuplicates: asPairs(dupes) },
				invalid: [
					{ nearDuplicates: asPairs(dupes.slice(0, 2)) },
					{ nearDuplicates: asPairs([...dupes, "blue-500|focus"]) },
					{ nearDuplicates: [] },
				],
			}),
		);
	}

	// n312-4: derive a dark theme from a light token set.
	{
		const light: Record<string, string> = {
			surface: "#ffffff",
			"surface-raised": "#f9fafb",
			text: "#1f2937",
			"text-muted": "#6b7280",
			primary: "#2563eb",
			"on-primary": "#ffffff",
			link: "#1d4ed8",
			danger: "#b91c1c",
		};
		const pairs: Pair[] = [
			["text", "surface", 4.5],
			["text", "surface-raised", 4.5],
			["text-muted", "surface", 4.5],
			["text-muted", "surface-raised", 4.5],
			["link", "surface", 4.5],
			["danger", "surface", 4.5],
			["on-primary", "primary", 4.5],
		];
		for (const [fg, bg, m] of pairs) assert(contrast(light[fg] as string, light[bg] as string) >= m, `n312-4 light ${fg}/${bg}`);
		const H = (n: string) => oklchOfHex(light[n] as string).H;
		const dark = tokensFrom({
			surface: [0.2, 0.01, 260],
			"surface-raised": [0.25, 0.012, 260],
			text: [0.93, 0.01, 260],
			"text-muted": [0.75, 0.015, 260],
			primary: [0.72, 0.14, H("primary")],
			"on-primary": [0.18, 0.03, H("primary")],
			link: [0.75, 0.13, H("link")],
			danger: [0.7, 0.16, H("danger")],
		});
		const hueChecked = Object.keys(light).filter((n) => oklchOfHex(light[n] as string).C >= 0.04);
		assert(hueChecked.length >= 3, "n312-4 needs hue-checked tokens");
		const params: AuditParams = {
			shape: "dark",
			field: "dark",
			light,
			pairs,
			hueTol: 12,
			hueMinChroma: 0.04,
			darkMinChroma: 0.04,
			surfaces: ["surface", "surface-raised"],
			surfaceMaxL: 0.32,
			derivation: {
				hueChecked,
				tolerance: "12° hue: dark-theme variants typically change lightness and chroma, not hue; 8-bit rounding moves hue < 2° at chroma >= 0.04",
			},
		};
		const inverted = Object.fromEntries(
			Object.entries(light).map(([k, h]) => {
				const v = 0xffffff - Number.parseInt(h.slice(1), 16);
				return [k, `#${v.toString(16).padStart(6, "0")}`];
			}),
		);
		tasks.push(
			task(312, 4, {
				prompt: `We're adding dark mode. Here is our light theme's token set:
${Object.entries(light)
	.map(([k, h]) => `- ${k}: ${h}`)
	.join("\n")}

Produce the dark-theme value for every token. Requirements:
${pairs.map(([fg, bg, m]) => `- ${fg} on ${bg}: WCAG 2 contrast at least ${m}:1 (dark values);`).join("\n")}
- surface and surface-raised are actually dark: Oklab L at most ${params.surfaceMaxL};
- every token whose light value has Oklch chroma of at least ${params.hueMinChroma} keeps its identity in dark mode: Oklch chroma at least ${params.darkMinChroma} and hue within ${params.hueTol}° of the light value's hue. Lightness and chroma may otherwise change freely.

${WCAG} ${OKLCH} Oklab L is the same L. ${ON_HEX}

${contract(`{"dark": {"surface": "#rrggbb", "surface-raised": "#rrggbb", "text": "#rrggbb", ...every token}}`)}`,
				schema: obj({ dark: hexObj(Object.keys(light)) }),
				params,
				witness: { dark },
				invalid: [{ dark: light }, { dark: inverted }, { dark: { ...dark, "text-muted": "#4b5563" } }],
			}),
		);
	}

	// n312-5: non-text UI parts against two dark surfaces (WCAG 1.4.11, 3:1).
	{
		const surfaces: [string, string][] = [
			["app-background", "#0f172a"],
			["panel", "#1e293b"],
		];
		const parts: [string, string][] = [
			["focus-ring", "#3b82f6"],
			["divider", "#334155"],
			["icon-muted", "#68778d"],
			["input-border", "#5b6b82"],
			["selected-outline", "#a78bfa"],
		];
		const rows = parts.flatMap(([p, ph]) =>
			surfaces.map(([s, sh]) => {
				const cr = contrast(ph, sh);
				assert(Math.abs(cr - 3) >= MARGIN_RATIO, `n312-5 ${p}/${s} within ${MARGIN_RATIO} of 3 (${cr})`);
				return { key: `${p}|${s}`, part: p, surface: s, cr, fails: cr < 3 };
			}),
		);
		const failing = rows.filter((r) => r.fails);
		assert(failing.length >= 3 && failing.length <= 7, "n312-5 verdict mix");
		const params: AuditParams = {
			shape: "set",
			field: "failing",
			item: { k: "fields", fields: ["part", "surface"] },
			universe: rows.map((r) => r.key),
			expected: failing.map((r) => r.key),
			mode: "per-item",
			derivation: { ratios: rows.map((r) => ({ combo: r.key, ratio: r4(r.cr) })), margin: `every ratio at least ${MARGIN_RATIO} from 3` },
		};
		const asItems = (rs: typeof rows) => rs.map((r) => ({ part: r.part, surface: r.surface }));
		const at45 = rows.filter((r) => r.cr < 4.5);
		tasks.push(
			task(312, 5, {
				prompt: `Reviewing our dark UI against WCAG 2.x success criterion 1.4.11 (non-text contrast): user-interface components and meaningful graphics need at least 3:1 against adjacent colors. Each of these parts can appear on either of two surfaces.

Surfaces:
${surfaces.map(([s, h]) => `- ${s}: ${h}`).join("\n")}

Parts:
${parts.map(([p, h]) => `- ${p}: ${h}`).join("\n")}

List every (part, surface) combination that falls below 3:1.

${WCAG}

${contract(`{"failing": [{"part": "<part>", "surface": "<surface>"}, ...]}`)}`,
				schema: obj({ failing: arr(obj({ part: STR, surface: STR })) }),
				params,
				witness: { failing: asItems(failing) },
				invalid: [{ failing: asItems(at45) }, { failing: [] }, { failing: asItems(failing.slice(1)) }],
			}),
		);
	}
	return tasks;
}

/** Neutral suite, author C: returns this author's categories' tasks. */
export function neutralC(): Task[] {
	return [...cat309(), ...cat310(), ...cat311(), ...cat312()];
}
