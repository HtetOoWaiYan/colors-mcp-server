import type {
	DivergingNParams,
	GradientTextParams,
} from "../../graders-fresh/tasks.js";
import { gradeDivergingN } from "../../graders-fresh/tasks.js";
import {
	type GrayscaleParams,
	gradeGrayscale,
	gradePick,
	type HueBand,
	type MixParams,
	type PickParams,
	type ScrimParams,
	type YcbcrItem,
} from "../../graders-gen/tasks.js";
import { hexToRgb, linearToSrgb, rgbToOklch } from "../../reference/color.js";
import {
	BT601,
	BT709,
	BT2020,
	decodeYcbcr,
	encodeYcbcr,
	type YcbcrSpec,
} from "../../reference-fresh/ycbcr.js";
import {
	hexToRgb8,
	minScrimOpacity,
	mixLinear8,
	mixOklab8,
	mixSrgb8,
	over8,
	type Rgb8,
	rgb8ToHex,
	scrimContrast,
	scrimContrastExact,
} from "../../reference-gen/composite.js";
import {
	contract,
	corrupt,
	HEX_SCHEMA,
	objectSchema,
	resultsSchema,
	round,
} from "../build/common.js";
import { maxChromaHex, searchGrayscale, searchPick } from "../gen/search.js";
import { CATEGORY_NAMES, type Task } from "../types.js";
import { searchDivergingN, searchGradientText } from "./search-fresh.js";

interface FreshInit {
	category: number;
	n: number;
	prompt: string;
	schema: Record<string, unknown>;
	grader: Task["grader"];
	witness: unknown;
	invalid: unknown[];
	toolUseful: boolean;
}

export function makeFreshTask(t: FreshInit): Task {
	return {
		id: `f${t.category}-${t.n}`,
		category: t.category,
		categoryName: CATEGORY_NAMES[t.category] as string,
		// The final judge: every task is sealed, so nothing here can be tuned on.
		split: "heldout",
		prompt: t.prompt,
		schema: t.schema,
		grader: t.grader,
		witness: t.witness,
		invalid: t.invalid,
		toolUseful: t.toolUseful,
	};
}

const fail = (msg: string): never => {
	throw new Error(msg);
};
const floor2 = (v: number) => Math.floor(v * 100 + 1e-9) / 100;
const hueOf = (hex: string) => rgbToOklch(hexToRgb(hex)).H;
const lightOf = (hex: string) => rgbToOklch(hexToRgb(hex)).L;
const checksFailed = (checks: { name: string; pass: boolean }[]) =>
	checks.filter((c) => !c.pass).map((c) => c.name);
// A borderline invalid must break exactly the one rule it was built to break.
function breaksOnly(
	checks: { name: string; pass: boolean }[],
	rule: string,
	id: string,
): void {
	const f = checksFailed(checks);
	if (f.length !== 1 || f[0] !== rule)
		fail(`${id}: borderline invalid breaks ${f.join("+")}, not ${rule}`);
}

// Every searched floor is this fraction of the best value any answer meeting the other rules reaches.
export const FLOOR_FRACTION = 0.6;

const PICK_SCHEMA = objectSchema({ hex: HEX_SCHEMA });
const HEX_LIST = (key: "steps" | "colors", n: number) =>
	objectSchema({
		[key]: { type: "array", items: HEX_SCHEMA, minItems: n, maxItems: n },
	});

/** States a hue band; a band that wraps past 0 says so, since "between 340 and 10" is otherwise ambiguous. */
export function bandText(b: HueBand): string {
	if (b.min < b.max) return `hue between ${b.min} and ${b.max} degrees`;
	const mid = (b.min + (b.max - b.min + 360) / 2) % 360;
	return `hue between ${b.min} and ${b.max} degrees, going through 0 (so ${mid} counts, 180 does not)`;
}

const OKLCH_NOTE =
	"OKLCH is Björn Ottosson's Oklab in polar form (lightness 0 to 1, chroma, hue in degrees). Contrast is the WCAG 2 contrast ratio.";

// ---- 201 constrained pick, 203 dual surface ----

interface PickSpec {
	category: 201 | 203;
	n: number;
	intro: string;
	hue: HueBand;
	hueLine: string;
	chromaWhat: string;
	lMin?: number;
	lMinLine?: string;
	lMax?: number;
	lMaxLine?: string;
	contrasts: { name: string; against: string; min: number; line: string }[];
}

function pickTask(s: PickSpec): Task {
	const id = `f${s.category}-${s.n}`;
	const base: PickParams = {
		hue: s.hue,
		cMin: 0,
		lMin: s.lMin,
		lMax: s.lMax,
		contrasts: s.contrasts.map(({ name, against, min }) => ({ name, against, min })),
	};
	const open = searchPick(base);
	const cMin = floor2(FLOOR_FRACTION * open.maxChroma);
	const params: PickParams = { ...base, cMin };
	const r = searchPick(params);
	if (!r.witness) fail(`${id} infeasible`);
	const rules = [
		s.hueLine,
		`OKLCH chroma at least ${cMin}, so it reads as ${s.chromaWhat}, not gray.`,
		...(s.lMinLine ? [s.lMinLine] : []),
		...(s.lMaxLine ? [s.lMaxLine] : []),
		...s.contrasts.map((c) => c.line),
	];
	const prompt = `${s.intro}\n\n${rules.map((l) => `- ${l}`).join("\n")}\n\nAny color meeting every requirement is acceptable. ${OKLCH_NOTE}\n\n${contract('{"hex": "#rrggbb"}')}`;
	const nearMiss = Object.keys(r.nearMiss).sort();
	for (const k of nearMiss)
		breaksOnly(gradePick({ hex: r.nearMiss[k] }, params), k, id);
	if (nearMiss.length < 2) fail(`${id}: too few borderline invalids`);
	return makeFreshTask({
		category: s.category,
		n: s.n,
		prompt,
		schema: PICK_SCHEMA,
		grader: {
			kind: "gen-pick",
			params: {
				...params,
				derivation: {
					floorFraction: FLOOR_FRACTION,
					openMaxChroma: round(open.maxChroma),
					feasibleColors: r.feasible,
					witnessSlack: round(r.witnessSlack, 3),
				},
			},
		},
		witness: { hex: r.witness },
		invalid: [
			{},
			{ hex: "magenta" },
			corrupt({ hex: r.witness }),
			...nearMiss.map((k) => ({ hex: r.nearMiss[k] })),
		],
		toolUseful: true,
	});
}

