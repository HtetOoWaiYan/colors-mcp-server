/**
 * Neutral suite, author B: categories 305-308 (cvd-simulation, interpolation, harmony,
 * naming-and-text-color). Every expected value comes from the hand-written references in
 * src/reference-neutral/b-*.ts; every margin the brief requires is asserted at build time, so a
 * change of inputs that breaks a margin fails the build instead of shipping an ambiguous task.
 */
import type { CheckSpec, Expect, PathSeg } from "../../graders-neutral/b-checks.js";
import { gradeB } from "../../graders-neutral/b-checks.js";
import { deltaE2000, hexToRgb, rgbToLab } from "../../reference/color.js";
import { type Cvd, CVDS, cvdDeltaEBoth, simulateEncodedWrong, simulateHex } from "../../reference-neutral/b-cvd.js";
import {
	hslRotateHex,
	hslWith,
	oklchMaxChroma,
	oklchRotate,
	type Scheme,
	SCHEMES,
	schemeError,
} from "../../reference-neutral/b-harmony.js";
import {
	gamutExcess,
	type HueRule,
	interpolateHex,
	sampleGradient,
	type Space,
	stops,
} from "../../reference-neutral/b-interp.js";
import { apcaLc, CSS_NAMED, namesFor, rankNamed, wcag } from "../../reference-neutral/b-naming.js";
import {
	hexChannelDiff,
	hexOf,
	hslOfHex,
	hslToRgb,
	hueDist,
	type Rgb,
	oklchOfHex,
} from "../../reference-neutral/b-spaces.js";
import { contract, mulberry32, round } from "../build/common.js";
import { CATEGORY_NAMES, type Task } from "../types.js";

// ---------- small builders ----------

function assert(cond: boolean, msg: string): void {
	if (!cond) throw new Error(`neutralB build: ${msg}`);
}

const KIND: Record<number, string> = {
	305: "neutral-cvd-simulation",
	306: "neutral-interpolation",
	307: "neutral-harmony",
	308: "neutral-naming-and-text-color",
};

interface TaskBody {
	prompt: string;
	schema: Record<string, unknown>;
	checks: CheckSpec[];
	derivation: Record<string, unknown>;
	witness: unknown;
	invalid: unknown[];
	toolUseful?: boolean;
}

function task(category: number, n: number, t: TaskBody): Task {
	const params = { checks: t.checks, derivation: t.derivation };
	const failing = gradeB(t.witness, params).filter((c) => !c.pass);
	assert(failing.length === 0, `n${category}-${n} witness fails ${failing.map((c) => c.name).join(", ")}`);
	t.invalid.forEach((inv, i) =>
		assert(gradeB(inv, params).some((c) => !c.pass), `n${category}-${n} invalid[${i}] passes every check`),
	);
	return {
		id: `n${category}-${n}`,
		category,
		categoryName: CATEGORY_NAMES[category] as string,
		split: "dev",
		prompt: t.prompt,
		schema: t.schema,
		grader: { kind: KIND[category] as string, params },
		witness: t.witness,
		invalid: t.invalid,
		toolUseful: t.toolUseful ?? true,
	};
}

const HEX = { type: "string", pattern: "^#[0-9a-fA-F]{6}$" };
const NUM = { type: "number" };
const BOOL = { type: "boolean" };
const STR = { type: "string" };
const obj = (properties: Record<string, unknown>) => ({
	type: "object",
	properties,
	required: Object.keys(properties),
});
const arr = (items: unknown, n?: number) =>
	n === undefined ? { type: "array", items } : { type: "array", items, minItems: n, maxItems: n };

const c = (name: string, path: PathSeg[], e: Expect): CheckSpec => ({ name, path, e });
const byId = (id: string): PathSeg => ({ by: "id", eq: id });
const hexE = (v: string, tol: number): Expect => ({ k: "hex", v, tol });
const eqE = (v: string | number | boolean): Expect => ({ k: "eq", v });
const numE = (v: number, tol: number): Expect => ({ k: "num", v, tol });
const oneOfE = (v: string[]): Expect => ({ k: "oneOf", v });
const r1 = (v: number) => round(v, 1);
const r2 = (v: number) => round(v, 2);

function shuffled<T>(xs: readonly T[], seed: number): T[] {
	const rnd = mulberry32(seed);
	const out = [...xs];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(rnd() * (i + 1));
		[out[i], out[j]] = [out[j] as T, out[i] as T];
	}
	return out;
}

// ---------- shared prompt fragments ----------

const SRGB_CURVE = "the sRGB transfer function of IEC 61966-2-1 (the piecewise curve with the linear segment below 0.04045)";
const CVD_STD = `Simulate with the Machado, Oliveira & Fernandes (2009) model at severity 1.0 (the full dichromat matrices from that paper). Apply it in linear-light sRGB: decode each 8-bit channel with ${SRGB_CURVE}, multiply the linear RGB vector by the 3×3 matrix for the deficiency, clamp each channel to [0, 1], and re-encode with the same curve.`;
const DE_STD =
	"Measure differences with CIEDE2000 (kL = kC = kH = 1) on CIELAB computed from sRGB via XYZ with the D65 reference white (Xn = 0.95047, Yn = 1, Zn = 1.08883) and no chromatic adaptation to D50.";
const DE_ROUNDING = "Whether or not you round the simulated colors to 8-bit hex before measuring makes no difference to the answer.";
const LAB_D65 =
	"CIELAB here means L*a*b* computed from sRGB via XYZ with the D65 reference white (Xn = 0.95047, Yn = 1, Zn = 1.08883) and no chromatic adaptation, not the D50-based Lab that CSS's lab() uses.";
const OKLAB = "Oklab is Björn Ottosson's Oklab computed from linear-light sRGB; Oklch is its polar form (L, C, h in degrees).";
const HEX_OUT = "Convert results back to sRGB, clamp any channel outside [0, 1], and give 8-bit hex as #rrggbb.";
const HUE_RULES =
	"Hue arcs follow CSS Color 4: with h1 the start hue and h2 the end hue, \"shorter\" adds 360 to h1 if h2 − h1 > 180 or to h2 if h2 − h1 < −180; \"longer\" adds 360 to h1 if 0 < h2 − h1 < 180 or to h2 if −180 < h2 − h1 ≤ 0; then the hue is interpolated linearly like any other component and taken mod 360.";
const HSL_WHEEL =
	"On the HSL wheel (the hue of CSS hsl()), a rotated color is made by converting the hex to HSL, adding the offset to H (mod 360), keeping S and L as the base has them, and converting back to 8-bit hex.";
const OKLCH_WHEEL =
	"On the Oklch wheel (Björn Ottosson's Oklab computed from linear-light sRGB, in polar form L, C, h), a rotated color is made by adding the offset to h, keeping L and C as the base has them, and converting back to 8-bit sRGB hex; if a result fell outside sRGB, reduce C at constant L and h until it fits.";
const WCAG_STD =
	"Contrast ratio means the WCAG 2.x definition: (L1 + 0.05) / (L2 + 0.05), where L1 is the relative luminance of the lighter color and L2 that of the darker, and relative luminance is 0.2126 R + 0.7152 G + 0.0722 B on channels linearized with the sRGB curve.";
const APCA_STD =
	"APCA means APCA-W3 version 0.0.98G-4g: screen luminance Y = 0.2126729·R^2.4 + 0.7151522·G^2.4 + 0.0721750·B^2.4 on the 0-1 channel values (simple 2.4 exponent, no linear segment); soft black clamp Y += (0.022 − Y)^1.414 when Y < 0.022; if |Ybg − Ytxt| < 0.0005 then Lc = 0; normal polarity (Ybg > Ytxt): S = (Ybg^0.56 − Ytxt^0.57) × 1.14, Lc = 0 if S < 0.1 else S − 0.027; reverse polarity: S = (Ybg^0.65 − Ytxt^0.62) × 1.14, Lc = 0 if S > −0.1 else S + 0.027; finally Lc × 100.";

// =====================================================================================
// 305 cvd-simulation
// =====================================================================================

const SIM_TOL = 3;

