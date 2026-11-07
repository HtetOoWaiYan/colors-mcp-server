import {
	type DivergingParams,
	type GrayscaleParams,
	gradeDiverging,
	gradeGrayscale,
	type HueBand,
	type MixParams,
	type PickParams,
	type ScrimParams,
	type YcbcrItem,
} from "../../graders-gen/tasks.js";
import { hexToRgb, linearToSrgb, rgbToOklch } from "../../reference/color.js";
import {
	hexToRgb8,
	mixLinear8,
	mixOklab8,
	mixSrgb8,
	minScrimOpacity,
	over8,
	type Rgb8,
	rgb8ToHex,
	scrimContrast,
	scrimContrastExact,
} from "../../reference-gen/composite.js";
import {
	decode709Limited,
	encode709Limited,
	encodeJfif,
} from "../../reference-gen/ycbcr.js";
import { contract, corrupt, HEX_SCHEMA, objectSchema, resultsSchema, round } from "../build/common.js";
import { CATEGORY_NAMES, type Task } from "../types.js";
import {
	GRAY_BAND,
	maxChromaHex,
	searchDiverging,
	searchGrayscale,
	searchPick,
} from "./search.js";

interface GenInit {
	category: number;
	n: number;
	prompt: string;
	schema: Record<string, unknown>;
	grader: Task["grader"];
	witness: unknown;
	invalid: unknown[];
	toolUseful: boolean;
}

export function makeGenTask(t: GenInit): Task {
	return {
		id: `g${t.category}-${t.n}`,
		category: t.category,
		categoryName: CATEGORY_NAMES[t.category] as string,
		// Nothing in this suite is ever tuned on, so it has no sealed held-out split.
		split: "dev",
		prompt: t.prompt,
		schema: t.schema,
		grader: t.grader,
		witness: t.witness,
		invalid: t.invalid,
		toolUseful: t.toolUseful,
	};
}

const floor2 = (v: number) => Math.floor(v * 100 + 1e-9) / 100;
const hueOf = (hex: string) => rgbToOklch(hexToRgb(hex)).H;
const lightOf = (hex: string) => rgbToOklch(hexToRgb(hex)).L;
// A borderline invalid must break exactly the one rule it was built to break.
function breaksOnly(
	checks: { name: string; pass: boolean }[],
	rule: string,
	id: string,
): void {
	const failed = checks.filter((c) => !c.pass).map((c) => c.name);
	if (failed.length !== 1 || failed[0] !== rule)
		fail(`${id}: borderline invalid breaks ${failed.join("+")}, not ${rule}`);
}
const fail = (msg: string): never => {
	throw new Error(msg);
};
const PICK_SCHEMA = objectSchema({ hex: HEX_SCHEMA });
const HEX_LIST = (key: "steps" | "colors", n: number) =>
	objectSchema({
		[key]: {
			type: "array",
			items: HEX_SCHEMA,
			minItems: n,
			maxItems: n,
		},
	});

// ---- 101 constrained pick, 103 dual surface ----

interface PickSpec {
	category: 101 | 103;
	n: number;
	intro: string;
	hue: HueBand;
	hueLine: string;
	chromaLine: (c: number) => string;
	lMin?: number;
	lMinLine?: string;
	lMax?: number;
	lMaxLine?: string;
	contrasts: { name: string; against: string; min: number; line: string }[];
}

// The chroma floor is 0.6 x the largest chroma any 8-bit color meeting the other rules reaches.
const CHROMA_FRACTION = 0.6;

function pickTask(s: PickSpec): Task {
	const base: PickParams = {
		hue: s.hue,
		cMin: 0,
		lMin: s.lMin,
		lMax: s.lMax,
		contrasts: s.contrasts.map(({ name, against, min }) => ({
			name,
			against,
			min,
		})),
	};
	const open = searchPick(base);
	const cMin = floor2(CHROMA_FRACTION * open.maxChroma);
	const params: PickParams = { ...base, cMin };
	const r = searchPick(params);
	if (!r.witness) fail(`g${s.category}-${s.n} infeasible`);
	const rules = [
		s.hueLine,
		s.chromaLine(cMin),
		...(s.lMinLine ? [s.lMinLine] : []),
		...(s.lMaxLine ? [s.lMaxLine] : []),
		...s.contrasts.map((c) => c.line),
	];
	const prompt = `${s.intro}\n\n${rules.map((l) => `- ${l}`).join("\n")}\n\nAny color that meets every requirement is fine. Contrast is the WCAG 2 contrast ratio. OKLCH is Björn Ottosson's Oklab in polar form (lightness 0 to 1, chroma, hue in degrees).\n\n${contract('{"hex": "#rrggbb"}')}`;
	return makeGenTask({
		category: s.category,
		n: s.n,
		prompt,
		schema: PICK_SCHEMA,
		grader: {
			kind: "gen-pick",
			params: {
				...params,
				derivation: {
					openMaxChroma: round(open.maxChroma),
					feasibleColors: r.feasible,
					witnessSlack: round(r.witnessSlack, 3),
				},
			},
		},
		witness: { hex: r.witness },
		invalid: [
			{},
			{ hex: "green" },
			corrupt({ hex: r.witness }),
			...Object.keys(r.nearMiss)
				.sort()
				.map((k) => ({ hex: r.nearMiss[k] })),
		],
		toolUseful: true,
	});
}

