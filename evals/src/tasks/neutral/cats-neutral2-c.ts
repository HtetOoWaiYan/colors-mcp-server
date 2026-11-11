/**
 * Neutral suite v2, author C: categories 309-312 (tonal-scale, role-tokens, constraint-search,
 * palette-audit), five fresh tasks each (ids p309-1 .. p312-5). Same domains and standards as v1
 * (cats-neutral-c.ts), with new scenarios, inputs, wording and a different mix of task shapes.
 * The graders are v1's constraint graders (src/graders-neutral/c-graders.ts) plus one v2 kind for
 * tonal scales with several contrast pairings (v2-c-graders.ts). Witnesses come from the
 * hand-written references in src/reference-neutral/c-*.ts; every witness and every invalid answer is
 * graded at build time and every margin the brief asks for is asserted, so an input change that
 * breaks a task fails the build. Search optima were derived by exhaustive search over all 16.7M
 * opaque 8-bit colors (or all subsets of a candidate list); v2-c-search.test.ts re-derives them.
 */
import { gradeNeutral } from "../../graders-neutral/index.js";
import type { AuditParams, Pair, RolesParams, SearchParams } from "../../graders-neutral/c-graders.js";
import type { Scale2Params } from "../../graders-neutral/v2-c-graders.js";
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
import { CATEGORY_NAMES, type Task } from "../types.js";

// ---------- small builders (copied from v1 and adapted: p-ids, per-task grader kind) ----------

function assert(cond: boolean, msg: string): void {
	if (!cond) throw new Error(`neutral2C build: ${msg}`);
}

const KIND: Record<number, string> = {
	309: "neutral-tonal-scale",
	310: "neutral-role-tokens",
	311: "neutral-constraint-search",
	312: "neutral-palette-audit",
};

interface TaskBody {
	prompt: string;
	schema: Record<string, unknown>;
	params: object;
	witness: unknown;
	invalid: unknown[];
	toolUseful?: boolean;
	/** Grader kind when the category's v1 kind lacks a needed check (see registry2-c.ts). */
	kind?: string;
}

function task(category: number, n: number, t: TaskBody): Task {
	const id = `p${category}-${n}`;
	const grader = { kind: t.kind ?? (KIND[category] as string), params: t.params };
	const failing = gradeNeutral(grader, t.witness).filter((c) => !c.pass);
	assert(failing.length === 0, `${id} witness fails ${failing.map((c) => c.name).join(", ")}`);
	assert(t.invalid.length >= 2, `${id} needs two invalid answers`);
	assert(new Set(t.invalid.map((x) => JSON.stringify(x))).size === t.invalid.length, `${id} invalid answers repeat`);
	t.invalid.forEach((inv, i) =>
		assert(gradeNeutral(grader, inv).some((c) => !c.pass), `${id} invalid[${i}] passes every check`),
	);
	return {
		id,
		category,
		categoryName: CATEGORY_NAMES[category] as string,
		split: "dev",
		prompt: t.prompt,
		schema: t.schema,
		grader,
		witness: t.witness,
		invalid: t.invalid,
		toolUseful: t.toolUseful ?? true,
	};
}

const failedChecks = (kind: string, params: object, answer: unknown) =>
	gradeNeutral({ kind, params }, answer)
		.filter((c) => !c.pass)
		.map((c) => c.name);

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
const norm360 = (h: number) => ((h % 360) + 360) % 360;

// ---------- prompt fragments (v2 wording) ----------

const SRGB_DECODE = "the IEC 61966-2-1 sRGB curve (c / 12.92 when c ≤ 0.04045, otherwise ((c + 0.055) / 1.055)^2.4)";
const OKLCH2 = `By Oklch I mean the polar form of Björn Ottosson's Oklab (lightness L from 0 to 1, chroma C, hue h in degrees), computed from linear-light sRGB after decoding each 8-bit channel with ${SRGB_DECODE}.`;
const OKLAB_L2 = "Wherever I say Oklab L, it is that same lightness.";
const OKDIST2 = "Oklab distance means the straight-line distance between two colors' (L, a, b) Oklab coordinates, L running from 0 to 1.";
const WCAG2 =
	`Contrast means the WCAG 2.x ratio (Y_hi + 0.05) / (Y_lo + 0.05) of the two relative luminances, where Y = 0.2126 R + 0.7152 G + 0.0722 B on channels linearized with ${SRGB_DECODE}.`;
const ROUNDED2 = "I'll measure everything on the #rrggbb codes you send back, so check the rounded values, not your unrounded intermediates.";
const DE2 =
	"For color difference use CIEDE2000 with kL = kC = kH = 1, on CIELAB derived from sRGB through CIE XYZ with a D65 reference white (Xn 0.95047, Yn 1.00000, Zn 1.08883); do not adapt to D50.";
const CVD2 = `For deuteranopia use the Machado, Oliveira and Fernandes (2009) simulation at severity 1.0 (their full dichromat deuteranopia matrix), applied to linear-light sRGB: linearize each channel with ${SRGB_DECODE}, apply the 3×3 matrix, clamp each channel to 0..1, then encode back with the inverse curve.`;
const keyList = SCALE_KEYS.join(", ");

// =====================================================================================
// 309 tonal-scale
// =====================================================================================

const SCALE_PAIRS_KIND = "neutral-tonal-scale-pairs";

interface ScaleSpec {
	seed: string;
	seedKey: string | null;
	top: number;
	bottom: number;
	chroma: number[];
	params: Omit<Scale2Params, "keys" | "stepRatio" | "hue"> & { hueTol: number };
}

function scaleParams(s: ScaleSpec): { params: Scale2Params; witness: Record<string, string> } {
	const seed = oklchOfHex(s.seed);
	const seedIdx = s.seedKey ? SCALE_KEYS.indexOf(s.seedKey as (typeof SCALE_KEYS)[number]) : 5;
	const Ls = lightnessLadder(s.top, seedIdx, s.seedKey ? seed.L : (s.top + s.bottom) / 2, s.bottom);
	const witness = buildScale(s.seed, s.seedKey, Ls, s.chroma);
	const { hueTol, ...rest } = s.params;
	const params: Scale2Params = {
		keys: [...SCALE_KEYS],
		stepRatio: [0.5, 1.8],
		hue: { seedHue: r2(seed.H), tol: hueTol, minChroma: 0.02 },
		...rest,
	};
	return { params, witness };
}

/** Requirement bullets generated from the params, so the prompt and the grader cannot drift apart. */
function scaleRules2(p: Scale2Params, name: string): string {
	const lines = [
		`keys ${keyList} and no others, each value an opaque #rrggbb code;`,
		`Oklch L falls at every step from 50 down to 950; step 50 sits at L ≥ ${p.lightFloor} and step 950 at L ≤ ${p.darkCeiling};`,
		`the ten lightness gaps between neighbouring steps are fairly even: none is smaller than ${p.stepRatio[0]}× or larger than ${p.stepRatio[1]}× the median gap;`,
		`hue holds steady: any step with Oklch chroma of ${p.hue.minChroma} or more has its hue no more than ${p.hue.tol}° away from ${name}'s ${p.hue.seedHue}°;`,
	];
	if (p.seed)
		lines.push(
			`${name} (${p.seed.hex}) sits at step ${p.seed.steps.join(" or ")}; anything within an Oklab distance of ${p.seed.tol} of it counts as ${name}, so the exact code is the safe choice;`,
		);
	if (p.midChroma) {
		const mc = p.midChroma;
		lines.push(
			`the middle keeps its color: among steps ${mc.steps.join(", ")}, not counting a step that holds ${name} itself, at least one reaches Oklch chroma ${r4(mc.ratio * mc.seedChroma)} (${mc.ratio} × ${name}'s chroma of ${mc.seedChroma});`,
		);
	}
	if (p.maxChroma !== undefined) lines.push(`nothing goes above Oklch chroma ${p.maxChroma};`);
	if (p.tint)
		lines.push(
			`steps ${p.tint.steps.join(", ")} each keep a hint of ${name}: Oklch chroma ${p.tint.minChroma} or more, with hue within ${p.tint.hueTol}° of ${name}'s;`,
		);
	for (const pr of p.pairs ?? []) lines.push(`step ${pr.fg} against step ${pr.bg}: WCAG 2 contrast of at least ${pr.min}:1;`);
	for (const a of p.against ?? [])
		lines.push(`step ${a.step} against ${a.label} (${a.color}): WCAG 2 contrast of at least ${a.min}:1;`);
	lines.push("no two steps share a color.");
	return lines.map((l) => `- ${l}`).join("\n");
}