export function cat201(): Task[] {
	return [
		pickTask({
			category: 201,
			n: 1,
			intro:
				"Pick the background color for the maintenance warning banner in our admin console. The banner text is #1a1a1a. Requirements:",
			hue: { min: 70, max: 95 },
			hueLine: `It is an amber: OKLCH ${bandText({ min: 70, max: 95 })}.`,
			chromaWhat: "amber",
			lMax: 0.9,
			lMaxLine: "OKLCH lightness at most 0.9, so it does not fade into the white page.",
			contrasts: [
				{
					name: "text",
					against: "#1a1a1a",
					min: 7,
					line: "The banner text #1a1a1a on it reaches a contrast ratio of at least 7:1.",
				},
			],
		}),
		pickTask({
			category: 201,
			n: 2,
			intro:
				"Pick the fill color for the 'New' tag on product cards. The tag label is #1f2937 and the cards are white (#ffffff). Requirements:",
			hue: { min: 340, max: 10 },
			hueLine: `It is a rose pink: OKLCH ${bandText({ min: 340, max: 10 })}.`,
			chromaWhat: "pink",
			contrasts: [
				{
					name: "text",
					against: "#1f2937",
					min: 4.5,
					line: "The label #1f2937 on the tag reaches a contrast ratio of at least 4.5:1.",
				},
				{
					name: "page",
					against: "#ffffff",
					min: 3,
					line: "The tag shape itself reaches a contrast ratio of at least 3:1 against the white card #ffffff.",
				},
			],
		}),
		pickTask({
			category: 201,
			n: 3,
			intro:
				"Pick the text color for form error messages. The same messages appear on the plain white form (#ffffff) and inside the pale red error summary box (#fef2f2). Requirements:",
			hue: { min: 15, max: 35 },
			hueLine: `It is a red: OKLCH ${bandText({ min: 15, max: 35 })}.`,
			chromaWhat: "red",
			lMin: 0.45,
			lMinLine: "OKLCH lightness at least 0.45, so it does not read as brown or black.",
			contrasts: [
				{
					name: "tint",
					against: "#fef2f2",
					min: 4.5,
					line: "As text on the error box #fef2f2 it reaches a contrast ratio of at least 4.5:1.",
				},
				{
					name: "white",
					against: "#ffffff",
					min: 4.5,
					line: "As text on the white form #ffffff it reaches a contrast ratio of at least 4.5:1.",
				},
			],
		}),
		pickTask({
			category: 201,
			n: 4,
			intro:
				"Pick the highlight fill for 'live' badges in our dark streaming app. Badges sit on dark cards (#18181b) and carry black (#000000) text. Requirements:",
			hue: { min: 115, max: 140 },
			hueLine: `It is a lime: OKLCH ${bandText({ min: 115, max: 140 })}.`,
			chromaWhat: "lime",
			lMax: 0.93,
			lMaxLine: "OKLCH lightness at most 0.93, so it does not look white.",
			contrasts: [
				{
					name: "black",
					against: "#000000",
					min: 10,
					line: "Black text #000000 on it reaches a contrast ratio of at least 10:1.",
				},
				{
					name: "card",
					against: "#18181b",
					min: 6,
					line: "The badge reaches a contrast ratio of at least 6:1 against the dark card #18181b.",
				},
			],
		}),
	];
}

function brandBand(brand: string, tol: number): HueBand {
	const h = hueOf(brand);
	return { min: round((h - tol + 360) % 360), max: round((h + tol) % 360) };
}

interface DualSpec {
	n: number;
	intro: string;
	brand: string;
	tol: number;
	surfaces: { name: string; hex: string; min: number; label: string }[];
}

function dualTask(s: DualSpec): Task {
	return pickTask({
		category: 203,
		n: s.n,
		intro: `${s.intro} Requirements:`,
		hue: brandBand(s.brand, s.tol),
		hueLine: `Stay in the brand's hue family: OKLCH hue within ${s.tol} degrees of the hue of our brand color ${s.brand}.`,
		chromaWhat: "a brand color",
		contrasts: s.surfaces.map((x) => ({
			name: x.name,
			against: x.hex,
			min: x.min,
			line: `Contrast ratio of at least ${x.min}:1 against the ${x.label} ${x.hex}.`,
		})),
	});
}