const chroma = (what: string) => (c: number) =>
	`OKLCH chroma at least ${c}, so it reads as ${what}, not gray.`;
const textOn = (hex: string, min: number, who: string) =>
	`${who} (${hex}) on it reaches a contrast ratio of at least ${min}:1.`;

export function cat101(): Task[] {
	return [
		pickTask({
			category: 101,
			n: 1,
			intro:
				"I need one primary button fill color for a fintech app. Requirements:",
			hue: { min: 140, max: 165 },
			hueLine: "It is a green: OKLCH hue between 140 and 165 degrees.",
			chromaLine: chroma("a real green"),
			lMin: 0.45,
			lMinLine:
				"OKLCH lightness at least 0.45, so it does not read as near-black.",
			contrasts: [
				{
					name: "white_text",
					against: "#ffffff",
					min: 4.5,
					line: textOn("#ffffff", 4.5, "White label text"),
				},
			],
		}),
		pickTask({
			category: 101,
			n: 2,
			intro:
				"Pick the link color for our dark theme. The page background is #0b0f19. Requirements:",
			hue: { min: 240, max: 265 },
			hueLine: "It is a blue: OKLCH hue between 240 and 265 degrees.",
			chromaLine: chroma("blue"),
			lMax: 0.85,
			lMaxLine: "OKLCH lightness at most 0.85, so it does not look washed out.",
			contrasts: [
				{
					name: "page",
					against: "#0b0f19",
					min: 7,
					line: "As text on the #0b0f19 background it reaches a contrast ratio of at least 7:1.",
				},
			],
		}),
		pickTask({
			category: 101,
			n: 3,
			intro:
				"Choose our new purple brand color. It is used as a button fill with white text, and as a solid accent bar on the dark sidebar (#111827). Requirements:",
			hue: { min: 290, max: 315 },
			hueLine: "OKLCH hue between 290 and 315 degrees.",
			chromaLine: chroma("a vivid purple"),
			contrasts: [
				{
					name: "white_text",
					against: "#ffffff",
					min: 4.5,
					line: textOn("#ffffff", 4.5, "White button text"),
				},
				{
					name: "sidebar",
					against: "#111827",
					min: 3,
					line: "The color itself reaches a contrast ratio of at least 3:1 against the sidebar #111827.",
				},
			],
		}),
		pickTask({
			category: 101,
			n: 4,
			intro: "Pick a teal for our app header bar, which carries white text. Requirements:",
			hue: { min: 180, max: 205 },
			hueLine: "It is a teal: OKLCH hue between 180 and 205 degrees.",
			chromaLine: chroma("teal"),
			lMin: 0.4,
			lMinLine:
				"OKLCH lightness at least 0.4, so it does not read as near-black.",
			contrasts: [
				{
					name: "white_text",
					against: "#ffffff",
					min: 4.5,
					line: textOn("#ffffff", 4.5, "White header text"),
				},
			],
		}),
	];
}

// Brand hue +-20 degrees, so the answer stays in the brand's hue family.
const HUE_TOL = 20;
function dualTask(
	n: number,
	use: string,
	light: string,
	dark: string,
	brand: string,
): Task {
	const h = hueOf(brand);
	return pickTask({
		category: 103,
		n,
		intro: `Pick one ${use} color that works on both of our surfaces: the light surface ${light} and the dark surface ${dark}. We want a single color, not one per theme. Requirements:`,
		hue: {
			min: round((h - HUE_TOL + 360) % 360),
			max: round((h + HUE_TOL) % 360),
		},
		hueLine: `Stay in the brand's hue family: OKLCH hue within ${HUE_TOL} degrees of the hue of our brand color ${brand}.`,
		chromaLine: chroma("a brand color"),
		contrasts: [
			{
				name: "light",
				against: light,
				min: 3,
				line: `Contrast ratio of at least 3:1 against the light surface ${light}.`,
			},
			{
				name: "dark",
				against: dark,
				min: 3,
				line: `Contrast ratio of at least 3:1 against the dark surface ${dark}.`,
			},
		],
	});
}