function cat305(): Task[] {
	const tasks: Task[] = [];

	// n305-1: how the brand palette looks under protanopia (simulated hex per color).
	{
		const palette: [string, string][] = [
			["brand-red", "#d62828"],
			["brand-orange", "#f77f00"],
			["sunflower", "#fcbf49"],
			["teal", "#2a9d8f"],
			["ink", "#264653"],
			["success", "#2b9348"],
		];
		const k: Cvd = "protanopia";
		const sim = palette.map(([id, h]) => ({ id, hex: simulateHex(h, k) }));
		const wrongEncoded = palette.map(([id, h]) => ({ id, hex: simulateEncodedWrong(h, k) }));
		const wrongDeutan = palette.map(([id, h]) => ({ id, hex: simulateHex(h, "deuteranopia") }));
		assert(
			wrongEncoded.some((w, i) => hexChannelDiff(w.hex, sim[i]?.hex as string) > SIM_TOL + 2),
			"n305-1 gamma-encoded variant must be distinguishable",
		);
		tasks.push(
			task(305, 1, {
				prompt: `I'm putting together a slide called "our palette through protanopic eyes" for the brand review. For each swatch below I need the color a person with protanopia would see, as a hex I can paint next to the original.

${CVD_STD}

Swatches:
${palette.map(([id, h]) => `- ${id}: ${h}`).join("\n")}

Use the ids as written and give each simulated color as 8-bit hex (#rrggbb).
${contract(`{"results": [{"id": "brand-red", "hex": "#rrggbb"}, ...one entry per swatch]}`)}`,
				schema: obj({ results: arr(obj({ id: STR, hex: HEX })) }),
				checks: sim.map((s) => c(`sim-${s.id}`, ["results", byId(s.id), "hex"], hexE(s.hex, SIM_TOL))),
				derivation: {
					model: "Machado 2009 protanopia, severity 1.0, linear sRGB, clamp then encode",
					tolerance: `±${SIM_TOL} per 8-bit channel: output rounding (±0.5) plus coefficient precision (the matrices circulate at 4 and 6 decimals) and clamp-before/after-encode ordering; applying the matrix to gamma-encoded values misses by up to ${Math.max(...wrongEncoded.map((w, i) => hexChannelDiff(w.hex, sim[i]?.hex as string)))}`,
				},
				witness: { results: sim },
				invalid: [{ results: wrongEncoded }, { results: wrongDeutan }, { results: palette.map(([id, hex]) => ({ id, hex })) }],
			}),
		);
	}

	// n305-2: which status-color pairs become hard to tell apart under deuteranopia (threshold verdicts).
	{
		const T = 12;
		const pairs: [string, string, string][] = [
			["success-vs-error", "#2e7d32", "#c62828"],
			["pending-vs-success", "#fbc02d", "#8bc34a"],
			["link-vs-visited", "#1565c0", "#6a1b9a"],
			["info-vs-neutral", "#1e88e5", "#757575"],
			["draft-vs-error", "#8d6e63", "#e53935"],
			["new-vs-success", "#00897b", "#43a047"],
		];
		const k: Cvd = "deuteranopia";
		const rows = pairs.map(([id, a, b]) => {
			const [d0, d1] = cvdDeltaEBoth(a, b, k);
			const lo = Math.min(d0, d1);
			const hi = Math.max(d0, d1);
			assert(hi <= 0.85 * T || lo >= 1.15 * T, `n305-2 ${id} within 15% of threshold (${d0}, ${d1})`);
			assert(Math.abs(d0 - d1) < 0.5, `n305-2 ${id} rounding sensitivity`);
			return { id, deltaE: r1(d0), confusable: d0 < T };
		});
		assert(rows.some((r) => r.confusable) && rows.some((r) => !r.confusable), "n305-2 needs both verdicts");
		const unsim = pairs.map(([id, a, b]) => {
			const d = deltaE2000(rgbToLab(hexToRgb(a)), rgbToLab(hexToRgb(b)));
			return { id, deltaE: r1(d), confusable: d < T };
		});
		const protan = pairs.map(([id, a, b]) => {
			const d = cvdDeltaEBoth(a, b, "protanopia")[0];
			return { id, deltaE: r1(d), confusable: d < T };
		});
		tasks.push(
			task(305, 2, {
				prompt: `Our ops dashboard shows status with color only (I know, I know). Before we add icons I want to know which pairs of status colors actually collapse for people with deuteranopia. Call a pair "hard to tell apart" when the color difference between the two simulated colors is below ${T}.

${CVD_STD}
${DE_STD} ${DE_ROUNDING}

Pairs:
${pairs.map(([id, a, b]) => `- ${id}: ${a} and ${b}`).join("\n")}

For each pair give the CIEDE2000 difference between the two simulated colors (one decimal is enough) and whether it is hard to tell apart.
${contract(`{"results": [{"id": "success-vs-error", "deltaE": <number>, "hardToTell": <true or false>}, ...one entry per pair]}`)}`,
				schema: obj({ results: arr(obj({ id: STR, deltaE: NUM, hardToTell: BOOL })) }),
				checks: rows.flatMap((r) => [
					c(`verdict-${r.id}`, ["results", byId(r.id), "hardToTell"], eqE(r.confusable)),
					c(`deltaE-${r.id}`, ["results", byId(r.id), "deltaE"], numE(r.deltaE, 1.0)),
				]),
				derivation: {
					threshold: T,
					deficiency: k,
					margin: "every pair at least 15% from the threshold with and without 8-bit rounding of the simulated colors",
					tolerance: "±1.0 ΔE00: rounding of the simulated colors moves ΔE00 by < 0.5 here; D65 white variants by ~0.02",
					values: rows,
				},
				witness: { results: rows.map((r) => ({ id: r.id, deltaE: r.deltaE, hardToTell: r.confusable })) },
				invalid: [
					{ results: unsim.map((r) => ({ id: r.id, deltaE: r.deltaE, hardToTell: r.confusable })) },
					{ results: protan.map((r) => ({ id: r.id, deltaE: r.deltaE, hardToTell: r.confusable })) },
				],
			}),
		);
	}

	// n305-3: which deficiency makes each map-legend pair most similar.
	{
		const pairs: [string, string, string][] = [
			["admin-vs-guest-areas", "#7570b3", "#e7298a"],
			["rail-vs-parkland", "#d73027", "#1a9850"],
			["forest-vs-water", "#33a02c", "#1f78b4"],
			["farmland-vs-meadow", "#e6ab02", "#66a61e"],
			["retail-vs-housing", "#fb9a99", "#fdbf6f"],
		];
		const rows = pairs.map(([id, a, b]) => {
			const both = CVDS.map((k) => cvdDeltaEBoth(a, b, k));
			const hi = both.map((d) => Math.max(...d));
			const lo = both.map((d) => Math.min(...d));
			const best = hi.indexOf(Math.min(...hi));
			const others = lo.filter((_, i) => i !== best);
			assert(Math.min(...others) >= 1.15 * (hi[best] as number), `n305-3 ${id} margin < 15%`);
			assert(Math.min(...others) - (hi[best] as number) >= 1, `n305-3 ${id} margin < 1 ΔE`);
			const worst = both.map((d) => d[0]).indexOf(Math.max(...both.map((d) => d[0])));
			return { id, k: CVDS[best] as Cvd, worstK: CVDS[worst] as Cvd, de: both.map((d) => r2(d[0])) };
		});
		assert(new Set(rows.map((r) => r.k)).size === 3, "n305-3 should exercise all three deficiencies");
		tasks.push(
			task(305, 3, {
				prompt: `Accessibility review of a land-use map legend. For each pair of legend colors below, tell me which type of dichromacy makes the two colors look most alike: protanopia, deuteranopia or tritanopia. "Most alike" means the smallest color difference between the two colors after both are simulated for that deficiency.

${CVD_STD} Use the protanopia, deuteranopia and tritanopia matrices respectively.
${DE_STD} ${DE_ROUNDING}

Legend pairs:
${pairs.map(([id, a, b]) => `- ${id}: ${a} vs ${b}`).join("\n")}

Answer with exactly one of the words protanopia, deuteranopia, tritanopia per pair.
${contract(`{"results": [{"id": "admin-vs-guest-areas", "mostAlikeUnder": "<deficiency>"}, ...one entry per pair]}`)}`,
				schema: obj({ results: arr(obj({ id: STR, mostAlikeUnder: { type: "string", enum: [...CVDS] } })) }),
				checks: rows.map((r) => c(`deficiency-${r.id}`, ["results", byId(r.id), "mostAlikeUnder"], oneOfE([r.k]))),
				derivation: {
					margin: "runner-up deficiency at least 15% and 1.0 ΔE00 above the winner, with and without 8-bit rounding",
					deltaE: Object.fromEntries(rows.map((r) => [r.id, Object.fromEntries(CVDS.map((k, i) => [k, r.de[i]]))])),
				},
				witness: { results: rows.map((r) => ({ id: r.id, mostAlikeUnder: r.k })) },
				invalid: [
					{ results: rows.map((r) => ({ id: r.id, mostAlikeUnder: "deuteranopia" })) },
					{ results: rows.map((r) => ({ id: r.id, mostAlikeUnder: r.worstK })) },
				],
			}),
		);
	}

	// n305-4: order chart series by how close they look to the highlight color under tritanopia.
	{
		const ref = "#00a6ca";
		const series = ["#3b82f6", "#84cc16", "#0ea5e9", "#6366f1", "#10b981"];
		const k: Cvd = "tritanopia";
		const d = series.map((s) => ({ s, both: cvdDeltaEBoth(ref, s, k) }));
		const order = [...d].sort((x, y) => (x.both[0] as number) - (y.both[0] as number));
		for (let i = 0; i < order.length - 1; i++) {
			const a = order[i] as (typeof order)[number];
			const b = order[i + 1] as (typeof order)[number];
			assert(Math.min(...b.both) - Math.max(...a.both) >= 1.0, `n305-4 gap < 1.0 between ${a.s} and ${b.s}`);
		}
		const want = order.map((o) => o.s);
		const plain = [...series].sort(
			(x, y) => deltaE2000(rgbToLab(hexToRgb(ref)), rgbToLab(hexToRgb(x))) - deltaE2000(rgbToLab(hexToRgb(ref)), rgbToLab(hexToRgb(y))),
		);
		const deut = [...series].sort((x, y) => cvdDeltaEBoth(ref, x, "deuteranopia")[0] - cvdDeltaEBoth(ref, y, "deuteranopia")[0]);
		assert(plain.join() !== want.join() && deut.join() !== want.join(), "n305-4 order must depend on the simulation");
		tasks.push(
			task(305, 4, {
				prompt: `In our analytics line chart the selected series is drawn in ${ref} and the other series use ${series.join(", ")}. A tritanopic user told us the highlight gets lost. Rank the other five series colors from the one that looks most like the highlight to a person with tritanopia, to the one that looks least like it.

${CVD_STD} Use the tritanopia matrix and simulate both the highlight and each series color.
${DE_STD} ${DE_ROUNDING}

List the five series colors as hex, most similar first.
${contract(`{"order": ["#rrggbb", "#rrggbb", "#rrggbb", "#rrggbb", "#rrggbb"]}`)}`,
				schema: obj({ order: arr(HEX, 5) }),
				checks: [
					c("most-similar", ["order", 0], eqE(want[0] as string)),
					c("least-similar", ["order", 4], eqE(want[4] as string)),
					c("full-order", ["order"], { k: "seq", v: want }),
				],
				derivation: {
					deficiency: k,
					deltaE: Object.fromEntries(order.map((o) => [o.s, r2(o.both[0] as number)])),
					margin: "adjacent ranks at least 1.0 ΔE00 apart with and without 8-bit rounding",
				},
				witness: { order: want },
				invalid: [{ order: plain }, { order: deut }],
			}),
		);
	}

	// n305-5: a red-yellow-green diverging scale under deuteranopia: simulated stops and the most similar pair.
	{
		const scale: [string, string][] = [
			["strong-negative", "#d7191c"],
			["negative", "#fdae61"],
			["neutral", "#ffffbf"],
			["positive", "#a6d96a"],
			["strong-positive", "#1a9641"],
		];
		const k: Cvd = "deuteranopia";
		const sim = scale.map(([id, h]) => ({ id, hex: simulateHex(h, k) }));
		const allPairs: { ids: [string, string]; both: [number, number] }[] = [];
		for (let i = 0; i < scale.length; i++)
			for (let j = i + 1; j < scale.length; j++) {
				const [ia, ha] = scale[i] as [string, string];
				const [ib, hb] = scale[j] as [string, string];
				allPairs.push({ ids: [ia, ib], both: cvdDeltaEBoth(ha, hb, k) });
			}
		allPairs.sort((x, y) => x.both[0] - y.both[0]);
		const best = allPairs[0] as (typeof allPairs)[number];
		const next = allPairs[1] as (typeof allPairs)[number];
		assert(Math.min(...next.both) >= 1.15 * Math.max(...best.both), "n305-5 closest pair margin < 15%");
		const idx = (id: string) => scale.findIndex(([x]) => x === id);
		assert(Math.abs(idx(best.ids[0]) - idx(best.ids[1])) > 1, "n305-5 the closest pair should not be neighbours");
		const adjacent = allPairs.find((p) => Math.abs(idx(p.ids[0]) - idx(p.ids[1])) === 1) as (typeof allPairs)[number];
		const wrongEnc = scale.map(([id, h]) => ({ id, hex: simulateEncodedWrong(h, k) }));
		tasks.push(
			task(305, 5, {
				prompt: `We use a classic red-yellow-green diverging scale for survey results (strongly disagree to strongly agree). I'd like to show the team what it looks like with deuteranopia, and find out which two steps of the scale are the easiest to confuse.

${CVD_STD}
${DE_STD} ${DE_ROUNDING}

Scale steps:
${scale.map(([id, h]) => `- ${id}: ${h}`).join("\n")}

Give the simulated color of every step as 8-bit hex, and the ids of the two steps (any two, not only neighbours) whose simulated colors have the smallest CIEDE2000 difference.
${contract(`{"simulated": [{"id": "strong-negative", "hex": "#rrggbb"}, ...one entry per step], "mostConfusable": ["<id>", "<id>"]}`)}`,
				schema: obj({ simulated: arr(obj({ id: STR, hex: HEX })), mostConfusable: arr(STR, 2) }),
				checks: [
					...sim.map((s) => c(`sim-${s.id}`, ["simulated", byId(s.id), "hex"], hexE(s.hex, SIM_TOL))),
					c("most-confusable-pair", ["mostConfusable"], { k: "set", v: best.ids }),
				],
				derivation: {
					deficiency: k,
					tolerance: `±${SIM_TOL} per 8-bit channel (see n305-1)`,
					closest: { pair: best.ids, deltaE: r2(best.both[0]) },
					runnerUp: { pair: next.ids, deltaE: r2(next.both[0]) },
				},
				witness: { simulated: sim, mostConfusable: best.ids },
				invalid: [
					{ simulated: wrongEnc, mostConfusable: best.ids },
					{ simulated: sim, mostConfusable: adjacent.ids },
					{ simulated: sim, mostConfusable: next.ids },
				],
			}),
		);
	}

	return tasks;
}