export function cat203(): Task[] {
	return [
		dualTask({
			n: 1,
			intro:
				"Our docs site has a light theme (#ffffff) and a dark theme (#0d1117). Pick one color for the callout border that works in both, so we can ship a single token.",
			brand: "#0d9488",
			tol: 15,
			surfaces: [
				{ name: "light", hex: "#ffffff", min: 3, label: "light theme background" },
				{ name: "dark", hex: "#0d1117", min: 3, label: "dark theme background" },
			],
		}),
		dualTask({
			n: 2,
			intro:
				"Pick one color used both as link text on our cream article background (#fffbeb) and as the icon color in the dark footer (#1c1917).",
			brand: "#7c3aed",
			tol: 15,
			surfaces: [
				{ name: "light", hex: "#fffbeb", min: 4.5, label: "cream article background" },
				{ name: "dark", hex: "#1c1917", min: 3, label: "dark footer" },
			],
		}),
		dualTask({
			n: 3,
			intro:
				"Pick one color for the 'unsaved changes' dot. It appears on white panels (#ffffff), on gray header strips (#e5e7eb) and on the dark navigation rail (#111827).",
			brand: "#d97706",
			tol: 20,
			surfaces: [
				{ name: "light", hex: "#ffffff", min: 3, label: "white panel" },
				{ name: "mid", hex: "#e5e7eb", min: 3, label: "gray strip" },
				{ name: "dark", hex: "#111827", min: 3, label: "dark navigation rail" },
			],
		}),
		dualTask({
			n: 4,
			intro:
				"Pick one color for the 'recording' indicator. It sits on our pale slate canvas (#f1f5f9) and on the slate sidebar (#334155).",
			brand: "#dc2626",
			tol: 20,
			surfaces: [
				{ name: "light", hex: "#f1f5f9", min: 3, label: "pale canvas" },
				{ name: "dark", hex: "#334155", min: 3, label: "slate sidebar" },
			],
		}),
	];
}

// ---- 202 scrim ----

interface ScrimSpec {
	n: number;
	intro: string;
	text: string;
	scrim: string;
	regions: string[];
	target: number;
	step: number;
	example: number;
}

// Both rounding conventions must agree on the optimum, so a careful answer cannot be marked wrong by rounding alone.
const SCRIM_MARGIN = 0.02;

function scrimTask(s: ScrimSpec): Task {
	const id = `f202-${s.n}`;
	const aStar =
		minScrimOpacity(s.text, s.scrim, s.regions, s.target, s.step) ??
		fail(`${id} infeasible`);
	const worst = (a: number, f: typeof scrimContrast) =>
		Math.min(...s.regions.map((r) => f(s.text, s.scrim, a, r)));
	const below = round(aStar - s.step, 6);
	if (below < 0) fail(`${id}: trivial, no overlay needed`);
	for (const f of [scrimContrast, scrimContrastExact]) {
		if (worst(aStar, f) < s.target + SCRIM_MARGIN)
			fail(`${id}: optimum too close to target`);
		if (worst(below, f) > s.target - SCRIM_MARGIN)
			fail(`${id}: step below optimum too close to target`);
	}
	const params: ScrimParams = {
		text: s.text,
		scrim: s.scrim,
		regions: s.regions,
		target: s.target,
		step: s.step,
		alphaStar: aStar,
	};
	const prompt = `${s.intro}\n\nText color: ${s.text}. Overlay color: ${s.scrim}. Worst-case image regions behind the text: ${s.regions.join(", ")}.\n\nGive the smallest overlay opacity, in steps of ${s.step} (for example ${s.example}), at which the text reaches a WCAG 2 contrast ratio of at least ${s.target}:1 against every one of those regions with the overlay applied. The overlay is painted over each region like CSS: on 8-bit sRGB channel values, result = opacity x overlay + (1 - opacity) x region, rounded to the nearest integer before measuring contrast. Do not overshoot: any more opacity than needed hides the image.\n\n${contract('{"opacity": number}')}`;
	const up2 = round(aStar + 2 * s.step, 6);
	return makeFreshTask({
		category: 202,
		n: s.n,
		prompt,
		schema: objectSchema({ opacity: { type: "number", minimum: 0, maximum: 1 } }),
		grader: { kind: "gen-scrim", params },
		witness: { opacity: aStar },
		invalid: [
			{},
			{ opacity: `${aStar}` },
			{ opacity: below },
			...(up2 <= 1 ? [{ opacity: up2 }] : []),
			{ opacity: round(aStar + s.step / 2, 6) },
		],
		toolUseful: true,
	});
}

export function cat202(): Task[] {
	return [
		scrimTask({
			n: 1,
			intro:
				"Our event poster pages set a large yellow display headline over a bright venue photo, with a black overlay layer between them. The headline is large text, so the target is 3:1.",
			text: "#ffd60a",
			scrim: "#000000",
			regions: ["#f5f0e6", "#c8e3f0", "#ffe08a"],
			target: 3,
			step: 0.05,
			example: 0.45,
		}),
		scrimTask({
			n: 2,
			intro:
				"A museum site puts small white body copy over artwork photos, darkened with a deep indigo overlay layer. The copy must meet the enhanced 7:1 level.",
			text: "#ffffff",
			scrim: "#1b1b2f",
			regions: ["#87ceeb", "#d4c4a8", "#6b8e23"],
			target: 7,
			step: 0.05,
			example: 0.45,
		}),
		scrimTask({
			n: 3,
			intro:
				"A recipe card puts dark navy text over a dim kitchen photo, lightened with a cream overlay layer.",
			text: "#0f172a",
			scrim: "#fff8e7",
			regions: ["#3e2f24", "#4a5d6b", "#6e3b3b"],
			target: 4.5,
			step: 0.01,
			example: 0.63,
		}),
		scrimTask({
			n: 4,
			intro:
				"Our video player draws white subtitles over the frame, on a black overlay band. Frames include skin tones, sky, snow and foliage.",
			text: "#ffffff",
			scrim: "#000000",
			regions: ["#e9c9a8", "#b0c4de", "#fafafa", "#7fbf7f"],
			target: 4.5,
			step: 0.02,
			example: 0.38,
		}),
	];
}

// ---- 204 composite and mix ----

interface MixLine {
	text: string;
	value: Rgb8;
	wrong: Rgb8;
}

const rgba = (hex: string, a: number) => {
	const [r, g, b] = hexToRgb8(hex);
	return `rgba(${r}, ${g}, ${b}, ${a})`;
};