export function cat103(): Task[] {
	return [
		dualTask(1, "focus ring", "#ffffff", "#121212", "#2563eb"),
		dualTask(2, "icon", "#f5f5f4", "#1c1917", "#ea580c"),
		dualTask(3, "status icon", "#d1d5db", "#1f2937", "#16a34a"),
		dualTask(4, "badge outline", "#fef3c7", "#1e3a8a", "#db2777"),
	];
}

// ---- 102 scrim ----

interface ScrimSpec {
	n: number;
	intro: string;
	text: string;
	scrim: string;
	regions: string[];
	target: number;
	step: number;
}

// Both rounding conventions must agree on the optimum, so a careful answer cannot be marked wrong by rounding alone.
const SCRIM_MARGIN = 0.02;

function scrimTask(s: ScrimSpec): Task {
	const aStar =
		minScrimOpacity(s.text, s.scrim, s.regions, s.target, s.step) ??
		fail(`g102-${s.n} infeasible`);
	const worst = (a: number, f: typeof scrimContrast) =>
		Math.min(...s.regions.map((r) => f(s.text, s.scrim, a, r)));
	const below = round(aStar - s.step, 6);
	for (const f of [scrimContrast, scrimContrastExact]) {
		if (worst(aStar, f) < s.target + SCRIM_MARGIN)
			fail(`g102-${s.n}: optimum too close to target`);
		if (below >= 0 && worst(below, f) > s.target - SCRIM_MARGIN)
			fail(`g102-${s.n}: step below optimum too close to target`);
	}
	const params: ScrimParams = {
		text: s.text,
		scrim: s.scrim,
		regions: s.regions,
		target: s.target,
		step: s.step,
		alphaStar: aStar,
	};
	const stepText = s.step === 0.05 ? "0.05 (for example 0.35)" : "0.01 (for example 0.37)";
	const prompt = `${s.intro}\n\nText color: ${s.text}. Overlay color: ${s.scrim}. Worst-case photo regions behind the text: ${s.regions.join(", ")}.\n\nFind the smallest overlay opacity, in steps of ${stepText}, at which the text reaches a WCAG 2 contrast ratio of at least ${s.target}:1 against every one of those regions once the overlay is applied. The overlay is painted over each region like CSS: on 8-bit sRGB channel values, result = opacity x overlay + (1 - opacity) x region, rounded to the nearest integer before measuring contrast. Do not overshoot: a darker or lighter overlay than needed hides the photo.\n\n${contract('{"opacity": number}')}`;
	const up2 = round(aStar + 2 * s.step, 6);
	return makeGenTask({
		category: 102,
		n: s.n,
		prompt,
		schema: objectSchema({
			opacity: { type: "number", minimum: 0, maximum: 1 },
		}),
		grader: { kind: "gen-scrim", params },
		witness: { opacity: aStar },
		invalid: [
			{},
			{ opacity: String(aStar) },
			{ opacity: below },
			...(up2 <= 1 ? [{ opacity: up2 }] : []),
			{ opacity: round(aStar + s.step / 2, 6) },
		],
		toolUseful: true,
	});
}

export function cat102(): Task[] {
	return [
		scrimTask({
			n: 1,
			intro:
				"Our homepage hero puts a white headline over a photo, with a black overlay layer between them.",
			text: "#ffffff",
			scrim: "#000000",
			regions: ["#d8d2c4", "#a7b8c9", "#f2efe9"],
			target: 4.5,
			step: 0.05,
		}),
		scrimTask({
			n: 2,
			intro:
				"A campaign banner puts white text over a landscape photo, tinted with our brand navy as an overlay layer.",
			text: "#ffffff",
			scrim: "#0b1f3a",
			regions: ["#c9d6df", "#e8dcc8", "#9fb4a3"],
			target: 4.5,
			step: 0.05,
		}),
		scrimTask({
			n: 3,
			intro:
				"An article card puts near-black text over a dark moody photo, so we lighten the photo with a white overlay layer.",
			text: "#111827",
			scrim: "#ffffff",
			regions: ["#2b3a4a", "#5a4632", "#1f2a1c", "#7a8a99"],
			target: 4.5,
			step: 0.05,
		}),
		scrimTask({
			n: 4,
			intro:
				"A product page puts a white caption over a bright studio photo (including pure white backdrop), with a black overlay layer.",
			text: "#ffffff",
			scrim: "#000000",
			regions: ["#e8c547", "#9fd3e6", "#ffffff"],
			target: 4.5,
			step: 0.01,
		}),
	];
}