// =====================================================================================
// 306 interpolation
// =====================================================================================

const INTERP_TOL = 2;

/** Asserts the stated-space result is in gamut (so clamping vs gamut mapping is moot) and returns its hex. */
function inGamutHex(rgb: Rgb, where: string): string {
	assert(gamutExcess(rgb) < 0.002, `${where} leaves sRGB (${gamutExcess(rgb)})`);
	return hexOf(rgb);
}

/** The worst channel distance of a wrong-variant answer list from the witness must exceed the tolerance. */
function distinct(witness: string[], wrong: string[], where: string): void {
	const worst = Math.max(...witness.map((w, i) => hexChannelDiff(w, wrong[i] as string)));
	assert(worst >= INTERP_TOL + 3, `${where} wrong variant too close (${worst})`);
}

function cat306(): Task[] {
	const tasks: Task[] = [];
	const hexes = (rs: Rgb[]) => rs.map(hexOf);

	// n306-1: five evenly spaced Oklab stops for a choropleth legend.
	{
		const a = "#0b3c5d";
		const b = "#f2c14e";
		const want = stops(a, b, 5, "oklab").map((s, i) => inGamutHex(s, `n306-1 stop ${i}`));
		const srgb = hexes(stops(a, b, 5, "srgb"));
		const lab = hexes(stops(a, b, 5, "lab"));
		const inner = Array.from({ length: 5 }, (_, i) => hexOf(interpolateHex(a, b, (i + 1) / 6, "oklab")));
		distinct(want, srgb, "n306-1 srgb");
		distinct(want, lab, "n306-1 lab");
		tasks.push(
			task(306, 1, {
				prompt: `I'm building a 5-class choropleth legend that runs from deep navy ${a} to sand ${b}. Plain RGB blending gives me a muddy middle, so I want the classes evenly spaced in Oklab instead: interpolate L, a and b linearly between the two endpoint colors and take 5 evenly spaced stops with both endpoints included (so the first stop is ${a} and the last is ${b}).

${OKLAB} ${HEX_OUT}
${contract(`{"stops": ["#rrggbb", "#rrggbb", "#rrggbb", "#rrggbb", "#rrggbb"]}`)}`,
				schema: obj({ stops: arr(HEX, 5) }),
				checks: want.map((h, i) => c(`stop-${i + 1}`, ["stops", i], hexE(h, INTERP_TOL))),
				derivation: {
					space: "oklab",
					tolerance: `±${INTERP_TOL} per 8-bit channel: output rounding plus Oklab matrix variants (Ottosson's published vs CSS Color 4's recomputed) which differ by < 0.1/255`,
					wrongSpaces: { srgb, lab },
				},
				witness: { stops: want },
				invalid: [{ stops: srgb }, { stops: inner }, { stops: lab }],
			}),
		);
	}

	// n306-2: three one-off mixes, each in its own stated space (color-mix semantics spelled out).
	{
		const mixes: { id: string; a: string; pa: number; b: string; space: Space; rule?: HueRule; text: string }[] = [
			{
				id: "overlay",
				a: "#ff3b30",
				pa: 30,
				b: "#007aff",
				space: "srgb-linear",
				text: "linear-light sRGB (decode both colors with the IEC 61966-2-1 sRGB curve, mix the linear values, re-encode)",
			},
			{ id: "tint", a: "#7c3aed", pa: 20, b: "#ffffff", space: "lab", text: "CIELAB (mix L*, a*, b*)" },
			{
				id: "blend",
				a: "#c026d3",
				pa: 50,
				b: "#f97316",
				space: "oklch",
				rule: "shorter",
				text: "Oklch with the shorter hue arc (mix L, C and h)",
			},
		];
		const want = mixes.map((m) => ({
			id: m.id,
			hex: inGamutHex(interpolateHex(m.a, m.b, 1 - m.pa / 100, m.space, m.rule), `n306-2 ${m.id}`),
		}));
		const swapped = mixes.map((m) => ({ id: m.id, hex: hexOf(interpolateHex(m.a, m.b, m.pa / 100, m.space, m.rule)) }));
		const allSrgb = mixes.map((m) => ({ id: m.id, hex: hexOf(interpolateHex(m.a, m.b, 1 - m.pa / 100, "srgb")) }));
		const longer = mixes.map((m) => ({
			id: m.id,
			hex: hexOf(interpolateHex(m.a, m.b, 1 - m.pa / 100, m.space, m.space === "oklch" ? "longer" : "shorter")),
		}));
		assert(
			allSrgb.every((x, i) => hexChannelDiff(x.hex, want[i]?.hex as string) > INTERP_TOL + 2),
			"n306-2 every mix must separate the gamma-sRGB variant",
		);
		assert(
			swapped.every((x, i) => mixes[i]?.pa === 50 || hexChannelDiff(x.hex, want[i]?.hex as string) > INTERP_TOL + 2),
			"n306-2 every unequal mix must separate swapped weights",
		);
		assert(hexChannelDiff(longer[2]?.hex as string, want[2]?.hex as string) > 50, "n306-2 hue arc must matter");
		tasks.push(
			task(306, 2, {
				prompt: `Three token values in our theme file are defined as mixes of two colors, and I need them flattened to plain hex for a platform that can't mix. "X% of A with Y% of B" means: convert both colors to the stated space, and every component of the result is X/100 × (A's component) + Y/100 × (B's component). No alpha anywhere.

- overlay: 30% of #ff3b30 with 70% of #007aff, mixed in ${mixes[0]?.text}.
- tint: 20% of #7c3aed with 80% of #ffffff, mixed in ${mixes[1]?.text}.
- blend: 50% of #c026d3 with 50% of #f97316, mixed in ${mixes[2]?.text}.

${LAB_D65} ${OKLAB} ${HUE_RULES} ${HEX_OUT}
${contract(`{"results": [{"id": "overlay", "hex": "#rrggbb"}, {"id": "tint", "hex": "#rrggbb"}, {"id": "blend", "hex": "#rrggbb"}]}`)}`,
				schema: obj({ results: arr(obj({ id: STR, hex: HEX })) }),
				checks: want.map((w) => c(`mix-${w.id}`, ["results", byId(w.id), "hex"], hexE(w.hex, INTERP_TOL))),
				derivation: {
					spaces: Object.fromEntries(mixes.map((m) => [m.id, m.space])),
					tolerance: `±${INTERP_TOL} per channel; the D50-Lab variant of the tint lands within 1 step, so it is not decisive`,
					wrong: { swapped, allSrgb, longer },
				},
				witness: { results: want },
				invalid: [{ results: swapped }, { results: allSrgb }, { results: longer }],
			}),
		);
	}

	// n306-3: a 3-stop HSL gradient with the middle stop at 25%, sampled at three positions.
	{
		const g = [
			{ color: "#e11d48", pos: 0 },
			{ color: "#f59e0b", pos: 0.25 },
			{ color: "#0ea5e9", pos: 1 },
		];
		const at = [10, 40, 75];
		const want = at.map((p) => inGamutHex(sampleGradient(g, p / 100, "hsl"), `n306-3 ${p}`));
		const midpoint = at.map((p) => hexOf(sampleGradient([g[0]!, { ...g[1]!, pos: 0.5 }, g[2]!], p / 100, "hsl")));
		const oklab = at.map((p) => hexOf(sampleGradient(g, p / 100, "oklab")));
		const numericHue = at.map((p) => hexOf(sampleGradient(g, p / 100, "hsl", p < 25 ? "longer" : "shorter")));
		distinct(want, midpoint, "n306-3 midpoint");
		distinct(want, oklab, "n306-3 oklab");
		distinct(want, numericHue, "n306-3 numeric hue");
		tasks.push(
			task(306, 3, {
				prompt: `Hero banner background: a horizontal gradient with three color stops, rose ${g[0]?.color} at 0%, amber ${g[1]?.color} at 25% and sky ${g[2]?.color} at 100%. It is interpolated in HSL with the shorter hue arc. Between two neighbouring stops the color at position p is the interpolation between those two stops at progress (p − start) / (end − start); H, S and L are each interpolated linearly, with the hue arc fixed up first.

${HUE_RULES} HSL is the CSS hsl() model. ${HEX_OUT}

What colors does the banner show at 10%, 40% and 75% of its width?
${contract(`{"samples": [{"at": 10, "hex": "#rrggbb"}, {"at": 40, "hex": "#rrggbb"}, {"at": 75, "hex": "#rrggbb"}]}`)}`,
				schema: obj({ samples: arr(obj({ at: NUM, hex: HEX }), 3) }),
				checks: at.map((p, i) => c(`at-${p}`, ["samples", { by: "at", eq: p }, "hex"], hexE(want[i] as string, INTERP_TOL))),
				derivation: {
					space: "hsl",
					rule: "shorter",
					tolerance: `±${INTERP_TOL} per channel; HSL is exact up to output rounding`,
					wrong: { midpointAt50: midpoint, oklab, numericHueNoArcFixup: numericHue },
				},
				witness: { samples: at.map((p, i) => ({ at: p, hex: want[i] })) },
				invalid: [
					{ samples: at.map((p, i) => ({ at: p, hex: midpoint[i] })) },
					{ samples: at.map((p, i) => ({ at: p, hex: numericHue[i] })) },
				],
			}),
		);
	}

	// n306-4: the longer hue arc in Oklch between colors ~170 degrees apart (so the long way is ~190).
	{
		const a = "#e8590c";
		const b = "#0c8599";
		const [, , ha] = oklchOfHex(a);
		const [, , hb] = oklchOfHex(b);
		assert(hueDist(ha, hb) > 160 && hueDist(ha, hb) < 180, "n306-4 hues should be ~170 apart");
		const want = stops(a, b, 6, "oklch", "longer").map((s, i) => inGamutHex(s, `n306-4 stop ${i}`));
		const shorter = hexes(stops(a, b, 6, "oklch", "shorter"));
		const hslLonger = hexes(stops(a, b, 6, "hsl", "longer"));
		distinct(want, shorter, "n306-4 shorter");
		distinct(want, hslLonger, "n306-4 hsl");
		tasks.push(
			task(306, 4, {
				prompt: `For a playful loading bar I want a 6-step gradient from orange ${a} to teal ${b} that deliberately goes the long way round the hue circle (through reds, magentas and blues) instead of the direct route through yellow-green. Interpolate in Oklch with the "longer" hue arc: L and C linearly, the hue linearly after the arc fix-up. Give 6 evenly spaced stops with both endpoints included.

${OKLAB} ${HUE_RULES} ${HEX_OUT}
${contract(`{"stops": ["#rrggbb", "#rrggbb", "#rrggbb", "#rrggbb", "#rrggbb", "#rrggbb"]}`)}`,
				schema: obj({ stops: arr(HEX, 6) }),
				checks: want.map((h, i) => c(`stop-${i + 1}`, ["stops", i], hexE(h, INTERP_TOL))),
				derivation: {
					space: "oklch",
					rule: "longer",
					hues: { start: r2(ha), end: r2(hb) },
					gamut: "every stop is inside sRGB, so clamping vs gamut mapping does not matter",
					tolerance: `±${INTERP_TOL} per channel`,
					wrong: { shorter, hslLonger },
				},
				witness: { stops: want },
				invalid: [{ stops: shorter }, { stops: hslLonger }],
			}),
		);
	}

	// n306-5: animation frames of a CIELAB (D65) tween.
	{
		const a = "#4c1d95";
		const b = "#bbf7d0";
		const ts = [0.2, 0.4, 0.6, 0.8];
		const want = ts.map((t) => inGamutHex(interpolateHex(a, b, t, "lab"), `n306-5 ${t}`));
		const oklab = ts.map((t) => hexOf(interpolateHex(a, b, t, "oklab")));
		const srgb = ts.map((t) => hexOf(interpolateHex(a, b, t, "srgb")));
		distinct(want, oklab, "n306-5 oklab");
		distinct(want, srgb, "n306-5 srgb");
		tasks.push(
			task(306, 5, {
				prompt: `Our motion spec says the onboarding card's background tweens from violet ${a} to mint ${b}, interpolated in CIELAB, and QA wants the expected intermediate colors to compare screenshots against. Interpolate L*, a* and b* linearly from the first color (progress 0) to the second (progress 1) and give the frames at progress 0.2, 0.4, 0.6 and 0.8.

${LAB_D65} ${HEX_OUT}
${contract(`{"frames": [{"t": 0.2, "hex": "#rrggbb"}, {"t": 0.4, "hex": "#rrggbb"}, {"t": 0.6, "hex": "#rrggbb"}, {"t": 0.8, "hex": "#rrggbb"}]}`)}`,
				schema: obj({ frames: arr(obj({ t: NUM, hex: HEX }), 4) }),
				checks: ts.map((t, i) => c(`frame-${t}`, ["frames", { by: "t", eq: t }, "hex"], hexE(want[i] as string, INTERP_TOL))),
				derivation: {
					space: "lab (D65, no adaptation)",
					tolerance: `±${INTERP_TOL} per channel; the D50-adapted Lab variant lands within 1 step for this pair, so the white-point choice is not decisive`,
					wrong: { oklab, srgb },
				},
				witness: { frames: ts.map((t, i) => ({ t, hex: want[i] })) },
				invalid: [{ frames: ts.map((t, i) => ({ t, hex: oklab[i] })) }, { frames: ts.map((t, i) => ({ t, hex: srgb[i] })) }],
			}),
		);
	}

	return tasks;
}

