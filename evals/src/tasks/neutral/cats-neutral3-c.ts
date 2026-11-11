/**
 * Neutral suite v3, author C: categories 309-312 (tonal-scale, role-tokens, constraint-search,
 * palette-audit), five fresh tasks each (ids q309-1 .. q312-5). Same domains and standards as v1
 * (cats-neutral-c.ts) and v2 (cats-neutral2-c.ts), with new scenarios, inputs, wording and task
 * shapes: hue-path, anchored and label-switch scales; brand-locked, seed-exact and kept-apart roles;
 * multi-floor fixes with a tight 1.2x optimality bound, a narrow luminance window search, P3
 * mapping with an exact out-of-gamut verdict and relative lightness shifts; a mixed CSS-notation
 * verdict audit, translucent non-text parts, a ΔE76-vs-ΔE2000 trap, a two-background chart pick
 * over 16 candidates and a light theme derived from a dark one.
 * Graders: v1's constraint graders (c-graders.ts) for the verdict sets, otherwise the v3 kinds in
 * v3-c-graders.ts (registry3-c.ts), which run the earlier checks and add the new ones. Witnesses come
 * from the hand-written references (c-*.ts, v3-c-*.ts); every witness and invalid answer is graded at
 * build time and every margin is asserted, so an input change that breaks a task fails the build.
 * The 16.7M-color optima are stored in SEARCH3_311 and re-derived in v3-c-search.test.ts.
 */
import { gradeNeutral } from "../../graders-neutral/index.js";
import type { Pair } from "../../graders-neutral/c-graders.js";
import type { Audit3Params, Roles3Params, Scale3Params, Search3Params } from "../../graders-neutral/v3-c-graders.js";
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
import { cssLines, SCALE_KEYS, tokensFrom } from "../../reference-neutral/c-scale.js";
import { buildScale3, ladder } from "../../reference-neutral/v3-c-scale.js";
import { chartSearch, de76Hex, over, parseCssColor } from "../../reference-neutral/v3-c-search.js";
import { contrastRatioRgb } from "../../reference/color.js";
import { round } from "../build/common.js";
import { CATEGORY_NAMES, type Task } from "../types.js";

// ---------- small builders (copied from v2's cats-neutral2-c.ts: q-ids, per-task grader kind) ----------

function assert(cond: boolean, msg: string): void {
	if (!cond) throw new Error(`neutral3C build: ${msg}`);
}

/** Output contract in v3's own wording (the freshness test rejects sentences shared with v1/v2 prompts). */
const contract = (shape: string): string =>
	`Send back only JSON, inside one \`\`\`json code fence, matching this shape exactly:\n${shape}`;

const KIND: Record<number, string> = {
	309: "neutral-tonal-scale-v3",
	310: "neutral-role-tokens-v3",
	311: "neutral-constraint-search-v3",
	312: "neutral-palette-audit-v3",
};

interface TaskBody {
	prompt: string;
	schema: Record<string, unknown>;
	params: object;
	witness: unknown;
	invalid: unknown[];
	toolUseful?: boolean;
	/** Grader kind when the category's v3 kind is not the one used (the verdict-set audits reuse v1's kind). */
	kind?: string;
}

function task(category: number, n: number, t: TaskBody): Task {
	const id = `q${category}-${n}`;
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
const r3 = (v: number) => round(v, 3);
const r4 = (v: number) => round(v, 4);
const norm360 = (h: number) => ((h % 360) + 360) % 360;
const hueSigned = (a: number, b: number) => ((((a - b) % 360) + 540) % 360) - 180;

// ---------- prompt fragments (v3 wording) ----------

const DECODE =
	"the piecewise IEC 61966-2-1 sRGB decoding (a channel value c at or below 0.04045 becomes c / 12.92, anything above becomes ((c + 0.055) / 1.055) raised to 2.4)";
const OKLCH3 = `Oklch throughout this brief is Ottosson's Oklab (2020) in polar form: L on a 0-1 scale, chroma C, hue h in degrees, computed from linear sRGB after ${DECODE} of each 8-bit channel.`;
const OKLCH3_SHORT =
	"Oklch throughout this brief is Ottosson's Oklab (2020) in polar form (L from 0 to 1, chroma C, hue h in degrees), computed from linear sRGB with the channels decoded that same way.";
const OKLAB_L3 = "Oklab L and Oklch L are one and the same number.";
const OKDIST3 = "A distance in Oklab is the Euclidean length of the (ΔL, Δa, Δb) difference, with L on its 0-1 scale.";
const WCAG3 =
	"For contrast I go by WCAG 2.x: each color's relative luminance is Y = 0.2126 R + 0.7152 G + 0.0722 B over channels linearized by that same decoding, and the ratio is (higher Y + 0.05) / (lower Y + 0.05).";
const WCAG3_ALONE = `For contrast I go by WCAG 2.x: relative luminance Y = 0.2126 R + 0.7152 G + 0.0722 B over channels linearized by ${DECODE}; the ratio is (higher Y + 0.05) / (lower Y + 0.05).`;
const MEASURED3 = "Everything gets measured on the 8-bit codes in your reply, so verify after rounding, not before.";
const DE3 =
	"CIEDE2000 here means the 2000 formula with kL = kC = kH = 1, applied to CIELAB derived from sRGB through CIE XYZ under a D65 white (Xn 0.95047, Yn 1, Zn 1.08883), without any chromatic adaptation to D50.";
const CVD3 = `Deuteranopia is simulated with Machado, Oliveira & Fernandes (2009) at severity 1.0, i.e. their full-dichromat deuteranopia matrix, in linear-light sRGB: decode each channel with ${DECODE}, multiply by the 3×3 matrix, clamp every channel into 0..1 and encode back.`;
const keyList = SCALE_KEYS.join(", ");

// =====================================================================================
// 309 tonal-scale
// =====================================================================================

type ScaleExtra = Omit<Scale3Params, "keys" | "stepRatio" | "hue">;

interface Scale3Spec {
	seed: string;
	seedKey: string | null;
	lKnots: [number, number][];
	chroma: number[];
	hueKnots?: [number, number][];
	hueTol: number;
	hueMinChroma?: number;
	stepRatio?: [number, number];
	params: ScaleExtra;
}

function scale3(s: Scale3Spec): { params: Scale3Params; witness: Record<string, string> } {
	const seed = oklchOfHex(s.seed);
	const witness = buildScale3(s.seed, s.seedKey, ladder(s.lKnots), s.chroma, s.hueKnots);
	const params: Scale3Params = {
		keys: [...SCALE_KEYS],
		stepRatio: s.stepRatio ?? [0.5, 1.8],
		hue: { seedHue: r2(seed.H), tol: s.hueTol, minChroma: s.hueMinChroma ?? 0.02 },
		...s.params,
	};
	return { params, witness };
}

const orList = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} or ${xs[xs.length - 1]}`);

/** Requirement bullets generated from the params (v3 wording), so prompt and grader cannot drift apart. */
function scaleRules3(p: Scale3Params, name: string): string {
	const lines = [
		`the JSON holds the eleven keys ${keyList} and nothing else, every value an opaque #rrggbb;`,
		`Oklch L goes down at every single step from 50 to 950, with step 50 at ${p.lightFloor} or above and step 950 at ${p.darkCeiling} or below;`,
		`spacing: take the ten L differences between adjacent steps; each must lie between ${p.stepRatio[0]} and ${p.stepRatio[1]} times their median;`,
		`no step with Oklch chroma ${p.hue.minChroma} or higher strays more than ${p.hue.tol}° in hue from ${name} (${p.hue.seedHue}°);`,
	];
	if (p.huePath) {
		const hp = p.huePath;
		const knots = hp.knots.map(([x, h]) => `${h}° at step ${SCALE_KEYS[x]}`).join(", ");
		lines.push(
			`the hue drifts along a planned path: the target hue is ${knots}, changing linearly with step position in between (steps 50, 100, 200, ..., 950 are positions 0 to 10, evenly spaced; interpolate the short way round the hue circle); every step with chroma ${hp.minChroma} or more must be within ${hp.tol}° of its own target;`,
		);
	}
	if (p.seed)
		lines.push(
			`${name}, ${p.seed.hex}, is one of the steps: step ${orList(p.seed.steps)}${p.seed.steps.length > 1 ? ", your choice" : ""} (within ${p.seed.tol} in Oklab distance of it is close enough, so copying the hex exactly is safest);`,
		);
	for (const a of p.anchors ?? []) lines.push(`step ${a.step} has Oklch L from ${a.min} to ${a.max};`);
	if (p.midChroma) {
		const mc = p.midChroma;
		lines.push(
			`color in the middle survives: of steps ${mc.steps.join(", ")}, ignoring any step that is ${name} itself, the most saturated has Oklch chroma ${r4(mc.ratio * mc.seedChroma)} or more (that is ${mc.ratio} × the ${mc.seedChroma} chroma of ${name});`,
		);
	}
	if (p.peak) lines.push(`the most chromatic of all eleven steps (highest Oklch chroma) is step ${orList(p.peak)};`);
	if (p.maxChroma !== undefined) lines.push(`all eleven steps stay at Oklch chroma ${p.maxChroma} or lower;`);
	if (p.tint)
		lines.push(
			`each of steps ${p.tint.steps.join(", ")} keeps a trace of ${name}: chroma at least ${p.tint.minChroma}, hue within ${p.tint.hueTol}° of ${p.hue.seedHue}°;`,
		);
	for (const pr of p.pairs ?? []) lines.push(`steps ${pr.fg} and ${pr.bg} are at least ${pr.min}:1 apart by WCAG 2 contrast;`);
	for (const a of p.against ?? []) lines.push(`step ${a.step} reaches ${a.min}:1 or more by WCAG 2 contrast against ${a.label} (${a.color});`);
	lines.push("eleven different colors, no repeats.");
	return lines.map((l) => `- ${l}`).join("\n");
}

const SCALE_SHAPE3 = `{"scale": {"50": "#rrggbb", "100": "#rrggbb", ..., "900": "#rrggbb", "950": "#rrggbb"}}`;
const scaleSchema = (withCss = false) =>
	withCss ? obj({ scale: hexObj(SCALE_KEYS), css: STR }) : obj({ scale: hexObj(SCALE_KEYS) });
const reversed = (s: Record<string, string>) =>
	Object.fromEntries(SCALE_KEYS.map((k, i) => [k, s[SCALE_KEYS[10 - i] as string] as string]));
