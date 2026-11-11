/**
 * Neutral suite v2, author B: categories 305-308 (cvd-simulation, interpolation, harmony,
 * naming-and-text-color), five fresh tasks each (ids p305-1 .. p308-5). Same domains and standards
 * as v1 (cats-neutral-b.ts), new scenarios, inputs, wording and task shapes. Every expected value
 * comes from the hand-written references in src/reference-neutral/b-*.ts, and every margin the brief
 * asks for is asserted at build time, so an input change that breaks a margin fails the build.
 */
import type { PathSeg } from "../../graders-neutral/b-checks.js";
import { gradeNeutral } from "../../graders-neutral/index.js";
import type { CheckSpec2, Expect2 } from "../../graders-neutral/v2-b-checks.js";
import { deltaE2000, hexToRgb, inGamut, oklchToRgb, rgbToLab } from "../../reference/color.js";
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
import { hexChannelDiff, hexOf, hslOfHex, hueDist, oklchOfHex, type Rgb } from "../../reference-neutral/b-spaces.js";
import { contract, mulberry32, round } from "../build/common.js";
import { CATEGORY_NAMES, type Task } from "../types.js";

// ---------- small builders (copied from v1 and adapted: p-ids, per-task grader kind) ----------

function assert(cond: boolean, msg: string): void {
	if (!cond) throw new Error(`neutral2B build: ${msg}`);
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
	checks: CheckSpec2[];
	derivation: Record<string, unknown>;
	witness: unknown;
	invalid: unknown[];
	toolUseful?: boolean;
	/** Grader kind when the category's v1 kind lacks a needed check (see registry2-b.ts). */
	kind?: string;
}