// =====================================================================================
// 307 harmony
// =====================================================================================

const HUE_TOL = 3;
const HSL_S_TOL = 4;
const HSL_L_TOL = 2;
const OK_L_TOL = 0.01;
const OK_C_TOL = 0.015;

/** HSL checks for one answer hex: hue (deg), S and L (percentage points). Requires usable chroma. */
function hslChecks(prefix: string, path: PathSeg[], h: number, s: number, l: number, witnessHex: string): CheckSpec[] {
	const rgb = hexToRgb(witnessHex);
	assert(Math.max(...rgb) - Math.min(...rgb) >= 0.25, `${prefix} too little chroma for a ±${HUE_TOL}° hue check`);
	return [
		c(`${prefix}-hue`, path, { k: "coord", space: "hsl", i: 0, v: r2(((h % 360) + 360) % 360), tol: HUE_TOL }),
		c(`${prefix}-saturation`, path, { k: "coord", space: "hsl", i: 1, v: r2(s * 100), tol: HSL_S_TOL }),
		c(`${prefix}-lightness`, path, { k: "coord", space: "hsl", i: 2, v: r2(l * 100), tol: HSL_L_TOL }),
	];
}

function oklchChecks(prefix: string, path: PathSeg[], L: number, C: number, H: number): CheckSpec[] {
	assert(C >= 0.08, `${prefix} chroma too low for a ±${HUE_TOL}° hue check`);
	return [
		c(`${prefix}-hue`, path, { k: "coord", space: "oklch", i: 2, v: r2(((H % 360) + 360) % 360), tol: HUE_TOL }),
		c(`${prefix}-L`, path, { k: "coord", space: "oklch", i: 0, v: round(L, 4), tol: OK_L_TOL }),
		c(`${prefix}-C`, path, { k: "coord", space: "oklch", i: 1, v: round(C, 4), tol: OK_C_TOL }),
	];
}