const dropKey = (s: Record<string, string>, k: string) => Object.fromEntries(Object.entries(s).filter(([x]) => x !== k));
const KIND309 = KIND[309] as string;

function cat309(): Task[] {
	const tasks: Task[] = [];

	// q309-1: vivid green seed, hue path (light end leans yellow, dark end leans teal).
	{
		const seed = "#14b05f";
		const s = oklchOfHex(seed);
		const hueKnots: [number, number][] = [
			[0, r2(norm360(s.H - 18))],
			[5, r2(s.H)],
			[10, r2(norm360(s.H + 14))],
		];
		const lKnots: [number, number][] = [
			[0, 0.975],
			[5, s.L],
			[10, 0.27],
		];
		const chroma = [0.035, 0.07, 0.11, 0.15, 0.18, 0, 0.17, 0.15, 0.12, 0.095, 0.07];
		const { params, witness } = scale3({
			seed,
			seedKey: "500",
			lKnots,
			chroma,
			hueKnots,
			hueTol: 26,
			stepRatio: [0.6, 1.6],
			params: {
				lightFloor: 0.955,
				darkCeiling: 0.3,
				huePath: { knots: hueKnots, tol: 7, minChroma: 0.03 },
				seed: { hex: seed, steps: ["500"], tol: 0.02 },
				midChroma: { steps: ["300", "400", "500", "600", "700"], ratio: 0.85, seedChroma: r4(s.C) },
				derivation: {
					witness: "seed at 500; Oklch L 0.975 -> seed L -> 0.27 piecewise-linear; hue on the stated path; chroma up to 0.18, gamut-mapped by chroma reduction at constant L and h",
					huePath: "7° per step: 8-bit rounding moves hue by at most ~4° at chroma 0.03, the smallest chroma the path rule covers",
					hueTol: "26° overall = the largest path offset (18°) plus a margin, so the general rule never contradicts the path",
					stepRatio: "0.6-1.6 x median: tighter than the 0.5-1.8 of v1/v2; a two-slope ladder through the seed sits at ~0.9-1.15",
				},
			},
		});
		const flat = buildScale3(seed, "500", ladder(lKnots), chroma);
		const backwards = buildScale3(seed, "500", ladder(lKnots), chroma, [
			[0, norm360(s.H + 18)],
			[5, s.H],
			[10, norm360(s.H - 14)],
		]);
		assert(failedChecks(KIND309, params, { scale: flat }).join() === "hue-follows-path", "q309-1 constant-hue scale must fail only the path");
		tasks.push(
			task(309, 1, {
				prompt: `I'm building the color ramp for a cycling app whose brand green is ${seed}. Flat single-hue ramps look lifeless to us, so like many illustrators we want the hue to travel: pale tints lean toward yellow-green and deep shades lean toward blue-green. Please produce the full 11-step ramp (${keyList}; 50 palest, 950 deepest).

What the ramp must satisfy:
${scaleRules3(params, "the brand green")}

${OKLCH3} ${OKDIST3} ${MEASURED3}

${contract(SCALE_SHAPE3)}`,
				schema: scaleSchema(),
				params,
				witness: { scale: witness },
				invalid: [{ scale: flat }, { scale: backwards }, { scale: dropKey(witness, "100") }],
			}),
		);
	}

	// q309-2: pale peach seed; JSON plus a CSS block; chroma peak must sit in the middle.
	{
		const seed = "#fbd3bd";
		const s = oklchOfHex(seed);
		const chroma = [0.025, 0, 0.075, 0.11, 0.14, 0.155, 0.145, 0.12, 0.095, 0.072, 0.052];
		const { params, witness } = scale3({
			seed,
			seedKey: "100",
			lKnots: [
				[0, 0.975],
				[1, s.L],
				[10, 0.25],
			],
			chroma,
			hueTol: 18,
			params: {
				lightFloor: 0.96,
				darkCeiling: 0.28,
				seed: { hex: seed, steps: ["100", "200"], tol: 0.015 },
				midChroma: { steps: ["300", "400", "500", "600", "700"], ratio: 2.4, seedChroma: r4(s.C) },
				peak: ["400", "500", "600"],
				css: { prefix: "apricot" },
				derivation: {
					witness: "seed at 100; L 0.975 -> seed -> 0.25; chroma rising to 0.155 at 500, gamut-mapped",
					midChroma: "2.4 x the pastel's chroma: the middle has to be a real orange-peach, not a dusty one",
					peak: "a pastel-seeded scale whose chroma peaks at 800+ reads muddy; one peaking at 100-300 reads washed out",
					css: "every --apricot-<key> declaration once, equal to the JSON value (case-insensitive, #rgb expanded)",
				},
			},
		});
		const css = cssLines("apricot", witness);
		// Peaking where the sRGB gamut is widest for this hue (L ~0.7-0.75, step 300) is the tempting wrong choice.
		const earlyPeak = { ...witness, "300": hexOfOklch(oklchOfHex(witness["300"] as string).L, 0.2, s.H) };
		const fd = failedChecks(KIND309, params, { scale: earlyPeak, css: cssLines("apricot", earlyPeak) });
		assert(fd.join() === "chroma-peak-placed", `q309-2 early peak must fail only the peak rule (${fd.join()})`);
		const atFive = buildScale3(seed, "500", ladder([[0, 0.975], [5, s.L], [10, 0.25]]), [0.01, 0.02, 0.03, 0.04, 0.045, 0, 0.06, 0.07, 0.07, 0.06, 0.05]);
		tasks.push(
			task(309, 2, {
				prompt: `Our bakery chain's packaging color is a pale peach, ${seed}. The web team wants a complete tonal family from it, keyed ${keyList} from lightest to darkest, delivered twice: as JSON, and as CSS custom properties for the theme stylesheet.

Rules:
${scaleRules3(params, "the peach")}

CSS part: a string with one declaration per key of the form \`--apricot-<key>: #rrggbb;\` (for example \`--apricot-50: #rrggbb;\`), each value identical to the JSON; one declaration per line is fine.

${OKLCH3} ${OKDIST3} ${MEASURED3}

${contract(`{"scale": {"50": "#rrggbb", ..., "950": "#rrggbb"}, "css": "--apricot-50: #rrggbb;\\n--apricot-100: #rrggbb;\\n..."}`)}`,
				schema: scaleSchema(true),
				params,
				witness: { scale: witness, css },
				invalid: [
					{ scale: earlyPeak, css: cssLines("apricot", earlyPeak) },
					{ scale: atFive, css: cssLines("apricot", atFive) },
					{ scale: witness, css: css.replace(`--apricot-300: ${witness["300"]}`, `--apricot-300: ${witness["400"]}`) },
					{ scale: witness, css: cssLines("peach", witness) },
				],
			}),
		);
	}

	// q309-3: dark oxblood seed that must be the darkest step; step 500 anchored; 300 vs 950 at 7:1.
	{
		const seed = "#4b1622";
		const s = oklchOfHex(seed);
		const chroma = [0.012, 0.03, 0.055, 0.085, 0.12, 0.15, 0.16, 0.15, 0.13, 0.1, 0];
		const { params, witness } = scale3({
			seed,
			seedKey: "950",
			lKnots: [
				[0, 0.975],
				[3, 0.79],
				[5, 0.61],
				[10, s.L],
			],
			chroma,
			hueTol: 20,
			params: {
				lightFloor: 0.95,
				darkCeiling: 0.3,
				seed: { hex: seed, steps: ["950"], tol: 0.02 },
				anchors: [{ step: "500", min: 0.56, max: 0.64 }],
				midChroma: { steps: ["300", "400", "500", "600", "700"], ratio: 1.6, seedChroma: r4(s.C) },
				pairs: [{ fg: "300", bg: "950", min: 7 }],
				derivation: {
					witness: "seed at 950; L knots 0.975 (50), 0.79 (300), 0.61 (500), seed L (950)",
					anchor: "500 at L 0.56-0.64 keeps the scale's middle a true mid-tone",
					contrast: "binding: a straight ladder 0.975 -> 0.61 -> seed puts 300 at L ~0.75 and misses 7:1 against the oxblood",
				},
			},
		});
		const straight = buildScale3(seed, "950", ladder([[0, 0.975], [5, 0.61], [10, s.L]]), chroma);
		assert(failedChecks(KIND309, params, { scale: straight }).includes("contrast-300-on-950"), "q309-3 straight ladder must miss 7:1");
		const extended = buildScale3(seed, "900", ladder([[0, 0.975], [3, 0.79], [5, 0.61], [9, s.L], [10, 0.2]]), [0.012, 0.03, 0.055, 0.085, 0.12, 0.15, 0.16, 0.15, 0.13, 0, 0.06]);
		tasks.push(
			task(309, 3, {
				prompt: `Our wine bar's brand color is a deep oxblood, ${seed}, and in its UI nothing is ever darker than that color: the oxblood is the floor of the palette. Build a tonal scale with keys ${keyList} (lightest first) where the oxblood is the very last step. Light steps carry text set in the oxblood, so step 300 must still be readable on it.

Requirements:
${scaleRules3(params, "the oxblood")}

${WCAG3_ALONE} ${OKLCH3_SHORT} ${OKDIST3} ${MEASURED3}

${contract(SCALE_SHAPE3)}`,
				schema: scaleSchema(),
				params,
				witness: { scale: witness },
				invalid: [{ scale: straight }, { scale: extended }, { scale: reversed(witness) }],
			}),
		);
	}

	// q309-4: neutral scale tinted toward a violet; step 500 works as a border on both ends.
	{
		const seed = "#6d4bc3";
		const s = oklchOfHex(seed);
		const chroma = [0.007, 0.014, 0.016, 0.018, 0.02, 0.021, 0.021, 0.02, 0.019, 0.017, 0.012];
		const { params, witness } = scale3({
			seed,
			seedKey: null,
			lKnots: [
				[0, 0.982],
				[10, 0.17],
			],
			chroma,
			hueTol: 22,
			hueMinChroma: 0.012,
			params: {
				lightFloor: 0.97,
				darkCeiling: 0.2,
				maxChroma: 0.026,
				tint: { steps: ["100", "200", "300", "400", "500", "600", "700", "800", "900"], minChroma: 0.011, hueTol: 22 },
				pairs: [
					{ fg: "500", bg: "50", min: 3 },
					{ fg: "500", bg: "950", min: 3 },
				],
				derivation: {
					witness: "uniform Oklch L 0.982 -> 0.17 at the violet's hue, chroma 0.007-0.021",
					tint: "chroma >= 0.011 with 22° hue tolerance: 8-bit rounding moves a and b by up to ~0.0025, i.e. up to ~13° of hue at chroma 0.011",
					pairs: "500 must reach 3:1 against both 50 and 950 (a border usable in both themes): Y(500) roughly 0.12-0.27, Oklch L ~0.49-0.65",
				},
			},
		});
		const gray = Object.fromEntries(SCALE_KEYS.map((k) => [k, hexOfOklch(oklchOfHex(witness[k] as string).L, 0, 0)]));
		const loud = Object.fromEntries(
			SCALE_KEYS.map((k) => {
				const c = oklchOfHex(witness[k] as string);
				return [k, hexOfOklch(c.L, Math.min(0.06, c.C * 2.5), s.H)];
			}),
		);
		const lightMid = buildScale3(seed, null, ladder([[0, 0.982], [5, 0.69], [10, 0.17]]), chroma);
		assert(failedChecks(KIND309, params, { scale: lightMid }).includes("contrast-500-on-50"), "q309-4 light 500 must miss 3:1 on 50");
		tasks.push(
			task(309, 4, {
				prompt: `Our podcast studio's site needs a gray family that feels related to the brand violet ${seed} without looking purple: grays with a faint violet cast. Eleven steps, ${keyList}, lightest to darkest; the violet itself is not part of this scale. Step 500 is our universal border and divider color, used both on step-50 pages (light mode) and on step-950 pages (dark mode).

The grays are acceptable when:
${scaleRules3(params, "the violet")}

${WCAG3_ALONE} ${OKLCH3_SHORT} ${MEASURED3}

${contract(SCALE_SHAPE3)}`,
				schema: scaleSchema(),
				params,
				witness: { scale: witness },
				invalid: [{ scale: gray }, { scale: loud }, { scale: lightMid }],
			}),
		);
	}

	// q309-5: azure seed fixed at 500; automatic label switch (dark label on 50-400, light label on 600-900).
	{
		const seed = "#1d86c4";
		const s = oklchOfHex(seed);
		const label = "#fbfcfd";
		const chroma = [0.018, 0.04, 0.07, 0.1, 0.125, 0, 0.13, 0.115, 0.095, 0.075, 0.055];
		const { params, witness } = scale3({
			seed,
			seedKey: "500",
			lKnots: [
				[0, 0.975],
				[5, s.L],
				[10, 0.24],
			],
			chroma,
			hueTol: 15,
			params: {
				lightFloor: 0.96,
				darkCeiling: 0.27,
				seed: { hex: seed, steps: ["500"], tol: 0.01 },
				midChroma: { steps: ["300", "400", "500", "600", "700"], ratio: 0.85, seedChroma: r4(s.C) },
				pairs: ["50", "100", "200", "300", "400"].map((k) => ({ fg: "950", bg: k, min: 4.5 })),
				against: ["600", "700", "800", "900"].map((k) => ({ step: k, color: label, label: "the light label", min: 4.5 })),
				derivation: {
					witness: "seed at 500; L 0.975 -> seed -> 0.24 piecewise-linear",
					binding: "400 must reach 4.5:1 against 950 (needs L400 >~ 0.63 when 950 is ~0.24) and 600 must reach 4.5:1 against the label (needs L600 <~ 0.57): the seed sits between them",
				},
			},
		});
		const shallow = buildScale3(seed, "500", ladder([[0, 0.975], [5, s.L], [10, 0.34]]), chroma);
		const tight = buildScale3(seed, "500", ladder([[0, 0.975], [4, 0.62], [5, s.L], [6, 0.58], [10, 0.24]]), chroma);
		const fs = failedChecks(KIND309, params, { scale: shallow });
		const ft = failedChecks(KIND309, params, { scale: tight });
		assert(fs.some((n) => n.startsWith("contrast-950-on")), `q309-5 shallow ladder must fail a dark-label pairing (${fs.join()})`);
		assert(ft.includes("contrast-600-vs-the light label"), `q309-5 compressed middle must fail the light-label pairing (${ft.join()})`);
		tasks.push(
			task(309, 5, {
				prompt: `Our design system picks label colors automatically from a tonal scale, and I need that scale for our azure, ${seed}, which has to be step 500 exactly. Keys ${keyList}, light to dark. The switch rule: chips and buttons filled with steps 50 to 400 get their label in step 950 of the same scale; fills from 600 to 900 get the light label color ${label}. Step 500 (the azure itself) is exempt.

Every one of these must hold:
${scaleRules3(params, "the azure")}

${WCAG3_ALONE} ${OKLCH3_SHORT} ${OKDIST3} ${MEASURED3}

${contract(SCALE_SHAPE3)}`,
				schema: scaleSchema(),
				params,
				witness: { scale: witness },
				invalid: [{ scale: shallow }, { scale: tight }, { scale: { ...witness, "500": "#3a8fd0" } }],
			}),
		);
	}
	return tasks;
}