// ---- 104 composite and mix ----

interface MixLine {
	text: string;
	value: Rgb8;
	wrong: Rgb8;
}

const rgba = (hex: string, a: number) => {
	const [r, g, b] = hexToRgb8(hex);
	return `rgba(${r}, ${g}, ${b}, ${a})`;
};
const alphaLayer = (hex: string, a: number, bg: Rgb8) =>
	over8(hexToRgb8(hex), a, bg);

// One channel moved by one level away from the exact value, so it is wrong even under the rounding tolerance.
function offByOne(c: Rgb8): Rgb8 {
	const out = [...c];
	for (let k = 0; k < 3; k++) {
		const v = c[k] as number;
		const n = Math.round(v) + (v >= Math.round(v) ? -1 : 1);
		if (n >= 0 && n <= 255) {
			out[k] = n;
			return out as unknown as Rgb8;
		}
	}
	return fail("no channel to perturb");
}

function mixTask(
	n: number,
	intro: string,
	rules: string,
	lines: MixLine[],
	toolUseful: boolean,
): Task {
	for (const l of lines)
		if (l.value.some((v) => v < -0.5 || v > 255.5))
			fail(`g104-${n}: ${l.text} is out of gamut`);
	const params: MixParams = {
		items: lines.map((l) => ({
			expected: l.value.map((v) => round(v, 6)) as [number, number, number],
		})),
	};
	const witness = { results: lines.map((l) => ({ hex: rgb8ToHex(l.value) })) };
	const prompt = `${intro} ${rules} Round each final channel to the nearest integer and give the opaque hex.\n\n${lines.map((l, i) => `${i + 1}. ${l.text}`).join("\n")}\n\n${contract('{"results": [{"hex": "#rrggbb"}, ... one per line, in order]}')}`;
	return makeGenTask({
		category: 104,
		n,
		prompt,
		schema: resultsSchema(objectSchema({ hex: HEX_SCHEMA })),
		grader: { kind: "gen-mix", params },
		witness,
		invalid: [
			{},
			corrupt(witness),
			{ results: lines.map((l) => ({ hex: rgb8ToHex(l.wrong) })) },
			{
				results: lines.map((l, i) => ({
					hex: rgb8ToHex(i === 0 ? offByOne(l.value) : l.value),
				})),
			},
		],
		toolUseful,
	});
}

const COMPOSITE_RULES =
	"Composite like a browser does: source-over on 8-bit sRGB channel values, result = alpha x layer + (1 - alpha) x what is below, with no gamma conversion. An 8-digit hex #rrggbbaa has alpha aa/255. With several layers, composite from the bottom up and keep full precision between layers.";