const SCALE_SHAPE2 = `{"scale": {"50": "#rrggbb", "100": "#rrggbb", "200": "#rrggbb", ..., "950": "#rrggbb"}}`;
const scaleSchema = (withCss = false) =>
	withCss ? obj({ scale: hexObj(SCALE_KEYS), css: STR }) : obj({ scale: hexObj(SCALE_KEYS) });

const reversed = (s: Record<string, string>) =>
	Object.fromEntries(SCALE_KEYS.map((k, i) => [k, s[SCALE_KEYS[10 - i] as string] as string]));
const dropKey = (s: Record<string, string>, k: string) => Object.fromEntries(Object.entries(s).filter(([x]) => x !== k));

/** Every mid-band step except the seed's drops below the mid-chroma bar; must fail mid-chroma-kept only. */
function washedOut(w: Record<string, string>, p: Scale2Params, kind: string, seedKey: string, css?: string): Record<string, string> {
	const mc = p.midChroma as NonNullable<Scale2Params["midChroma"]>;
	const thr = mc.ratio * mc.seedChroma;
	const out = { ...w };
	for (const k of mc.steps) {
		if (k === seedKey) continue;
		const c = oklchOfHex(w[k] as string);
		out[k] = hexOfOklch(c.L, Math.min(c.C, 0.6 * thr), p.hue.seedHue);
	}
	const answer = css ? { scale: out, css: cssLines(css, out) } : { scale: out };
	const f = failedChecks(kind, p, answer);
	assert(f.length === 1 && f[0] === "mid-chroma-kept", `washed-out scale must fail only mid-chroma-kept (fails ${f.join(", ")})`);
	return out;
}