const HSL_TOL_NOTE = `hue ±${HUE_TOL}° (8-bit rounding moves HSL hue by < 1° at the chroma used), S ±${HSL_S_TOL} and L ±${HSL_L_TOL} percentage points (rounding moves S by up to ~1.5 points at low L)`;
const OK_TOL_NOTE = `hue ±${HUE_TOL}° at C ≥ 0.08 (rounding moves it by ~1°), L ±${OK_L_TOL} and C ±${OK_C_TOL} (rounding moves them by < 0.004)`;

/** Asserts an Oklch rotation stays in gamut with chroma headroom, so the reduce-chroma rule is not decisive. */
function okRotate(base: string, deg: number, where: string) {
	const r = oklchRotate(base, deg);
	assert(!r.reduced, `${where} leaves sRGB`);
	assert(oklchMaxChroma(r.L, r.H) - r.C >= 0.04, `${where} chroma headroom < 0.04`);
	return r;
}

function cat307(): Task[] {
	const tasks: Task[] = [];

	// n307-1: HSL triadic companions of a teal.
	{
		const base = "#2a9d8f";
		const [h, s, l] = hslOfHex(base);
		const want = [120, 240].map((d) => hslRotateHex(base, d));
		const okTriad = [120, 240].map((d) => oklchRotate(base, d).hex);
		okTriad.forEach((x, i) =>
			assert(hueDist(hslOfHex(x)[0], h + (i + 1) * 120) >= HUE_TOL + 5, "n307-1 Oklch wheel must miss the HSL hue"),
		);
		tasks.push(
			task(307, 1, {
				prompt: `Our app's primary is the teal ${base}. For an illustration set I need its two triadic partners on the classic color wheel. ${HSL_WHEEL}

Give the +120° partner first, then the +240° partner.
${contract(`{"triadic": ["#rrggbb", "#rrggbb"]}`)}`,
				schema: obj({ triadic: arr(HEX, 2) }),
				checks: [120, 240].flatMap((d, i) =>
					hslChecks(`plus${d}`, ["triadic", i], h + d, s, l, want[i] as string),
				),
				derivation: { wheel: "hsl", base: { h: r2(h), s: r2(s * 100), l: r2(l * 100) }, tolerance: HSL_TOL_NOTE, oklchWheelAnswer: okTriad },
				witness: { triadic: want },
				invalid: [{ triadic: okTriad }, { triadic: [...want].reverse() }, { triadic: [hslRotateHex(base, 180), hslRotateHex(base, 180)] }],
			}),
		);
	}

	// n307-2: Oklch split-complementary of a green.
	{
		const base = "#15803d";
		const [L, C, H] = oklchOfHex(base);
		const rs = [150, 210].map((d) => okRotate(base, d, `n307-2 +${d}`));
		const hslWheel = [150, 210].map((d) => hslRotateHex(base, d));
		hslWheel.forEach((x, i) =>
			assert(hueDist(oklchOfHex(x)[2], H + [150, 210][i]!) >= HUE_TOL + 5, "n307-2 HSL wheel must miss the Oklch hue"),
		);
		tasks.push(
			task(307, 2, {
				prompt: `Design-system lead here. Our success green is ${base} and I'd like a split-complementary pair for the marketing pages, built on a perceptual wheel rather than HSL. Split-complementary means the two colors at +150° and −150° (= +210°) from the base. ${OKLCH_WHEEL}

Give the +150° color first, then the +210° color.
${contract(`{"splitComplementary": ["#rrggbb", "#rrggbb"]}`)}`,
				schema: obj({ splitComplementary: arr(HEX, 2) }),
				checks: rs.flatMap((r, i) => oklchChecks(`plus${[150, 210][i]}`, ["splitComplementary", i], L, C, r.H)),
				derivation: {
					wheel: "oklch",
					base: { L: round(L, 4), C: round(C, 4), H: r2(H) },
					gamut: "both rotations are inside sRGB with ≥ 0.04 chroma headroom, so the reduce-chroma rule never applies",
					tolerance: OK_TOL_NOTE,
					hslWheelAnswer: hslWheel,
				},
				witness: { splitComplementary: rs.map((r) => r.hex) },
				invalid: [
					{ splitComplementary: hslWheel },
					{ splitComplementary: rs.map((r) => r.hex).reverse() },
					{ splitComplementary: [okRotate(base, 180, "n307-2 complement").hex, okRotate(base, 180, "n307-2 complement").hex] },
				],
			}),
		);
	}

	// n307-3: identify which scheme each set of swatches forms (HSL wheel, hue only).
	{
		const S = [0.65, 0.8, 0.55, 0.7];
		const Ls = [0.45, 0.55, 0.4, 0.6];
		const defs: [string, Scheme, number][] = [
			["set-a", "split-complementary", 20],
			["set-b", "tetradic", 200],
			["set-c", "analogous", 250],
			["set-d", "square", 45],
			["set-e", "triadic", 95],
		];
		const OFFS: Record<Scheme, number[]> = {
			complementary: [0, 180],
			"split-complementary": [0, 150, 210],
			triadic: [0, 120, 240],
			tetradic: [0, 60, 180, 240],
			square: [0, 90, 180, 270],
			analogous: [0, 30, 60],
		};
		const sets = defs.map(([id, scheme, base], si) => {
			const hexesRaw = OFFS[scheme].map((o, i) => hexOf(hslToRgb([(base + o) % 360, S[i] as number, Ls[i] as number])));
			const hexes = shuffled(hexesRaw, 300 + si);
			const hues = hexes.map((x) => hslOfHex(x)[0]);
			assert(schemeError(hues, scheme) <= 1.5, `n307-3 ${id} does not match ${scheme}`);
			for (const other of SCHEMES)
				if (other !== scheme) assert(schemeError(hues, other) >= 20, `n307-3 ${id} also near ${other}`);
			const okMatch = SCHEMES.filter((x) => schemeError(hexes.map((h) => oklchOfHex(h)[2]), x) <= HUE_TOL + 2);
			return { id, scheme, hexes, okMatch };
		});
		assert(sets.some((x) => !x.okMatch.includes(x.scheme)), "n307-3 at least one set should only read correctly on the HSL wheel");
		const SYN: Record<Scheme, string[]> = {
			complementary: ["complementary"],
			"split-complementary": ["split-complementary"],
			triadic: ["triadic"],
			tetradic: ["tetradic", "rectangle", "rectangular"],
			square: ["square"],
			analogous: ["analogous"],
		};
		const bySize = (n: number): Scheme => (n === 2 ? "complementary" : n === 3 ? "triadic" : "square");
		tasks.push(
			task(307, 3, {
				prompt: `I inherited five mood boards and want to label which classic color scheme each one uses. Judge by hue only (lightness and saturation vary on purpose), on the HSL hue wheel of CSS hsl(). Any swatch in a set may be the base, and swatches are listed in no particular order. Hue offsets from the base, allowing a few degrees for rounding:
- complementary: 0, 180
- split-complementary: 0, +150, +210
- triadic: 0, +120, +240
- tetradic (rectangle): 0, +60, +180, +240
- square: 0, +90, +180, +270
- analogous: 0, +30, −30 (a run of neighbours 30° apart)

Sets:
${sets.map((x) => `- ${x.id}: ${x.hexes.join(", ")}`).join("\n")}

Answer with one of: complementary, split-complementary, triadic, tetradic, square, analogous.
${contract(`{"results": [{"id": "set-a", "scheme": "<scheme>"}, ...one entry per set]}`)}`,
				schema: obj({ results: arr(obj({ id: STR, scheme: STR })) }),
				checks: sets.map((x) => c(`scheme-${x.id}`, ["results", byId(x.id), "scheme"], oneOfE(SYN[x.scheme]))),
				derivation: {
					wheel: "hsl",
					margin: "the right scheme fits within 1.5°; every other scheme of the same size is ≥ 20° off",
					truth: Object.fromEntries(sets.map((x) => [x.id, x.scheme])),
					oklchWheelWouldMatch: Object.fromEntries(sets.map((x) => [x.id, x.okMatch])),
				},
				witness: { results: sets.map((x) => ({ id: x.id, scheme: x.scheme })) },
				invalid: [
					{ results: sets.map((x) => ({ id: x.id, scheme: bySize(x.hexes.length) })) },
					{ results: sets.map((x) => ({ id: x.id, scheme: "triadic" })) },
				],
				toolUseful: true,
			}),
		);
	}

	// n307-4: one member of a rectangle tetrad, on the HSL wheel and then on the Oklch wheel.
	{
		const base = "#0f766e";
		const [h, s, l] = hslOfHex(base);
		const [L, C, H] = oklchOfHex(base);
		const hslHex = hslRotateHex(base, 60);
		const ok = okRotate(base, 60, "n307-4");
		assert(hueDist(oklchOfHex(hslHex)[2], H + 60) >= HUE_TOL + 5, "n307-4 HSL answer must fail the Oklch hue check");
		assert(hueDist(hslOfHex(ok.hex)[0], h + 60) >= HUE_TOL + 5, "n307-4 Oklch answer must fail the HSL hue check");
		tasks.push(
			task(307, 4, {
				prompt: `We're picking a rectangle (tetradic) scheme around our deep teal ${base}: the members sit at +60°, +180° and +240° from the base. Right now I only need the +60° member, and I want to compare two wheels before we commit.

1. ${HSL_WHEEL}
2. ${OKLCH_WHEEL}

Give the +60° member computed each way.
${contract(`{"hslWheel": "#rrggbb", "oklchWheel": "#rrggbb"}`)}`,
				schema: obj({ hslWheel: HEX, oklchWheel: HEX }),
				checks: [...hslChecks("hsl", ["hslWheel"], h + 60, s, l, hslHex), ...oklchChecks("oklch", ["oklchWheel"], L, C, ok.H)],
				derivation: {
					offset: 60,
					tolerance: { hsl: HSL_TOL_NOTE, oklch: OK_TOL_NOTE },
					gamut: "the Oklch rotation is inside sRGB with ≥ 0.04 chroma headroom",
				},
				witness: { hslWheel: hslHex, oklchWheel: ok.hex },
				invalid: [
					{ hslWheel: ok.hex, oklchWheel: hslHex },
					{ hslWheel: hslRotateHex(base, -60), oklchWheel: okRotate(base, -60, "n307-4 -60").hex },
				],
			}),
		);
	}

	// n307-5: monochromatic HSL lightness steps plus an analogous pair, for a theme generator.
	{
		const base = "#c05621";
		const [h, s, l] = hslOfHex(base);
		const Lsteps = [20, 35, 50, 65, 80];
		const tints = Lsteps.map((x) => hslWith(base, { l: x / 100 }));
		const analog = [-30, 30].map((d) => hslRotateHex(base, d));
		// Plausible wrong answers: tints by mixing with black/white in sRGB (hue kept, saturation not), and the analogous pair swapped.
		const mixTint = Lsteps.map((x) => {
			const rgb = hexToRgb(base);
			const t = x / 100;
			return t < l
				? hexOf(rgb.map((v) => (v * t) / l) as unknown as Rgb)
				: hexOf(rgb.map((v) => v + (1 - v) * ((t - l) / (1 - l))) as unknown as Rgb);
		});
		tasks.push(
			task(307, 5, {
				prompt: `I'm writing presets for a theme generator. Starting from the burnt orange ${base}:

1. A monochromatic ramp: keep the HSL hue and saturation of the base (CSS hsl() model) and set the HSL lightness to 20%, 35%, 50%, 65% and 80%, in that order.
2. An analogous pair: the colors at −30° and +30° from the base. ${HSL_WHEEL} Give the −30° color first, then the +30° color.

${contract(`{"monochromatic": ["#rrggbb", "#rrggbb", "#rrggbb", "#rrggbb", "#rrggbb"], "analogous": ["#rrggbb", "#rrggbb"]}`)}`,
				schema: obj({ monochromatic: arr(HEX, 5), analogous: arr(HEX, 2) }),
				checks: [
					...Lsteps.flatMap((x, i) => hslChecks(`mono-${x}`, ["monochromatic", i], h, s, x / 100, tints[i] as string)),
					...[-30, 30].flatMap((d, i) =>
						hslChecks(`analogous${d > 0 ? "-plus" : "-minus"}30`, ["analogous", i], h + d, s, l, analog[i] as string),
					),
				],
				derivation: { wheel: "hsl", base: { h: r2(h), s: r2(s * 100), l: r2(l * 100) }, tolerance: HSL_TOL_NOTE },
				witness: { monochromatic: tints, analogous: analog },
				invalid: [
					{ monochromatic: mixTint, analogous: analog },
					{ monochromatic: tints, analogous: [...analog].reverse() },
				],
			}),
		);
	}

	return tasks;
}