// One channel moved one level away from the exact value, so it is wrong even under the rounding tolerance.
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
			fail(`f204-${n}: ${l.text} is out of gamut`);
	const params: MixParams = {
		items: lines.map((l) => ({
			expected: l.value.map((v) => round(v, 6)) as [number, number, number],
		})),
	};
	const witness = { results: lines.map((l) => ({ hex: rgb8ToHex(l.value) })) };
	const wrong = { results: lines.map((l) => ({ hex: rgb8ToHex(l.wrong) })) };
	if (JSON.stringify(wrong) === JSON.stringify(witness))
		fail(`f204-${n}: the common mistake gives the same answer`);
	const prompt = `${intro} ${rules} Round each final channel to the nearest integer and give the opaque hex.\n\n${lines.map((l, i) => `${i + 1}. ${l.text}`).join("\n")}\n\n${contract('{"results": [{"hex": "#rrggbb"}, ... one per line, in order]}')}`;
	return makeFreshTask({
		category: 204,
		n,
		prompt,
		schema: resultsSchema(objectSchema({ hex: HEX_SCHEMA })),
		grader: { kind: "gen-mix", params },
		witness,
		invalid: [
			{},
			corrupt(witness),
			wrong,
			{
				results: lines.map((l, i) => ({
					hex: rgb8ToHex(i === lines.length - 1 ? offByOne(l.value) : l.value),
				})),
			},
		],
		toolUseful,
	});
}

const COMPOSITE_RULES =
	"Composite the way a browser paints: source-over on 8-bit sRGB channel values, result = alpha x layer + (1 - alpha) x what is below, with no gamma conversion. An 8-digit hex #rrggbbaa has alpha aa/255. Layers are listed top first; composite from the bottom up and keep full precision between layers.";

const MIX_RULES =
	"Each line is a CSS color-mix(). A percentage written after a color is that color's share and the other color gets the rest; with no percentage the mix is 50/50. Mix in the named space: srgb mixes the gamma-encoded channel values; srgb-linear decodes with the sRGB transfer function (IEC 61966-2-1), mixes the linear-light values, then re-encodes; oklab mixes Oklab (Ottosson) L, a and b, then converts back to sRGB.";

const linearOver = (fg: Rgb8, a: number, bg: Rgb8): Rgb8 =>
	mixLinear8(bg, fg, a);

function stack(layersTopFirst: [Rgb8, number][], bg: Rgb8, wrongOrder = false): Rgb8 {
	const order = wrongOrder ? layersTopFirst : [...layersTopFirst].reverse();
	return order.reduce<Rgb8>((acc, [rgb, a]) => over8(rgb, a, acc), bg);
}

type Space = "srgb" | "srgb-linear" | "oklab";
const MIXERS: Record<Space, (a: Rgb8, b: Rgb8, t: number) => Rgb8> = {
	srgb: mixSrgb8,
	"srgb-linear": mixLinear8,
	oklab: mixOklab8,
};

/** pct is the share of `a` or of `b`, as written after that color. */
function mixLine(
	space: Space,
	a: string,
	b: string,
	pct: { on: "a" | "b"; value: number } | null,
	wrongSpace: Space,
): MixLine {
	const shareB = pct === null ? 0.5 : pct.on === "a" ? 1 - pct.value / 100 : pct.value / 100;
	const pa = pct?.on === "a" ? ` ${pct.value}%` : "";
	const pb = pct?.on === "b" ? ` ${pct.value}%` : "";
	const A = hexToRgb8(a);
	const B = hexToRgb8(b);
	return {
		text: `color-mix(in ${space}, ${a}${pa}, ${b}${pb})`,
		value: MIXERS[space](A, B, shareB),
		wrong: MIXERS[wrongSpace](A, B, shareB),
	};
}

export function cat204(): Task[] {
	const surface = hexToRgb8("#1a1c1e");
	const white = hexToRgb8("#ffffff");
	const elev = (a: number, text: string): MixLine => ({
		text,
		value: over8(white, a, surface),
		wrong: linearOver(white, a, surface),
	});
	const L = (hex: string, a: number): [Rgb8, number] => [hexToRgb8(hex), a];
	const stackLine = (text: string, layers: [Rgb8, number][], bg: string): MixLine => ({
		text,
		value: stack(layers, hexToRgb8(bg)),
		wrong: stack(layers, hexToRgb8(bg), true),
	});
	return [
		mixTask(
			1,
			"Our dark theme raises surfaces by laying translucent white over the base surface #1a1c1e. Give the solid color each elevation level renders as.",
			COMPOSITE_RULES,
			[
				elev(0.05, `${rgba("#ffffff", 0.05)} over #1a1c1e`),
				elev(0.11, `${rgba("#ffffff", 0.11)} over #1a1c1e`),
				elev(0.16, `${rgba("#ffffff", 0.16)} over #1a1c1e`),
				elev(0x1f / 255, "#ffffff1f over #1a1c1e"),
			],
			false,
		),
		mixTask(
			2,
			"These notification states stack several translucent layers on an opaque base. Give the solid color each stack renders as.",
			COMPOSITE_RULES,
			[
				stackLine(
					`${rgba("#0f172a", 0.4)} over ${rgba("#3b82f6", 0.25)} over #f8fafc`,
					[L("#0f172a", 0.4), L("#3b82f6", 0.25)],
					"#f8fafc",
				),
				stackLine(
					"#00000033 over #ffffffcc over #6d28d9",
					[L("#000000", 0x33 / 255), L("#ffffff", 0xcc / 255)],
					"#6d28d9",
				),
				stackLine(
					`${rgba("#ffffff", 0.3)} over ${rgba("#dc2626", 0.6)} over ${rgba("#000000", 0.2)} over #fefce8`,
					[L("#ffffff", 0.3), L("#dc2626", 0.6), L("#000000", 0.2)],
					"#fefce8",
				),
			],
			false,
		),
		mixTask(
			3,
			"Our design tokens now derive tints and blends with CSS color-mix(). Give the solid hex each expression produces.",
			MIX_RULES,
			[
				mixLine("oklab", "#0ea5e9", "#ffffff", { on: "a", value: 30 }, "srgb"),
				mixLine("srgb", "#ef4444", "#000000", { on: "a", value: 70 }, "oklab"),
				mixLine("oklab", "#f43f5e", "#22d3ee", null, "srgb"),
				mixLine("oklab", "#1e293b", "#fbbf24", { on: "b", value: 25 }, "srgb"),
			],
			true,
		),
		mixTask(
			4,
			"Our chart theme blends colors in linear light with CSS color-mix(). Give the solid hex each expression produces.",
			MIX_RULES,
			[
				mixLine("srgb-linear", "#ff8800", "#0044ff", { on: "a", value: 40 }, "srgb"),
				mixLine("srgb-linear", "#ffffff", "#4b5563", { on: "a", value: 25 }, "srgb"),
				mixLine("srgb-linear", "#10b981", "#000000", null, "srgb"),
				mixLine("srgb-linear", "#e879f9", "#facc15", { on: "b", value: 70 }, "srgb"),
			],
			false,
		),
	];
}