export function cat104(): Task[] {
	const white = hexToRgb8("#ffffff");
	const f5 = hexToRgb8("#f5f5f5");
	const dark = hexToRgb8("#121212");
	const fa = hexToRgb8("#fafafa");
	const page = hexToRgb8("#e2e8f0");
	const mix = (
		space: "srgb" | "srgb-linear" | "oklab",
		a: string,
		b: string,
		pctA = 50,
	): MixLine => {
		const A = hexToRgb8(a);
		const B = hexToRgb8(b);
		const t = 1 - pctA / 100;
		const fn =
			space === "srgb" ? mixSrgb8 : space === "srgb-linear" ? mixLinear8 : mixOklab8;
		// The common mistake for every space is mixing in another one.
		const wrongFn = space === "srgb" ? mixOklab8 : mixSrgb8;
		const pa = pctA === 50 ? "" : ` ${pctA}%`;
		return {
			text: `color-mix(in ${space}, ${a}${pa}, ${b})`,
			value: fn(A, B, t),
			wrong: wrongFn(A, B, t),
		};
	};
	const MIX_RULES =
		"Each line is a CSS color-mix(): an even 50/50 mix unless a percentage follows the first color (that share goes to the first color, the rest to the second). Mix in the named space: srgb mixes the gamma-encoded channel values; srgb-linear decodes with the standard sRGB transfer function (IEC 61966-2-1), mixes the linear-light values, then re-encodes; oklab mixes Oklab (Ottosson) L, a and b, then converts back to sRGB.";
	const stack = (layers: [string, number][], bg: Rgb8) =>
		layers.reduce((acc, [hex, a]) => alphaLayer(hex, a, acc), bg);
	return [
		mixTask(
			1,
			"Our design file uses translucent fills. For each one, give the solid color it actually renders as.",
			COMPOSITE_RULES,
			[
				{
					text: `${rgba("#2563eb", 0.15)} over #ffffff`,
					value: alphaLayer("#2563eb", 0.15, white),
					wrong: alphaLayer("#2563eb", 0.85, white),
				},
				{
					text: "#00000080 over #f5f5f5",
					value: alphaLayer("#000000", 128 / 255, f5),
					wrong: alphaLayer("#000000", 0.8, f5),
				},
				{
					text: `${rgba("#ffffff", 0.08)} over #121212`,
					value: alphaLayer("#ffffff", 0.08, dark),
					wrong: alphaLayer("#ffffff", 0.8, dark),
				},
				{
					text: `${rgba("#dc2626", 0.12)} over #fafafa`,
					value: alphaLayer("#dc2626", 0.12, fa),
					wrong: alphaLayer("#dc2626", 0.88, fa),
				},
			],
			false,
		),
		mixTask(
			2,
			"These UI states stack translucent layers. Layers are listed top first. Give the solid color each stack renders as.",
			COMPOSITE_RULES,
			[
				{
					text: `${rgba("#000000", 0.5)} over ${rgba("#ff0000", 0.5)} over #ffffff`,
					value: stack(
						[
							["#ff0000", 0.5],
							["#000000", 0.5],
						],
						white,
					),
					wrong: stack(
						[
							["#000000", 0.5],
							["#ff0000", 0.5],
						],
						white,
					),
				},
				{
					text: `modal backdrop ${rgba("#0f172a", 0.6)} over card ${rgba("#ffffff", 0.9)} over page #e2e8f0`,
					value: stack(
						[
							["#ffffff", 0.9],
							["#0f172a", 0.6],
						],
						page,
					),
					wrong: stack(
						[
							["#0f172a", 0.6],
							["#ffffff", 0.9],
						],
						page,
					),
				},
				{
					text: `hover ${rgba("#ffffff", 0.5)} over selected #1e40af33 over #ffffff`,
					value: stack(
						[
							["#1e40af", 0x33 / 255],
							["#ffffff", 0.5],
						],
						white,
					),
					wrong: stack([["#1e40af", 0x33 / 255]], white),
				},
			],
			false,
		),
		mixTask(
			3,
			"We are replacing hand-picked tints with CSS color-mix(). Give the solid hex each expression produces.",
			MIX_RULES,
			[
				mix("srgb", "#ff0000", "#0000ff"),
				mix("oklab", "#ff0000", "#0000ff"),
				mix("srgb", "#fde047", "#1e3a8a"),
				mix("oklab", "#fde047", "#1e3a8a"),
			],
			true,
		),
		mixTask(
			4,
			"We are replacing hand-picked tints with CSS color-mix() in linear light. Give the solid hex each expression produces.",
			MIX_RULES,
			[
				mix("srgb-linear", "#ff0000", "#0000ff"),
				mix("srgb-linear", "#000000", "#ffffff"),
				mix("srgb-linear", "#22c55e", "#ffffff", 25),
				mix("srgb-linear", "#7c3aed", "#f97316"),
			],
			false,
		),
	];
}

// ---- 105 grayscale-safe set ----

// The gap floor is 0.7 x the best even spacing the band allows, so the brief stays feasible with room to spare.
const GAP_FRACTION = 0.7;