function cat309(): Task[] {
	const tasks: Task[] = [];

	// p309-1: vivid yellow seed whose peak chroma is gamut-limited; JSON plus CSS custom properties.
	{
		const seed = "#ffc61a";
		const s = oklchOfHex(seed);
		const { params, witness } = scaleParams({
			seed,
			seedKey: "200",
			top: 0.98,
			bottom: 0.26,
			chroma: [0.035, 0.09, 0, 0.17, 0.16, 0.15, 0.135, 0.115, 0.095, 0.075, 0.055],
			params: {
				hueTol: 20,
				lightFloor: 0.96,
				darkCeiling: 0.3,
				seed: { hex: seed, steps: ["200", "300"], tol: 0.02 },
				midChroma: { steps: ["300", "400", "500", "600", "700"], ratio: 0.7, seedChroma: r4(s.C) },
				css: { prefix: "sunflower" },
				derivation: {
					witness: "seed at 200 (Oklch L ~0.86); piecewise-linear L 0.98 -> seed -> 0.26 at the seed hue; chroma requested up to 0.17 and gamut-mapped by chroma reduction (yellow loses chroma fast as L drops)",
					midChroma: "0.7 x seed chroma: dark yellows cannot keep the seed's chroma inside sRGB, but 300/400 can stay near it",
					seedSteps: "200 or 300: a yellow this light belongs near the top of a 50-950 scale; at 500 the light end would be crushed",
					css: "every --sunflower-<key> declaration must appear once and equal the JSON value (case-insensitive, #rgb expanded)",
				},
			},
		});
		const css = cssLines("sunflower", witness);
		const wrongCss = css.replace(witness["600"] as string, witness["700"] as string);
		const atFive = buildScale(seed, "500", lightnessLadder(0.98, 5, s.L, 0.26), [0.03, 0.06, 0.09, 0.12, 0.15, 0, 0.12, 0.1, 0.08, 0.06, 0.05]);
		const wo = washedOut(witness, params, KIND[309] as string, "200", "sunflower");
		tasks.push(
			task(309, 1, {
				prompt: `Our festival ticketing brand is built around a sunflower yellow, ${seed}. I'm setting up the design tokens and need an eleven-step tonal ramp from it (${keyList}, palest first), both as JSON and as CSS custom properties for our :root block.

Constraints the ramp has to meet:
${scaleRules2(params, "the sunflower yellow")}

For the CSS: one declaration per step, written \`--sunflower-50: #rrggbb;\` and so on for every key (one per line is nicest), carrying exactly the same colors as the JSON.

${OKLCH2} ${OKDIST2} ${ROUNDED2}

${contract(`{"scale": {"50": "#rrggbb", ..., "950": "#rrggbb"}, "css": "--sunflower-50: #rrggbb;\\n--sunflower-100: #rrggbb;\\n..."}`)}`,
				schema: scaleSchema(true),
				params,
				witness: { scale: witness, css },
				invalid: [
					{ scale: witness, css: wrongCss },
					{ scale: atFive, css: cssLines("sunflower", atFive) },
					{ scale: wo, css: cssLines("sunflower", wo) },
					{ scale: reversed(witness), css: cssLines("sunflower", reversed(witness)) },
				],
			}),
		);
	}

	// p309-2: pale lavender seed; step 50 used as label color on step 600 buttons.
	{
		const seed = "#ddd3f5";
		const s = oklchOfHex(seed);
		const chroma = [0.02, 0.035, 0, 0.08, 0.12, 0.15, 0.15, 0.13, 0.11, 0.085, 0.06];
		const { params, witness } = scaleParams({
			seed,
			seedKey: "200",
			top: 0.975,
			bottom: 0.2,
			chroma,
			params: {
				hueTol: 20,
				lightFloor: 0.95,
				darkCeiling: 0.3,
				seed: { hex: seed, steps: ["100", "200"], tol: 0.02 },
				midChroma: { steps: ["300", "400", "500", "600", "700"], ratio: 2, seedChroma: r4(s.C) },
				pairs: [{ fg: "50", bg: "600", min: 4.5 }],
				derivation: {
					witness: "seed at 200; L 0.975 -> seed -> 0.20; chroma rising to 0.15 in the middle",
					midChroma: "ratio 2: a pastel seed's middle steps must be clearly more saturated than the pastel",
					contrast: "binding: the same ladder ending at 0.25 instead of 0.20 puts 600 at L ~0.565 and misses 4.5:1 against 50",
				},
			},
		});
		const shallow = buildScale(seed, "200", lightnessLadder(0.975, 2, s.L, 0.25), chroma);
		assert(contrast(shallow["50"] as string, shallow["600"] as string) < 4.5, "p309-2 shallow ladder must miss the pairing");
		tasks.push(
			task(309, 2, {
				prompt: `The meditation app I'm designing uses a very soft lavender, ${seed}, as its signature color. I need it turned into a full 50 → 950 scale (keys ${keyList}; 50 is the lightest) so the product also gets saturated mid-tones and deep shades. Primary buttons will be filled with step 600 and labelled in step 50, so that pairing must clear AA for body text.

Please meet every one of these:
${scaleRules2(params, "the lavender")}

${WCAG2} ${OKLCH2} ${OKDIST2} ${ROUNDED2}

${contract(SCALE_SHAPE2)}`,
				schema: scaleSchema(),
				params,
				kind: SCALE_PAIRS_KIND,
				witness: { scale: witness },
				invalid: [
					{ scale: shallow },
					{ scale: washedOut(witness, params, SCALE_PAIRS_KIND, "200") },
					{ scale: dropKey(witness, "50") },
					{ scale: { ...witness, "800": witness["700"] } },
				],
			}),
		);
	}

	// p309-3: near-black navy seed; scale doubles as a dark-mode palette with two pairings.
	{
		const seed = "#13294b";
		const s = oklchOfHex(seed);
		const { params, witness } = scaleParams({
			seed,
			seedKey: "900",
			top: 0.975,
			bottom: 0.2,
			chroma: [0.012, 0.03, 0.05, 0.08, 0.11, 0.13, 0.13, 0.11, 0.09, 0, 0.05],
			params: {
				hueTol: 20,
				lightFloor: 0.95,
				darkCeiling: 0.25,
				seed: { hex: seed, steps: ["800", "900"], tol: 0.02 },
				midChroma: { steps: ["400", "500", "600", "700"], ratio: 1.5, seedChroma: r4(s.C) },
				pairs: [
					{ fg: "200", bg: "900", min: 7 },
					{ fg: "400", bg: "950", min: 4.5 },
				],
				derivation: {
					witness: "seed at 900 (L ~0.29); L 0.975 -> seed -> 0.20 at 950",
					midChroma: "ratio 1.5: a scale grown from a dark, muted navy must not stay grayish in the middle",
					darkCeiling: "0.25: step 950 is the dark-mode page background and has to sit below the navy",
				},
			},
		});
		const grayish = buildScale(seed, "900", lightnessLadder(0.975, 9, s.L, 0.2), SCALE_KEYS.map((_, i) => Math.min(0.05, 0.01 + 0.005 * i)));
		const stopsAtSeed = buildScale(seed, "950", lightnessLadder(0.975, 10, s.L, s.L), [0.012, 0.03, 0.05, 0.08, 0.11, 0.13, 0.13, 0.11, 0.09, 0.07, 0]);
		tasks.push(
			task(309, 3, {
				prompt: `Our fintech dashboard's brand color is a near-black navy, ${seed}. I want one 11-step scale (${keyList}, light to dark) that serves both themes: in dark mode, step 950 is the page background, step 900 is the card color, body text on cards uses step 200, and links on the page background use step 400.

Requirements:
${scaleRules2(params, "the navy")}

${WCAG2} ${OKLCH2} ${OKDIST2} ${ROUNDED2}

${contract(SCALE_SHAPE2)}`,
				schema: scaleSchema(),
				params,
				kind: SCALE_PAIRS_KIND,
				witness: { scale: witness },
				invalid: [{ scale: grayish }, { scale: stopsAtSeed }, { scale: reversed(witness) }],
			}),
		);
	}

	// p309-4: warm-tinted neutral scale with light-mode and dark-mode text pairings.
	{
		const seed = "#c4663f";
		const chroma = [0.006, 0.015, 0.017, 0.019, 0.021, 0.023, 0.023, 0.022, 0.02, 0.017, 0.013];
		const { params, witness } = scaleParams({
			seed,
			seedKey: null,
			top: 0.978,
			bottom: 0.18,
			chroma,
			params: {
				hueTol: 20,
				lightFloor: 0.965,
				darkCeiling: 0.22,
				maxChroma: 0.03,
				tint: { steps: ["100", "200", "300", "400", "500", "600", "700", "800"], minChroma: 0.012, hueTol: 22 },
				pairs: [
					{ fg: "600", bg: "50", min: 4.5 },
					{ fg: "100", bg: "900", min: 7 },
				],
				derivation: {
					witness: "uniform Oklch L 0.978 -> 0.18 at the terracotta's hue, chroma 0.006-0.023",
					tint: "chroma >= 0.012 keeps the warmth visible; 22° hue tolerance because 8-bit rounding moves a and b by up to ~0.0025, i.e. up to ~12° of hue at chroma 0.012",
					cap: "0.03: still reads as a neutral next to the terracotta (chroma ~0.13)",
				},
			},
		});
		const pureGray = Object.fromEntries(SCALE_KEYS.map((k) => [k, hexOfOklch(oklchOfHex(witness[k] as string).L, 0, 0)]));
		const tooWarm = Object.fromEntries(
			SCALE_KEYS.map((k) => {
				const c = oklchOfHex(witness[k] as string);
				return [k, hexOfOklch(c.L, Math.min(0.07, c.C * 3), c.H)];
			}),
		);
		const narrow = buildScale(seed, null, lightnessLadder(0.978, 5, (0.978 + 0.3) / 2, 0.3), chroma);
		tasks.push(
			task(309, 4, {
				prompt: `For the neutrals of our pottery shop's site I'd like grays that are warmed very slightly by our terracotta, ${seed}, rather than flat or bluish grays. Build an 11-step neutral scale (${keyList}, lightest to darkest); the terracotta itself should not appear in it. In light mode, secondary text is step 600 on a step 50 page; in dark mode, text is step 100 on step 900 panels.

The scale is done when:
${scaleRules2(params, "the terracotta")}

${WCAG2} ${OKLCH2} ${ROUNDED2}

${contract(SCALE_SHAPE2)}`,
				schema: scaleSchema(),
				params,
				kind: SCALE_PAIRS_KIND,
				witness: { scale: witness },
				invalid: [{ scale: pureGray }, { scale: tooWarm }, { scale: narrow }],
			}),
		);
	}

	// p309-5: orange seed too light for white text; steps 500 and 600 must work with white.
	{
		const seed = "#f7801f";
		const s = oklchOfHex(seed);
		const white = "#ffffff";
		assert(contrast(seed, white) < 3, "p309-5 seed must miss 3:1 on white");
		const { params, witness } = scaleParams({
			seed,
			seedKey: "400",
			top: 0.975,
			bottom: 0.25,
			chroma: [0.02, 0.05, 0.09, 0.14, 0, 0.17, 0.155, 0.135, 0.11, 0.085, 0.065],
			params: {
				hueTol: 20,
				lightFloor: 0.95,
				darkCeiling: 0.3,
				seed: { hex: seed, steps: ["400", "500"], tol: 0.02 },
				midChroma: { steps: ["300", "400", "500", "600", "700"], ratio: 0.75, seedChroma: r4(s.C) },
				against: [
					{ step: "500", color: white, label: "white", min: 3 },
					{ step: "600", color: white, label: "white", min: 4.5 },
				],
				derivation: {
					witness: "seed at 400 (it is below 3:1 on white, so it cannot be 500); L 0.975 -> seed -> 0.25",
					seedSteps: "400 or 500 offered; only 400 is compatible with the 500-on-white rule, which the solver has to notice",
				},
			},
		});
		const atFive = buildScale(seed, "500", lightnessLadder(0.975, 5, s.L, 0.25), [0.02, 0.05, 0.09, 0.12, 0.15, 0, 0.155, 0.135, 0.11, 0.085, 0.065]);
		const f = failedChecks(SCALE_PAIRS_KIND, params, { scale: atFive });
		assert(f.includes("contrast-500-vs-white"), "p309-5 seed-at-500 answer must fail the 500 pairing");
		tasks.push(
			task(309, 5, {
				prompt: `Marketing picked ${seed} as the new campaign orange and wants it as a tonal scale in our token set (${keyList}, from lightest to darkest). Two usage rules come from our design guidelines: step 500 is used for icons and chart strokes on white, so it needs the 3:1 non-text contrast against white; step 600 fills buttons with white labels, so it needs 4.5:1 against white. The orange itself should land at step 400 or 500, whichever works.

Checklist:
${scaleRules2(params, "the campaign orange")}

${WCAG2} ${OKLCH2} ${OKDIST2} ${ROUNDED2}

${contract(SCALE_SHAPE2)}`,
				schema: scaleSchema(),
				params,
				kind: SCALE_PAIRS_KIND,
				witness: { scale: witness },
				invalid: [
					{ scale: atFive },
					{ scale: washedOut(witness, params, SCALE_PAIRS_KIND, "400") },
					{ scale: dropKey(witness, "950") },
				],
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
type Theme = "light" | "dark";

function lightTable(h: number, c: number, sec: number, aaa: boolean): Table {
	return {
		primary: [aaa ? 0.43 : 0.5, Math.min(c, 0.17), h],
		"on-primary": [1, 0, h],
		"primary-container": [0.92, Math.min(c, 0.06), h],
		"on-primary-container": [aaa ? 0.27 : 0.33, Math.min(c, 0.1), h],
		secondary: [aaa ? 0.45 : 0.52, 0.08, sec],
		surface: [0.985, 0.006, h],
		"on-surface": [0.23, 0.012, h],
		"surface-variant": [0.925, 0.014, h],
		outline: [0.55, 0.02, h],
		error: [aaa ? 0.44 : 0.51, 0.18, 27],
		"on-error": [1, 0, 27],
	};
}
function darkTable(h: number, c: number, sec: number, aaa: boolean): Table {
	return {
		primary: [aaa ? 0.82 : 0.8, Math.min(c, 0.12), h],
		"on-primary": [aaa ? 0.21 : 0.3, Math.min(c, 0.08), h],
		"primary-container": [aaa ? 0.33 : 0.4, Math.min(c, 0.11), h],
		"on-primary-container": [0.94, Math.min(c, 0.04), h],
		secondary: [0.8, 0.08, sec],
		surface: [0.19, 0.008, h],
		"on-surface": [0.93, 0.008, h],
		"surface-variant": [0.29, 0.014, h],
		outline: [0.65, 0.02, h],
		error: [0.8, 0.1, 25],
		"on-error": [aaa ? 0.23 : 0.32, 0.09, 25],
	};
}

function roleRules2(p: RolesParams, seed: string): string {
	const where = p.themes.length === 2 ? "in both themes" : `in the ${p.themes[0]} theme`;
	const off = r2(hueSigned(p.secondary.hue, p.primary.seedHue));
	const container = p.themes.map((t) =>
		t === "light" ? "lighter than primary in the light theme" : "darker than primary in the dark theme",
	);
	const surf = p.themes.map((t) =>
		t === "light" ? `Oklab L ≥ ${p.surfaces.lightMinL} in the light theme` : `Oklab L ≤ ${p.surfaces.darkMaxL} in the dark theme`,
	);
	const lines = [
		`each role above is given ${where} as a #rrggbb code;`,
		...p.pairs.map(([fg, bg, m]) => `${fg} against ${bg}: WCAG 2 contrast ≥ ${m}:1 ${where};`),
		`primary-container is ${container.join(", and ")}, by a margin of at least ${p.containerMargin} in Oklab L;`,
		`primary stays recognisably the seed: Oklch chroma ≥ ${p.primary.minChroma}, hue no more than ${p.primary.tol}° from the seed ${seed}'s ${p.primary.seedHue}°;`,
		`secondary is a neighbouring accent: Oklch chroma ≥ ${p.secondary.minChroma}, hue within ${p.secondary.tol}° of ${p.secondary.hue}° (seed hue ${off >= 0 ? "+" : "−"} ${Math.abs(off)}°);`,
		`${p.surfaces.roles.join(", ")} stay close to neutral: Oklch chroma ≤ ${p.surfaces.maxChroma};`,
		`surface has ${surf.join(", and ")};`,
		`error is clearly a red: Oklch hue from ${p.error.band[0]}° to ${p.error.band[1]}°, chroma ≥ ${p.error.minChroma};`,
		...(p.bands ?? []).map((b) => `${b.role}: Oklch hue from ${b.band[0]}° to ${b.band[1]}°, chroma ≥ ${b.minChroma};`),
	];
	for (const lr of p.lightness ?? [])
		lines.push(`${lr.role} in the ${lr.theme} theme: Oklab L ${lr.min !== undefined ? `≥ ${lr.min}` : `≤ ${lr.max}`};`);
	if (p.levels) {
		const dir = p.themes[0] === "light" ? "darker" : "lighter";
		lines.push(
			`${p.levels.roles.join(", ")} form a stack of elevation levels in that order, each one ${dir} than the one before by at least ${p.levels.minStep} in Oklab L;`,
		);
	}
	return lines.map((l) => `- ${l}`).join("\n");
}

interface RolesSpec {
	seed: string;
	secOffset: number;
	aaa: boolean;
	themes: Theme[];
	extraRoles?: string[];
	extraPairs?: Pair[];
	extraLight?: Table;
	extraDark?: Table;
	bands?: RolesParams["bands"];
	levels?: RolesParams["levels"];
	lightness?: RolesParams["lightness"];
	primaryMinChroma?: number;
	intro: string;
	outro?: string;
}

type ThemeSets = Record<string, Record<string, string>>;

function rolesTask(n: number, o: RolesSpec, extraInvalid: (w: ThemeSets) => unknown[] = () => []): Task {
	const s = oklchOfHex(o.seed);
	const sec = norm360(s.H + o.secOffset);
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
			roles: ["surface", "surface-variant", ...(o.levels ? o.levels.roles.slice(1) : [])],
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
				"Oklch tone tables per theme at the seed hue (light: primary L 0.50, or 0.43 for 7:1, container 0.92, surface 0.985; dark: primary 0.80/0.82, container 0.40/0.33, surface 0.19), gamut-mapped by chroma reduction",
			tolerances:
				"hue: 15° for primary, 20° for secondary (8-bit rounding moves hue by < 5° at chroma >= 0.03); container margin 0.15 Oklab L (Material-style containers sit ~0.4 away from primary); surface chroma <= 0.03 reads as neutral",
		},
	};
	const light = tokensFrom({ ...lightTable(s.H, s.C, sec, o.aaa), ...(o.extraLight ?? {}) });
	const dark = tokensFrom({ ...darkTable(s.H, s.C, sec, o.aaa), ...(o.extraDark ?? {}) });
	const sets: Record<Theme, Record<string, string>> = { light, dark };
	const witness: ThemeSets = Object.fromEntries(o.themes.map((t) => [t, sets[t]]));
	const swapped = Object.fromEntries(o.themes.map((t) => [t, sets[t === "light" ? "dark" : "light"]]));
	const pinkError = Object.fromEntries(
		o.themes.map((t) => {
			const set = { ...sets[t] };
			const e = oklchOfHex(set.error as string);
			set.error = hexOfOklch(e.L, e.C, 350);
			return [t, set];
		}),
	);
	const shape =
		o.themes.length === 2
			? `{"light": {"primary": "#rrggbb", "on-primary": "#rrggbb", ...one entry per role}, "dark": {...the same roles}}`
			: `{"${o.themes[0]}": {"primary": "#rrggbb", "on-primary": "#rrggbb", ...one entry per role}}`;
	return task(310, n, {
		prompt: `${o.intro}

Roles: ${roles.join(", ")}.

What I need from the result:
${roleRules2(params, o.seed)}
${o.outro ? `\n${o.outro}\n` : ""}
${WCAG2} ${OKLCH2} ${OKLAB_L2} ${ROUNDED2}

${contract(shape)}`,
		schema: obj(Object.fromEntries(o.themes.map((t) => [t, hexObj(roles)]))),
		params,
		witness,
		invalid: [swapped, pinkError, ...extraInvalid(witness)],
	});
}

function cat310(): Task[] {
	const lowSeed = "#6b7a8f";
	const tert = norm360(oklchOfHex(lowSeed).H - 120);
	const blueH = oklchOfHex("#1f5fa8").H;
	const cyanH = oklchOfHex("#00b4d8").H;
	return [
		// p310-1: light theme only, 7:1 everywhere, three surface elevation levels.
		rolesTask(
			1,
			{
				seed: "#1f5fa8",
				secOffset: 35,
				aaa: true,
				themes: ["light"],
				extraRoles: ["surface-container-low", "surface-container"],
				extraPairs: [
					["on-surface", "surface-container-low", 7],
					["on-surface", "surface-container", 7],
				],
				extraLight: {
					"surface-container-low": [0.955, 0.01, blueH],
					"surface-container": [0.925, 0.012, blueH],
				},
				levels: { roles: ["surface", "surface-container-low", "surface-container"], minStep: 0.02 },
				intro: `Our county archive's catalogue site only ships a light theme, and our accessibility policy asks for 7:1 on every text pairing (WCAG AAA). From the seed blue #1f5fa8, please give me the light theme's color roles, including two container surfaces that step down from the page surface for cards and side panels.`,
			},
			(w) => [
				{ light: { ...w.light, "surface-container": w.light?.surface } },
				// Built to the AA tone table (4.5:1) instead of 7:1.
				{
					light: {
						...w.light,
						...tokensFrom(lightTable(blueH, oklchOfHex("#1f5fa8").C, norm360(blueH + 35), false)),
					},
				},
			],
		),
		// p310-2: low-chroma slate seed, both themes, AA, plus a tertiary accent in a stated hue band.
		rolesTask(
			2,
			{
				seed: lowSeed,
				secOffset: 30,
				aaa: false,
				themes: ["light", "dark"],
				primaryMinChroma: 0.02,
				extraRoles: ["tertiary", "on-tertiary"],
				extraPairs: [["on-tertiary", "tertiary", 4.5]],
				extraLight: { tertiary: [0.5, 0.1, tert], "on-tertiary": [1, 0, tert] },
				extraDark: { tertiary: [0.8, 0.1, tert], "on-tertiary": [0.3, 0.06, tert] },
				bands: [{ role: "tertiary", band: [r2(norm360(tert - 20)), r2(norm360(tert + 20))], minChroma: 0.06 }],
				intro: `A logistics client's brand color is a desaturated slate, ${lowSeed}, close to gray. They want light and dark themes of color roles derived from it, with WCAG AA (4.5:1) on every text pairing, and a tertiary accent that brings some life into the otherwise muted palette.`,
				outro: "The tertiary band is centred on the seed hue minus 120°. Because the seed has so little chroma, the bar for primary's chroma is deliberately low.",
			},
			(w) => [Object.fromEntries(Object.entries(w).map(([t, set]) => [t, { ...set, tertiary: set.secondary }]))],
		),
		// p310-3: vivid cyan seed, both themes, AA, on-surface-variant text and primary visible on surface.
		rolesTask(
			3,
			{
				seed: "#00b4d8",
				secOffset: -45,
				aaa: false,
				themes: ["light", "dark"],
				extraRoles: ["on-surface-variant"],
				extraPairs: [
					["on-surface-variant", "surface", 4.5],
					["on-surface-variant", "surface-variant", 4.5],
					["primary", "surface", 3],
				],
				extraLight: { "on-surface-variant": [0.42, 0.02, cyanH] },
				extraDark: { "on-surface-variant": [0.8, 0.02, cyanH] },
				intro: `We're re-theming a sailing-weather app around the bright cyan #00b4d8. I need color roles for a light and a dark theme. Text pairs need WCAG AA (4.5:1), and that includes the secondary text role on-surface-variant on both surface roles. The primary color is also drawn bare on the surface for map markers, so primary needs the 3:1 non-text contrast against surface.`,
			},
			(w) => [Object.fromEntries(Object.entries(w).map(([t, set]) => [t, { ...set, primary: "#00b4d8" }]))],
		),
		// p310-4: dark theme only, 7:1, error-container roles, primary visible on surface.
		rolesTask(
			4,
			{
				seed: "#5c6bc0",
				secOffset: 60,
				aaa: true,
				themes: ["dark"],
				extraRoles: ["error-container", "on-error-container"],
				extraPairs: [
					["on-error-container", "error-container", 7],
					["primary", "surface", 3],
				],
				extraDark: {
					"error-container": [0.36, 0.09, 25],
					"on-error-container": [0.93, 0.035, 25],
				},
				bands: [{ role: "error-container", band: [15, 45], minChroma: 0.04 }],
				lightness: [{ role: "error-container", theme: "dark", max: 0.45 }],
				intro: `Our observatory's night-viewing console runs in a dark theme only, and the staff asked for 7:1 text contrast so it stays readable on dimmed screens. From the seed indigo #5c6bc0, give me the dark theme's roles, including an error container (the tinted box behind inline error messages) with its own text color. Primary is also used bare for focus outlines on the surface, so it needs 3:1 against surface.`,
			},
			(w) => [{ dark: { ...w.dark, "error-container": w.dark?.error } }],
		),
		// p310-5: purple seed, both themes, AA, status roles success / warning / info.
		rolesTask(
			5,
			{
				seed: "#8a3ffc",
				secOffset: -30,
				aaa: false,
				themes: ["light", "dark"],
				extraRoles: ["success", "on-success", "warning", "on-warning", "info", "on-info"],
				extraPairs: [
					["on-success", "success", 4.5],
					["on-warning", "warning", 4.5],
					["on-info", "info", 4.5],
				],
				extraLight: {
					success: [0.5, 0.13, 152],
					"on-success": [1, 0, 152],
					warning: [0.82, 0.15, 80],
					"on-warning": [0.27, 0.05, 75],
					info: [0.5, 0.12, 245],
					"on-info": [1, 0, 245],
				},
				extraDark: {
					success: [0.8, 0.14, 152],
					"on-success": [0.28, 0.06, 152],
					warning: [0.84, 0.14, 80],
					"on-warning": [0.27, 0.05, 75],
					info: [0.8, 0.1, 245],
					"on-info": [0.28, 0.06, 245],
				},
				bands: [
					{ role: "success", band: [135, 170], minChroma: 0.06 },
					{ role: "warning", band: [60, 100], minChroma: 0.06 },
					{ role: "info", band: [225, 265], minChroma: 0.06 },
				],
				intro: `The seed for our analytics product is the purple #8a3ffc. Along with the standard roles I need three status families, success, warning and info, each with an on- color for the text and icons placed on it, in both a light and a dark theme. Every text pairing must meet WCAG AA (4.5:1).`,
			},
			(w) => [Object.fromEntries(Object.entries(w).map(([t, set]) => [t, { ...set, warning: set.error }]))],
		),
	];
}

// =====================================================================================
// 311 constraint-search
// =====================================================================================

/**
 * Stored results of the exhaustive searches (all 16,777,216 opaque 8-bit colors).
 * v2-c-search.test.ts recomputes each by brute force and fails if these drift.
 */
export const SEARCH2_311 = {
	fixDarkText: { background: "#eefaf3", original: "#3aa76d", target: 4.5, hueTol: 6, optimum: 0.114239, best: "#20824b" },
	fixLightText: { background: "#16161e", original: "#9d7cd8", target: 7, hueTol: 8, optimum: 0.067078, best: "#ac93ef" },
	dual: {
		light: "#fafaf9",
		dark: "#1c1917",
		min: 3,
		band: [45, 70] as [number, number],
		maxChroma: 0.192769,
		best: "#f26500",
		floor: 0.165,
		feasibleAtFloor: 12358,
		/** Highest-chroma color clearing 3.08:1 on both surfaces with hue in [48, 67]: slack on every rule. */
		witness: "#e96900",
		current: "#f57c00",
		/** Common design-system oranges; every one must fail (asserted in v2-c-search.test.ts). */
		commonOranges: ["#f59e0b", "#d97706", "#ea580c", "#f97316", "#fb923c", "#c2410c", "#fd7e14", "#ff9800", "#f57c00", "#ef6c00", "#e67700"],
	},
};

const FIX_FACTOR = 2;
const FIX_SLACK = 0.01;

type Fix = (typeof SEARCH2_311)["fixDarkText"];

function fixTask(n: number, f: Fix, field: string, prompt: (ratio: number, hue: number) => string, wrong: string[]): Task {
	const ratio = contrast(f.original, f.background);
	assert(ratio < f.target, `p311-${n} original must fail`);
	const bound = r4(FIX_FACTOR * f.optimum + FIX_SLACK);
	const params: SearchParams = {
		shape: "fix",
		field,
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
			bound: `distance <= ${FIX_FACTOR} x optimum + ${FIX_SLACK} = ${bound}`,
			originalRatio: r2(ratio),
		},
	};
	return task(311, n, {
		prompt: prompt(r2(ratio), r2(oklchOfHex(f.original).H)),
		schema: obj({ [field]: HEX }),
		params,
		witness: { [field]: f.best },
		invalid: wrong.map((h) => ({ [field]: h })),
	});
}

function cat311(): Task[] {
	const tasks: Task[] = [];

	// p311-1: green success text on a pale green toast fails AA; darken it minimally.
	{
		const f = SEARCH2_311.fixDarkText;
		tasks.push(
			fixTask(
				1,
				f,
				"toastText",
				(ratio, hue) => `Our "Saved!" toast prints its message in ${f.original} on the toast's pale green fill ${f.background}, and QA measured it at only ${ratio}:1. I want the smallest possible change to the text color that gets it to WCAG AA for normal text, so the toast still looks the way the designers drew it.

A replacement passes if:
- it has a WCAG 2 contrast of ${f.target}:1 or more against ${f.background};
- its Oklch hue is within ${f.hueTol}° of the current text color's ${hue}°;
- it is close to ${f.original}: its Oklab distance from ${f.original} may be at most ${FIX_FACTOR} times the smallest distance that any 8-bit color meeting the first two conditions can reach, plus ${FIX_SLACK}.

${WCAG2} ${OKLCH2} ${OKDIST2} ${ROUNDED2}

${contract(`{"toastText": "#rrggbb"}`)}`,
				[f.original, "#000000", "#1b4332", "#2b8a8a"],
			),
		);
	}

	// p311-2: purple keyword color in a dark code editor must reach 7:1; lighten minimally.
	{
		const f = SEARCH2_311.fixLightText;
		tasks.push(
			fixTask(
				2,
				f,
				"keyword",
				(ratio, hue) => `In our code editor's dark theme, language keywords are drawn in ${f.original} on the editor background ${f.background}. That's ${ratio}:1, and since this theme is sold as the high-contrast option it has to reach WCAG AAA: ${f.target}:1. Please nudge the keyword color just far enough; it must still read as the same purple.

Acceptance:
- WCAG 2 contrast against ${f.background} of at least ${f.target}:1;
- Oklch hue no more than ${f.hueTol}° from ${f.original}'s hue (${hue}°);
- Oklab distance from ${f.original} at most ${FIX_FACTOR}× the minimum achievable by any 8-bit color that meets the two rules above, plus ${FIX_SLACK}.

${WCAG2} ${OKLCH2} ${OKDIST2} ${ROUNDED2}

${contract(`{"keyword": "#rrggbb"}`)}`,
				[f.original, "#ffffff", "#c7b8f5", "#a0a0ff"],
			),
		);
	}

	// p311-3: one orange that is visible on a light and a dark card.
	{
		const d = SEARCH2_311.dual;
		assert(contrast(d.current, d.light) < d.min && contrast(d.current, d.dark) >= d.min, "p311-3 current color must fail only the light card");
		assert(d.maxChroma >= 1.15 * d.floor, "p311-3 feasibility margin");
		const params: SearchParams = {
			shape: "dual",
			field: "highlight",
			light: d.light,
			dark: d.dark,
			min: d.min,
			band: d.band,
			minChroma: d.floor,
			derivation: {
				method: "exhaustive search over all opaque 8-bit sRGB colors meeting both contrasts and the hue band",
				maxChroma: d.maxChroma,
				maxChromaColor: d.best,
				feasibleAtFloor: d.feasibleAtFloor,
				commonOrangesRejected: d.commonOranges,
				floor: `${d.floor} = max achievable chroma / ${r2(d.maxChroma / d.floor)} (>= 15% margin)`,
			},
		};
		tasks.push(
			task(311, 3, {
				prompt: `Our charts highlight the selected series with an orange stroke, and the same chart component renders on a light card (${d.light}) and on a dark card (${d.dark}). The orange we use today, ${d.current}, measures only ${r2(contrast(d.current, d.light))}:1 on the light card. I'd like a single orange that works on both cards.

The color has to:
- reach a WCAG 2 contrast of ${d.min}:1 or more against ${d.light}, and also ${d.min}:1 or more against ${d.dark};
- have an Oklch hue from ${d.band[0]}° to ${d.band[1]}° (a true orange, neither red nor amber);
- keep an Oklch chroma of at least ${d.floor}, so it still reads as a vivid highlight rather than a brown.

${WCAG2} ${OKLCH2} ${ROUNDED2}

${contract(`{"highlight": "#rrggbb"}`)}`,
				schema: obj({ highlight: HEX }),
				params,
				witness: { highlight: d.witness },
				invalid: [{ highlight: d.current }, { highlight: "#d97706" }, { highlight: "#ea580c" }, { highlight: "#b5651d" }],
			}),
		);
	}

	// Gamut-mapping tolerances. Reference: chroma reduction at constant Oklch L and h. CSS Color 4's
	// algorithm (bisection with a 0.02 deltaEOK JND clip) and colorjs.io's chroma-only mapping land up to
	// ~0.028 Oklab, ~0.020 L and ~3° hue away on these inputs; per-channel clipping of the big
	// excursions lands 0.035-0.05 away. Checked against colorjs.io in v2-c-search.test.ts.
	const D_TOL = 0.032;
	const L_TOL = 0.022;
	const H_TOL = 5;
	const IN_TOL = { dTol: 0.008, lTol: 0.008, hTol: 2 };
	const mapDerivation = {
		reference: "Oklch chroma reduction at constant L and h (bisection) to the sRGB boundary, then 8-bit rounding",
		tolerance: `out of gamut: Oklab distance <= ${D_TOL}, |ΔL| <= ${L_TOL}, Δh <= ${H_TOL}° (accepts the CSS Color 4 JND-clip, ray-trace and chroma-only bisection algorithms; rejects per-channel clipping); inside sRGB: ${IN_TOL.dTol}, ${IN_TOL.lTol}, ${IN_TOL.hTol}° (only rounding and matrix precision differ)`,
	};

	// p311-4: three Display P3 chart colors to sRGB, two outside sRGB, one inside.
	{
		const inputs: [string, [number, number, number]][] = [
			["alert", [1, 0.12, 0.18]],
			["mint", [0.1, 0.85, 0.55]],
			["sand", [0.88, 0.78, 0.6]],
		];
		const refs = inputs.map(([field, p]) => {
			const raw = p3ToSrgb(p);
			const out = !raw.every((v) => v >= 0 && v <= 1);
			const mapped = rgbToHex(reduceChroma(oklchOfRgb(raw)).rgb);
			return { field, p, mapped, clip: rgbToHex(raw), out, tol: out ? { dTol: D_TOL, lTol: L_TOL, hTol: H_TOL } : IN_TOL };
		});
		assert(refs.map((r) => r.out).join() === "true,true,false", "p311-4 gamut status of the inputs");
		const params: SearchParams = {
			shape: "map",
			targets: refs.map((r) => ({ field: r.field, ref: r.mapped, ...r.tol })),
			derivation: { ...mapDerivation, inputs: refs.map((r) => ({ field: r.field, p3: r.p, reference: r.mapped, outOfGamut: r.out })) },
		};
		const cssP3 = (p: readonly number[]) => `color(display-p3 ${p.join(" ")})`;
		tasks.push(
			task(311, 4, {
				prompt: `Our data-viz palette was picked on wide-gamut displays and is stored as Display P3. The PDF export only understands sRGB, so I need sRGB hex equivalents for these three series colors:
${refs.map((r) => `- ${r.field}: \`${cssP3(r.p)}\``).join("\n")}

How to convert: Display P3 shares sRGB's D65 white point and its transfer curve, ${SRGB_DECODE}; decode to linear light, go through CIE XYZ into linear sRGB, and encode again. Any color that lands outside sRGB has to be brought inside the way CSS Color 4 intends: hold its Oklch lightness and hue fixed and lower Oklch chroma until it just fits. That plain chroma reduction is what I treat as the reference; CSS Color 4's own JND-based gamut-mapping algorithm is accepted too. Clamping the R, G, B channels one by one is not. Colors that are already inside sRGB are simply converted. Return 8-bit hex.

${OKLCH2} I'll compare each answer with the reference by Oklab distance, Oklch L and Oklch hue: within ${D_TOL}, ${L_TOL} and ${H_TOL}° for a color that needed gamut mapping, and within ${IN_TOL.dTol}, ${IN_TOL.lTol} and ${IN_TOL.hTol}° for one that was already inside sRGB.

${contract(`{"alert": "#rrggbb", "mint": "#rrggbb", "sand": "#rrggbb"}`)}`,
				schema: hexObj(refs.map((r) => r.field)),
				params,
				witness: Object.fromEntries(refs.map((r) => [r.field, r.mapped])),
				invalid: [
					Object.fromEntries(refs.map((r) => [r.field, r.clip])),
					Object.fromEntries(refs.map((r) => [r.field, rgbToHex(r.p)])),
				],
			}),
		);
	}

	// p311-5: three Oklch lightness shifts of a violet chip color; two need gamut mapping, one does not.
	{
		const base = "#7048e8";
		const b = oklchOfHex(base);
		const shifts: [string, number][] = [
			["hover", -0.06],
			["on-dark", 0.15],
			["tint", 0.25],
		];
		const refs = shifts.map(([field, dl]) => {
			const m = reduceChroma({ L: b.L + dl, C: b.C, H: b.H });
			const out = m.oklch.C < b.C - 1e-6;
			return { field, dl, mapped: rgbToHex(m.rgb), out, mappedC: r4(m.oklch.C) };
		});
		assert(refs.map((r) => r.out).join() === "false,true,true", "p311-5 gamut status of the shifts");
		const params: SearchParams = {
			shape: "map",
			targets: refs.map((r) => ({ field: r.field, ref: r.mapped, ...(r.out ? { dTol: D_TOL, lTol: L_TOL, hTol: H_TOL } : IN_TOL) })),
			derivation: { ...mapDerivation, base, refs },
		};
		const clip = Object.fromEntries(
			shifts.map(([field, dl]) => {
				const h = (b.H * Math.PI) / 180;
				return [field, rgbToHex(oklabToRgbClipped(b.L + dl, b.C * Math.cos(h), b.C * Math.sin(h)))];
			}),
		);
		const hslShift = Object.fromEntries(shifts.map(([field, dl]) => [field, hslLightnessShift(base, dl)]));
		tasks.push(
			task(311, 5, {
				prompt: `Filter chips in our app use the violet ${base}. I need three derived colors, each made by moving only the Oklch lightness of ${base} and keeping its Oklch chroma and hue exactly as they are:
${refs.map((r) => `- ${r.field}: Oklch L ${r.dl > 0 ? "+" : "−"} ${Math.abs(r.dl)}`).join("\n")}

If a shifted color falls outside sRGB, fit it back in the CSS Color 4 way: keep the new L and the hue and reduce chroma until it just fits (plain chroma reduction is the reference; CSS Color 4's JND-based mapping algorithm is accepted as well). Per-channel clamping of R, G and B is not acceptable. Give 8-bit hex.

${OKLCH2} Each result is compared with the reference by Oklab distance, Oklch L and Oklch hue: within ${D_TOL}, ${L_TOL} and ${H_TOL}° when the shifted color needed gamut mapping, and within ${IN_TOL.dTol}, ${IN_TOL.lTol} and ${IN_TOL.hTol}° when it fit in sRGB as is.

${contract(`{"hover": "#rrggbb", "on-dark": "#rrggbb", "tint": "#rrggbb"}`)}`,
				schema: hexObj(shifts.map(([f]) => f)),
				params,
				witness: Object.fromEntries(refs.map((r) => [r.field, r.mapped])),
				invalid: [clip, hslShift, { hover: base, "on-dark": base, tint: base }],
			}),
		);
	}
	return tasks;
}

/** Oklab -> encoded sRGB with per-channel clipping (the wrong-variant answer for gamut tasks). */
function oklabToRgbClipped(L: number, a: number, bb: number): [number, number, number] {
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

/** CSS hsl(): shift L by dl, keep H and S (the wrong-space answer for Oklch lightness shifts). */
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
 * p312-2 derivation, from the exhaustive 4-subset search in c-search.ts (re-run in
 * v2-c-search.test.ts). normalVisionBest is the best set by plain CIEDE2000 without simulation, and
 * ignoringContrast the best deuteranopia set when the 3:1 rule is ignored: both plausible wrong answers.
 */
export const CHART2_312 = {
	background: "#121212",
	candidates: ["#ff6b6b", "#51cf66", "#fcc419", "#339af0", "#cc5de8", "#ff922b", "#20c997", "#868e96", "#5c7cfa", "#94d82d", "#3d5afe", "#2f3b8f"],
	k: 4,
	best: ["#fcc419", "#339af0", "#20c997", "#868e96"],
	bestScore: 16.758,
	threshold: 14.2443,
	normalVisionBest: ["#ff6b6b", "#fcc419", "#339af0", "#20c997"],
	ignoringContrast: ["#fcc419", "#339af0", "#20c997", "#2f3b8f"],
};

function cat312(): Task[] {
	const tasks: Task[] = [];

	// p312-1: AA verdicts where the solver must classify each text as large or normal from px and weight.
	{
		const rows0: [string, string, string, number, boolean][] = [
			["hero-title", "#ffffff", "#d6457a", 28, false],
			["card-heading", "#ffffff", "#2f9e8f", 20, true],
			["intro", "#ffffff", "#3d8bd9", 20, false],
			["cta-label", "#ffffff", "#e8590c", 16, true],
			["body", "#5a6270", "#f4f6f8", 16, false],
			["fine-print", "#7a7f87", "#ffffff", 12, false],
			["sale-badge", "#ffffff", "#f08c3a", 24, true],
			["link", "#2b6cb0", "#ffffff", 15, false],
		];
		const rows = rows0.map(([id, fg, bg, px, bold]) => {
			const pt = px * 0.75;
			const large = pt >= 18 || (bold && pt >= 14);
			const t = large ? 3 : 4.5;
			const cr = contrast(fg, bg);
			assert(Math.abs(cr - t) >= MARGIN_RATIO, `p312-1 ${id} within ${MARGIN_RATIO} of ${t} (${cr})`);
			return { id, fg, bg, px, bold, large, t, cr, fails: cr < t, naiveFails: cr < (px >= 18 ? 3 : 4.5) };
		});
		const failing = rows.filter((r) => r.fails).map((r) => r.id);
		const allNormal = rows.filter((r) => r.cr < 4.5).map((r) => r.id);
		const naive = rows.filter((r) => r.naiveFails).map((r) => r.id);
		assert(allNormal.join() !== failing.join() && naive.join() !== failing.join(), "p312-1 the size rule must matter");
		const params: AuditParams = {
			shape: "set",
			field: "failing",
			item: { k: "id" },
			universe: rows.map((r) => r.id),
			expected: failing,
			mode: "per-item",
			derivation: {
				ratios: rows.map((r) => ({ id: r.id, ratio: r4(r.cr), large: r.large, threshold: r.t })),
				margin: `every ratio at least ${MARGIN_RATIO} from its own threshold`,
				traps: "intro (20px regular = 15pt, normal) and cta-label (16px bold = 12pt bold, normal) fail; card-heading (20px bold = 15pt bold, large) passes",
			},
		};
		tasks.push(
			task(312, 1, {
				prompt: `Before our newsletter template goes out, can you check its text styles against WCAG 2 AA? Each style is listed with its CSS font size and weight. Normal text needs 4.5:1. Large-scale text needs only 3:1, and WCAG defines large-scale as at least 18 point, or at least 14 point when bold; on screen 1 pt is 4/3 CSS px, so that is 24px regular or about 18.67px bold. Treat "bold" as bold and everything else as regular.

${rows.map((r) => `- ${r.id}: ${r.fg} on ${r.bg}, ${r.px}px ${r.bold ? "bold" : "regular"}`).join("\n")}

${WCAG2}

Which styles fail? Give their ids (empty list if all pass).
${contract(`{"failing": ["<id>", ...]}`)}`,
				schema: obj({ failing: arr(STR) }),
				params,
				witness: { failing },
				invalid: [{ failing: allNormal }, { failing: naive }, { failing: [] }],
			}),
		);
	}

	// p312-2: choose 4 of 12 series colors for a dark dashboard, maximizing deuteranopia separation.
	{
		const c = CHART2_312;
		const params: AuditParams = {
			shape: "chart",
			field: "series",
			candidates: c.candidates,
			background: c.background,
			k: c.k,
			minContrast: 3,
			threshold: c.threshold,
			derivation: {
				method: "exhaustive search over all 4-subsets of the candidates with >= 3:1 on the background; score = min pairwise CIEDE2000 between deuteranopia simulations (unrounded)",
				best: c.best,
				bestScore: c.bestScore,
				threshold: "0.85 x best score",
				ignoringContrast: c.ignoringContrast,
			},
		};
		tasks.push(
			task(312, 2, {
				prompt: `Our ops dashboard is dark (background ${c.background}) and each chart shows four series. From the twelve brand-approved colors below, choose 4 different ones. Each must reach at least 3:1 WCAG 2 contrast against ${c.background}, since lines and markers are non-text graphics. Among the sets that satisfy that, I want the one that stays most distinguishable for deuteranopes: maximize the smallest CIEDE2000 difference between any two of the four after deuteranopia simulation. A set whose smallest difference is at least 85% of the best possible from this list is good enough.

Approved colors: ${c.candidates.join(", ")}

${CVD2} ${DE2} Compute the differences on the unrounded simulated colors. ${WCAG2}

${contract(`{"series": ["#rrggbb", "#rrggbb", "#rrggbb", "#rrggbb"]}`)}`,
				schema: obj({ series: arr(HEX, 4) }),
				params,
				witness: { series: c.best },
				invalid: [{ series: c.normalVisionBest }, { series: c.ignoringContrast }, { series: [...c.best, "#5c7cfa"] }],
			}),
		);
	}

	// p312-3: near-duplicate tokens with a chain (A~B, B~C, but A and C are not near-duplicates).
	{
		const T = 3;
		const tokens: [string, string][] = [
			["sky-400", "#38bdf8"],
			["sand-100", "#f5ecd9"],
			["orange-500", "#f76707"],
			["info", "#3db7f0"],
			["moss", "#5b7f3a"],
			["border", "#d4d4d8"],
			["cream", "#f3e9d4"],
			["ink", "#1c1917"],
			["link-hover", "#45b0e6"],
			["cta", "#f56a10"],
			["divider", "#e4e4e7"],
			["olive-600", "#617f3c"],
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
				assert(de <= T * (1 - MARGIN_RATIO) || de >= T * (1 + MARGIN_RATIO), `p312-3 ${key} within 15% of ${T} (${de})`);
				universe.push(key);
				all.push({ pair: key, de: r2(de) });
				if (de < T) dupes.push(key);
			}
		const chainEnds = "link-hover|sky-400";
		assert(!dupes.includes(chainEnds) && dupes.includes("info|sky-400") && dupes.includes("info|link-hover"), "p312-3 chain");
		const params: AuditParams = {
			shape: "set",
			field: "pairs",
			item: { k: "pair" },
			universe,
			expected: dupes,
			mode: "per-expected",
			derivation: {
				threshold: T,
				margin: "every pair at least 15% from the threshold",
				closest: [...all].sort((x, y) => x.de - y.de).slice(0, 8),
				chain: "sky-400~info and info~link-hover are near-duplicates, sky-400/link-hover is not (grouping by transitivity is wrong)",
			},
		};
		const asPairs = (keys: string[]) => [...keys].sort().map((k) => k.split("|"));
		tasks.push(
			task(312, 3, {
				prompt: `I'm cleaning up the color tokens of a design system we inherited. Some tokens look like copies of each other with slightly different codes. List every pair of tokens whose CIEDE2000 difference is under ${T}; I'll decide later which ones to merge. Judge each pair on its own numbers.

${tokens.map(([n, h]) => `- ${n} = ${h}`).join("\n")}

${DE2}

Give each qualifying pair once, as a two-item array of token names; the order inside a pair and the order of pairs are up to you.
${contract(`{"pairs": [["<token>", "<token>"], ...]}`)}`,
				schema: obj({ pairs: arr(arr(STR, 2)) }),
				params,
				witness: { pairs: asPairs(dupes) },
				invalid: [
					{ pairs: asPairs([...dupes, chainEnds]) },
					{ pairs: asPairs([...dupes, "border|divider"]) },
					{ pairs: asPairs(dupes.filter((k) => !k.includes("moss"))) },
				],
			}),
		);
	}

	// p312-4: dark-theme counterpart of a dashboard's light token set, including non-text 3:1 pairs.
	{
		const light: Record<string, string> = {
			canvas: "#f7f8fa",
			card: "#ffffff",
			text: "#16202c",
			"text-subtle": "#5b6574",
			"border-strong": "#7b8493",
			accent: "#0b7a75",
			"on-accent": "#ffffff",
			success: "#1e7b34",
			"warning-text": "#9a5b00",
		};
		const pairs: Pair[] = [
			["text", "canvas", 4.5],
			["text", "card", 4.5],
			["text-subtle", "card", 4.5],
			["border-strong", "card", 3],
			["accent", "card", 3],
			["on-accent", "accent", 4.5],
			["success", "card", 4.5],
			["warning-text", "card", 4.5],
		];
		for (const [fg, bg, m] of pairs) assert(contrast(light[fg] as string, light[bg] as string) >= m, `p312-4 light ${fg}/${bg}`);
		const H = (n: string) => oklchOfHex(light[n] as string).H;
		const dark = tokensFrom({
			canvas: [0.17, 0.008, 250],
			card: [0.22, 0.01, 250],
			text: [0.94, 0.008, 250],
			"text-subtle": [0.76, 0.015, 250],
			"border-strong": [0.56, 0.015, 250],
			accent: [0.72, 0.12, H("accent")],
			"on-accent": [0.2, 0.03, H("accent")],
			success: [0.76, 0.15, H("success")],
			"warning-text": [0.8, 0.14, H("warning-text")],
		});
		const hueChecked = Object.keys(light).filter((n) => oklchOfHex(light[n] as string).C >= 0.04);
		assert(hueChecked.length === 3, `p312-4 hue-checked tokens: ${hueChecked.join()}`);
		const params: AuditParams = {
			shape: "dark",
			field: "dark",
			light,
			pairs,
			hueTol: 15,
			hueMinChroma: 0.04,
			darkMinChroma: 0.04,
			surfaces: ["canvas", "card"],
			surfaceMaxL: 0.3,
			derivation: {
				hueChecked,
				tolerance: "15° hue: dark-theme counterparts change lightness and chroma, not hue; 8-bit rounding moves hue < 2° at chroma >= 0.04",
			},
		};
		const dimSubtle = { ...dark, "text-subtle": hexOfOklch(0.5, 0.015, 250) };
		const grayAccent = { ...dark, accent: hexOfOklch(0.72, 0.01, H("accent")) };
		tasks.push(
			task(312, 4, {
				prompt: `Our analytics dashboard needs a dark theme. These are the light theme's tokens:
${Object.entries(light)
	.map(([k, h]) => `- ${k}: ${h}`)
	.join("\n")}

Give me a dark value for every token so that, in the dark theme:
${pairs.map(([fg, bg, m]) => `- ${fg} against ${bg} reaches a WCAG 2 contrast of ${m}:1 or more${m === 3 ? " (non-text: borders and accent icons)" : ""};`).join("\n")}
- canvas and card are genuinely dark, with Oklab L of ${params.surfaceMaxL} or less;
- any token whose light value has Oklch chroma ${params.hueMinChroma} or more keeps its identity: its dark value has Oklch chroma ${params.darkMinChroma} or more and a hue within ${params.hueTol}° of the light value's. Lightness and chroma are otherwise yours to change.

${WCAG2} ${OKLCH2} ${OKLAB_L2} ${ROUNDED2}

${contract(`{"dark": {"canvas": "#rrggbb", "card": "#rrggbb", "text": "#rrggbb", ...one entry per token}}`)}`,
				schema: obj({ dark: hexObj(Object.keys(light)) }),
				params,
				witness: { dark },
				invalid: [{ dark: light }, { dark: dimSubtle }, { dark: grayAccent }],
			}),
		);
	}

	// p312-5: non-text components against two light surfaces (WCAG 1.4.11, 3:1).
	{
		const surfaces: [string, string][] = [
			["card", "#ffffff"],
			["page", "#e6eaf0"],
		];
		const parts: [string, string][] = [
			["checkbox-border", "#868e9c"],
			["toggle-track-off", "#c3cad5"],
			["slider-fill", "#3f6fe0"],
			["online-dot", "#12b886"],
			["tab-underline", "#9775fa"],
			["error-icon", "#e03131"],
		];
		const rows = parts.flatMap(([p, ph]) =>
			surfaces.map(([s, sh]) => {
				const cr = contrast(ph, sh);
				assert(Math.abs(cr - 3) >= MARGIN_RATIO, `p312-5 ${p}/${s} within ${MARGIN_RATIO} of 3 (${cr})`);
				return { key: `${p}|${s}`, component: p, background: s, cr, fails: cr < 3 };
			}),
		);
		const failing = rows.filter((r) => r.fails);
		const cardOnly = rows.filter((r) => r.fails && r.background === "card");
		assert(failing.length >= 4 && failing.length <= 8 && cardOnly.length < failing.length, "p312-5 verdict mix");
		const params: AuditParams = {
			shape: "set",
			field: "failing",
			item: { k: "fields", fields: ["component", "background"] },
			universe: rows.map((r) => r.key),
			expected: failing.map((r) => r.key),
			mode: "per-item",
			derivation: { ratios: rows.map((r) => ({ combo: r.key, ratio: r4(r.cr) })), margin: `every ratio at least ${MARGIN_RATIO} from 3` },
		};
		const asItems = (rs: typeof rows) => rs.map((r) => ({ component: r.component, background: r.background }));
		tasks.push(
			task(312, 5, {
				prompt: `I'm auditing the form controls of our light theme for WCAG 2.x success criterion 1.4.11, non-text contrast: the visual parts needed to identify a control or its state must have at least 3:1 against the adjacent color. Every component below is used both on white cards and directly on the gray page.

Backgrounds:
${surfaces.map(([s, h]) => `- ${s}: ${h}`).join("\n")}

Components:
${parts.map(([p, h]) => `- ${p}: ${h}`).join("\n")}

Report each (component, background) combination whose contrast is below 3:1. Name the component and the background exactly as they are labelled above (the labels, not the hex codes).

${WCAG2}

${contract(`{"failing": [{"component": "<component>", "background": "<background>"}, ...]}`)}`,
				schema: obj({ failing: arr(obj({ component: STR, background: STR })) }),
				params,
				witness: { failing: asItems(failing) },
				invalid: [{ failing: asItems(cardOnly) }, { failing: asItems(rows.filter((r) => r.cr < 4.5)) }, { failing: [] }],
			}),
		);
	}
	return tasks;
}

/** Neutral suite v2, author C: returns this author's categories' tasks. */
export function neutral2C(): Task[] {
	return [...cat309(), ...cat310(), ...cat311(), ...cat312()];
}