// ---- 205 grayscale-safe set ----

function grayscaleTask(
	n: number,
	count: number,
	background: string,
	minContrast: number,
	cMin: number,
	hueGap: number,
	intro: string,
): Task {
	const id = `f205-${n}`;
	const s =
		searchGrayscale({ n: count, background, minContrast, cMin, hueGap }) ??
		fail(`${id} infeasible`);
	const lGap = floor2(FLOOR_FRACTION * s.gStar);
	const params: GrayscaleParams = { n: count, background, minContrast, lGap, cMin, hueGap };
	const prompt = `${intro} The report is also printed on a black-and-white office printer, so the colors must stay apart in grayscale. Requirements:\n\n- Every pair of colors differs in Oklab lightness L (0 to 1 scale) by at least ${lGap}.\n- Each color reaches a WCAG 2 contrast ratio of at least ${minContrast}:1 against the background ${background}.\n- Each color is clearly colorful: OKLCH chroma at least ${cMin}.\n- Every pair is at least ${hueGap} degrees apart in OKLCH hue.\n\n${contract(`{"colors": ["#rrggbb", ... exactly ${count} colors]}`)}`;
	const colors = s.colors;
	if (checksFailed(gradeGrayscale({ colors }, params)).length)
		fail(`${id}: witness fails`);
	// Neutral grays at the witness lightness: they keep the gap and contrast but not chroma.
	const grays = colors.map((h) => {
		const v = 255 * linearToSrgb(lightOf(h) ** 3);
		return rgb8ToHex([v, v, v]);
	});
	const tooClose = [...colors];
	tooClose[1] = maxChromaHex(
		lightOf(colors[0] as string) + lGap - 0.01,
		hueOf(colors[1] as string),
		0.85,
	);
	breaksOnly(gradeGrayscale({ colors: tooClose }, params), "lightness_gap", id);
	return makeFreshTask({
		category: 205,
		n,
		prompt,
		schema: HEX_LIST("colors", count),
		grader: {
			kind: "gen-grayscale",
			params: {
				...params,
				derivation: {
					floorFraction: FLOOR_FRACTION,
					band: s.band.map((x) => round(x, 3)),
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
			{ colors: [colors[1], ...colors.slice(1)] },
			{ colors: tooClose },
		],
		toolUseful: true,
	});
}

export function cat205(): Task[] {
	return [
		grayscaleTask(
			1,
			3,
			"#1e1e1e",
			4.5,
			0.06,
			50,
			"Pick 3 colors for the data labels of a donut chart on our dark (#1e1e1e) analytics view. The labels are small text, so each color needs 4.5:1.",
		),
		grayscaleTask(
			2,
			5,
			"#fffdf7",
			3,
			0.07,
			40,
			"Pick 5 colors for the bars of a grouped bar chart in our annual report, printed on warm paper-white (#fffdf7).",
		),
		grayscaleTask(
			3,
			6,
			"#f3f4f6",
			3,
			0.05,
			25,
			"Pick 6 colors for the categories of a scatter plot drawn on a light gray (#f3f4f6) panel.",
		),
		grayscaleTask(
			4,
			4,
			"#262626",
			3,
			0.07,
			40,
			"Pick 4 colors for the lines of a monitoring chart on a charcoal (#262626) panel.",
		),
	];
}

// ---- 206 diverging scale, any odd count, light or dark middle ----

interface DivSpec {
	n: number;
	use: string;
	steps: number;
	middle: "light" | "dark";
	center: string;
	a: { name: string; band: HueBand };
	b: { name: string; band: HueBand };
	centerL: number;
	centerCMax: number;
	symTol: number;
	minStep: number;
	endL: number;
	sideCMin: number;
	endCMin: number;
}

const ordinal = (k: number) =>
	["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"][k] as string;

function divergingTask(s: DivSpec): Task {
	const id = `f206-${s.n}`;
	const p0: Omit<DivergingNParams, "deutanMin"> = {
		n: s.steps,
		middle: s.middle,
		centerL: s.centerL,
		centerCMax: s.centerCMax,
		symTol: s.symTol,
		minStep: s.minStep,
		endL: s.endL,
		sideCMin: s.sideCMin,
		endCMin: s.endCMin,
		hueA: s.a.band,
		hueB: s.b.band,
	};
	const r = searchDivergingN(p0, s.center);
	if (!Number.isFinite(r.best)) fail(`${id} infeasible`);
	const deutanMin = Math.floor(FLOOR_FRACTION * r.best);
	const params: DivergingNParams = { ...p0, deutanMin };
	const m = (s.steps - 1) / 2;
	const light = s.middle === "light";
	const prompt = `Build a ${s.steps}-step diverging color scale for ${s.use}: ${s.a.name} on the left end, ${s.b.name} on the right end, meeting at a ${s.middle} neutral middle. All lightness, chroma and hue values are OKLCH (Ottosson). Requirements:\n\n1. Exactly ${s.steps} colors, ordered from the left end to the right end.\n2. The middle (${ordinal(m + 1)}) color is a ${s.middle} neutral: lightness ${light ? "at least" : "at most"} ${s.centerL}, chroma at most ${s.centerCMax}.\n3. Colors 1 to ${m} are ${s.a.name}: ${bandText(s.a.band)}, chroma at least ${s.sideCMin}. Colors ${m + 2} to ${s.steps} are ${s.b.name}: ${bandText(s.b.band)}, chroma at least ${s.sideCMin}.\n4. Lightness is symmetric around the middle: each color and its mirror (1 and ${s.steps}, 2 and ${s.steps - 1}, and so on) differ in lightness by at most ${s.symTol}.\n5. Lightness ${light ? "rises" : "falls"} toward the middle on both sides by at least ${s.minStep} per step.\n6. Both end colors have lightness ${light ? "at most" : "at least"} ${s.endL} and chroma at least ${s.endCMin}.\n7. The two end colors stay distinguishable for people with deuteranopia: simulate deuteranopia with Machado et al. 2009 at severity 1.0 (matrix applied to linear sRGB, result clipped to 0 to 1), then their CIEDE2000 difference (CIELAB, D65 white) is at least ${deutanMin}.\n\n${contract(`{"steps": ["#rrggbb", ... exactly ${s.steps} colors, left to right]}`)}`;
	const w = r.steps;
	const tinted = [...w];
	tinted[m] = light ? "#f3e3c3" : "#3a2a1a";
	const oneHue = [...w.slice(0, m + 1), ...w.slice(0, m).reverse()];
	const lopsided = [...w];
	lopsided[m + 1] = maxChromaHex(
		lightOf(w[m - 1] as string) + (light ? -1 : 1) * (s.symTol + 0.01),
		hueOf(w[m + 1] as string),
		0.9,
	);
	breaksOnly(gradeDivergingN({ steps: lopsided }, params), "symmetric_lightness", id);
	const invalid = [
		{},
		corrupt({ steps: w }),
		{ steps: [...w].reverse() },
		{ steps: tinted },
		{ steps: oneHue },
		{ steps: w.slice(0, s.steps - 1) },
		{ steps: lopsided },
	];
	return makeFreshTask({
		category: 206,
		n: s.n,
		prompt,
		schema: HEX_LIST("steps", s.steps),
		grader: {
			kind: "fresh-diverging",
			params: {
				...params,
				derivation: { floorFraction: FLOOR_FRACTION, bestDeutan: round(r.best, 3) },
			},
		},
		witness: { steps: w },
		invalid,
		toolUseful: true,
	});
}

const LIGHT_MIDDLE = {
	middle: "light",
	center: "#f4f1ea",
	centerL: 0.93,
	centerCMax: 0.02,
	symTol: 0.02,
	sideCMin: 0.04,
} as const;
const DARK_MIDDLE = {
	middle: "dark",
	center: "#26262b",
	centerL: 0.32,
	centerCMax: 0.025,
	symTol: 0.025,
	sideCMin: 0.05,
} as const;

export function cat206(): Task[] {
	return [
		divergingTask({
			...LIGHT_MIDDLE,
			n: 1,
			use: "a survey-agreement chart (strongly disagree to strongly agree)",
			steps: 5,
			a: { name: "magentas", band: { min: 335, max: 360 } },
			b: { name: "olive greens", band: { min: 105, max: 130 } },
			minStep: 0.08,
			endL: 0.55,
			endCMin: 0.1,
		}),
		divergingTask({
			...LIGHT_MIDDLE,
			n: 2,
			use: "a rainfall-anomaly map",
			steps: 9,
			a: { name: "indigos", band: { min: 265, max: 290 } },
			b: { name: "ambers", band: { min: 65, max: 90 } },
			minStep: 0.04,
			endL: 0.5,
			endCMin: 0.08,
		}),
		divergingTask({
			...DARK_MIDDLE,
			n: 3,
			use: "a dark-mode latency heatmap",
			steps: 7,
			a: { name: "cyans", band: { min: 195, max: 220 } },
			b: { name: "pinks", band: { min: 345, max: 10 } },
			minStep: 0.06,
			endL: 0.78,
			endCMin: 0.08,
		}),
		divergingTask({
			...DARK_MIDDLE,
			n: 4,
			use: "a dark-mode stock-movement treemap",
			steps: 5,
			a: { name: "greens", band: { min: 145, max: 170 } },
			b: { name: "violets", band: { min: 295, max: 320 } },
			minStep: 0.1,
			endL: 0.75,
			endCMin: 0.1,
		}),
	];
}

// ---- 207 video Y'CbCr ----

const specText = (name: string, s: YcbcrSpec) => {
	const k = 2 ** (s.bits - 8);
	const range =
		s.range === "limited"
			? `${s.bits}-bit limited (studio) range: Y' spans ${16 * k} to ${235 * k}, Cb and Cr span ${16 * k} to ${240 * k} with ${128 * k} as zero`
			: `${s.bits}-bit full range: all three components span 0 to ${2 ** s.bits - 1}, with Cb and Cr centered at ${2 ** (s.bits - 1)} (Y' = ${2 ** s.bits - 1} x luma, Cb and Cr = ${2 ** (s.bits - 1)} + ${2 ** s.bits - 1} x the color-difference value)`;
	return `Use ${name} luma coefficients (Kr = ${s.kr}, Kb = ${s.kb}) and ${range}. Treat each sRGB hex channel divided by 255 as the gamma-encoded R'G'B' signal as is (no transfer-function conversion).`;
};

// Legality must not hinge on rounding: every decoded channel is at least this far inside or outside 0..1.
const LEGAL_MARGIN = 0.01;
const toInts = (v: readonly number[]) => v.map((x) => Math.round(x));
const clipHex = (rgb: readonly number[]) =>
	rgb.map((v) => round(Math.min(255, Math.max(0, v * 255)), 6)) as [number, number, number];

function encodeItem(hex: string, spec: YcbcrSpec, wrongSpec: YcbcrSpec) {
	const e = encodeYcbcr(hex, spec).map((v) => round(v, 6)) as [number, number, number];
	const max = 2 ** spec.bits - 1;
	if (e.some((v) => v < 0.5 || v > max - 0.5)) fail(`${hex} encodes out of range`);
	const [y, cb, cr] = toInts(encodeYcbcr(hex, wrongSpec));
	return { line: hex, item: { kind: "encode", expected: e } as YcbcrItem, wrong: { y, cb, cr } };
}

function decodeItem(
	triple: [number, number, number],
	kind: "decode" | "legal",
	spec: YcbcrSpec,
	wrongSpec: YcbcrSpec,
) {
	const rgb = decodeYcbcr(...triple, spec);
	const legal = rgb.every((v) => v >= 0 && v <= 1);
	const inside = Math.min(...rgb.map((v) => Math.min(v, 1 - v)));
	if (legal ? inside < LEGAL_MARGIN : inside > -LEGAL_MARGIN)
		fail(`${triple} legality is too close to call`);
	if (kind === "decode" && !legal) fail(`${triple} is not a legal color`);
	const expected = clipHex(rgb);
	const wrongHex = rgb8ToHex(clipHex(decodeYcbcr(...triple, wrongSpec)));
	const [y, cb, cr] = triple;
	return {
		line: `Y' ${y}, Cb ${cb}, Cr ${cr}`,
		item: (kind === "legal" ? { kind, legal, expected } : { kind, expected }) as YcbcrItem,
		wrong: kind === "legal" ? { legal: !legal, hex: wrongHex } : { hex: wrongHex },
	};
}

function ycbcrTask(
	n: number,
	intro: string,
	items: { line: string; item: YcbcrItem; wrong: unknown }[],
	shape: string,
	extraInvalid: (witness: { results: Record<string, unknown>[] }) => unknown[] = () => [],
): Task {
	const witness = {
		results: items.map(({ item }) => {
			if (item.kind === "encode") {
				const [y, cb, cr] = toInts(item.expected);
				return { y, cb, cr };
			}
			return item.kind === "legal"
				? { legal: item.legal, hex: rgb8ToHex(item.expected) }
				: { hex: rgb8ToHex(item.expected) };
		}),
	};
	const prompt = `${intro}\n\n${items.map((x, i) => `${i + 1}. ${x.line}`).join("\n")}\n\n${contract(shape)}`;
	const last = items.length - 1;
	const lastItem = items[last]?.item as YcbcrItem;
	const nudged: Record<string, unknown>[] = [...witness.results];
	if (lastItem.kind === "encode") {
		const cr = lastItem.expected[2];
		nudged[last] = { ...nudged[last], cr: Math.round(cr) + (cr >= Math.round(cr) ? -1 : 1) };
	} else nudged[last] = { ...nudged[last], hex: rgb8ToHex(offByOne(lastItem.expected)) };
	return makeFreshTask({
		category: 207,
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

export function cat207(): Task[] {
	const sd: YcbcrSpec = { ...BT601, bits: 8, range: "limited" };
	const hd8: YcbcrSpec = { ...BT709, bits: 8, range: "limited" };
	const uhd10: YcbcrSpec = { ...BT2020, bits: 10, range: "limited" };
	const uhd8: YcbcrSpec = { ...BT2020, bits: 8, range: "limited" };
	const jfif: YcbcrSpec = { ...BT601, bits: 8, range: "full" };
	const hd10: YcbcrSpec = { ...BT709, bits: 10, range: "limited" };
	const encShape =
		'{"results": [{"y": integer, "cb": integer, "cr": integer}, ... one per color, in order]}';
	return [
		ycbcrTask(
			1,
			`We are delivering our logo animation to a standard-definition broadcaster. Give each brand color's 8-bit Y'CbCr code values. ${specText("BT.601", sd)} Round each code value to the nearest integer.`,
			["#e11d48", "#0891b2", "#a3e635"].map((h) => encodeItem(h, sd, hd8)),
			encShape,
		),
		ycbcrTask(
			2,
			`Our UHD streaming package needs 10-bit Y'CbCr code values for the title-card colors. ${specText("BT.2020 (non-constant luminance)", uhd10)} Round each code value to the nearest integer.`,
			["#6366f1", "#f97316", "#14b8a6"].map((h) => encodeItem(h, uhd10, uhd8)),
			encShape,
		),
		ycbcrTask(
			3,
			`A designer pulled these Y'CbCr samples straight out of a JPEG (JFIF) file. Give the sRGB hex each one shows as. ${specText("BT.601", jfif)} Decode each to R'G'B', use those values directly as sRGB channels, scale to 0 to 255 and round to the nearest integer.`,
			(
				[
					[150, 90, 170],
					[60, 140, 120],
					[200, 128, 100],
				] as [number, number, number][]
			).map((t) => decodeItem(t, "decode", jfif, sd)),
			'{"results": [{"hex": "#rrggbb"}, ... one per sample, in order]}',
		),
		ycbcrTask(
			4,
			`A 10-bit HD master failed QC on out-of-gamut pixels. Some code-value combinations inside the legal code range still do not correspond to any RGB color. ${specText("BT.709", hd10)} For each sample, decode to R'G'B': "legal" is true only if all three values lie within 0 to 1 before any clamping. Then give the hex after clamping each channel to 0 to 1, scaling to 0 to 255 and rounding to the nearest integer.`,
			(
				[
					[700, 300, 800],
					[500, 560, 470],
					[260, 700, 300],
					[820, 470, 500],
				] as [number, number, number][]
			).map((t) =>
				decodeItem(t, "legal", hd10, { ...BT601, bits: 10, range: "limited" }),
			),
			'{"results": [{"legal": boolean, "hex": "#rrggbb"}, ... one per sample, in order]}',
			(w) => [{ results: w.results.map((r) => ({ ...r, legal: !r.legal })) }],
		),
	];
}

// ---- 208 text over a CSS gradient ----

interface GradSpec {
	n: number;
	intro: string;
	css: string;
	stops: string[];
	target: number;
	hue: HueBand;
	hueWhat: string;
	also: { name: string; against: string; min: number; line: string }[];
	/** The gradient dips between stops, so a color checked only at the stops must exist as a borderline invalid. */
	expectDip: boolean;
}

function gradientTask(s: GradSpec): Task {
	const id = `f208-${s.n}`;
	const base: GradientTextParams = {
		stops: s.stops,
		target: s.target,
		hue: s.hue,
		cMin: 0,
		also: s.also.map(({ name, against, min }) => ({ name, against, min })),
	};
	const open = searchGradientText(base);
	const cMin = floor2(FLOOR_FRACTION * open.maxChroma);
	const params: GradientTextParams = { ...base, cMin };
	const r = searchGradientText(params);
	if (!r.witness) fail(`${id} infeasible`);
	if (s.expectDip && !r.stopsOnly) fail(`${id}: no stops-only trap exists`);
	const rules = [
		`It is ${s.hueWhat}: OKLCH ${bandText(s.hue)}.`,
		`OKLCH chroma at least ${cMin}, so it reads as a color, not gray.`,
		`It reaches a WCAG 2 contrast ratio of at least ${s.target}:1 against every point of the gradient: each stop and every color blended between neighbouring stops.`,
		...s.also.map((a) => a.line),
	];
	const prompt = `${s.intro}\n\n\`\`\`css\nbackground: ${s.css};\n\`\`\`\n\nThe browser blends neighbouring stops in gamma-encoded sRGB: each channel of the 8-bit hex values moves in a straight line from one stop to the next, and blended colors are not rounded. Stop positions only stretch the blend, so they do not change which colors appear. Requirements for the text color:\n\n${rules.map((l) => `- ${l}`).join("\n")}\n\nAny color meeting every requirement is acceptable. ${OKLCH_NOTE}\n\n${contract('{"hex": "#rrggbb"}')}`;
	const nearMiss = Object.keys(r.nearMiss).sort();
	const borderline = [
		...nearMiss.map((k) => r.nearMiss[k] as string),
		...(r.stopsOnly ? [r.stopsOnly] : []),
	];
	if (borderline.length < 2) fail(`${id}: too few borderline invalids`);
	return makeFreshTask({
		category: 208,
		n: s.n,
		prompt,
		schema: PICK_SCHEMA,
		grader: {
			kind: "fresh-gradient-text",
			params: {
				...params,
				derivation: {
					floorFraction: FLOOR_FRACTION,
					openMaxChroma: round(open.maxChroma),
					feasibleColors: r.feasible,
					witnessSlack: round(r.witnessSlack, 3),
				},
			},
		},
		witness: { hex: r.witness },
		invalid: [
			{},
			{ hex: "navy" },
			corrupt({ hex: r.witness }),
			...borderline.map((hex) => ({ hex })),
		],
		toolUseful: true,
	});
}

export function cat208(): Task[] {
	return [
		gradientTask({
			n: 1,
			intro:
				"Our pricing page hero has a coral-to-teal gradient behind the headline. Pick the headline text color.",
			css: "linear-gradient(90deg, #ff5f6d 0%, #00c9a7 100%)",
			stops: ["#ff5f6d", "#00c9a7"],
			target: 4.5,
			hue: { min: 250, max: 275 },
			hueWhat: "a navy",
			also: [],
			expectDip: true,
		}),
		gradientTask({
			n: 2,
			intro:
				"A campaign landing page sets a huge display headline (large text, so 3:1 is enough) over an orange-to-blue gradient. Pick the headline color.",
			css: "linear-gradient(135deg, #f83600 0%, #0098f0 100%)",
			stops: ["#f83600", "#0098f0"],
			target: 3,
			hue: { min: 320, max: 345 },
			hueWhat: "a plum",
			also: [],
			expectDip: true,
		}),
		gradientTask({
			n: 3,
			intro:
				"Our night-mode onboarding screen has a deep three-stop gradient behind small body text. Browsers that cannot paint the gradient show the solid fallback #4c4398 instead. Pick the body text color.",
			css: "linear-gradient(180deg, #0f0c29 0%, #302b63 50%, #24243e 100%)",
			stops: ["#0f0c29", "#302b63", "#24243e"],
			target: 7,
			hue: { min: 70, max: 100 },
			hueWhat: "a warm cream or gold",
			also: [
				{
					name: "fallback",
					against: "#4c4398",
					min: 4.5,
					line: "On the solid fallback background #4c4398 it reaches a contrast ratio of at least 4.5:1.",
				},
			],
			expectDip: false,
		}),
		gradientTask({
			n: 4,
			intro:
				"A summer-sale banner runs a four-stop gradient behind the button caption. Pick the caption color.",
			css: "linear-gradient(90deg, #fb923c 0%, #f472b6 30%, #34d399 65%, #38bdf8 100%)",
			stops: ["#fb923c", "#f472b6", "#34d399", "#38bdf8"],
			target: 4.5,
			hue: { min: 145, max: 170 },
			hueWhat: "a deep green",
			also: [],
			expectDip: true,
		}),
	];
}