// =====================================================================================
// 310 role-tokens
// =====================================================================================

const CORE_ROLES = [
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
const corePairs = (min: number): Pair[] => [
	["on-primary", "primary", min],
	["on-primary-container", "primary-container", min],
	["on-surface", "surface", min],
	["on-surface", "surface-variant", min],
	["on-error", "error", min],
];

type Table = Record<string, [number, number, number]>;
type Theme = "light" | "dark";

/** v3 tone tables (Oklch L, C, h per role), tuned per contrast level; gamut-mapped by chroma reduction. */
function lightTone(h: number, c: number, sec: number, aaa: boolean): Table {
	return {
		primary: [aaa ? 0.42 : 0.5, Math.min(c, 0.16), h],
		"on-primary": [0.995, 0.004, h],
		"primary-container": [0.93, Math.min(c, 0.055), h],
		"on-primary-container": [aaa ? 0.27 : 0.33, Math.min(c, 0.09), h],
		secondary: [aaa ? 0.43 : 0.5, 0.085, sec],
		surface: [0.99, 0.004, h],
		"on-surface": [0.22, 0.01, h],
		"surface-variant": [0.93, 0.012, h],
		outline: [0.56, 0.016, h],
		error: [aaa ? 0.43 : 0.5, 0.17, 27],
		"on-error": [0.995, 0.004, 27],
	};
}
function darkTone(h: number, c: number, sec: number, aaa: boolean): Table {
	return {
		primary: [aaa ? 0.83 : 0.79, Math.min(c, 0.12), h],
		"on-primary": [aaa ? 0.22 : 0.3, Math.min(c, 0.07), h],
		"primary-container": [aaa ? 0.34 : 0.4, Math.min(c, 0.1), h],
		"on-primary-container": [0.95, Math.min(c, 0.035), h],
		secondary: [aaa ? 0.82 : 0.79, 0.08, sec],
		surface: [0.18, 0.007, h],
		"on-surface": [0.94, 0.007, h],
		"surface-variant": [0.28, 0.012, h],
		outline: [0.66, 0.018, h],
		error: [aaa ? 0.84 : 0.8, 0.1, 27],
		"on-error": [aaa ? 0.24 : 0.32, 0.08, 27],
	};
}

function roleRules3(p: Roles3Params, seed: string): string {
	const both = p.themes.length === 2;
	const where = both ? "in each theme" : `in the ${p.themes[0]} theme`;
	const off = r2(hueSigned(p.secondary.hue, p.primary.seedHue));
	const lines = [
		`${where}, a #rrggbb value for every role named above;`,
		...p.pairs.map(([fg, bg, m]) => `${fg} versus ${bg}: at least ${m}:1 WCAG 2 contrast ${where};`),
		...p.themes.map((t) =>
			t === "light"
				? `light theme: primary-container's Oklab L exceeds primary's by ${p.containerMargin} or more;`
				: `dark theme: primary-container's Oklab L is below primary's by ${p.containerMargin} or more;`,
		),
		`primary carries the seed: Oklch chroma no lower than ${p.primary.minChroma} and hue no further than ${p.primary.tol}° from ${p.primary.seedHue}° (the hue of ${seed});`,
		`secondary: Oklch chroma no lower than ${p.secondary.minChroma}, hue within ${p.secondary.tol}° of ${p.secondary.hue}° (the seed's hue ${off >= 0 ? "+" : "−"} ${Math.abs(off)}°);`,
		`neutral surfaces: ${p.surfaces.roles.join(", ")} each at Oklch chroma ${p.surfaces.maxChroma} or less;`,
		...p.themes.map((t) =>
			t === "light" ? `light theme: surface at Oklab L ${p.surfaces.lightMinL} or higher;` : `dark theme: surface at Oklab L ${p.surfaces.darkMaxL} or lower;`,
		),
		`error is red: Oklch hue in the range ${p.error.band[0]}° to ${p.error.band[1]}° and chroma no lower than ${p.error.minChroma};`,
		...(p.bands ?? []).map((b) => `${b.role}: Oklch hue in the range ${b.band[0]}° to ${b.band[1]}°, chroma no lower than ${b.minChroma};`),
	];
	for (const lr of p.lightness ?? [])
		lines.push(`${lr.theme} theme: ${lr.role} at Oklab L ${lr.min !== undefined ? `${lr.min} or higher` : `${lr.max} or lower`};`);
	if (p.levels)
		lines.push(
			`${p.levels.roles.join(" → ")} is an elevation stack: ${both ? "in the light theme each level is darker, in the dark theme each is lighter," : p.themes[0] === "light" ? "each level is darker" : "each level is lighter"} than the previous one by ${p.levels.minStep} or more in Oklab L;`,
		);
	for (const r of p.same ?? []) lines.push(`${r} is the very same hex code in both themes;`);
	for (const e of p.exact ?? []) lines.push(`${e.theme} theme: ${e.role} is ${e.hex} itself (an Oklab distance up to ${e.tol} is tolerated);`);
	for (const a of p.apart ?? []) lines.push(`${a.a} and ${a.b} stay at least ${a.min} apart in Oklab distance ${where};`);
	return lines.map((l) => `- ${l}`).join("\n");
}

interface Roles3Spec {
	seed: string;
	secOffset: number;
	aaa: boolean;
	themes: Theme[];
	extraRoles?: string[];
	extraPairs?: Pair[];
	light?: Table;
	dark?: Table;
	primaryMinChroma?: number;
	extra?: Partial<Roles3Params>;
	surfaceExtra?: string[];
	intro: string;
	outro?: string;
	derivation: Record<string, string>;
}

type ThemeSets = Record<string, Record<string, string>>;

function roles3Task(n: number, o: Roles3Spec, extraInvalid: (w: ThemeSets, p: Roles3Params) => unknown[]): Task {
	const s = oklchOfHex(o.seed);
	const sec = norm360(s.H + o.secOffset);
	const min = o.aaa ? 7 : 4.5;
	const roles = [...CORE_ROLES, ...(o.extraRoles ?? [])];
	const params: Roles3Params = {
		themes: o.themes,
		roles,
		pairs: [...corePairs(min), ...(o.extraPairs ?? [])],
		containerMargin: 0.18,
		primary: { seedHue: r2(s.H), tol: 12, minChroma: o.primaryMinChroma ?? 0.05 },
		secondary: { hue: r2(sec), tol: 18, minChroma: 0.035 },
		surfaces: {
			roles: ["surface", "surface-variant", ...(o.surfaceExtra ?? [])],
			maxChroma: 0.025,
			lightMinL: 0.95,
			darkMaxL: 0.24,
		},
		error: { band: [18, 42], minChroma: 0.07 },
		...o.extra,
		derivation: {
			tolerances:
				"primary hue 12° and secondary 18° (8-bit rounding moves hue < 4° at chroma >= 0.035); container margin 0.18 Oklab L (Material-style containers sit ~0.4 from primary); surfaces chroma <= 0.025",
			...o.derivation,
		},
	};
	const sets: Record<Theme, Record<string, string>> = {
		light: tokensFrom({ ...lightTone(s.H, s.C, sec, o.aaa), ...(o.light ?? {}) }),
		dark: tokensFrom({ ...darkTone(s.H, s.C, sec, o.aaa), ...(o.dark ?? {}) }),
	};
	const witness: ThemeSets = Object.fromEntries(o.themes.map((t) => [t, sets[t]]));
	const swapped: ThemeSets = Object.fromEntries(o.themes.map((t) => [t, sets[t === "light" ? "dark" : "light"]]));
	const shape =
		o.themes.length === 2
			? `{"light": {"primary": "#rrggbb", "on-primary": "#rrggbb", ...all roles}, "dark": {...the same roles}}`
			: `{"${o.themes[0]}": {"primary": "#rrggbb", "on-primary": "#rrggbb", ...all roles}}`;
	return task(310, n, {
		prompt: `${o.intro}

Roles to fill in: ${roles.map((r) => `\`${r}\``).join(", ")}.

Acceptance list:
${roleRules3(params, o.seed)}
${o.outro ? `\n${o.outro}\n` : ""}
${WCAG3_ALONE} ${OKLCH3_SHORT} ${OKLAB_L3}${params.exact ? ` ${OKDIST3}` : ""} ${MEASURED3}

${contract(shape)}`,
		schema: obj(Object.fromEntries(o.themes.map((t) => [t, hexObj(roles)]))),
		params,
		witness,
		invalid: [swapped, ...extraInvalid(witness, params)],
	});
}

const mapTheme = (w: ThemeSets, f: (set: Record<string, string>, t: string) => Record<string, string>): ThemeSets =>
	Object.fromEntries(Object.entries(w).map(([t, set]) => [t, f({ ...set }, t)]));

function cat310(): Task[] {
	const taupe = "#8b7d6f";
	const coral = "#f2937a";
	const lagoon = "#3fa7c4";
	const fern = "#3d8b4f";
	const crimson = "#b3263e";
	const H = (hex: string) => oklchOfHex(hex).H;
	const tasks: Task[] = [];

	// q310-1: low-chroma taupe seed, both themes, AA, complementary secondary with its own container pair.
	{
		const sec = norm360(H(taupe) + 180);
		tasks.push(
			roles3Task(
				1,
				{
					seed: taupe,
					secOffset: 180,
					aaa: false,
					themes: ["light", "dark"],
					primaryMinChroma: 0.02,
					extraRoles: ["secondary-container", "on-secondary-container"],
					extraPairs: [["on-secondary-container", "secondary-container", 4.5]],
					light: {
						primary: [0.5, 0.04, H(taupe)],
						"secondary-container": [0.92, 0.04, sec],
						"on-secondary-container": [0.32, 0.06, sec],
					},
					dark: {
						primary: [0.79, 0.04, H(taupe)],
						"on-primary": [0.3, 0.025, H(taupe)],
						"secondary-container": [0.36, 0.06, sec],
						"on-secondary-container": [0.93, 0.03, sec],
					},
					extra: {
						lightness: [
							{ role: "secondary-container", theme: "light", min: 0.86 },
							{ role: "secondary-container", theme: "dark", max: 0.42 },
						],
						bands: [{ role: "secondary-container", band: [r2(norm360(sec - 25)), r2(norm360(sec + 25))], minChroma: 0.025 }],
					},
					intro: `A furniture retailer's identity is built on a quiet taupe, ${taupe}, barely more colorful than gray. They want Material-style color roles for a light and a dark theme from it, WCAG AA (4.5:1) for every text pairing, and a secondary accent on the opposite side of the hue circle so the UI has one clearly contrasting color. The secondary also gets a tonal container with its own text color, for chips and selected filters.`,
					outro: "Because the taupe has so little chroma, primary's chroma floor is set low on purpose. The secondary-container band is the complementary hue ± 25°.",
					derivation: {
						witness: "tone tables at the taupe's hue; primary given chroma 0.04 (seed 0.027); secondary and its container at the seed hue + 180°",
					},
				},
				(w) => [
					// Secondary at the seed's own hue instead of the complement.
					mapTheme(w, (set) => ({ ...set, secondary: set.primary as string })),
					mapTheme(w, (set, t) => ({ ...set, "secondary-container": t === "light" ? (set.secondary as string) : (set["on-secondary-container"] as string) })),
				],
			),
		);
	}

	// q310-2: dark theme only, AA, the seed itself is primary, OLED-dark surface, outline and primary visible.
	{
		const c = oklchOfHex(coral);
		const tert = norm360(c.H + 140);
		tasks.push(
			roles3Task(
				2,
				{
					seed: coral,
					secOffset: -35,
					aaa: false,
					themes: ["dark"],
					extraRoles: ["tertiary", "on-tertiary"],
					extraPairs: [
						["on-tertiary", "tertiary", 4.5],
						["primary", "surface", 3],
						["outline", "surface", 3],
					],
					dark: {
						primary: [c.L, c.C, c.H],
						"on-primary": [0.27, 0.05, c.H],
						"primary-container": [0.42, 0.1, c.H],
						surface: [0.13, 0.004, c.H],
						"surface-variant": [0.22, 0.01, c.H],
						tertiary: [0.78, 0.1, tert],
						"on-tertiary": [0.28, 0.05, tert],
					},
					extra: {
						surfaces: { roles: ["surface", "surface-variant"], maxChroma: 0.025, lightMinL: 0.95, darkMaxL: 0.16 },
						exact: [{ role: "primary", theme: "dark", hex: coral, tol: 0.01 }],
						bands: [{ role: "tertiary", band: [r2(norm360(tert - 20)), r2(norm360(tert + 20))], minChroma: 0.05 }],
					},
					intro: `Our e-reader app's night mode is the only theme it ships, and it targets OLED screens, so the page surface has to be close to black. The brand coral ${coral} is light enough to use as-is on dark backgrounds, and brand wants exactly that: dark-theme primary is the coral itself. Please work out the rest of the dark theme's roles around it, with WCAG AA (4.5:1) for text pairs, 3:1 for primary and for outline against the surface (they are drawn bare as icons, progress bars and input borders), and a tertiary accent for highlights in the books.`,
					outro: "The tertiary band is the seed hue + 140° ± 20°.",
					derivation: {
						witness: "dark tone table at the coral's hue with primary replaced by the coral itself (L ~0.76), surface at Oklab L 0.13",
						surface: "Oklab L <= 0.16 for OLED (true-black-adjacent) surfaces",
					},
				},
				(w) => [
					mapTheme(w, (set) => ({ ...set, primary: hexOfOklch(0.79, 0.11, H(coral)) })),
					mapTheme(w, (set) => ({ ...set, surface: hexOfOklch(0.22, 0.008, H(coral)) })),
					mapTheme(w, (set) => ({ ...set, outline: hexOfOklch(0.36, 0.015, H(coral)) })),
				],
			),
		);
	}

	// q310-3: brand-locked primary (same hex in both themes), visible on both surfaces, AA.
	{
		const h = H(lagoon);
		// Primary at the lagoon's hue, darkened until its luminance sits inside the window that
		// 4.5:1 with the shared on-primary and 3:1 against both surfaces allow.
		const primaryL = 0.535;
		const shared = { primary: [primaryL, 0.1, h] as [number, number, number], "on-primary": [0.995, 0.004, h] as [number, number, number] };
		tasks.push(
			roles3Task(
				3,
				{
					seed: lagoon,
					secOffset: 50,
					aaa: false,
					themes: ["light", "dark"],
					extraPairs: [["primary", "surface", 3]],
					light: { ...shared, "primary-container": [0.9, 0.05, h] },
					dark: { ...shared, "primary-container": [0.3, 0.06, h], surface: [0.18, 0.006, h] },
					extra: { same: ["primary", "on-primary"] },
					intro: `Our transit operator's brand rules say the lagoon blue (seed ${lagoon}) must look identical everywhere: the primary role and the text on it are one fixed pair of hex codes, used unchanged in the light and the dark theme. Everything else may adapt per theme. Give me both themes' color roles. Text pairs need WCAG AA (4.5:1), and primary also has to stand out at 3:1 against the surface of each theme, because it is drawn bare for route lines.`,
					outro: "Primary does not have to be the seed hex itself: it has to keep the seed's hue (within the tolerance stated above) and the chroma floor.",
					derivation: {
						window: "same primary in both themes: >= 3:1 on a light surface (Y ~0.97) and on a dark one (Y ~0.008), and >= 4.5:1 with a near-white on-primary, leaves relative luminance ~0.124-0.181",
						witness: `primary at Oklch L ${primaryL}, C 0.10 at the seed hue in both themes; dark surface at L 0.18`,
					},
				},
				(w) => [
					// Each theme gets its own primary (the usual Material behaviour), which breaks the lock.
					{ ...w, dark: { ...w.dark, primary: tokensFrom({ p: [0.79, 0.1, h] }).p as string, "on-primary": tokensFrom({ p: [0.3, 0.06, h] }).p as string } },
					mapTheme(w, (set) => ({ ...set, primary: lagoon })),
				],
			),
		);
	}

	// q310-4: green seed with success/warning roles; success must stay apart from the green primary.
	{
		const g = oklchOfHex(fern);
		tasks.push(
			roles3Task(
				4,
				{
					seed: fern,
					secOffset: 40,
					aaa: false,
					themes: ["light", "dark"],
					extraRoles: ["success", "on-success", "warning", "on-warning"],
					extraPairs: [
						["on-success", "success", 4.5],
						["on-warning", "warning", 4.5],
					],
					light: {
						primary: [0.52, 0.12, g.H],
						success: [0.4, 0.11, 150],
						"on-success": [0.995, 0.004, 150],
						warning: [0.83, 0.15, 78],
						"on-warning": [0.28, 0.05, 70],
					},
					dark: {
						primary: [0.8, 0.12, g.H],
						success: [0.66, 0.15, 150],
						"on-success": [0.2, 0.03, 150],
						warning: [0.85, 0.14, 78],
						"on-warning": [0.27, 0.05, 70],
					},
					extra: {
						bands: [
							{ role: "success", band: [135, 165], minChroma: 0.07 },
							{ role: "warning", band: [60, 95], minChroma: 0.07 },
						],
						apart: [{ a: "success", b: "primary", min: 0.1 }],
					},
					intro: `A plant-nursery marketplace uses the fern green ${fern} as its seed, which collides with the usual green "success" color. We still want success and warning roles (each with an on- color for text and icons), in a light and a dark theme, but success must not be mistaken for the brand: it has to stay a clear step away from primary. Every text pairing needs WCAG AA (4.5:1).`,
					derivation: {
						apart: "0.1 Oklab: success and primary share a hue band, so they must differ by about a tenth of the lightness range; the witness separates them mostly by L (light 0.52 vs 0.40, dark 0.80 vs 0.66)",
					},
				},
				(w) => [
					mapTheme(w, (set) => ({ ...set, success: set.primary as string, "on-success": set["on-primary"] as string })),
					mapTheme(w, (set) => ({ ...set, warning: set.error as string, "on-warning": set["on-error"] as string })),
				],
			),
		);
	}

	// q310-5: crimson seed, AAA in both themes, error kept apart from primary, three surface levels.
	{
		const r = oklchOfHex(crimson);
		const levels = ["surface", "surface-container", "surface-container-high"];
		tasks.push(
			roles3Task(
				5,
				{
					seed: crimson,
					secOffset: -45,
					aaa: true,
					themes: ["light", "dark"],
					extraRoles: ["surface-container", "surface-container-high"],
					extraPairs: [
						["on-surface", "surface-container", 7],
						["on-surface", "surface-container-high", 7],
					],
					surfaceExtra: ["surface-container", "surface-container-high"],
					light: {
						primary: [0.43, 0.15, r.H],
						error: [0.33, 0.12, 35],
						"surface-container": [0.955, 0.008, r.H],
						"surface-container-high": [0.925, 0.01, r.H],
						"on-surface": [0.2, 0.01, r.H],
					},
					dark: {
						primary: [0.8, 0.1, r.H],
						error: [0.9, 0.055, 35],
						"on-error": [0.25, 0.08, 35],
						"surface-container": [0.22, 0.008, r.H],
						"surface-container-high": [0.26, 0.01, r.H],
					},
					extra: {
						error: { band: [20, 45], minChroma: 0.05 },
						levels: { roles: levels, minStep: 0.025 },
						apart: [{ a: "error", b: "primary", min: 0.09 }],
					},
					intro: `A blood-donation service's brand is the crimson ${crimson}, so its error color is easily confused with the brand. Their accessibility statement promises WCAG AAA, so every text pairing must reach 7:1, in a light and a dark theme. I need the color roles for both themes, including two container surfaces that stack on top of the page surface (cards, then dialogs), and an error color that is red yet clearly not the brand crimson.`,
					derivation: {
						apart: "0.09 Oklab between error and primary in each theme; at AAA both are dark in the light theme and light in the dark theme, so the gap comes from lightness and hue (error at hue 35°, darker in light, paler in dark)",
						levels: "each container 0.025 Oklab L beyond the previous level (darker in light, lighter in dark)",
					},
				},
				(w) => [
					mapTheme(w, (set) => ({ ...set, error: set.primary as string })),
					// One container stack for both themes (light values reused in the dark theme).
					{ ...w, dark: { ...w.dark, "surface-container": w.light?.["surface-container"] as string, "surface-container-high": w.light?.["surface-container-high"] as string } },
				],
			),
		);
	}
	return tasks;
}