function task(category: number, n: number, t: TaskBody): Task {
	const id = `p${category}-${n}`;
	const grader = { kind: t.kind ?? (KIND[category] as string), params: { checks: t.checks, derivation: t.derivation } };
	const failing = gradeNeutral(grader, t.witness).filter((x) => !x.pass);
	assert(failing.length === 0, `${id} witness fails ${failing.map((x) => x.name).join(", ")}`);
	assert(t.invalid.length >= 2, `${id} needs two invalid answers`);
	assert(new Set(t.invalid.map((x) => JSON.stringify(x))).size === t.invalid.length, `${id} invalid answers repeat`);
	t.invalid.forEach((inv, i) =>
		assert(gradeNeutral(grader, inv).some((x) => !x.pass), `${id} invalid[${i}] passes every check`),
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

const c = (name: string, path: PathSeg[], e: Expect2): CheckSpec2 => ({ name, path, e });
const byId = (id: string): PathSeg => ({ by: "id", eq: id });
const hexE = (v: string, tol: number): Expect2 => ({ k: "hex", v, tol });
const eqE = (v: string | number | boolean): Expect2 => ({ k: "eq", v });
const numE = (v: number, tol: number): Expect2 => ({ k: "num", v, tol });
const oneOfE = (v: string[]): Expect2 => ({ k: "oneOf", v });
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

const plainDE = (a: string, b: string) => deltaE2000(rgbToLab(hexToRgb(a)), rgbToLab(hexToRgb(b)));

// ---------- prompt fragments (v2 wording) ----------

const SRGB_DECODE =
	"the IEC 61966-2-1 sRGB curve (c / 12.92 when c ≤ 0.04045, otherwise ((c + 0.055) / 1.055)^2.4)";
const machado = (what: string) =>
	`Simulation model: Machado, Oliveira & Fernandes (2009) at severity 1.0, i.e. the paper's full-strength ${what}. It acts on linear light: scale each 8-bit channel to 0-1, linearize it with ${SRGB_DECODE}, multiply the column vector [R, G, B] by the 3×3 matrix, clip each component into [0, 1], then gamma-encode again with the inverse of that curve.`;
const DE00 =
	"Color difference means CIEDE2000 (kL = kC = kH = 1) between CIE L*a*b* values obtained from sRGB through linear RGB and XYZ with the D65 white (Xn = 0.95047, Yn = 1.00000, Zn = 1.08883), used as they are: no adaptation to a D50 white.";
const ROUND_NOTE = "Rounding the simulated colors to 8-bit before measuring, or not, changes none of the answers here.";
const LAB_D65 =
	'"CIELAB" here is L*a*b* from sRGB via linear RGB and XYZ relative to the D65 white (Xn = 0.95047, Yn = 1, Zn = 1.08883), with no chromatic adaptation (so not the D50 Lab behind CSS lab()).';
const OKLAB = "Oklab is Björn Ottosson's Oklab, computed from linear-light sRGB; Oklch is the same space in polar form (L, C, hue h in degrees).";
const OUT_HEX = "Convert every result back to sRGB, clip any channel outside 0-1, and write it as 8-bit #rrggbb.";
const HUE_ARCS =
	'Hue arcs follow CSS Color 4. Let h1 be the hue of the first color named and h2 that of the second, both in [0, 360). "shorter": if h2 − h1 > 180 add 360 to h1; if h2 − h1 < −180 add 360 to h2. "longer": if 0 < h2 − h1 < 180 add 360 to h1; if −180 < h2 − h1 ≤ 0 add 360 to h2. "increasing": if h2 < h1 add 360 to h2. After this fix-up the hue is interpolated linearly like any other component and the result is taken mod 360.';
const HSL_WHEEL =
	"The wheel is the HSL hue of CSS hsl(): convert the color to HSL, add the offset to the hue (mod 360), leave saturation and lightness exactly as the base has them, convert back and round to 8-bit hex.";
const OKLCH_WHEEL =
	"The wheel is the Oklch hue (Björn Ottosson's Oklab from linear-light sRGB, in polar form L, C, h): add the offset to h, leave L and C as the base has them, convert back to sRGB and round to 8-bit hex. Should a result fall outside the sRGB gamut, lower C (keeping L and h) just until it fits.";
const WCAG =
	"WCAG 2.x contrast ratio: (L_light + 0.05) / (L_dark + 0.05), where each L is the relative luminance 0.2126·R + 0.7152·G + 0.0722·B computed on channels linearized with the sRGB curve (c / 12.92 up to 0.04045, else ((c + 0.055) / 1.055)^2.4).";
const APCA =
	"APCA means APCA-W3 0.0.98G-4g. For each color take the 0-1 channels and compute Y = 0.2126729·R^2.4 + 0.7151522·G^2.4 + 0.0721750·B^2.4 (a plain 2.4 power, no linear toe). If Y < 0.022, replace it with Y + (0.022 − Y)^1.414. If the text and background Y differ by less than 0.0005, Lc = 0. When the background is lighter (Yb > Yt): S = 1.14 × (Yb^0.56 − Yt^0.57), and Lc = 0 if S < 0.1, otherwise S − 0.027. When the text is lighter: S = 1.14 × (Yb^0.65 − Yt^0.62), and Lc = 0 if S > −0.1, otherwise S + 0.027. Multiply by 100. Dark text on a lighter background gives a positive Lc, light text on a darker background a negative one.";

// =====================================================================================
// 305 cvd-simulation
// =====================================================================================

const SIM_TOL = 3;
const SIM_TOL_NOTE = `±${SIM_TOL} per 8-bit channel: output rounding (±0.5), the matrices circulating at 4 or 6 decimals, and clipping before or after re-encoding together move a channel by < 1.5`;
const DE_TOL = 1.0;

function cat305(): Task[] {
	const tasks: Task[] = [];

	// p305-1: transit-map line colors as a tritanope sees them.
	{
		const lines: [string, string][] = [
			["harbour", "#0086b3"],
			["airport", "#9b26b6"],
			["riverside", "#43b02a"],
			["university", "#ffb81c"],
			["circle", "#e05206"],
			["express", "#5d6770"],
		];
		const k: Cvd = "tritanopia";
		const sim = lines.map(([id, h]) => ({ id, hex: simulateHex(h, k) }));
		const encoded = lines.map(([id, h]) => ({ id, hex: simulateEncodedWrong(h, k) }));
		const deutan = lines.map(([id, h]) => ({ id, hex: simulateHex(h, "deuteranopia") }));
		const worstEnc = Math.max(...encoded.map((w, i) => hexChannelDiff(w.hex, sim[i]?.hex as string)));
		assert(worstEnc >= SIM_TOL + 5, "p305-1 gamma-encoded variant must be distinguishable");
		tasks.push(
			task(305, 1, {
				prompt: `A rider wrote in to say that two of our metro lines look identical to her; she has tritanopia (blue-yellow dichromacy). Before we redraw the map I'd like to see every line color the way she sees it.

${machado("tritanopia matrix")}

Line colors:
${lines.map(([id, h]) => `- ${id} line: ${h}`).join("\n")}

For each line give the simulated color as 8-bit hex, keyed by the line name as written above (without the word "line").
${contract(`{"lines": [{"id": "harbour", "hex": "#rrggbb"}, ...one entry per line]}`)}`,
				schema: obj({ lines: arr(obj({ id: STR, hex: HEX })) }),
				checks: sim.map((s) => c(`tritan-${s.id}`, ["lines", byId(s.id), "hex"], hexE(s.hex, SIM_TOL))),
				derivation: {
					model: "Machado 2009 tritanopia, severity 1.0, linear sRGB, clip then encode",
					tolerance: `${SIM_TOL_NOTE}; the matrix applied to gamma-encoded values misses by up to ${worstEnc}`,
				},
				witness: { lines: sim },
				invalid: [{ lines: encoded }, { lines: deutan }, { lines: lines.map(([id, hex]) => ({ id, hex })) }],
			}),
		);
	}

	// p305-2: every pair of a six-color categorical palette that collapses under protanopia.
	{
		const T = 10;
		const pal: [string, string][] = [
			["blue", "#4e79a7"],
			["orange", "#f28e2b"],
			["red", "#e15759"],
			["green", "#59a14f"],
			["brown", "#9c755f"],
			["purple", "#b07aa1"],
		];
		const k: Cvd = "protanopia";
		const all: { a: string; b: string; d: [number, number]; plain: number; deut: number }[] = [];
		for (let i = 0; i < pal.length; i++)
			for (let j = i + 1; j < pal.length; j++) {
				const [a, ha] = pal[i] as [string, string];
				const [b, hb] = pal[j] as [string, string];
				const d = cvdDeltaEBoth(ha, hb, k);
				assert(Math.max(...d) <= 0.85 * T || Math.min(...d) >= 1.15 * T, `p305-2 ${a}-${b} within 15% of ${T}`);
				all.push({ a, b, d, plain: plainDE(ha, hb), deut: cvdDeltaEBoth(ha, hb, "deuteranopia")[0] });
			}
		const below = all.filter((p) => p.d[0] < T);
		assert(below.length >= 2 && below.length <= all.length - 5, "p305-2 needs a few confusable pairs");
		const asPairs = (xs: typeof all) => xs.map((p) => [p.a, p.b]);
		const deutSet = all.filter((p) => p.deut < T);
		const plainSet = all.filter((p) => p.plain < T);
		assert(asPairs(deutSet).join() !== asPairs(below).join(), "p305-2 deuteranopia reading must differ");
		tasks.push(
			task(305, 2, {
				kind: "neutral-cvd-pair-set",
				prompt: `Our charting theme has six categorical series colors. A colleague with protanopia says some of them blur together, and I want the complete list of offending pairs so we can fix all of them at once. Treat two series colors as confusable when the difference between their protanopia-simulated versions is below ${T}. Check all 15 pairs.

${machado("protanopia matrix")}
${DE00} ${ROUND_NOTE}

Series colors:
${pal.map(([id, h]) => `- ${id}: ${h}`).join("\n")}

List every confusable pair by the two color names (either order). Leave out pairs that are not confusable; if none are, give an empty list.
${contract(`{"confusablePairs": [["<name>", "<name>"], ...]}`)}`,
				schema: obj({ confusablePairs: arr(arr(STR, 2)) }),
				checks: all.map((p) =>
					c(`${p.d[0] < T ? "confusable" : "distinct"}-${p.a}-${p.b}`, ["confusablePairs"], {
						k: "pair",
						v: [p.a, p.b],
						want: p.d[0] < T,
					}),
				),
				derivation: {
					deficiency: k,
					threshold: T,
					margin: "every pair at least 15% from the threshold, with and without 8-bit rounding of the simulated colors",
					deltaE: Object.fromEntries(all.map((p) => [`${p.a}-${p.b}`, r2(p.d[0])])),
				},
				witness: { confusablePairs: asPairs(below) },
				invalid: [
					{ confusablePairs: asPairs(deutSet) },
					{ confusablePairs: asPairs(plainSet) },
					{ confusablePairs: asPairs(below).slice(1) },
				],
			}),
		);
	}

	// p305-3: one pair at a time, the difference under each of the three dichromacies, and the worst.
	{
		const pairs: [string, string, string][] = [
			["confirm-vs-cancel", "#2f9e44", "#e03131"],
			["ripe-vs-unripe", "#fab005", "#82c91e"],
			["focus-vs-meeting", "#12b886", "#4c6ef5"],
		];
		const rows = pairs.map(([id, a, b]) => {
			const both = CVDS.map((k) => cvdDeltaEBoth(a, b, k));
			both.forEach((d, i) => assert(Math.abs(d[0] - d[1]) < 0.5, `p305-3 ${id} ${CVDS[i]} rounding sensitivity`));
			const hi = both.map((d) => Math.max(...d));
			const lo = both.map((d) => Math.min(...d));
			const w = hi.indexOf(Math.min(...hi));
			const others = lo.filter((_, i) => i !== w);
			assert(Math.min(...others) >= 1.15 * (hi[w] as number) && Math.min(...others) - (hi[w] as number) >= 1, `p305-3 ${id} worst margin`);
			const enc = CVDS.map((k) => plainDE(simulateEncodedWrong(a, k), simulateEncodedWrong(b, k)));
			const best = both.map((d) => d[0]).indexOf(Math.max(...both.map((d) => d[0])));
			return { id, de: both.map((d) => r1(d[0])), worst: CVDS[w] as Cvd, best: CVDS[best] as Cvd, enc: enc.map(r1), plain: r1(plainDE(a, b)) };
		});
		assert(new Set(rows.map((r) => r.worst)).size === 3, "p305-3 each pair should have a different worst deficiency");
		assert(
			rows.some((r) => r.enc.some((v, i) => Math.abs(v - (r.de[i] as number)) > DE_TOL + 0.5)),
			"p305-3 gamma-encoded simulation must be distinguishable",
		);
		const row = (r: (typeof rows)[number], de: number[], worst: string) => ({
			id: r.id,
			protanopia: de[0],
			deuteranopia: de[1],
			tritanopia: de[2],
			worst,
		});
		tasks.push(
			task(305, 3, {
				prompt: `Three color pairs in our product carry meaning on their own: the confirm and cancel buttons of the self-checkout kiosk, the ripe and unripe badges in the grocery app, and the "focus time" and "meeting" blocks in the calendar. For each pair, how far apart do the two colors stay for someone with protanopia, with deuteranopia and with tritanopia? And under which of the three is the pair weakest (smallest difference)?

${machado("matrix for each of protanopia, deuteranopia and tritanopia")} Simulate both colors of a pair with the same matrix.
${DE00} ${ROUND_NOTE}

Pairs:
${pairs.map(([id, a, b]) => `- ${id}: ${a} and ${b}`).join("\n")}

Give the three differences (one decimal is enough) and name the weakest deficiency with one of the words protanopia, deuteranopia, tritanopia.
${contract(`{"results": [{"id": "confirm-vs-cancel", "protanopia": <number>, "deuteranopia": <number>, "tritanopia": <number>, "worst": "<deficiency>"}, ...one entry per pair]}`)}`,
				schema: obj({
					results: arr(
						obj({ id: STR, protanopia: NUM, deuteranopia: NUM, tritanopia: NUM, worst: { type: "string", enum: [...CVDS] } }),
					),
				}),
				checks: rows.flatMap((r) => [
					...CVDS.map((k, i) => c(`${k}-${r.id}`, ["results", byId(r.id), k], numE(r.de[i] as number, DE_TOL))),
					c(`worst-${r.id}`, ["results", byId(r.id), "worst"], oneOfE([r.worst])),
				]),
				derivation: {
					tolerance: `±${DE_TOL} ΔE00: 8-bit rounding of the simulated colors moves each value by < 0.5 here; D65 white variants by ~0.02`,
					margin: "the weakest deficiency is at least 15% and 1.0 ΔE00 below the other two, with and without rounding",
					rows,
				},
				witness: { results: rows.map((r) => row(r, r.de, r.worst)) },
				invalid: [
					{ results: rows.map((r) => row(r, r.enc, CVDS[r.enc.indexOf(Math.min(...r.enc))] as string)) },
					{ results: rows.map((r) => row(r, r.de, r.best)) },
					{ results: rows.map((r) => row(r, [r.plain, r.plain, r.plain], r.worst)) },
				],
			}),
		);
	}

	// p305-4: rank candidate annotation colors by how distinct they stay from the on-track green under protanopia.
	{
		const ref = "#2b8a3e";
		const cands = ["#ec5f13", "#c2255c", "#f08c00", "#7048e8", "#1098ad", "#868e96"];
		const k: Cvd = "protanopia";
		const d = cands.map((s) => ({ s, both: cvdDeltaEBoth(ref, s, k) }));
		const order = [...d].sort((x, y) => y.both[0] - x.both[0]);
		for (let i = 0; i < order.length - 1; i++) {
			const a = order[i] as (typeof order)[number];
			const b = order[i + 1] as (typeof order)[number];
			assert(Math.min(...a.both) - Math.max(...b.both) >= 1.0, `p305-4 gap < 1.0 between ${a.s} and ${b.s}`);
		}
		const want = order.map((o) => o.s);
		const plain = [...cands].sort((x, y) => plainDE(ref, y) - plainDE(ref, x));
		const deut = [...cands].sort((x, y) => cvdDeltaEBoth(ref, y, "deuteranopia")[0] - cvdDeltaEBoth(ref, x, "deuteranopia")[0]);
		assert(plain[0] !== want[0] && plain[5] !== want[5], "p305-4 both ends must depend on the simulation");
		assert(deut[5] !== want[5], "p305-4 the deuteranopia reading must miss the closest candidate");
		tasks.push(
			task(305, 4, {
				prompt: `Project-tracking chart: the "on track" series is drawn in forest green ${ref}, and we need a second color for "needs attention" annotations that a viewer with protanopia can still tell apart from that green. Rank the candidates below from the one that stays most distinct from the green under protanopia to the one that ends up closest to it.

${machado("protanopia matrix")} Simulate the green and each candidate.
${DE00} ${ROUND_NOTE}

Candidates: ${cands.join(", ")}

List all six candidates as hex, most distinct first.
${contract(`{"ranking": ["#rrggbb", "#rrggbb", "#rrggbb", "#rrggbb", "#rrggbb", "#rrggbb"]}`)}`,
				schema: obj({ ranking: arr(HEX, 6) }),
				checks: [
					c("most-distinct", ["ranking", 0], eqE(want[0] as string)),
					c("least-distinct", ["ranking", 5], eqE(want[5] as string)),
					c("full-ranking", ["ranking"], { k: "seq", v: want }),
				],
				derivation: {
					deficiency: k,
					deltaE: Object.fromEntries(order.map((o) => [o.s, r2(o.both[0])])),
					margin: "adjacent ranks at least 1.0 ΔE00 apart with and without 8-bit rounding",
					wrong: { normalVision: plain, deuteranopia: deut },
				},
				witness: { ranking: want },
				invalid: [{ ranking: plain }, { ranking: deut }, { ranking: [...want].reverse() }],
			}),
		);
	}

	// p305-5: the route color that stays most distinct from lake blue in the worst case over all three dichromacies.
	{
		const water = "#74c0fc";
		const cands = ["#ff6b6b", "#ffd43b", "#e64980", "#40c057", "#fd7e14", "#7950f2", "#be4bdb"];
		const rows = cands.map((h) => {
			const both = CVDS.map((k) => cvdDeltaEBoth(water, h, k));
			return {
				h,
				worst: Math.min(...both.map((d) => d[0])),
				worstHi: Math.min(...both.map((d) => Math.max(...d))),
				worstLo: Math.min(...both.map((d) => Math.min(...d))),
				per: both.map((d) => d[0]),
			};
		});
		const byWorst = [...rows].sort((a, b) => b.worst - a.worst);
		const best = byWorst[0] as (typeof rows)[number];
		const second = byWorst[1] as (typeof rows)[number];
		const weakest = byWorst[byWorst.length - 1] as (typeof rows)[number];
		const weak2 = byWorst[byWorst.length - 2] as (typeof rows)[number];
		assert(best.worstLo >= 1.15 * second.worstHi, "p305-5 best margin < 15%");
		assert(weak2.worstLo >= 1.15 * weakest.worstHi, "p305-5 weakest margin < 15%");
		assert(best.worstHi - best.worstLo < 0.5, "p305-5 rounding sensitivity");
		const plainBest = [...cands].sort((a, b) => plainDE(water, b) - plainDE(water, a))[0] as string;
		const tritBest = [...rows].sort((a, b) => (b.per[2] as number) - (a.per[2] as number))[0] as (typeof rows)[number];
		assert(plainBest !== best.h && tritBest.h !== best.h, "p305-5 the pick must depend on the worst-case rule");
		tasks.push(
			task(305, 5, {
				prompt: `Hiking map: lakes are filled with ${water}, and the highlighted route crosses several of them. I want the route color that stays most distinguishable from the lake blue for every common kind of dichromacy. For a candidate, take its CIEDE2000 difference from the lake blue under protanopia, under deuteranopia and under tritanopia (both colors simulated each time) and keep the smallest of the three: its worst case. The best route color is the one whose worst case is largest.

${machado("matrix for each of protanopia, deuteranopia and tritanopia")}
${DE00} ${ROUND_NOTE}

Candidates: ${cands.join(", ")}

Give the best candidate, its worst-case difference (one decimal is enough), and the candidate whose worst case is smallest.
${contract(`{"best": "#rrggbb", "bestWorstCase": <number>, "weakest": "#rrggbb"}`)}`,
				schema: obj({ best: HEX, bestWorstCase: NUM, weakest: HEX }),
				checks: [
					c("best", ["best"], eqE(best.h)),
					c("best-worst-case", ["bestWorstCase"], numE(r1(best.worst), DE_TOL)),
					c("weakest", ["weakest"], eqE(weakest.h)),
				],
				derivation: {
					rule: "maximize the minimum over protanopia, deuteranopia, tritanopia of ΔE00(water, candidate) after simulation",
					margin: "best and weakest each at least 15% clear of the runner-up, with and without 8-bit rounding",
					tolerance: `worst-case value ±${DE_TOL} ΔE00 (rounding moves it by < 0.5)`,
					table: Object.fromEntries(rows.map((r) => [r.h, Object.fromEntries(CVDS.map((k, i) => [k, r2(r.per[i] as number)]))])),
				},
				witness: { best: best.h, bestWorstCase: r1(best.worst), weakest: weakest.h },
				invalid: [
					{ best: plainBest, bestWorstCase: r1(plainDE(water, plainBest)), weakest: weakest.h },
					{ best: tritBest.h, bestWorstCase: r1(tritBest.worst), weakest: weakest.h },
					{ best: best.h, bestWorstCase: r1(best.worst), weakest: weak2.h },
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
const INTERP_TOL_NOTE = `±${INTERP_TOL} per 8-bit channel: output rounding plus matrix variants (Oklab: Ottosson's published vs CSS Color 4's recomputed; Lab: D65 white to 4 or 5 decimals), which move results by < 0.5/255`;

/** Asserts the stated-space result is in gamut (so clipping vs gamut mapping is moot) and returns its hex. */
function inGamutHex(rgb: Rgb, where: string): string {
	assert(gamutExcess(rgb) < 0.002, `${where} leaves sRGB (${gamutExcess(rgb)})`);
	return hexOf(rgb);
}

/** The worst channel distance of a wrong-variant answer list from the witness must clear the tolerance. */
function distinct(witness: string[], wrong: string[], where: string): number {
	const worst = Math.max(...witness.map((w, i) => hexChannelDiff(w, wrong[i] as string)));
	assert(worst >= INTERP_TOL + 3, `${where} wrong variant too close (${worst})`);
	return worst;
}

function cat306(): Task[] {
	const tasks: Task[] = [];
	const hexes = (rs: Rgb[]) => rs.map(hexOf);

	// p306-1: five stops blended in linear light for a glow.
	{
		const a = "#ffd60a";
		const b = "#3a0ca3";
		const want = stops(a, b, 5, "srgb-linear").map((s, i) => inGamutHex(s, `p306-1 stop ${i}`));
		const gamma = hexes(stops(a, b, 5, "srgb"));
		const oklab = hexes(stops(a, b, 5, "oklab"));
		distinct(want, gamma, "p306-1 gamma sRGB");
		distinct(want, oklab, "p306-1 oklab");
		tasks.push(
			task(306, 1, {
				prompt: `Our 3D team's rule is that light blends happen in linear light, and I'm matching a 2D splash screen to their renders: a glow that fades from sun yellow ${a} into violet ${b}. I need the five swatches of that blend, both ends included (first = ${a}, last = ${b}), evenly spaced.

Blend in linear-light sRGB: decode each channel of both colors with ${SRGB_DECODE}, interpolate the three linear values at progress 0, 0.25, 0.5, 0.75 and 1, then encode back with the inverse curve. ${OUT_HEX}
${contract(`{"swatches": ["#rrggbb", "#rrggbb", "#rrggbb", "#rrggbb", "#rrggbb"]}`)}`,
				schema: obj({ swatches: arr(HEX, 5) }),
				checks: want.map((h, i) => c(`swatch-${i + 1}`, ["swatches", i], hexE(h, INTERP_TOL))),
				derivation: {
					space: "srgb-linear",
					tolerance: `±${INTERP_TOL} per channel: linear-light mixing is exact up to output rounding and curve constants`,
					wrong: { gammaSrgb: gamma, oklab },
				},
				witness: { swatches: want },
				invalid: [{ swatches: gamma }, { swatches: oklab }],
			}),
		);
	}

	// p306-2: three state colors defined as weighted mixes, each in its own space and hue rule.
	{
		const mixes: { id: string; a: string; pa: number; b: string; space: Space; rule?: HueRule; text: string }[] = [
			{ id: "pressed", a: "#1971c2", pa: 75, b: "#000000", space: "oklab", text: "Oklab (mix L, a and b)" },
			{
				id: "accent",
				a: "#2f9e44",
				pa: 40,
				b: "#f03e3e",
				space: "oklch",
				rule: "increasing",
				text: 'Oklch with the "increasing" hue arc (mix L, C and h)',
			},
			{
				id: "hover-warm",
				a: "#e64980",
				pa: 35,
				b: "#fab005",
				space: "hsl",
				rule: "shorter",
				text: 'HSL (the CSS hsl() model) with the "shorter" hue arc (mix H, S and L)',
			},
		];
		const at = (m: (typeof mixes)[number], t: number, space: Space, rule?: HueRule) => hexOf(interpolateHex(m.a, m.b, t, space, rule));
		const want = mixes.map((m) => ({
			id: m.id,
			hex: inGamutHex(interpolateHex(m.a, m.b, 1 - m.pa / 100, m.space, m.rule), `p306-2 ${m.id}`),
		}));
		const swapped = mixes.map((m) => ({ id: m.id, hex: at(m, m.pa / 100, m.space, m.rule) }));
		const gamma = mixes.map((m) => ({ id: m.id, hex: at(m, 1 - m.pa / 100, "srgb") }));
		const wrongArc = mixes.map((m) => ({
			id: m.id,
			hex: at(m, 1 - m.pa / 100, m.space, m.space === "oklch" ? "shorter" : m.space === "hsl" ? "longer" : undefined),
		}));
		mixes.forEach((m, i) => {
			const w = want[i]?.hex as string;
			assert(hexChannelDiff(gamma[i]?.hex as string, w) >= INTERP_TOL + 5, `p306-2 ${m.id} must separate gamma sRGB`);
			assert(hexChannelDiff(swapped[i]?.hex as string, w) >= INTERP_TOL + 5, `p306-2 ${m.id} must separate swapped weights`);
			if (m.rule) assert(hexChannelDiff(wrongArc[i]?.hex as string, w) >= 40, `p306-2 ${m.id} hue arc must matter`);
		});
		tasks.push(
			task(306, 2, {
				prompt: `Our design tokens define three state colors as mixes, and the native apps need them as flat hex values. "P% of A with Q% of B" means: express both colors in the stated space, then every component of the result is (P/100) × A's component + (Q/100) × B's component; A is always the first color named. No transparency is involved.

- pressed: 75% of #1971c2 with 25% of #000000, in ${mixes[0]?.text}.
- accent: 40% of #2f9e44 with 60% of #f03e3e, in ${mixes[1]?.text}.
- hover-warm: 35% of #e64980 with 65% of #fab005, in ${mixes[2]?.text}.

${OKLAB} ${HUE_ARCS} ${OUT_HEX}
${contract(`{"tokens": [{"id": "pressed", "hex": "#rrggbb"}, {"id": "accent", "hex": "#rrggbb"}, {"id": "hover-warm", "hex": "#rrggbb"}]}`)}`,
				schema: obj({ tokens: arr(obj({ id: STR, hex: HEX })) }),
				checks: want.map((w) => c(`token-${w.id}`, ["tokens", byId(w.id), "hex"], hexE(w.hex, INTERP_TOL))),
				derivation: {
					spaces: Object.fromEntries(mixes.map((m) => [m.id, `${m.space}${m.rule ? ` ${m.rule}` : ""}`])),
					tolerance: INTERP_TOL_NOTE,
					gamut: "every mix is inside sRGB, so clipping vs gamut mapping does not matter",
					wrong: { swapped, gamma, wrongArc },
				},
				witness: { tokens: want },
				invalid: [{ tokens: swapped }, { tokens: gamma }, { tokens: wrongArc }],
			}),
		);
	}

	// p306-3: a three-stop Oklab gradient whose middle stop sits at 70%, sampled at four positions.
	{
		const g = [
			{ color: "#14213d", pos: 0 },
			{ color: "#e76f51", pos: 0.7 },
			{ color: "#fefae0", pos: 1 },
		];
		const at = [20, 50, 80, 90];
		const want = at.map((p) => inGamutHex(sampleGradient(g, p / 100, "oklab"), `p306-3 ${p}`));
		const midpoint = at.map((p) => hexOf(sampleGradient([g[0]!, { ...g[1]!, pos: 0.5 }, g[2]!], p / 100, "oklab")));
		const gamma = at.map((p) => hexOf(sampleGradient(g, p / 100, "srgb")));
		const lab = at.map((p) => hexOf(sampleGradient(g, p / 100, "lab")));
		distinct(want, midpoint, "p306-3 midpoint");
		distinct(want, gamma, "p306-3 gamma");
		distinct(want, lab, "p306-3 lab");
		tasks.push(
			task(306, 3, {
				prompt: `Poster background, a vertical "dusk" gradient with three stops: ink navy ${g[0]?.color} at 0%, terracotta ${g[1]?.color} at 70% and cream ${g[2]?.color} at 100%. It is interpolated in Oklab. A point at position p between two neighbouring stops at s0 and s1 takes the color at progress (p − s0) / (s1 − s0) between those two stop colors, with L, a and b each interpolated linearly.

${OKLAB} ${OUT_HEX}

The printer wants spot checks: what colors does the poster show at 20%, 50%, 80% and 90% of its height?
${contract(`{"samples": [{"at": 20, "hex": "#rrggbb"}, {"at": 50, "hex": "#rrggbb"}, {"at": 80, "hex": "#rrggbb"}, {"at": 90, "hex": "#rrggbb"}]}`)}`,
				schema: obj({ samples: arr(obj({ at: NUM, hex: HEX }), 4) }),
				checks: at.map((p, i) => c(`at-${p}`, ["samples", { by: "at", eq: p }, "hex"], hexE(want[i] as string, INTERP_TOL))),
				derivation: {
					space: "oklab",
					tolerance: INTERP_TOL_NOTE,
					wrong: { middleStopAt50: midpoint, gammaSrgb: gamma, lab },
				},
				witness: { samples: at.map((p, i) => ({ at: p, hex: want[i] })) },
				invalid: [
					{ samples: at.map((p, i) => ({ at: p, hex: midpoint[i] })) },
					{ samples: at.map((p, i) => ({ at: p, hex: gamma[i] })) },
				],
			}),
		);
	}

	// p306-4: an HSL pair about 208 degrees apart, both hue arcs side by side.
	{
		const a = "#c92a2a";
		const b = "#1c7ed6";
		const [ha] = hslOfHex(a);
		const [hb] = hslOfHex(b);
		assert(hb - ha > 195 && hb - ha < 215, "p306-4 HSL hues should be ~200 apart");
		const longer = stops(a, b, 5, "hsl", "longer").map((s, i) => inGamutHex(s, `p306-4 longer ${i}`));
		const shorter = stops(a, b, 5, "hsl", "shorter").map((s, i) => inGamutHex(s, `p306-4 shorter ${i}`));
		const okLonger = hexes(stops(a, b, 5, "oklch", "longer"));
		const okShorter = hexes(stops(a, b, 5, "oklch", "shorter"));
		distinct(longer, shorter, "p306-4 arcs");
		distinct(longer, okLonger, "p306-4 oklch longer");
		distinct(shorter, okShorter, "p306-4 oklch shorter");
		tasks.push(
			task(306, 4, {
				prompt: `Two candidate rainbow bars for a progress meter, both running from brick red ${a} to azure ${b} and interpolated in HSL (the CSS hsl() model; H, S and L each interpolated linearly after the hue fix-up). Version one uses the "longer" hue arc, version two the "shorter" one. I need five evenly spaced swatches of each, both endpoints included.

${HUE_ARCS} The first color named (${a}) is the start. ${OUT_HEX}
${contract(`{"longer": ["#rrggbb", "#rrggbb", "#rrggbb", "#rrggbb", "#rrggbb"], "shorter": ["#rrggbb", "#rrggbb", "#rrggbb", "#rrggbb", "#rrggbb"]}`)}`,
				schema: obj({ longer: arr(HEX, 5), shorter: arr(HEX, 5) }),
				checks: [
					...longer.map((h, i) => c(`longer-${i + 1}`, ["longer", i], hexE(h, INTERP_TOL))),
					...shorter.map((h, i) => c(`shorter-${i + 1}`, ["shorter", i], hexE(h, INTERP_TOL))),
				],
				derivation: {
					space: "hsl",
					hues: { start: r2(ha), end: r2(hb) },
					tolerance: `±${INTERP_TOL} per channel; HSL is exact up to output rounding`,
					wrong: { okLonger, okShorter },
				},
				witness: { longer, shorter },
				invalid: [{ longer: shorter, shorter: longer }, { longer: okLonger, shorter: okShorter }],
			}),
		);
	}

	// p306-5: the 50% point of one pair in five spaces side by side.
	{
		const a = "#0f4c5c";
		const b = "#fb8b24";
		const spaces: [string, Space, string][] = [
			["srgb", "srgb", "gamma-encoded sRGB (average the 0-255 channel values as they are)"],
			["linear", "srgb-linear", "linear-light sRGB (decode with the sRGB curve, average, re-encode)"],
			["lab", "lab", "CIELAB (average L*, a*, b*)"],
			["oklab", "oklab", "Oklab (average L, a, b)"],
			["oklch", "oklch", 'Oklch (average L and C; the hue with the "shorter" arc)'],
		];
		const want = spaces.map(([id, sp]) => ({ id, hex: inGamutHex(interpolateHex(a, b, 0.5, sp, "shorter"), `p306-5 ${id}`) }));
		for (let i = 0; i < want.length; i++)
			for (let j = i + 1; j < want.length; j++)
				assert(
					hexChannelDiff(want[i]?.hex as string, want[j]?.hex as string) >= INTERP_TOL + 3,
					`p306-5 ${want[i]?.id} and ${want[j]?.id} midpoints too close`,
				);
		const asObj = (xs: { id: string; hex: string }[]) => Object.fromEntries(xs.map((x) => [x.id, x.hex]));
		const allGamma = want.map((w) => ({ id: w.id, hex: want[0]?.hex as string }));
		const labOklabSwapped = want.map((w) =>
			w.id === "lab" ? { id: w.id, hex: want[3]?.hex as string } : w.id === "oklab" ? { id: w.id, hex: want[2]?.hex as string } : w,
		);
		const longerHue = want.map((w) => (w.id === "oklch" ? { id: w.id, hex: hexOf(interpolateHex(a, b, 0.5, "oklch", "longer")) } : w));
		tasks.push(
			task(306, 5, {
				prompt: `I'm writing an internal explainer on why "the middle of a gradient" depends on the color space. The example pair is deep teal ${a} and tangerine ${b}. For each space below, give the color exactly halfway between them (each component the average of the two colors' components in that space):

${spaces.map(([id, , text]) => `- ${id}: ${text}`).join("\n")}

${LAB_D65} ${OKLAB} ${HUE_ARCS} ${OUT_HEX}
${contract(`{${spaces.map(([id]) => `"${id}": "#rrggbb"`).join(", ")}}`)}`,
				schema: obj(Object.fromEntries(spaces.map(([id]) => [id, HEX]))),
				checks: want.map((w) => c(`midpoint-${w.id}`, [w.id], hexE(w.hex, INTERP_TOL))),
				derivation: {
					tolerance: `${INTERP_TOL_NOTE}; the D50-adapted Lab reading of the lab midpoint is checked to land within tolerance`,
					margin: `every two spaces' midpoints differ by at least ${INTERP_TOL + 3} on some channel`,
				},
				witness: asObj(want),
				invalid: [asObj(allGamma), asObj(labOklabSwapped), asObj(longerHue)],
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
function hslChecks(prefix: string, path: PathSeg[], h: number, s: number, l: number, witnessHex: string): CheckSpec2[] {
	const rgb = hexToRgb(witnessHex);
	assert(Math.max(...rgb) - Math.min(...rgb) >= 0.25, `${prefix} too little chroma for a ±${HUE_TOL}° hue check`);
	return [
		c(`${prefix}-hue`, path, { k: "coord", space: "hsl", i: 0, v: r2(((h % 360) + 360) % 360), tol: HUE_TOL }),
		c(`${prefix}-saturation`, path, { k: "coord", space: "hsl", i: 1, v: r2(s * 100), tol: HSL_S_TOL }),
		c(`${prefix}-lightness`, path, { k: "coord", space: "hsl", i: 2, v: r2(l * 100), tol: HSL_L_TOL }),
	];
}

function oklchChecks(prefix: string, path: PathSeg[], L: number, C: number, H: number): CheckSpec2[] {
	assert(C >= 0.08, `${prefix} chroma too low for a ±${HUE_TOL}° hue check`);
	return [
		c(`${prefix}-hue`, path, { k: "coord", space: "oklch", i: 2, v: r2(((H % 360) + 360) % 360), tol: HUE_TOL }),
		c(`${prefix}-L`, path, { k: "coord", space: "oklch", i: 0, v: round(L, 4), tol: OK_L_TOL }),
		c(`${prefix}-C`, path, { k: "coord", space: "oklch", i: 1, v: round(C, 4), tol: OK_C_TOL }),
	];
}

const HSL_TOL_NOTE = `hue ±${HUE_TOL}° (8-bit rounding moves HSL hue by < 1° at the chroma used), S ±${HSL_S_TOL} and L ±${HSL_L_TOL} percentage points (rounding moves S by up to ~1.5 points at low L)`;
const OK_TOL_NOTE = `hue ±${HUE_TOL}° at C ≥ 0.08 (rounding moves it by < 2°), L ±${OK_L_TOL} and C ±${OK_C_TOL} (rounding moves them by < 0.004)`;

/** Asserts an Oklch rotation stays in gamut with chroma headroom, so the reduce-chroma rule is not decisive. */
function okRotate(base: string, deg: number, where: string) {
	const r = oklchRotate(base, deg);
	assert(!r.reduced, `${where} leaves sRGB`);
	assert(oklchMaxChroma(r.L, r.H) - r.C >= 0.04, `${where} chroma headroom < 0.04`);
	return r;
}

function cat307(): Task[] {
	const tasks: Task[] = [];

	// p307-1: an Oklch square scheme around a clay brown.
	{
		const base = "#b17c4c";
		const [L, C, H] = oklchOfHex(base);
		const offs = [90, 180, 270];
		const rs = offs.map((d) => okRotate(base, d, `p307-1 +${d}`));
		const hslWheel = offs.map((d) => hslRotateHex(base, d));
		assert(
			hslWheel.some((x, i) => hueDist(oklchOfHex(x)[2], H + (offs[i] as number)) >= HUE_TOL + 5),
			"p307-1 HSL wheel must miss the Oklch hue",
		);
		tasks.push(
			task(307, 1, {
				prompt: `Infographic for a pottery studio: the base color is the clay brown ${base}, and I want three more category colors that form a square with it on a perceptually even wheel, so all four feel equally strong. A square scheme sits at +90°, +180° and +270° from the base. ${OKLCH_WHEEL}

List the three new colors in the order +90°, +180°, +270°.
${contract(`{"square": ["#rrggbb", "#rrggbb", "#rrggbb"]}`)}`,
				schema: obj({ square: arr(HEX, 3) }),
				checks: rs.flatMap((r, i) => oklchChecks(`plus${offs[i]}`, ["square", i], L, C, r.H)),
				derivation: {
					wheel: "oklch",
					base: { L: round(L, 4), C: round(C, 4), H: r2(H) },
					gamut: "all three rotations are inside sRGB with ≥ 0.04 chroma headroom, so the reduce-chroma rule never applies",
					tolerance: OK_TOL_NOTE,
					hslWheelAnswer: hslWheel,
				},
				witness: { square: rs.map((r) => r.hex) },
				invalid: [{ square: hslWheel }, { square: rs.map((r) => r.hex).reverse() }],
			}),
		);
	}

	// p307-2: HSL complements of four brand colors (RGB inversion is the trap).
	{
		const bases: [string, string][] = [
			["harbor-blue", "#1e6091"],
			["violet", "#9d4edd"],
			["wine", "#7a1f3d"],
			["apricot", "#f4a259"],
		];
		const rows = bases.map(([id, hex]) => {
			const [h, s, l] = hslOfHex(hex);
			return { id, hex, h, s, l, comp: hslRotateHex(hex, 180) };
		});
		const inverted = rows.map((r) => ({ id: r.id, hex: `#${(0xffffff - Number.parseInt(r.hex.slice(1), 16)).toString(16).padStart(6, "0")}` }));
		const okComp = rows.map((r) => ({ id: r.id, hex: oklchRotate(r.hex, 180).hex }));
		assert(
			okComp.filter((x, i) => hueDist(hslOfHex(x.hex)[0], (rows[i]?.h as number) + 180) >= HUE_TOL + 5).length >= 2,
			"p307-2 Oklch complements must miss the HSL hue for at least two bases",
		);
		tasks.push(
			task(307, 2, {
				prompt: `Each of our four sub-brands needs a complementary accent for its campaign artwork. Complementary here means +180° on the classic color wheel. ${HSL_WHEEL}

Sub-brand colors:
${bases.map(([id, hex]) => `- ${id}: ${hex}`).join("\n")}

Give each accent keyed by the sub-brand id.
${contract(`{"accents": [{"id": "harbor-blue", "hex": "#rrggbb"}, ...one entry per sub-brand]}`)}`,
				schema: obj({ accents: arr(obj({ id: STR, hex: HEX })) }),
				checks: rows.flatMap((r) => hslChecks(r.id, ["accents", byId(r.id), "hex"], r.h + 180, r.s, r.l, r.comp)),
				derivation: {
					wheel: "hsl",
					bases: Object.fromEntries(rows.map((r) => [r.id, { h: r2(r.h), s: r2(r.s * 100), l: r2(r.l * 100) }])),
					tolerance: HSL_TOL_NOTE,
					wrong: { rgbInversion: inverted, oklchWheel: okComp },
				},
				witness: { accents: rows.map((r) => ({ id: r.id, hex: r.comp })) },
				invalid: [{ accents: inverted }, { accents: okComp }],
			}),
		);
	}

	// p307-3: name the scheme of each swatch set on the Oklch wheel, with "none" as an option.
	{
		const TOL = 5;
		const OFFS: Record<Scheme, number[]> = {
			complementary: [0, 180],
			"split-complementary": [0, 150, 210],
			triadic: [0, 120, 240],
			tetradic: [0, 60, 180, 240],
			square: [0, 90, 180, 270],
			analogous: [0, 30, 330],
		};
		// [id, scheme or none, hue offsets, base hue, per-swatch L, per-swatch C]
		const defs: [string, Scheme | "none", number[], number, number[], number[]][] = [
			["set-a", "triadic", OFFS.triadic, 15, [0.62, 0.72, 0.55], [0.11, 0.09, 0.12]],
			["set-b", "square", OFFS.square, 120, [0.62, 0.72, 0.55, 0.68], [0.11, 0.09, 0.12, 0.1]],
			["set-c", "none", [0, 100, 215], 250, [0.6, 0.7, 0.66], [0.1, 0.09, 0.1]],
			["set-d", "tetradic", OFFS.tetradic, 330, [0.62, 0.72, 0.55, 0.68], [0.11, 0.09, 0.12, 0.1]],
			["set-e", "analogous", OFFS.analogous, 170, [0.62, 0.72, 0.55], [0.11, 0.09, 0.12]],
			["set-f", "complementary", OFFS.complementary, 75, [0.62, 0.72], [0.11, 0.09]],
			["set-g", "none", [0, 135], 200, [0.68, 0.7], [0.09, 0.09]],
		];
		const readAs = (hues: number[]): Scheme | "none" => {
			const fits = SCHEMES.filter((s) => schemeError(hues, s) <= TOL);
			return fits.length === 1 ? (fits[0] as Scheme) : "none";
		};
		const sets = defs.map(([id, scheme, offs, base, Ls, Cs], si) => {
			const raw = offs.map((o, i) => {
				const rgb = oklchToRgb({ L: Ls[i] as number, C: Cs[i] as number, H: (base + o) % 360 });
				assert(inGamut(rgb, 0), `p307-3 ${id} swatch ${i} leaves sRGB`);
				return hexOf(rgb);
			});
			const hexes = shuffled(raw, 700 + si);
			const ok = hexes.map((h) => oklchOfHex(h));
			assert(Math.min(...ok.map((x) => x[1])) >= 0.08, `p307-3 ${id} chroma too low for hue reading`);
			const hues = ok.map((x) => x[2]);
			for (const s of SCHEMES) {
				const e = schemeError(hues, s);
				if (s === scheme) assert(e <= 1.5, `p307-3 ${id} does not match ${s} (${e})`);
				else if (e !== Number.POSITIVE_INFINITY) assert(e >= 4 * TOL, `p307-3 ${id} too near ${s} (${e})`);
			}
			const hslReading = readAs(hexes.map((h) => hslOfHex(h)[0]));
			return { id, scheme, hexes, hslReading };
		});
		assert(sets.filter((s) => s.hslReading !== s.scheme).length >= 2, "p307-3 the HSL wheel must misread at least two sets");
		const SYN: Record<Scheme | "none", string[]> = {
			complementary: ["complementary"],
			"split-complementary": ["split-complementary"],
			triadic: ["triadic"],
			tetradic: ["tetradic", "rectangle", "rectangular"],
			square: ["square"],
			analogous: ["analogous"],
			none: ["none"],
		};
		const bySize = (n: number) => (n === 2 ? "complementary" : n === 3 ? "triadic" : "square");
		tasks.push(
			task(307, 3, {
				prompt: `I'm auditing palettes that agencies sent us, and each one claims to follow a color-wheel scheme. Please tell me which scheme each set really forms on the Oklch hue wheel (Björn Ottosson's Oklab from linear-light sRGB, polar form; use the hue angle h only, since lightness and chroma vary on purpose). Swatches are in no particular order and any swatch may be the base. A set forms a scheme when, for some choice of base, every swatch sits within ${TOL}° of one of the scheme's positions (one swatch per position, every position filled). Positions relative to the base:
- complementary: 0°, 180°
- split-complementary: 0°, +150°, +210°
- triadic: 0°, +120°, +240°
- tetradic (rectangle): 0°, +60°, +180°, +240°
- square: 0°, +90°, +180°, +270°
- analogous: 0°, +30°, −30°
If no scheme fits, the answer is "none".

Sets:
${sets.map((s) => `- ${s.id}: ${s.hexes.join(", ")}`).join("\n")}

Answer with one of: complementary, split-complementary, triadic, tetradic, square, analogous, none.
${contract(`{"results": [{"id": "set-a", "scheme": "<scheme or none>"}, ...one entry per set]}`)}`,
				schema: obj({ results: arr(obj({ id: STR, scheme: STR })) }),
				checks: sets.map((s) => c(`scheme-${s.id}`, ["results", byId(s.id), "scheme"], oneOfE(SYN[s.scheme]))),
				derivation: {
					wheel: "oklch",
					tolerance: `${TOL}° per swatch`,
					margin: `the right scheme fits within 1.5°; every other scheme of the same size is ≥ ${4 * TOL}° off; "none" sets are ≥ ${4 * TOL}° from every scheme`,
					truth: Object.fromEntries(sets.map((s) => [s.id, s.scheme])),
					hslWheelReading: Object.fromEntries(sets.map((s) => [s.id, s.hslReading])),
				},
				witness: { results: sets.map((s) => ({ id: s.id, scheme: s.scheme })) },
				invalid: [
					{ results: sets.map((s) => ({ id: s.id, scheme: s.hslReading })) },
					{ results: sets.map((s) => ({ id: s.id, scheme: bySize(s.hexes.length) })) },
				],
			}),
		);
	}

	// p307-4: both triadic partners, first on the HSL wheel, then on the Oklch wheel.
	{
		const base = "#3f7cac";
		const [h, s, l] = hslOfHex(base);
		const [L, C, H] = oklchOfHex(base);
		const offs = [120, 240];
		const hsl = offs.map((d) => hslRotateHex(base, d));
		const ok = offs.map((d) => okRotate(base, d, `p307-4 +${d}`));
		assert(hueDist(oklchOfHex(hsl[0] as string)[2], H + 120) >= HUE_TOL + 5, "p307-4 HSL answer must fail the Oklch hue check");
		assert(hueDist(hslOfHex(ok[0]?.hex as string)[0], h + 120) >= HUE_TOL + 5, "p307-4 Oklch answer must fail the HSL hue check");
		tasks.push(
			task(307, 4, {
				prompt: `Our denim blue ${base} needs two triadic partners (+120° and +240°) for a seasonal palette. The illustrators work on the classic HSL wheel, the product team on a perceptual one, so please do both:

1. HSL wheel. ${HSL_WHEEL}
2. Oklch wheel. ${OKLCH_WHEEL}

In each list give the +120° partner first, then the +240° one.
${contract(`{"hslWheel": ["#rrggbb", "#rrggbb"], "oklchWheel": ["#rrggbb", "#rrggbb"]}`)}`,
				schema: obj({ hslWheel: arr(HEX, 2), oklchWheel: arr(HEX, 2) }),
				checks: [
					...offs.flatMap((d, i) => hslChecks(`hsl-plus${d}`, ["hslWheel", i], h + d, s, l, hsl[i] as string)),
					...offs.flatMap((d, i) => oklchChecks(`oklch-plus${d}`, ["oklchWheel", i], L, C, ok[i]?.H as number)),
				],
				derivation: {
					base: { hsl: { h: r2(h), s: r2(s * 100), l: r2(l * 100) }, oklch: { L: round(L, 4), C: round(C, 4), H: r2(H) } },
					gamut: "both Oklch rotations are inside sRGB with ≥ 0.04 chroma headroom",
					tolerance: { hsl: HSL_TOL_NOTE, oklch: OK_TOL_NOTE },
				},
				witness: { hslWheel: hsl, oklchWheel: ok.map((r) => r.hex) },
				invalid: [
					{ hslWheel: ok.map((r) => r.hex), oklchWheel: hsl },
					{ hslWheel: [...hsl].reverse(), oklchWheel: ok.map((r) => r.hex).reverse() },
				],
			}),
		);
	}

	// p307-5: Oklch lightness steps at constant chroma and hue, plus Oklch analogous accents.
	{
		const base = "#905b93";
		const [L, C, H] = oklchOfHex(base);
		const Ls = [0.35, 0.5, 0.65, 0.8];
		const steps = Ls.map((x) => {
			const rgb = oklchToRgb({ L: x, C, H });
			assert(inGamut(rgb, 0) && oklchMaxChroma(x, H) - C >= 0.04, `p307-5 step L=${x} lacks chroma headroom`);
			return hexOf(rgb);
		});
		const analog = [-30, 30].map((d) => okRotate(base, d, `p307-5 ${d}`));
		const hslSteps = Ls.map((x) => hslWith(base, { l: x }));
		const hslAnalog = [-30, 30].map((d) => hslRotateHex(base, d));
		tasks.push(
			task(307, 5, {
				prompt: `Theme generator, plum preset, base ${base}. I need two things built on Oklch (Björn Ottosson's Oklab from linear-light sRGB, polar form L, C, h):

1. Tonal steps: keep the base's C and h and set L to 0.35, 0.50, 0.65 and 0.80, in that order, then convert to sRGB and round to 8-bit hex (a step outside sRGB would get its C lowered, at the same L and h, just until it fits).
2. Analogous accents at −30° and +30° from the base. ${OKLCH_WHEEL} Give −30° first.
${contract(`{"steps": ["#rrggbb", "#rrggbb", "#rrggbb", "#rrggbb"], "analogous": ["#rrggbb", "#rrggbb"]}`)}`,
				schema: obj({ steps: arr(HEX, 4), analogous: arr(HEX, 2) }),
				checks: [
					...Ls.flatMap((x, i) => oklchChecks(`step-${x.toFixed(2)}`, ["steps", i], x, C, H)),
					...analog.flatMap((r, i) => oklchChecks(i === 0 ? "analogous-minus30" : "analogous-plus30", ["analogous", i], L, C, r.H)),
				],
				derivation: {
					wheel: "oklch",
					base: { L: round(L, 4), C: round(C, 4), H: r2(H) },
					gamut: "every step and accent is inside sRGB with ≥ 0.04 chroma headroom",
					tolerance: OK_TOL_NOTE,
					wrong: { hslLightness: hslSteps, hslAnalogous: hslAnalog },
				},
				witness: { steps, analogous: analog.map((r) => r.hex) },
				invalid: [
					{ steps: hslSteps, analogous: hslAnalog },
					{ steps, analogous: analog.map((r) => r.hex).reverse() },
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

	// p308-1: nearest CSS named color by CIEDE2000, with the distance.
	{
		const DE_NAME_TOL = 0.5;
		const inputs = ["#5a7d9a", "#d3d0cb", "#647080", "#e020e6", "#c0392b"];
		const rows = inputs.map((hex) => {
			const d = rankNamed(hex, "ciede2000");
			const e = rankNamed(hex, "srgb-euclid");
			assert((d[1]?.d as number) >= 1.1 * (d[0]?.d as number), `p308-1 ${hex} margin < 10%`);
			return {
				hex,
				names: d[0]?.names as string[],
				de: d[0]?.d as number,
				runnerUp: { names: d[1]?.names as string[], de: d[1]?.d as number },
				euclid: e[0]?.names as string[],
			};
		});
		assert(rows.filter((r) => r.names.length > 1).length >= 2, "p308-1 should exercise aliases");
		assert(rows.filter((r) => !r.euclid.includes(r.names[0] as string)).length >= 2, "p308-1 the RGB-distance reading must differ");
		tasks.push(
			task(308, 1, {
				prompt: `Our color picker shows a friendly name under each swatch: the CSS named color (from the 148 keywords of CSS Color 4) that is perceptually closest. "Closest" means the smallest CIEDE2000 difference (kL = kC = kH = 1), computed on CIELAB. ${LAB_D65}

Where two keywords have the same value (gray and grey, for example) either is fine. For each swatch, give the name and the CIEDE2000 difference to it (two decimals).

Swatches: ${inputs.join(", ")}
${contract(`{"names": [{"id": "${inputs[0]}", "name": "<keyword>", "deltaE": <number>}, ...one entry per swatch, id = the swatch hex]}`)}`,
				schema: obj({ names: arr(obj({ id: STR, name: STR, deltaE: NUM })) }),
				checks: rows.flatMap((r) => [
					c(`name-${r.hex}`, ["names", byId(r.hex), "name"], oneOfE(r.names)),
					c(`deltaE-${r.hex}`, ["names", byId(r.hex), "deltaE"], numE(r2(r.de), DE_NAME_TOL)),
				]),
				derivation: {
					margin: "the runner-up value is at least 10% farther than the winner",
					tolerance: `ΔE00 ±${DE_NAME_TOL}: two-decimal rounding plus white-point constant variants; a D50-adapted Lab reading moves these values by up to 0.30 and still names the same keywords, so it passes too`,
					rows: rows.map((r) => ({ ...r, de: r2(r.de), runnerUp: { ...r.runnerUp, de: r2(r.runnerUp.de) } })),
				},
				witness: { names: rows.map((r) => ({ id: r.hex, name: r.names[0], deltaE: r2(r.de) })) },
				invalid: [
					{ names: rows.map((r) => ({ id: r.hex, name: r.euclid[0], deltaE: r2(r.de) })) },
					{ names: rows.map((r) => ({ id: r.hex, name: r.runnerUp.names[0], deltaE: r2(r.runnerUp.de) })) },
				],
			}),
		);
	}

	// p308-2: hex values of CSS keywords (X11 values differ for gray and purple).
	{
		const names = ["rebeccapurple", "lightslategrey", "darkgoldenrod", "mediumvioletred", "gray", "purple", "peachpuff", "olivedrab"];
		const want = Object.fromEntries(names.map((n) => [n, CSS_NAMED[n] as string]));
		assert(names.every((n) => /^#[0-9a-f]{6}$/.test(want[n] as string)), "p308-2 names");
		const x11 = { ...want, gray: "#bebebe", purple: "#a020f0" };
		const confused = { ...want, rebeccapurple: "#800080", lightslategrey: "#708090" };
		tasks.push(
			task(308, 2, {
				prompt: `Migrating a legacy email template: its inline styles use CSS color keywords, and the new design-token file needs each one as hex. Use the CSS Color 4 named-color table (some other color-name lists give different values for a few of these words, so take the CSS ones).

Keywords: ${names.join(", ")}

Give each keyword's 8-bit hex value.
${contract(`{${names.map((n) => `"${n}": "#rrggbb"`).join(", ")}}`)}`,
				schema: obj(Object.fromEntries(names.map((n) => [n, HEX]))),
				checks: names.map((n) => c(`hex-${n}`, [n], hexE(want[n] as string, 0))),
				derivation: { source: "CSS Color 4 named colors", exact: true, x11Differs: ["gray", "purple"] },
				witness: want,
				invalid: [x11, confused],
				toolUseful: false,
			}),
		);
	}

	// p308-3: black or white value labels on chart bars, by WCAG 2 and by APCA, with the APCA Lc.
	{
		const bgs = ["#f76707", "#1098ad", "#c2255c", "#fab005", "#5c940d"];
		const rows = bgs.map((bg) => {
			const wb = wcag("#000000", bg);
			const ww = wcag("#ffffff", bg);
			const lb = apcaLc("#000000", bg);
			const lw = apcaLc("#ffffff", bg);
			assert(Math.max(wb, ww) / Math.min(wb, ww) >= 1.15, `p308-3 ${bg} WCAG too close`);
			assert(Math.abs(Math.abs(lb) - Math.abs(lw)) >= 5, `p308-3 ${bg} APCA too close`);
			const apca = Math.abs(lb) > Math.abs(lw) ? "black" : "white";
			return { bg, wcag: wb > ww ? "black" : "white", apca, lc: r1(apca === "black" ? lb : lw) };
		});
		assert(rows.filter((r) => r.wcag !== r.apca).length >= 2 && rows.some((r) => r.wcag === r.apca), "p308-3 needs agreement and disagreement");
		tasks.push(
			task(308, 3, {
				prompt: `Bar chart: each bar carries its value label inside the bar, in either pure black (#000000) or pure white (#ffffff). Our accessibility guild is split between two rules, so for each bar color tell me which label color each rule prefers, and for the APCA pick, its Lc value.

- WCAG rule: the label color with the higher contrast ratio. ${WCAG}
- APCA rule: the label color with the larger |Lc|, the label being the text and the bar the background. ${APCA}

Bar colors: ${bgs.join(", ")}

Give "lc" as the signed Lc of the label color the APCA rule picks (one decimal is enough).
${contract(`{"bars": [{"id": "${bgs[0]}", "wcag": "<black or white>", "apca": "<black or white>", "lc": <number>}, ...one entry per bar, id = the bar hex]}`)}`,
				schema: obj({
					bars: arr(
						obj({
							id: STR,
							wcag: { type: "string", enum: ["black", "white"] },
							apca: { type: "string", enum: ["black", "white"] },
							lc: NUM,
						}),
					),
				}),
				checks: rows.flatMap((r) => [
					c(`wcag-${r.bg}`, ["bars", byId(r.bg), "wcag"], eqE(r.wcag)),
					c(`apca-${r.bg}`, ["bars", byId(r.bg), "apca"], eqE(r.apca)),
					c(`lc-${r.bg}`, ["bars", byId(r.bg), "lc"], numE(r.lc, 1.0)),
				]),
				derivation: {
					margin: "the WCAG winner beats the loser by ≥ 15% in ratio; the APCA winner by ≥ 5 Lc",
					tolerance: "Lc ±1.0: one-decimal rounding plus coefficient-precision variants",
					rows,
				},
				witness: { bars: rows.map((r) => ({ id: r.bg, wcag: r.wcag, apca: r.apca, lc: r.lc })) },
				invalid: [
					{ bars: rows.map((r) => ({ id: r.bg, wcag: r.wcag, apca: r.wcag, lc: r.lc })) },
					{ bars: rows.map((r) => ({ id: r.bg, wcag: r.wcag, apca: r.apca, lc: Math.abs(r.lc) })) },
				],
			}),
		);
	}

	// p308-4: which text/background pairs fall below an APCA bar of |Lc| 60, and the weakest one.
	{
		const T = 60;
		const pairs: [string, string, string][] = [
			["sidebar-caption", "#6c6f7d", "#f6f4ef"],
			["primary-button", "#ffffff", "#3d7dd8"],
			["night-mode-meta", "#a7a9be", "#232946"],
			["success-toast", "#ffffff", "#2cb67d"],
			["footer-legal", "#8d99ae", "#2b2d42"],
			["tag-on-blush", "#9a8c98", "#f2e9e4"],
			["warning-link", "#c2410c", "#fff7ed"],
			["tooltip-text", "#e3e0d8", "#5a5a66"],
		];
		const rows = pairs.map(([id, t, b]) => {
			const lc = Math.abs(apcaLc(t, b));
			assert(Math.abs(lc - T) >= 4, `p308-4 ${id} too close to ${T} (${lc})`);
			return { id, lc, fails: lc < T, ratio: wcag(t, b) };
		});
		const failing = rows.filter((r) => r.fails).sort((a, b) => a.lc - b.lc);
		assert(failing.length >= 3 && failing.length <= rows.length - 3, "p308-4 needs passes and fails");
		const worst = failing[0] as (typeof failing)[number];
		assert((failing[1]?.lc as number) - worst.lc >= 3, "p308-4 weakest not clear by 3 Lc");
		const wcagFail = rows.filter((r) => r.ratio < 4.5);
		const wcagWorst = [...rows].sort((a, b) => a.ratio - b.ratio)[0] as (typeof rows)[number];
		assert(wcagFail.map((r) => r.id).join() !== failing.map((r) => r.id).join(), "p308-4 WCAG reading must differ");
		assert(wcagWorst.id !== worst.id, "p308-4 WCAG weakest must differ");
		tasks.push(
			task(308, 4, {
				prompt: `We're adopting APCA for our design-system lint. The bar for this pass: every text/background pair needs |Lc| of at least ${T}. Which of the pairs below fall short, and which one is the weakest (smallest |Lc|)?

${APCA}

Pairs (text on background):
${pairs.map(([id, t, b]) => `- ${id}: ${t} on ${b}`).join("\n")}

List the ids of all pairs below the bar, then the weakest pair's id and its |Lc| (one decimal is enough).
${contract(`{"belowBar": ["<id>", ...], "weakest": {"id": "<id>", "absLc": <number>}}`)}`,
				schema: obj({ belowBar: arr(STR), weakest: obj({ id: STR, absLc: NUM }) }),
				checks: [
					...rows.map((r) => c(`${r.fails ? "below" : "meets"}-${r.id}`, ["belowBar"], { k: "has", v: r.id, want: r.fails })),
					c("weakest-id", ["weakest", "id"], eqE(worst.id)),
					c("weakest-lc", ["weakest", "absLc"], numE(r1(worst.lc), 1.0)),
				],
				derivation: {
					threshold: T,
					absLc: Object.fromEntries(rows.map((r) => [r.id, r1(r.lc)])),
					margin: "every pair ≥ 4 Lc from the bar; the weakest ≥ 3 Lc below the next failure",
					tolerance: "|Lc| ±1.0: one-decimal rounding plus coefficient-precision variants",
					wcagReading: { failing: wcagFail.map((r) => r.id), weakest: wcagWorst.id },
				},
				witness: { belowBar: failing.map((r) => r.id), weakest: { id: worst.id, absLc: r1(worst.lc) } },
				invalid: [
					{ belowBar: wcagFail.map((r) => r.id), weakest: { id: wcagWorst.id, absLc: r1(wcagWorst.lc) } },
					{ belowBar: failing.map((r) => r.id), weakest: { id: failing[1]?.id as string, absLc: r1(failing[1]?.lc as number) } },
				],
			}),
		);
	}

	// p308-5: hex to CSS keyword: exact match where there is one, else nearest by RGB distance.
	{
		const inputs = ["#6495ed", "#00ff00", "#ff00ff", "#edae49", "#30638e", "#f2e8cf"];
		const rows = inputs.map((hex) => {
			const e = rankNamed(hex, "srgb-euclid");
			const exact = (e[0]?.d as number) === 0;
			if (!exact) assert((e[1]?.d as number) >= 1.1 * (e[0]?.d as number), `p308-5 ${hex} margin < 10%`);
			const de = rankNamed(hex, "ciede2000");
			return { hex, names: e[0]?.names as string[], exact, deNames: de[0]?.names as string[] };
		});
		assert(rows.filter((r) => r.exact).length >= 2 && rows.filter((r) => !r.exact).length >= 2, "p308-5 needs exact and nearest");
		assert(rows.some((r) => r.names.length > 1), "p308-5 should exercise an alias");
		assert(rows.filter((r) => !r.exact && !r.deNames.includes(r.names[0] as string)).length >= 2, "p308-5 CIEDE2000 reading must differ");
		assert(namesFor("#00ff00").join() === "lime", "p308-5 #00ff00 is lime in CSS");
		tasks.push(
			task(308, 5, {
				prompt: `I'm writing alt text for our swatch collection and want each hex described by a CSS color keyword (the 148 named colors of CSS Color 4). If a hex is exactly a keyword's value, use that keyword and mark it exact. Otherwise use the keyword whose value is nearest by straight-line distance between the 8-bit R, G, B values (0-255 per channel), and mark it not exact. When several keywords share the winning value, any of them is fine.

Hex values: ${inputs.join(", ")}
${contract(`{"labels": [{"id": "${inputs[0]}", "name": "<keyword>", "exact": <true or false>}, ...one entry per hex, id = the hex]}`)}`,
				schema: obj({ labels: arr(obj({ id: STR, name: STR, exact: BOOL })) }),
				checks: rows.flatMap((r) => [
					c(`name-${r.hex}`, ["labels", byId(r.hex), "name"], oneOfE(r.names)),
					c(`exact-${r.hex}`, ["labels", byId(r.hex), "exact"], eqE(r.exact)),
				]),
				derivation: {
					metric: "Euclidean distance on 8-bit sRGB",
					margin: "for non-exact inputs the runner-up value is at least 10% farther than the winner",
					rows,
				},
				witness: { labels: rows.map((r) => ({ id: r.hex, name: r.names[0], exact: r.exact })) },
				invalid: [
					{ labels: rows.map((r) => ({ id: r.hex, name: r.exact ? r.names[0] : r.deNames[0], exact: r.exact })) },
					{ labels: rows.map((r) => ({ id: r.hex, name: r.hex === "#00ff00" ? "green" : r.names[0], exact: r.exact })) },
					{ labels: rows.map((r) => ({ id: r.hex, name: r.names[0], exact: false })) },
				],
			}),
		);
	}

	return tasks;
}

/** Neutral suite v2, author B: categories 305-308, five tasks each. */
export function neutral2B(): Task[] {
	return [...cat305(), ...cat306(), ...cat307(), ...cat308()];
}