function grayscaleTask(
	n: number,
	count: number,
	background: string,
	cMin: number,
	hueGap: number,
	intro: string,
): Task {
	const s =
		searchGrayscale({ n: count, background, minContrast: 3, cMin, hueGap }) ??
		fail(`g105-${n} infeasible`);
	const lGap = floor2(GAP_FRACTION * s.gStar);
	const params: GrayscaleParams = {
		n: count,
		background,
		minContrast: 3,
		lGap,
		cMin,
		hueGap,
	};
	const prompt = `${intro} The charts are often printed in black and white, so the colors must stay apart in grayscale. Requirements:\n\n- Every pair of colors differs in Oklab lightness L (0 to 1 scale) by at least ${lGap}.\n- Each color reaches a WCAG 2 contrast ratio of at least 3:1 against the background ${background}.\n- Each color is clearly colorful: OKLCH chroma at least ${cMin}.\n- Every pair is at least ${hueGap} degrees apart in OKLCH hue.\n\n${contract(`{"colors": ["#rrggbb", ... exactly ${count} colors]}`)}`;
	const colors = s.colors;
	// Neutral grays at the witness lightness: they pass the gap and contrast rules but not chroma.
	const grays = colors.map((h) => {
		const v = 255 * linearToSrgb(rgbToOklch(hexToRgb(h)).L ** 3);
		return rgb8ToHex([v, v, v]);
	});
	const tooClose = [...colors];
	tooClose[1] = maxChromaHex(
		lightOf(colors[0] as string) + lGap - 0.01,
		hueOf(colors[1] as string),
		0.85,
	);
	breaksOnly(gradeGrayscale({ colors: tooClose }, params), "lightness_gap", `g105-${n}`);
	return makeGenTask({
		category: 105,
		n,
		prompt,
		schema: HEX_LIST("colors", count),
		grader: {
			kind: "gen-grayscale",
			params: {
				...params,
				derivation: {
					band: s.band.map((x) => round(x, 3)),
					bandLimits: GRAY_BAND,
					gStar: round(s.gStar),
				},
			},
		},
		witness: { colors },
		invalid: [
			{},
			corrupt({ colors }),
			{ colors: colors.slice(0, count - 1) },
			{ colors: grays },
			{ colors: [colors[0], colors[0], ...colors.slice(2)] },
			{ colors: tooClose },
		],
		toolUseful: true,
	});
}

export function cat105(): Task[] {
	return [
		grayscaleTask(
			1,
			3,
			"#ffffff",
			0.08,
			60,
			"Pick 3 colors for the series of a bar chart on a white (#ffffff) background.",
		),
		grayscaleTask(
			2,
			4,
			"#ffffff",
			0.08,
			45,
			"Pick 4 colors for the lines of a line chart on a white (#ffffff) background.",
		),
		grayscaleTask(
			3,
			4,
			"#0f172a",
			0.08,
			45,
			"Pick 4 colors for the series of a dashboard chart on our dark (#0f172a) background.",
		),
		grayscaleTask(
			4,
			5,
			"#f8fafc",
			0.06,
			30,
			"Pick 5 colors for the segments of a stacked area chart on an off-white (#f8fafc) background.",
		),
	];
}

// ---- 106 diverging scale ----

const DIVERGING_BASE = {
	centerLMin: 0.9,
	centerCMax: 0.03,
	symTol: 0.03,
	minStep: 0.05,
	endLMax: 0.6,
	sideCMin: 0.04,
};
const CENTER = "#f7f7f7";
// The deuteranopia floor is 0.75 x the best end-to-end separation the grid search found, rounded down.
const DEUTAN_FRACTION = 0.75;

function divergingTask(
	n: number,
	use: string,
	a: { name: string; band: HueBand },
	b: { name: string; band: HueBand },
	endCMin: number,
): Task {
	const p0 = { ...DIVERGING_BASE, hueA: a.band, hueB: b.band, endCMin };
	const s = searchDiverging(p0, CENTER);
	if (!Number.isFinite(s.best)) fail(`g106-${n} infeasible`);
	const deutanMin = Math.floor(DEUTAN_FRACTION * s.best);
	const params: DivergingParams = { ...p0, deutanMin };
	const prompt = `Build a 7-step diverging color scale for ${use}: ${a.name} on the left end, ${b.name} on the right end, meeting at a light neutral middle. All lightness, chroma and hue values are OKLCH (Ottosson). Requirements:\n\n1. Exactly 7 colors, ordered from the left end to the right end.\n2. The middle (4th) color is a light neutral: lightness at least ${p0.centerLMin}, chroma at most ${p0.centerCMax}.\n3. Colors 1 to 3 are ${a.name}: hue between ${a.band.min} and ${a.band.max} degrees, chroma at least ${p0.sideCMin}. Colors 5 to 7 are ${b.name}: hue between ${b.band.min} and ${b.band.max} degrees, chroma at least ${p0.sideCMin}.\n4. Lightness is symmetric around the middle: colors 1 and 7, 2 and 6, 3 and 5 each differ in lightness by at most ${p0.symTol}.\n5. Lightness rises toward the middle on both sides by at least ${p0.minStep} per step.\n6. Both end colors have lightness at most ${p0.endLMax} and chroma at least ${endCMin}.\n7. The two end colors stay distinguishable for people with deuteranopia: simulate deuteranopia with Machado et al. 2009 at severity 1.0 (matrix applied to linear sRGB, result clipped to 0 to 1), then their CIEDE2000 difference (CIELAB, D65 white) is at least ${deutanMin}.\n\n${contract('{"steps": ["#rrggbb", ... exactly 7 colors, left to right]}')}`;
	const w = s.steps;
	const tinted = [...w];
	tinted[3] = "#f0e2c8";
	const sequential = [w[0], w[1], w[2], CENTER, w[2], w[1], w[0]];
	const lopsided = [...w];
	lopsided[4] = maxChromaHex(
		lightOf(w[2] as string) - p0.symTol - 0.01,
		hueOf(w[4] as string),
		0.9,
	);
	breaksOnly(
		gradeDiverging({ steps: lopsided }, params),
		"symmetric_lightness",
		`g106-${n}`,
	);
	return makeGenTask({
		category: 106,
		n,
		prompt,
		schema: HEX_LIST("steps", 7),
		grader: {
			kind: "gen-diverging",
			params: { ...params, derivation: { bestDeutan: round(s.best, 3) } },
		},
		witness: { steps: w },
		invalid: [
			{},
			corrupt({ steps: w }),
			{ steps: [...w].reverse() },
			{ steps: tinted },
			{ steps: sequential },
			{ steps: w.slice(0, 6) },
			{ steps: lopsided },
		],
		toolUseful: true,
	});
}