// =====================================================================================
// 308 naming-and-text-color
// =====================================================================================

function cat308(): Task[] {
	const tasks: Task[] = [];

	// n308-1: nearest CSS named color by two metrics.
	{
		const inputs = ["#e03024", "#edac08", "#99acc3", "#cc5500"];
		const rows = inputs.map((hex) => {
			const e = rankNamed(hex, "srgb-euclid");
			const d = rankNamed(hex, "ciede2000");
			assert((e[1]?.d as number) >= 1.1 * (e[0]?.d as number), `n308-1 ${hex} euclid margin < 10%`);
			assert((d[1]?.d as number) >= 1.1 * (d[0]?.d as number), `n308-1 ${hex} ciede2000 margin < 10%`);
			return {
				hex,
				euclid: e[0]?.names as string[],
				de: d[0]?.names as string[],
				margins: { euclid: r2((e[1]?.d as number) / (e[0]?.d as number)), de: r2((d[1]?.d as number) / (d[0]?.d as number)) },
			};
		});
		assert(rows.some((r) => r.euclid[0] !== r.de[0]) && rows.some((r) => r.euclid[0] === r.de[0]), "n308-1 needs agreement and disagreement");
		assert(rows.some((r) => r.euclid.length > 1 || r.de.length > 1), "n308-1 should exercise an alias");
		tasks.push(
			task(308, 1, {
				prompt: `I'm labelling swatches in a style guide with the closest CSS named color (the 148 named colors of CSS Color 4), and two of us disagree about the metric, so please give both:
- "euclidean": the smallest straight-line distance between the 8-bit R, G, B values (0-255 per channel) in sRGB;
- "ciede2000": the smallest CIEDE2000 difference (kL = kC = kH = 1) in CIELAB.

${LAB_D65}

If several names share the winning value (such as gray and grey), any of them is fine.

Swatches: ${inputs.join(", ")}
${contract(`{"results": [{"id": "${inputs[0]}", "euclidean": "<name>", "ciede2000": "<name>"}, ...one entry per swatch, id = the swatch hex]}`)}`,
				schema: obj({ results: arr(obj({ id: STR, euclidean: STR, ciede2000: STR })) }),
				checks: rows.flatMap((r) => [
					c(`euclidean-${r.hex}`, ["results", byId(r.hex), "euclidean"], oneOfE(r.euclid)),
					c(`ciede2000-${r.hex}`, ["results", byId(r.hex), "ciede2000"], oneOfE(r.de)),
				]),
				derivation: {
					margin: "runner-up value at least 10% farther than the winner under each metric",
					rows,
				},
				witness: { results: rows.map((r) => ({ id: r.hex, euclidean: r.euclid[0], ciede2000: r.de[0] })) },
				invalid: [
					{ results: rows.map((r) => ({ id: r.hex, euclidean: r.euclid[0], ciede2000: r.euclid[0] })) },
					{ results: rows.map((r) => ({ id: r.hex, euclidean: r.de[0], ciede2000: r.de[0] })) },
				],
			}),
		);
	}

	// n308-2: hex values of CSS named colors (knowledge; includes X11-conflict names).
	{
		const names = ["rebeccapurple", "darkslategrey", "lightgoldenrodyellow", "papayawhip", "darkorchid", "green", "maroon"];
		const want = Object.fromEntries(names.map((n) => [n, CSS_NAMED[n] as string]));
		// X11 rgb.txt values that differ from CSS for green and maroon; rebeccapurple confused with purple.
		const x11 = { ...want, green: "#00ff00", maroon: "#b03060" };
		const confused = { ...want, rebeccapurple: "#800080", darkslategrey: "#708090" };
		tasks.push(
			task(308, 2, {
				prompt: `We're replacing CSS color keywords in an old stylesheet with hex tokens so our design files can use them. What hex value does each of these keywords have, per the CSS Color 4 named-color table (not any other color-name list)?

${names.join(", ")}

Give the 8-bit hex value for each, keyed by the keyword.
${contract(`{${names.map((n) => `"${n}": "#rrggbb"`).join(", ")}}`)}`,
				schema: obj(Object.fromEntries(names.map((n) => [n, HEX]))),
				checks: names.map((n) => c(`hex-${n}`, [n], hexE(want[n] as string, 0))),
				derivation: { source: "CSS Color 4 named colors", exact: true },
				witness: want,
				invalid: [x11, confused],
				toolUseful: false,
			}),
		);
	}

	// n308-3: black or white text on each background, by WCAG 2 and by APCA (they disagree on some).
	{
		const bgs = ["#f97316", "#8b5cf6", "#06b6d4", "#7c3aed", "#16a34a"];
		const rows = bgs.map((bg) => {
			const wb = wcag("#000000", bg);
			const ww = wcag("#ffffff", bg);
			const ab = Math.abs(apcaLc("#000000", bg));
			const aw = Math.abs(apcaLc("#ffffff", bg));
			assert(Math.max(wb, ww) / Math.min(wb, ww) >= 1.15, `n308-3 ${bg} WCAG too close`);
			assert(Math.abs(ab - aw) >= 3, `n308-3 ${bg} APCA too close`);
			return {
				bg,
				wcag: wb > ww ? "black" : "white",
				apca: ab > aw ? "black" : "white",
				values: { wcagBlack: r2(wb), wcagWhite: r2(ww), lcBlack: r1(apcaLc("#000000", bg)), lcWhite: r1(apcaLc("#ffffff", bg)) },
			};
		});
		assert(rows.some((r) => r.wcag !== r.apca) && rows.some((r) => r.wcag === r.apca), "n308-3 needs agreement and disagreement");
		tasks.push(
			task(308, 3, {
				prompt: `For our button generator I need to pick pure black (#000000) or pure white (#ffffff) label text automatically, and I'm comparing two rules. For each button background below, tell me which of the two text colors gives the higher contrast under each rule:

1. WCAG: the higher contrast ratio.
2. APCA: the larger magnitude |Lc|, with the text as foreground and the button color as background.

${WCAG_STD}
${APCA_STD}

Backgrounds: ${bgs.join(", ")}
${contract(`{"results": [{"id": "${bgs[0]}", "wcag": "<black or white>", "apca": "<black or white>"}, ...one entry per background, id = the background hex]}`)}`,
				schema: obj({
					results: arr(obj({ id: STR, wcag: { type: "string", enum: ["black", "white"] }, apca: { type: "string", enum: ["black", "white"] } })),
				}),
				checks: rows.flatMap((r) => [
					c(`wcag-${r.bg}`, ["results", byId(r.bg), "wcag"], eqE(r.wcag)),
					c(`apca-${r.bg}`, ["results", byId(r.bg), "apca"], eqE(r.apca)),
				]),
				derivation: {
					margin: "the WCAG winner beats the loser by ≥ 15% in ratio; the APCA winner by ≥ 3 Lc",
					rows,
				},
				witness: { results: rows.map((r) => ({ id: r.bg, wcag: r.wcag, apca: r.apca })) },
				invalid: [
					{ results: rows.map((r) => ({ id: r.bg, wcag: r.wcag, apca: r.wcag })) },
					{ results: rows.map((r) => ({ id: r.bg, wcag: "white", apca: "white" })) },
				],
			}),
		);
	}

	// n308-4: which text/background pairs fail 4.5:1, and the lowest-contrast failure.
	{
		const T = 4.5;
		const pairs: [string, string, string][] = [
			["card-caption", "#64748b", "#e2e8f0"],
			["search-placeholder", "#9ca3af", "#ffffff"],
			["teal-button-label", "#ffffff", "#14b8a6"],
			["error-message", "#ef4444", "#fef2f2"],
			["warning-chip-label", "#ffffff", "#f59e0b"],
			["body-copy", "#475569", "#ffffff"],
			["link-on-cream", "#a16207", "#fefce8"],
			["badge-text", "#b45309", "#fffbeb"],
		];
		const rows = pairs.map(([id, t, b]) => {
			const r = wcag(t, b);
			assert(Math.abs(r - T) >= 0.15, `n308-4 ${id} too close to ${T} (${r})`);
			return { id, ratio: r, fails: r < T };
		});
		const failing = rows.filter((r) => r.fails).sort((a, b) => a.ratio - b.ratio);
		assert(failing.length >= 3 && failing.length < rows.length, "n308-4 needs passes and fails");
		const worst = failing[0] as (typeof failing)[number];
		assert((failing[1]?.ratio as number) - worst.ratio >= 0.2, "n308-4 worst not clear by 0.2");
		const failIds = failing.map((r) => r.id);
		tasks.push(
			task(308, 4, {
				prompt: `Audit pass on our component kit. Our bar is a contrast ratio of at least ${T}:1 for all text. Which of these text/background pairs fail, and which failing pair is the worst (lowest ratio)?

${WCAG_STD}

${pairs.map(([id, t, b]) => `- ${id}: text ${t} on ${b}`).join("\n")}

List the ids of every failing pair, then the id of the lowest-contrast one with its ratio (two decimals is plenty).
${contract(`{"failing": ["<id>", ...], "worst": {"id": "<id>", "ratio": <number>}}`)}`,
				schema: obj({ failing: arr(STR), worst: obj({ id: STR, ratio: NUM }) }),
				checks: [
					...rows.map((r) => c(`${r.fails ? "fails" : "passes"}-${r.id}`, ["failing"], { k: "has", v: r.id, want: r.fails })),
					c("worst-id", ["worst", "id"], eqE(worst.id)),
					c("worst-ratio", ["worst", "ratio"], numE(r2(worst.ratio), 0.05)),
				],
				derivation: {
					threshold: T,
					ratios: Object.fromEntries(rows.map((r) => [r.id, r2(r.ratio)])),
					margin: "every pair ≥ 0.15 from the threshold; the worst is ≥ 0.2 below the next failure",
					tolerance: "ratio ±0.05: covers two-decimal rounding and the 0.03928 vs 0.04045 linearization threshold",
				},
				witness: { failing: failIds, worst: { id: worst.id, ratio: r2(worst.ratio) } },
				invalid: [
					{ failing: rows.filter((r) => r.ratio < 5).map((r) => r.id), worst: { id: worst.id, ratio: r2(worst.ratio) } },
					{ failing: failIds, worst: { id: "search-placeholder", ratio: r2(rows[1]?.ratio as number) } },
				],
			}),
		);
	}

	// n308-5: legacy named text colors on white: hex, WCAG ratio, AA pass.
	{
		const names = ["teal", "slategray", "royalblue", "seagreen", "crimson", "chocolate"];
		const rows = names.map((n) => {
			const hex = CSS_NAMED[n] as string;
			const ratio = wcag(hex, "#ffffff");
			assert(Math.abs(ratio - 4.5) >= 0.15, `n308-5 ${n} too close to 4.5`);
			return { id: n, hex, ratio: r2(ratio), passesAA: ratio >= 4.5 };
		});
		assert(rows.some((r) => r.passesAA) && rows.some((r) => !r.passesAA), "n308-5 needs both verdicts");
		assert(names.every((n) => namesFor(CSS_NAMED[n] as string).includes(n)), "n308-5 names");
		tasks.push(
			task(308, 5, {
				prompt: `An old marketing site sets its link and label colors with CSS keywords, all on a white (#ffffff) page. For each keyword, give its hex value from the CSS Color 4 named-color table, its contrast ratio against white (about two decimals), and whether it meets the 4.5:1 minimum for normal body text.

${WCAG_STD}

Keywords: ${names.join(", ")}
${contract(`{"results": [{"id": "teal", "hex": "#rrggbb", "ratio": <number>, "passesAA": <true or false>}, ...one entry per keyword]}`)}`,
				schema: obj({ results: arr(obj({ id: STR, hex: HEX, ratio: NUM, passesAA: BOOL })) }),
				checks: rows.flatMap((r) => [
					c(`hex-${r.id}`, ["results", byId(r.id), "hex"], hexE(r.hex, 0)),
					c(`ratio-${r.id}`, ["results", byId(r.id), "ratio"], numE(r.ratio, 0.05)),
					c(`aa-${r.id}`, ["results", byId(r.id), "passesAA"], eqE(r.passesAA)),
				]),
				derivation: {
					tolerance: "hex exact; ratio ±0.05 (two-decimal rounding and linearization-threshold variants)",
					margin: "every ratio ≥ 0.15 from 4.5",
				},
				witness: { results: rows },
				invalid: [
					{ results: rows.map((r) => ({ ...r, passesAA: true })) },
					// Luminance ratio without the 0.05 flare term.
					{
						results: rows.map((r) => {
							const lum = (1 + 0.05) / r.ratio - 0.05;
							const bad = 1 / lum;
							return { ...r, ratio: r2(bad), passesAA: bad >= 4.5 };
						}),
					},
				],
			}),
		);
	}

	return tasks;
}

/** Neutral suite, author B: returns this author's categories' tasks. */
export function neutralB(): Task[] {
	return [...cat305(), ...cat306(), ...cat307(), ...cat308()];
}