// =====================================================================================
// 311 constraint-search
// =====================================================================================

/**
 * Stored results of the exhaustive searches over all 16,777,216 opaque 8-bit sRGB colors
 * (bruteFixMulti / bruteChromaMax in v3-c-search.ts). v3-c-search.test.ts recomputes each one and
 * fails if these drift; it also counts how many colors each bound admits.
 */
export const SEARCH3_311 = {
	chip: {
		original: "#ebe4fa",
		fill: "#a597d8",
		target: 4.5,
		hueTol: 8,
		optimum: 0.584394,
		best: "#4b2766",
		feasible: 74642,
		withinBound: 63677,
	},
	link: {
		original: "#4a7fd4",
		page: "#fbfaf6",
		callout: "#eaf2fb",
		target: 7,
		hueTol: 6,
		optimum: 0.158548,
		best: "#284ba7",
		/** Optimum when only the page is checked: fails the callout (6.48:1). */
		pageOnly: "#2d50ae",
		feasible: 216944,
		withinBound: 34759,
	},
	badge: {
		page: "#f6f5f2",
		footer: "#2a2733",
		label: "#fcfcfd",
		band: [350, 15] as [number, number],
		maxChroma: 0.247558,
		best: "#df0091",
		floor: 0.214,
		countAtFloor: 19903,
		/** Highest-chroma color clearing 3.03 / 3.03 / 4.55 with hue in [353, 12]: slack on every rule. */
		witness: "#df0089",
		/** Common pinks and magentas; every one must fail (asserted in v3-c-search.test.ts). */
		commonPinks: ["#d81b60", "#db2777", "#e60073", "#d6006f", "#cc0066", "#e91e63", "#ec4899", "#be185d", "#c2185b", "#f06595", "#ff0066"],
	},
};