export function cat106(): Task[] {
	return [
		divergingTask(
			1,
			"a temperature-anomaly map",
			{ name: "blues", band: { min: 235, max: 265 } },
			{ name: "oranges", band: { min: 40, max: 70 } },
			0.1,
		),
		divergingTask(
			2,
			"an election swing map",
			{ name: "purples", band: { min: 295, max: 325 } },
			{ name: "greens", band: { min: 135, max: 160 } },
			0.1,
		),
		divergingTask(
			3,
			"a soil-moisture map",
			{ name: "teals", band: { min: 185, max: 210 } },
			{ name: "ochres", band: { min: 55, max: 80 } },
			0.08,
		),
		divergingTask(
			4,
			"a profit-and-loss heatmap",
			{ name: "reds", band: { min: 15, max: 35 } },
			{ name: "greens", band: { min: 135, max: 155 } },
			0.1,
		),
	];
}

// ---- 107 video Y'CbCr ----

const BT709 =
	"Use BT.709 luma coefficients (Kr = 0.2126, Kb = 0.0722) and 8-bit limited (studio) range: Y' spans 16 to 235, Cb and Cr span 16 to 240 with 128 as zero. Treat each sRGB hex channel divided by 255 as the gamma-encoded R'G'B' signal as is (no transfer-function conversion).";
const clip255 = (v: number) => Math.min(255, Math.max(0, v));
const clip01Hex = (rgb: [number, number, number]) =>
	rgb.map((v) => round(clip255(v * 255), 6)) as [number, number, number];
const toInts = (v: number[]) => v.map((x) => Math.round(x));

// Legality must not hinge on rounding: every decoded channel is at least this far inside or outside 0..1.
const LEGAL_MARGIN = 0.01;

function ycbcrTask(
	n: number,
	intro: string,
	items: { line: string; item: YcbcrItem; wrong: unknown }[],
	shape: string,
	extraInvalid: (witness: { results: Record<string, unknown>[] }) => unknown[] = () => [],
): Task {
	const witness = {
		results: items.map(({ item }) =>
			item.kind === "encode"
				? (() => {
						const [y, cb, cr] = toInts(item.expected);
						return { y, cb, cr };
					})()
				: item.kind === "legal"
					? { legal: item.legal, hex: rgb8ToHex(item.expected) }
					: { hex: rgb8ToHex(item.expected) },
		),
	};
	const prompt = `${intro}\n\n${items.map((x, i) => `${i + 1}. ${x.line}`).join("\n")}\n\n${contract(shape)}`;
	const first = items[0]?.item as YcbcrItem;
	const nudged: Record<string, unknown>[] = [...witness.results];
	if (first.kind === "encode") {
		const y = first.expected[0];
		nudged[0] = { ...nudged[0], y: Math.round(y) + (y >= Math.round(y) ? -1 : 1) };
	} else nudged[0] = { ...nudged[0], hex: rgb8ToHex(offByOne(first.expected)) };
	return makeGenTask({
		category: 107,
		n,
		prompt,
		schema: resultsSchema({ type: "object" }),
		grader: { kind: "gen-ycbcr", params: { items: items.map((x) => x.item) } },
		witness,
		invalid: [
			{},
			corrupt(witness),
			{ results: items.map((x) => x.wrong) },
			{ results: nudged },
			...extraInvalid(witness),
		],
		toolUseful: false,
	});
}