const FIX3_FACTOR = 1.2;

function cat311(): Task[] {
	const tasks: Task[] = [];

	// q311-1: pale chip label on a mid-tone fill; even pure white cannot reach 4.5:1, so the fix goes dark.
	{
		const f = SEARCH3_311.chip;
		const ratio = contrast(f.original, f.fill);
		assert(ratio < f.target && contrast("#ffffff", f.fill) < f.target - 0.5, "q311-1 lightening must be infeasible");
		const bound = r4(FIX3_FACTOR * f.optimum);
		const params: Search3Params = {
			shape: "fix-multi",
			field: "label",
			original: f.original,
			floors: [{ label: "fill", hex: f.fill, min: f.target }],
			hueTol: f.hueTol,
			optimum: f.optimum,
			factor: FIX3_FACTOR,
			derivation: {
				method: "exhaustive search over all opaque 8-bit sRGB colors: minimum Oklab distance to the original among colors meeting the contrast floor with Oklch hue within hueTol",
				best: f.best,
				bound: `distance <= ${FIX3_FACTOR} x optimum = ${bound} (the optimum itself beats it by 20%)`,
				feasible: f.feasible,
				withinBound: f.withinBound,
				originalRatio: r2(ratio),
				trap: `white reaches only ${r2(contrast("#ffffff", f.fill))}:1 on the fill, so no lighter label can pass`,
			},
		};
		tasks.push(
			task(311, 1, {
				prompt: `Our filter chips print their label in a pale lavender, ${f.original}, on a lavender fill, ${f.fill}. An audit measured ${r2(ratio)}:1, and the chips are normal-size text, so they need WCAG AA. I want the label color that changes as little as possible while getting there; the fill stays as it is.

A new label is accepted when:
- its WCAG 2 contrast against ${f.fill} is ${f.target}:1 or more;
- its Oklch hue is no more than ${f.hueTol}° from the hue of ${f.original} (${r2(oklchOfHex(f.original).H)}°);
- its Oklab distance from ${f.original} is no more than ${FIX3_FACTOR} times the smallest distance reachable by any opaque 8-bit color that satisfies the two rules above.

${WCAG3_ALONE} ${OKLCH3_SHORT} ${OKDIST3} ${MEASURED3}

${contract(`{"label": "#rrggbb"}`)}`,
				schema: obj({ label: HEX }),
				params,
				witness: { label: f.best },
				invalid: [{ label: f.original }, { label: "#fdfcff" }, { label: "#000000" }, { label: "#160a20" }],
			}),
		);
	}

	// q311-2: link color that must reach AAA on the page and inside a tinted callout; tight 1.2x bound.
	{
		const f = SEARCH3_311.link;
		const rp = contrast(f.original, f.page);
		const rc = contrast(f.original, f.callout);
		assert(rp < f.target && rc < f.target, "q311-2 original must fail both");
		assert(contrast(f.pageOnly, f.callout) < f.target && contrast(f.pageOnly, f.page) >= f.target, "q311-2 page-only answer must fail only the callout");
		const bound = r4(FIX3_FACTOR * f.optimum);
		const params: Search3Params = {
			shape: "fix-multi",
			field: "link",
			original: f.original,
			floors: [
				{ label: "page", hex: f.page, min: f.target },
				{ label: "callout", hex: f.callout, min: f.target },
			],
			hueTol: f.hueTol,
			optimum: f.optimum,
			factor: FIX3_FACTOR,
			derivation: {
				method: "exhaustive search over all opaque 8-bit sRGB colors meeting both contrast floors and the hue rule (minimum Oklab distance to the original)",
				best: f.best,
				bound: `distance <= ${FIX3_FACTOR} x optimum = ${bound} (20% above the optimum; v1/v2 used 2 x optimum + 0.01)`,
				feasible: f.feasible,
				withinBound: f.withinBound,
				pageOnly: `${f.pageOnly}: optimum when only the page is checked; ${r2(contrast(f.pageOnly, f.callout))}:1 in the callout`,
			},
		};
		tasks.push(
			task(311, 2, {
				prompt: `On our documentation site, inline links use ${f.original}. They appear in body text on the page background ${f.page} and inside blue "note" callouts whose fill is ${f.callout}. The docs are moving to WCAG AAA for body text, and the link currently measures ${r2(rp)}:1 on the page and ${r2(rc)}:1 in a callout. I need one link color for both places, as near to today's blue as possible.

Rules for the new link color:
- WCAG 2 contrast of ${f.target}:1 or more against ${f.page}, and ${f.target}:1 or more against ${f.callout};
- Oklch hue within ${f.hueTol}° of ${f.original}'s ${r2(oklchOfHex(f.original).H)}°;
- Oklab distance from ${f.original} no larger than ${FIX3_FACTOR}× the minimum that any opaque 8-bit color meeting the first two rules achieves.

${WCAG3_ALONE} ${OKLCH3_SHORT} ${OKDIST3} ${MEASURED3}

${contract(`{"link": "#rrggbb"}`)}`,
				schema: obj({ link: HEX }),
				params,
				witness: { link: f.best },
				invalid: [{ link: f.pageOnly }, { link: f.original }, { link: "#1b3a8a" }, { link: "#33337f" }],
			}),
		);
	}

	// q311-3: promo badge fill: 3:1 on a light page and a dark footer, 4.5:1 under its light label, pink band across 0°.
	{
		const d = SEARCH3_311.badge;
		assert(d.maxChroma >= 1.15 * d.floor, "q311-3 feasibility margin");
		const floors = [
			{ label: "page", hex: d.page, min: 3 },
			{ label: "footer", hex: d.footer, min: 3 },
			{ label: "label", hex: d.label, min: 4.5 },
		];
		const params: Search3Params = {
			shape: "chroma-floor",
			field: "badge",
			floors,
			band: d.band,
			minChroma: d.floor,
			derivation: {
				method: "exhaustive search over all opaque 8-bit sRGB colors meeting the three contrast floors with hue in the band (which wraps through 0°)",
				maxChroma: d.maxChroma,
				maxChromaColor: d.best,
				countAtFloor: d.countAtFloor,
				floor: `${d.floor} = max achievable chroma / ${r3(d.maxChroma / d.floor)} (>= 15% margin)`,
				window: "4.5:1 under the light label and 3:1 over the dark footer leave relative luminance ~0.166-0.179 only",
				commonPinksRejected: d.commonPinks,
			},
		};
		tasks.push(
			task(311, 3, {
				prompt: `I'm designing the "sale" badge for a fashion shop: a solid pink-magenta pill with its text in ${d.label}. The same badge sits on the light product page (${d.page}) and in the dark footer (${d.footer}). I need one fill color that works everywhere:
- the badge text on the fill: WCAG 2 contrast of 4.5:1 or more between ${d.label} and the fill;
- the pill as a shape: WCAG 2 contrast of 3:1 or more against ${d.page}, and also 3:1 or more against ${d.footer};
- Oklch hue in the band from ${d.band[0]}° up through 360°/0° to ${d.band[1]}° (pinks and magenta-reds; the band wraps around zero);
- Oklch chroma of ${d.floor} or more: it has to look loud, not dusty.

${WCAG3_ALONE} ${OKLCH3_SHORT} ${MEASURED3}

${contract(`{"badge": "#rrggbb"}`)}`,
				schema: obj({ badge: HEX }),
				params,
				witness: { badge: d.witness },
				invalid: [{ badge: "#d81b60" }, { badge: "#db2777" }, { badge: "#c0189a" }, { badge: "#b0306a" }],
			}),
		);
	}

	// Gamut-mapping tolerances. Reference: chroma reduction at constant Oklch L and h (bisection).
	// colorjs.io's CSS Color 4 algorithm (bisection with the 0.02 deltaEOK JND clip) and its chroma-only
	// and ray-trace methods land at most ~0.023 Oklab, ~0.016 L and ~4.1° hue away on these inputs;
	// per-channel clipping of the large excursions lands 0.044-0.058 away (v3-c-search.test.ts).
	const D_TOL = 0.032;
	const L_TOL = 0.022;
	const H_TOL = 5;
	const IN_TOL = { dTol: 0.008, lTol: 0.008, hTol: 2 };
	const mapDerivation = {
		reference: "Oklch chroma reduction at constant L and h (bisection) to the sRGB boundary, then 8-bit rounding",
		tolerance: `needed mapping: Oklab distance <= ${D_TOL}, |ΔL| <= ${L_TOL}, Δh <= ${H_TOL}° (accepts CSS Color 4's JND-clip algorithm, ray-trace and chroma-only bisection; rejects per-channel clipping where it matters); already inside sRGB: ${IN_TOL.dTol}, ${IN_TOL.lTol}, ${IN_TOL.hTol}° (only rounding and matrix precision differ)`,
	};

	// q311-4: four Display P3 swatches, two outside sRGB (one where clipping is clearly wrong); name the outside ones.
	{
		const inputs: [string, [number, number, number]][] = [
			["fern", [0.08, 0.82, 0.3]],
			["coral", [0.96, 0.5, 0.36]],
			["iris", [0.6, 0.2, 0.95]],
			["wheat", [0.9, 0.82, 0.62]],
		];
		const refs = inputs.map(([field, p]) => {
			const raw = p3ToSrgb(p);
			const excess = Math.max(...raw.map((v) => Math.max(-v, v - 1)));
			const out = excess > 0;
			// The verdict must not hinge on matrix precision: every channel at least 0.01 outside or inside.
			assert(Math.abs(excess) >= 0.01, `q311-4 ${field} gamut verdict too close (${excess})`);
			const ref = rgbToHex(reduceChroma(oklchOfRgb(raw)).rgb);
			return { field, p, ref, clip: rgbToHex(raw), out, excess: r4(excess), tol: out ? { dTol: D_TOL, lTol: L_TOL, hTol: H_TOL } : IN_TOL };
		});
		assert(refs.map((r) => r.out).join() === "true,true,false,false", "q311-4 gamut status");
		const outside = refs.filter((r) => r.out).map((r) => r.field);
		const params: Search3Params = {
			shape: "map-outside",
			targets: refs.map((r) => ({ field: r.field, ref: r.ref, ...r.tol })),
			outsideField: "outsideSrgb",
			outside,
			derivation: {
				...mapDerivation,
				inputs: refs.map((r) => ({ field: r.field, p3: r.p, reference: r.ref, outOfGamut: r.out, worstChannelExcess: r.excess })),
				verdictMargin: "every input is at least 0.01 outside or inside [0, 1] in its worst linear-to-encoded sRGB channel",
			},
		};
		const p3 = (p: readonly number[]) => `color(display-p3 ${p.join(" ")})`;
		const fieldsOf = (pick: (r: (typeof refs)[number]) => string) => Object.fromEntries(refs.map((r) => [r.field, pick(r)]));
		tasks.push(
			task(311, 4, {
				prompt: `Our paint-swatch catalogue stores colors as CSS Display P3 values. For the printed price list and for old browsers I need plain sRGB hex fallbacks for four swatches, and I'd like to know which of them can't be shown in sRGB at all:
${refs.map((r) => `- ${r.field}: \`${p3(r.p)}\``).join("\n")}

Conversion: Display P3 has the D65 white of sRGB and the same transfer curve, ${DECODE}. Linearize, convert through CIE XYZ to linear sRGB, and re-encode. A swatch is outside sRGB when any linear sRGB channel ends up below 0 or above 1. Fit such a swatch into sRGB as CSS Color 4 intends: keep its Oklch L and hue and lower the chroma until it just fits; that plain chroma reduction is my reference result, and the CSS Color 4 gamut-mapping algorithm with its just-noticeable-difference step is accepted as well. Clamping R, G and B separately is not. Swatches already inside sRGB are simply converted. Give 8-bit hex.

${OKLCH3_SHORT} Grading compares each hex with the reference by Oklab distance, Oklch L and Oklch hue: within ${D_TOL}, ${L_TOL} and ${H_TOL}° for a swatch that needed fitting, within ${IN_TOL.dTol}, ${IN_TOL.lTol} and ${IN_TOL.hTol}° for one that did not. The list of names outside sRGB must be exact.

${contract(`{"fern": "#rrggbb", "coral": "#rrggbb", "iris": "#rrggbb", "wheat": "#rrggbb", "outsideSrgb": ["<swatch name>", ...]}`)}`,
				schema: obj({ fern: HEX, coral: HEX, iris: HEX, wheat: HEX, outsideSrgb: arr(STR) }),
				params,
				witness: { ...fieldsOf((r) => r.ref), outsideSrgb: outside },
				invalid: [
					{ ...fieldsOf((r) => r.clip), outsideSrgb: outside },
					{ ...fieldsOf((r) => rgbToHex(r.p)), outsideSrgb: outside },
					{ ...fieldsOf((r) => r.ref), outsideSrgb: [...outside, "iris"] },
					{ ...fieldsOf((r) => r.ref), outsideSrgb: [] },
				],
			}),
		);
	}

	// q311-5: tint/shade/deep by relative Oklch lightness moves of a pink, chroma and hue kept, gamut-mapped.
	{
		const base = "#d43f86";
		const b = oklchOfHex(base);
		const moves: [string, string, number][] = [
			["tint", "L moves 45% of the way up to 1: L' = L + 0.45 × (1 − L)", b.L + 0.45 * (1 - b.L)],
			["shade", "L drops by 30% of itself: L' = 0.7 × L", 0.7 * b.L],
			["deep", "L drops by 60% of itself: L' = 0.4 × L", 0.4 * b.L],
		];
		const refs = moves.map(([field, , L]) => {
			const m = reduceChroma({ L, C: b.C, H: b.H });
			return { field, L: r4(L), ref: rgbToHex(m.rgb), mappedC: r4(m.oklch.C), needed: m.oklch.C < b.C - 1e-6 };
		});
		assert(refs.every((r) => r.needed), "q311-5 every move must need gamut mapping");
		const params = {
			shape: "map" as const,
			targets: refs.map((r) => ({ field: r.field, ref: r.ref, dTol: D_TOL, lTol: L_TOL, hTol: H_TOL })),
			derivation: { ...mapDerivation, base, baseOklch: { L: r4(b.L), C: r4(b.C), H: r2(b.H) }, refs },
		};
		const clipped = Object.fromEntries(
			refs.map((r) => {
				const h = (b.H * Math.PI) / 180;
				return [r.field, rgbToHex(oklabToRgbClipped(r.L, b.C * Math.cos(h), b.C * Math.sin(h)))];
			}),
		);
		const absolute = Object.fromEntries(
			[
				["tint", b.L + 0.45],
				["shade", b.L - 0.3],
				["deep", b.L - 0.6],
			].map(([f, L]) => [f as string, hexOfOklch(L as number, b.C, b.H)]),
		);
		tasks.push(
			task(311, 5, {
				prompt: `Our florist app's accent is the pink ${base}. For its interaction states I need three related colors, each made by changing only the Oklch lightness L of ${base} and keeping its Oklch chroma and hue as they are:
${moves.map(([f, rule]) => `- ${f}: ${rule};`).join("\n")}

If the moved color lies outside sRGB, bring it inside the CSS Color 4 way: hold the new L and the hue and reduce chroma until it fits (plain chroma reduction is my reference; the CSS Color 4 gamut-mapping algorithm with its just-noticeable-difference step is fine too). Do not clamp R, G and B one at a time. Return 8-bit hex.

${OKLCH3} ${OKDIST3} I'll compare each result with the reference by Oklab distance (up to ${D_TOL}), Oklch L (up to ${L_TOL}) and Oklch hue (up to ${H_TOL}°).

${contract(`{"tint": "#rrggbb", "shade": "#rrggbb", "deep": "#rrggbb"}`)}`,
				schema: hexObj(moves.map(([f]) => f)),
				params,
				kind: "neutral-constraint-search",
				witness: Object.fromEntries(refs.map((r) => [r.field, r.ref])),
				invalid: [clipped, absolute, { tint: base, shade: base, deep: base }],
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

// =====================================================================================
// 312 palette-audit
// =====================================================================================

const VERDICT_MARGIN = 0.15;
const V1_AUDIT = "neutral-palette-audit";

/**
 * q312-2 inputs. The derivation (best 5-subset, threshold, share of random picks that pass) is
 * computed at build time by chartSearch (v3-c-search.ts) and re-checked in v3-c-search.test.ts.
 */
export const CHART3_312 = {
	light: "#fdfcfa",
	dark: "#1e1c24",
	k: 5,
	candidates: [
		"#d1495e",
		"#e0663a",
		"#c27e18",
		"#a3a31e",
		"#4f9a3a",
		"#1f9a74",
		"#1592a8",
		"#3a83d6",
		"#6a6fe0",
		"#9a5ad6",
		"#c24fb0",
		"#d14d86",
		"#7f8a94",
		"#b0703f",
		"#36a9d2",
		"#4a3d8c",
	],
};

function cat312(): Task[] {
	const tasks: Task[] = [];

	// q312-1: AA verdicts on pairs written in mixed CSS notations (#rgb, rgb(), hsl()), size class stated.
	{
		const rows0: [string, string, string, "normal" | "large"][] = [
			["price-label", "#a55", "#fbf7f2", "normal"],
			["hero-heading", "hsl(205 70% 45%)", "#f9fbfd", "large"],
			["body-copy", "rgb(118 122 130)", "hsl(40 33% 96%)", "normal"],
			["badge-text", "#fdfdfd", "hsl(150 60% 36%)", "normal"],
			["footer-note", "hsl(220 9% 50%)", "#1d2027", "normal"],
			["caption", "#777", "#f2f2f2", "normal"],
			["nav-link", "rgb(46, 104, 168)", "hsl(210, 40%, 94%)", "normal"],
			["sale-banner", "hsl(0 0% 100%)", "hsl(14 85% 58%)", "large"],
		];
		const rows = rows0.map(([id, fg, bg, size]) => {
			const t = size === "large" ? 3 : 4.5;
			const a = parseCssColor(fg);
			const b = parseCssColor(bg);
			const cr = contrastRatioRgb(a, b);
			// An implementation that rounds the hsl() conversions to 8-bit first lands within 0.02 of this.
			const crRounded = contrastRatioRgb(hexToRgb(rgbToHex(a)), hexToRgb(rgbToHex(b)));
			assert(Math.abs(cr - t) >= VERDICT_MARGIN && Math.abs(crRounded - t) >= VERDICT_MARGIN, `q312-1 ${id} within ${VERDICT_MARGIN} of ${t} (${cr})`);
			return { id, fg, bg, size, t, cr, fails: cr < t };
		});
		const failing = rows.filter((r) => r.fails).map((r) => r.id);
		const allNormal = rows.filter((r) => r.cr < 4.5).map((r) => r.id);
		assert(allNormal.join() !== failing.join(), "q312-1 the size class must matter");
		assert(failing.includes("caption"), "q312-1 the #rgb shorthand row must fail");
		const params = {
			shape: "set" as const,
			field: "failing",
			item: { k: "id" as const },
			universe: rows.map((r) => r.id),
			expected: failing,
			mode: "per-item" as const,
			derivation: {
				ratios: rows.map((r) => ({ id: r.id, fg: rgbToHex(parseCssColor(r.fg)), bg: rgbToHex(parseCssColor(r.bg)), ratio: r4(r.cr), threshold: r.t })),
				margin: `every ratio at least ${VERDICT_MARGIN} from its threshold, with or without rounding the converted colors to 8-bit`,
				notation: "hsl() per CSS Color 4 (hsl-to-rgb), #rgb expands each digit (#777 = #777777), rgb() takes 0-255 numbers with or without commas",
			},
		};
		tasks.push(
			task(312, 1, {
				prompt: `Our marketing pages were assembled by three different teams, so the stylesheet mixes color notations. Please tell me which of these text styles fail WCAG 2 AA. "normal" means body-size text and needs 4.5:1; "large" means large-scale text and needs 3:1.

${rows.map((r) => `- ${r.id}: text \`${r.fg}\` on \`${r.bg}\` (${r.size})`).join("\n")}

Read the colors as CSS does: a three-digit hex doubles each digit, rgb() channels run 0-255, and hsl() is converted with the CSS Color 4 hue/saturation/lightness formula. ${WCAG3_ALONE}

List the ids that fail; an empty list if every style passes.
${contract(`{"failing": ["<id>", ...]}`)}`,
				schema: obj({ failing: arr(STR) }),
				params,
				kind: V1_AUDIT,
				witness: { failing },
				invalid: [{ failing: allNormal }, { failing: failing.filter((x) => x !== "caption") }, { failing: [] }],
			}),
		);
	}

	// q312-2: pick 5 of 16 series colors that work on a light and a dark card; deuteranopia separation.
	{
		const c = CHART3_312;
		const both = chartSearch(c.candidates, [c.light, c.dark], 3, c.k, 0.85);
		const lightOnly = chartSearch(c.candidates, [c.light], 3, c.k, 0.85);
		const normalVision = chartSearch(c.candidates, [c.light, c.dark], 3, c.k, 0.85, de2000Hex);
		assert(both.score >= both.threshold * 1.15, "q312-2 margin");
		assert(both.randomPassRate < 0.01, `q312-2 random pass rate ${both.randomPassRate}`);
		const params: Audit3Params = {
			shape: "chart-multi",
			field: "series",
			candidates: c.candidates,
			backgrounds: [
				{ label: "light-card", hex: c.light },
				{ label: "dark-card", hex: c.dark },
			],
			k: c.k,
			minContrast: 3,
			threshold: r4(both.threshold),
			derivation: {
				method: "exhaustive search over all 5-subsets of the candidates with >= 3:1 on both cards; score = min pairwise CIEDE2000 between deuteranopia simulations (unrounded)",
				eligible: both.eligible,
				best: both.best,
				bestScore: r4(both.score),
				threshold: "0.85 x best score (the best set clears it by 17.6%)",
				passingSubsets: `${both.passing} of ${both.subsets} eligible 5-subsets`,
				randomPassRate: `${r4(both.randomPassRate * 100)}% of all 4368 5-subsets of the 16 candidates pass every rule`,
				lightOnlyBest: lightOnly.best,
				normalVisionBest: normalVision.best,
			},
		};
		const minus = (xs: string[], ys: string[]) => xs.filter((x) => !ys.includes(x));
		assert(minus(lightOnly.best, both.eligible).length > 0, "q312-2 the light-only best set must use a color that fails the dark card");
		tasks.push(
			task(312, 2, {
				prompt: `Our energy-monitoring dashboard renders every chart on a light card (${c.light}) in day mode and on a dark card (${c.dark}) in night mode, with the same series colors. Each chart has five series. From the sixteen colors in our brand palette, choose 5 different ones such that:
- each of the 5 reaches 3:1 WCAG 2 contrast against ${c.light} and also against ${c.dark} (series lines are non-text graphics);
- among all sets that satisfy that, yours is (close to) the most distinguishable for people with deuteranopia: the smallest CIEDE2000 difference between any two of your five, after simulating deuteranopia, must be at least 85% of the best value any valid set from this palette can reach.

Palette: ${c.candidates.join(", ")}

${CVD3} ${DE3} Take the differences on the simulated colors before any rounding. ${WCAG3}

${contract(`{"series": ["#rrggbb", "#rrggbb", "#rrggbb", "#rrggbb", "#rrggbb"]}`)}`,
				schema: obj({ series: arr(HEX, 5) }),
				params,
				witness: { series: both.best },
				invalid: [{ series: lightOnly.best }, { series: normalVision.best }, { series: both.best.slice(0, 4) }],
			}),
		);
	}

	// q312-3: near-duplicate tokens by CIEDE2000 < 3, with a ΔE*ab trap in each direction.
	{
		const T = 3;
		const tokens: [string, string][] = [
			["slate-600", "#5e6168"],
			["icon-default", "#625f67"],
			["violet-500", "#7a3fe0"],
			["focus-ring", "#7933ee"],
			["amber-400", "#f0b429"],
			["warning", "#eeb32e"],
			["paper", "#f7f4ee"],
			["page-bg", "#f3f0e8"],
			["ink", "#23262d"],
			["rose-500", "#e0567a"],
			["sky-500", "#3c95d8"],
			["mint-300", "#8fd9b6"],
		];
		const universe: string[] = [];
		const dupes: string[] = [];
		const dupes76: string[] = [];
		const close: { pair: string; de00: number; de76: number }[] = [];
		for (let i = 0; i < tokens.length; i++)
			for (let j = i + 1; j < tokens.length; j++) {
				const [a, ha] = tokens[i] as [string, string];
				const [b, hb] = tokens[j] as [string, string];
				const key = [a, b].sort().join("|");
				const de = de2000Hex(ha, hb);
				const d76 = de76Hex(ha, hb);
				assert(de <= T * (1 - VERDICT_MARGIN) || de >= T * (1 + VERDICT_MARGIN), `q312-3 ${key} within 15% of ${T} (${de})`);
				universe.push(key);
				if (de < 6 || d76 < 6) close.push({ pair: key, de00: r2(de), de76: r2(d76) });
				if (de < T) dupes.push(key);
				if (d76 < T) dupes76.push(key);
			}
		assert(dupes.includes("focus-ring|violet-500") && !dupes76.includes("focus-ring|violet-500"), "q312-3 ΔE76 misses the saturated pair");
		assert(!dupes.includes("icon-default|slate-600") && dupes76.includes("icon-default|slate-600"), "q312-3 ΔE76 flags the near-gray pair");
		const params = {
			shape: "set" as const,
			field: "merge",
			item: { k: "pair" as const },
			universe,
			expected: dupes,
			mode: "per-expected" as const,
			derivation: {
				threshold: T,
				margin: "every pair's CIEDE2000 at least 15% from the threshold",
				close,
				traps: "violet-500/focus-ring: ΔE00 ~2.3 but ΔE*ab ~12.5 (blue-violet chroma is compressed by CIEDE2000); slate-600/icon-default: ΔE*ab ~2.5 but ΔE00 ~3.6 (near-neutral a* differences are expanded by the G term)",
				deltaE76Answer: dupes76,
			},
		};
		const asPairs = (keys: string[]) => [...keys].sort().map((k) => k.split("|"));
		tasks.push(
			task(312, 3, {
				prompt: `Before we publish v2 of our design tokens I want to merge tokens that are effectively the same color. Flag every pair of tokens whose CIEDE2000 difference is below ${T}. Judge each pair by that metric alone, even where a simpler color-difference formula would disagree.

${tokens.map(([n, h]) => `- \`${n}\`: ${h}`).join("\n")}

${DE3}

Report each flagged pair once, as a two-name array; the order within a pair and the order of the pairs don't matter.
${contract(`{"merge": [["<token>", "<token>"], ...]}`)}`,
				schema: obj({ merge: arr(arr(STR, 2)) }),
				params,
				kind: V1_AUDIT,
				witness: { merge: asPairs(dupes) },
				invalid: [{ merge: asPairs(dupes76) }, { merge: asPairs(dupes.filter((k) => k !== "page-bg|paper")) }, { merge: [] }],
			}),
		);
	}

	// q312-4: light theme derived from a dark-first token set.
	{
		const dark: Record<string, string> = {
			bg: "#121417",
			"bg-raised": "#1b1e24",
			text: "#e6e4df",
			"text-dim": "#a2a6ad",
			border: "#6b707a",
			accent: "#5fc29a",
			"on-accent": "#0d2219",
			link: "#8ab0f0",
			"danger-text": "#f2867b",
		};
		const pairs: Pair[] = [
			["text", "bg", 4.5],
			["text", "bg-raised", 4.5],
			["text-dim", "bg", 4.5],
			["text-dim", "bg-raised", 4.5],
			["link", "bg", 4.5],
			["danger-text", "bg-raised", 4.5],
			["border", "bg", 3],
			["accent", "bg", 3],
			["on-accent", "accent", 4.5],
		];
		for (const [fg, bg, m] of pairs) assert(contrast(dark[fg] as string, dark[bg] as string) >= m, `q312-4 dark ${fg}/${bg}`);
		const H = (n: string) => oklchOfHex(dark[n] as string).H;
		const light = tokensFrom({
			bg: [0.975, 0.004, 90],
			"bg-raised": [0.995, 0.002, 90],
			text: [0.24, 0.01, 90],
			"text-dim": [0.5, 0.012, 250],
			border: [0.62, 0.012, 250],
			accent: [0.5, 0.11, H("accent")],
			"on-accent": [0.995, 0.004, H("accent")],
			link: [0.48, 0.15, H("link")],
			"danger-text": [0.5, 0.17, H("danger-text")],
		});
		const hueChecked = Object.keys(dark).filter((n) => oklchOfHex(dark[n] as string).C >= 0.04);
		assert(hueChecked.join() === "accent,link,danger-text", `q312-4 hue-checked tokens: ${hueChecked.join()}`);
		const params: Audit3Params = {
			shape: "light-from-dark",
			field: "light",
			dark,
			pairs,
			hueTol: 15,
			hueMinChroma: 0.04,
			lightMinChroma: 0.04,
			surfaces: ["bg", "bg-raised"],
			surfaceMinL: 0.93,
			derivation: {
				hueChecked,
				tolerance: "15° hue: a light-theme counterpart changes lightness and chroma, not hue; 8-bit rounding moves hue < 2° at chroma >= 0.04",
				witness: "Oklch tone table: surfaces L 0.975/0.995, text 0.24, text-dim 0.50, border 0.62, accent/link/danger at L 0.48-0.50 on their dark hues",
			},
		};
		const inverted = Object.fromEntries(
			Object.entries(dark).map(([k, h]) => [k, `#${(0xffffff - Number.parseInt(h.slice(1), 16)).toString(16).padStart(6, "0")}`]),
		);
		const faintBorder = { ...light, border: hexOfOklch(0.8, 0.01, 250) };
		tasks.push(
			task(312, 4, {
				prompt: `Our trading terminal was designed dark-first, and customers now want a daylight mode. These are the dark theme's tokens:
${Object.entries(dark)
	.map(([k, h]) => `- ${k}: ${h}`)
	.join("\n")}

Give me a light-theme value for every token such that, in the light theme:
${pairs.map(([fg, bg, m]) => `- ${fg} on ${bg} reaches ${m}:1 WCAG 2 contrast${m === 3 ? " (a non-text element)" : ""};`).join("\n")}
- bg and bg-raised are actually light: Oklab L of ${params.surfaceMinL} or more;
- each token whose dark value has Oklch chroma ${params.hueMinChroma} or more keeps its identity: its light value has Oklch chroma ${params.lightMinChroma} or more and a hue within ${params.hueTol}° of the dark value's hue. Lightness and chroma may otherwise move as you see fit.

${WCAG3_ALONE} ${OKLCH3_SHORT} ${OKLAB_L3} ${MEASURED3}

${contract(`{"light": {"bg": "#rrggbb", "bg-raised": "#rrggbb", "text": "#rrggbb", ...one entry per token}}`)}`,
				schema: obj({ light: hexObj(Object.keys(dark)) }),
				params,
				witness: { light },
				invalid: [{ light: dark }, { light: inverted }, { light: faintBorder }],
			}),
		);
	}

	// q312-5: non-text parts, some translucent, composited over two light surfaces (WCAG 1.4.11, 3:1).
	{
		const surfaces: [string, string][] = [
			["canvas", "#eceae4"],
			["sheet", "#fefdfb"],
		];
		const parts: [string, string, number][] = [
			["input-border", "rgb(30 34 44)", 0.44],
			["divider", "rgb(30 34 44)", 0.16],
			["focus-ring", "#4c7ee8", 1],
			["icon-muted", "rgb(30 34 44)", 0.58],
			["toggle-track", "#878d98", 1],
			["chip-outline", "hsl(262 45% 60%)", 1],
		];
		const css = (c: string, a: number) => (a === 1 ? c : c.replace(")", ` / ${a})`));
		const rows = parts.flatMap(([p, c, a]) =>
			surfaces.map(([s, sh]) => {
				const bg = hexToRgb(sh);
				const fg = over(parseCssColor(c), a, bg);
				const cr = contrastRatioRgb(fg, bg);
				const crRounded = contrastRatioRgb(hexToRgb(rgbToHex(fg)), bg);
				assert(Math.abs(cr - 3) >= VERDICT_MARGIN && Math.abs(crRounded - 3) >= VERDICT_MARGIN, `q312-5 ${p}/${s} within ${VERDICT_MARGIN} of 3 (${cr})`);
				const opaque = contrastRatioRgb(parseCssColor(c), bg);
				return { key: `${p}|${s}`, element: p, on: s, cr, fails: cr < 3, opaqueFails: opaque < 3 };
			}),
		);
		const failing = rows.filter((r) => r.fails);
		const ignoringAlpha = rows.filter((r) => r.opaqueFails);
		assert(failing.length >= 4 && failing.length <= 7, "q312-5 verdict mix");
		assert(rows.some((r) => r.element === "toggle-track" && r.fails) && rows.some((r) => r.element === "toggle-track" && !r.fails), "q312-5 one part must split by surface");
		const params = {
			shape: "set" as const,
			field: "failing",
			item: { k: "fields" as const, fields: ["element", "on"] },
			universe: rows.map((r) => r.key),
			expected: failing.map((r) => r.key),
			mode: "per-item" as const,
			derivation: {
				ratios: rows.map((r) => ({ combo: r.key, ratio: r4(r.cr) })),
				margin: `every ratio at least ${VERDICT_MARGIN} from 3, with or without rounding the composite to 8-bit`,
				compositing: "source-over on gamma-encoded sRGB channels: out = alpha * part + (1 - alpha) * surface",
			},
		};
		const asItems = (rs: typeof rows) => rs.map((r) => ({ element: r.element, on: r.on }));
		tasks.push(
			task(312, 5, {
				prompt: `I'm checking the form controls of our booking widget against WCAG 2.x success criterion 1.4.11 (non-text contrast): a boundary or icon a user needs to see a control by must reach 3:1 against the color right next to it. The widget appears on two surfaces, and several parts are semi-transparent so they adapt to whatever is under them.

Surfaces:
${surfaces.map(([s, h]) => `- ${s}: ${h}`).join("\n")}

Parts:
${parts.map(([p, c, a]) => `- ${p}: \`${css(c, a)}\``).join("\n")}

A translucent part is painted the way browsers do it: plain source-over blending of the gamma-encoded sRGB values, out = alpha × part + (1 − alpha) × surface for each of R, G, B; then compare the blended color with that surface. hsl() follows the CSS Color 4 conversion. ${WCAG3_ALONE}

Which (part, surface) combinations fall below 3:1? Use the names exactly as labelled above.
${contract(`{"failing": [{"element": "<part>", "on": "<surface>"}, ...]}`)}`,
				schema: obj({ failing: arr(obj({ element: STR, on: STR })) }),
				params,
				kind: V1_AUDIT,
				witness: { failing: asItems(failing) },
				invalid: [{ failing: asItems(ignoringAlpha) }, { failing: asItems(failing.filter((r) => r.on === "canvas")) }, { failing: [] }],
			}),
		);
	}
	return tasks;
}

/** Neutral suite v3, author C: returns this author's categories' tasks. */
export function neutral3C(): Task[] {
	return [...cat309(), ...cat310(), ...cat311(), ...cat312()];
}