function encodeItem(
	hex: string,
	enc: (h: string) => [number, number, number],
	wrongEnc: (h: string) => [number, number, number],
) {
	const e = enc(hex).map((v) => round(v, 6)) as [number, number, number];
	if (e.some((v) => v < 0.5 || v > 254.5)) fail(`${hex} encodes out of range`);
	const [y, cb, cr] = toInts(wrongEnc(hex));
	return {
		line: hex,
		item: { kind: "encode", expected: e } as YcbcrItem,
		wrong: { y, cb, cr },
	};
}

function decodeItem(triple: [number, number, number], kind: "decode" | "legal") {
	const rgb = decode709Limited(...triple);
	const legal = rgb.every((v) => v >= 0 && v <= 1);
	const inside = Math.min(...rgb.map((v) => Math.min(v, 1 - v)));
	if (legal ? inside < LEGAL_MARGIN : inside > -LEGAL_MARGIN)
		fail(`${triple} legality is too close to call`);
	if (kind === "decode" && !legal) fail(`${triple} is not a legal color`);
	const expected = clip01Hex(rgb);
	// The usual mistake: decoding studio-range codes as if they were full range.
	const [y, cb, cr] = triple;
	const fr = decode709Limited(
		16 + (219 * y) / 255,
		128 + (224 * (cb - 128)) / 255,
		128 + (224 * (cr - 128)) / 255,
	);
	const fullRange = rgb8ToHex(clip01Hex(fr));
	const item: YcbcrItem =
		kind === "legal" ? { kind, legal, expected } : { kind, expected };
	return {
		line: `Y' ${y}, Cb ${cb}, Cr ${cr}`,
		item,
		wrong: kind === "legal" ? { legal, hex: fullRange } : { hex: fullRange },
	};
}

export function cat107(): Task[] {
	return [
		ycbcrTask(
			1,
			`We are putting our brand colors into a broadcast video package. Give each color's 8-bit Y'CbCr code values. ${BT709} Round each code value to the nearest integer.`,
			["#2563eb", "#f59e0b", "#16a34a"].map((h) =>
				encodeItem(h, encode709Limited, encodeJfif),
			),
			'{"results": [{"y": integer, "cb": integer, "cr": integer}, ... one per color, in order]}',
		),
		ycbcrTask(
			2,
			`An editor sampled these 8-bit Y'CbCr code values from a graded video clip. Give the sRGB hex a web page should use to match each one. ${BT709} Decode each to R'G'B', use those values directly as sRGB channels, scale to 0 to 255 and round to the nearest integer.`,
			(
				[
					[63, 205, 104],
					[173, 66, 166],
					[110, 154, 182],
				] as [number, number, number][]
			).map((t) => decodeItem(t, "decode")),
			'{"results": [{"hex": "#rrggbb"}, ... one per sample, in order]}',
		),
		ycbcrTask(
			3,
			"Our image pipeline stores brand colors as JPEG (JFIF) Y'CbCr. Give each color's code values: full range with BT.601 coefficients (Kr = 0.299, Kb = 0.114), all three components spanning 0 to 255, Cb and Cr centered at 128. Use each hex channel (0 to 255) as is, with no transfer-function conversion, and round each code value to the nearest integer.",
			["#7c3aed", "#0ea5e9", "#84cc16"].map((h) =>
				encodeItem(h, encodeJfif, encode709Limited),
			),
			'{"results": [{"y": integer, "cb": integer, "cr": integer}, ... one per color, in order]}',
		),
		ycbcrTask(
			4,
			`A broadcast QC report lists these 8-bit Y'CbCr code values. Some combinations inside the legal code range still do not correspond to any RGB color. ${BT709} For each sample, decode to R'G'B': "legal" is true only if all three values lie within 0 to 1 before any clamping. Then give the hex after clamping each channel to 0 to 1, scaling to 0 to 255 and rounding to the nearest integer.`,
			(
				[
					[180, 60, 200],
					[120, 140, 110],
					[40, 240, 128],
					[200, 120, 125],
				] as [number, number, number][]
			).map((t) => decodeItem(t, "legal")),
			'{"results": [{"legal": boolean, "hex": "#rrggbb"}, ... one per sample, in order]}',
			(w) => [
				{ results: w.results.map((r) => ({ ...r, legal: !r.legal })) },
			],
		),
	];
}
