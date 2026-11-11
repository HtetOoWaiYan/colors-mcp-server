/**
 * Neutral suite v3, author A: categories 301-304 (apca-contrast, delta-e, space-conversion,
 * color-properties), ids q<category>-<n>. Fresh scenarios, inputs and task shapes relative to v1
 * (cats-neutral-a.ts) and v2 (cats-neutral2-a.ts). Expected values come from the hand-written
 * references in src/reference-neutral/a-*.ts and v3-a-color.ts; grading reuses v1's table engine
 * (a-table.ts) under v1's four kind names. Every margin is asserted at build time, so a change of
 * inputs that breaks a margin fails the build instead of shipping an ambiguous task. Each task's
 * grader.params.derivation carries its raw inputs (`inputs`) so the colorjs.io cross-check test can
 * recompute them independently.
 */
import type { CheckSpec, Expect, TableParams } from "../../graders-neutral/a-table.js";
import {
	contrastRatio,
	deltaE2000,
	hexToRgb,
	linearToSrgb,
	type Rgb,
	relativeLuminance,
	rgbToHex,
	rgbToOklab,
	srgbToLinear,
	type Vec3,
} from "../../reference/color.js";
import { apcaLc } from "../../reference-neutral/a-apca.js";
import { de00Hex, de76Hex, labOfHex } from "../../reference-neutral/a-deltae.js";
import {
	labToXyz,
	mulM,
	P3_TO_XYZ,
	srgbToCmykNaive,
	srgbToHsl,
	srgbToHwb,
	srgbToLab,
	srgbToOklchV,
	srgbToRec2020,
	srgbToXyz,
	toPolar,
	XYZ_TO_SRGB,
	xyzToSrgb,
} from "../../reference-neutral/a-spaces.js";
import {
	bt2020NarrowCode,
	CIE94_GRAPHIC_ARTS,
	CIE94_TEXTILES,
	deltaE94,
	deltaE2000Terms,
	deltaECmc,
	maxSrgbChroma,
	mccamyCct,
	xyzToUvPrime,
	xyzToXyY,
} from "../../reference-neutral/v3-a-color.js";
import { mulberry32, round } from "../build/common.js";
import { CATEGORY_NAMES, type Task } from "../types.js";

// ---------- small builders (copied from v2's cats-neutral2-a.ts, ids changed to q<cat>-<n>) ----------

function assert(cond: boolean, msg: string): void {
	if (!cond) throw new Error(`neutral3A build: ${msg}`);
}

/** Output contract (own wording: the v3 freshness test rejects sentences shared with v1/v2 prompts, including common.ts's contract line). */
const contract = (shape: string): string =>
	`Answer with nothing but JSON: one \`\`\`json fenced block, shaped exactly like this:\n${shape}`;

const num = (v: number, tol: number): Expect => ({ k: "num", v, tol });
const eq = (v: string | number | boolean): Expect => ({ k: "eq", v });
const spec = (name: string, path: (string | number)[], e: Expect): CheckSpec => ({ name, path, e });

const KIND: Record<number, string> = {
	301: "neutral-apca-contrast",
	302: "neutral-delta-e",
	303: "neutral-space-conversion",
	304: "neutral-color-properties",
};

interface TaskBody {
	prompt: string;
	schema: Record<string, unknown>;
	params: TableParams;
	witness: unknown;
	invalid: unknown[];
	toolUseful?: boolean;
}

function task(category: number, n: number, t: TaskBody): Task {
	return {
		id: `q${category}-${n}`,
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
const NUM = { type: "number" };
const INT = { type: "integer" };
const BOOL = { type: "boolean" };
const STR = { type: "string" };
const obj = (properties: Record<string, unknown>) => ({
	type: "object",
	properties,
	required: Object.keys(properties),
});
const arr = (items: unknown, n?: number) =>
	n === undefined ? { type: "array", items } : { type: "array", items, minItems: n, maxItems: n };

/** Deterministic Fisher-Yates shuffle. */
function shuffled<T>(xs: readonly T[], seed: number): T[] {
	const rnd = mulberry32(seed);
	const out = [...xs];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(rnd() * (i + 1));
		[out[i], out[j]] = [out[j] as T, out[i] as T];
	}
	return out;
}

const r1 = (v: number) => round(v, 1);
const r2 = (v: number) => round(v, 2);
const r4 = (v: number) => round(v, 4);
const pct1 = (v: number) => round(v * 100, 1);
const sortedAsc = (xs: number[]) => [...xs].sort((a, b) => a - b);
const gray = (v: number) => rgbToHex([v / 255, v / 255, v / 255]);

/** Vector expectation; the hue component (hueIdx) is circular and skipped when skipHue. */
const vecE = (v: number[], tol: number[], hueIdx?: number, skipHue = false): Expect => ({
	k: "vec",
	v,
	tol: tol.map((t, i) => (skipHue && i === hueIdx ? null : t)),
	...(hueIdx === undefined ? {} : { hue: [hueIdx] }),
});

/** Max change of f(a, b) when either color's Lab moves by 0.03 along any axis (guards discontinuities). */
function labSensitivity(a: Vec3, b: Vec3, f: (x: Vec3, y: Vec3) => number): number {
	const base = f(a, b);
	let worst = 0;
	for (const which of [0, 1])
		for (let k = 0; k < 3; k++)
			for (const s of [-0.03, 0.03]) {
				const p = [...(which === 0 ? a : b)] as [number, number, number];
				p[k] = (p[k] as number) + s;
				const d = which === 0 ? f(p, b) : f(a, p);
				worst = Math.max(worst, Math.abs(d - base));
			}
	return worst;
}

// ---------- shared prompt fragments (fresh wording; the constants are the published ones) ----------

const APCA_STEPS = `APCA-W3, version 0.0.98G-4g. Spelled out so there is no doubt about the variant:
(a) Screen luminance of each color: Ys = 0.2126729·R^2.4 + 0.7151522·G^2.4 + 0.0721750·B^2.4, where R, G, B are the sRGB channel values scaled to 0-1 and raised to a simple 2.4 power (no linear segment near black).
(b) Black soft clamp: if Ys is below 0.022, use Ys + (0.022 − Ys)^1.414 instead.
(c) If the clamped background and text luminances differ by less than 0.0005, the result is Lc 0.
(d) Normal polarity (Ybg > Ytext, darker text on a lighter background): SAPC = (Ybg^0.56 − Ytext^0.57) × 1.14; the result is 0 if SAPC < 0.1, otherwise SAPC − 0.027.
(e) Reverse polarity (Ybg ≤ Ytext, lighter text on a darker background): SAPC = (Ybg^0.65 − Ytext^0.62) × 1.14; the result is 0 if SAPC > −0.1, otherwise SAPC + 0.027.
(f) Lc = 100 × the result. Darker-on-lighter comes out positive, lighter-on-darker negative`;

const LAB_V3 =
	"By CIELAB I mean this exact route: decode the sRGB hex with the IEC 61966-2-1 curve, convert the linear RGB to CIE XYZ with the sRGB primaries and a D65 white normalized to Y = 1, then compute L*, a*, b* (CIE 15 formulas) against that same D65 white (Xn ≈ 0.9505, Yn = 1, Zn ≈ 1.0888). No chromatic adaptation to D50 anywhere.";

const OKLAB_V3 = "Oklab in Björn Ottosson's 2020 definition (computed from linear-light sRGB, L running 0-1)";

// =====================================================================================
// 301 apca-contrast
// =====================================================================================

function cat301(): Task[] {
	const tasks: Task[] = [];
	const LC_TOL = 1.0;
	const lcTolNote = `±${LC_TOL} Lc: the reference follows the stated constants exactly and is rounded to 0.1; the band absorbs rounding of intermediate values (for example 4-digit luminances) and of the reported number`;

	// q301-1: caption over a sampled background gradient: signed Lc per sample, which samples reach the floor, weakest sample (one sample is inside the low-contrast clip).
	{
		const text = "#a7b0bd";
		const FLOOR = 30;
		const stops: [string, string][] = [
			["s1", "#101d33"],
			["s2", "#2b3a55"],
			["s3", "#5a6b85"],
			["s4", "#97a3b3"],
			["s5", "#c4ccd6"],
			["s6", "#eef1f5"],
		];
		type E = { id: string; lc: number; raw: number };
		const exp: E[] = stops.map(([id, bg]) => {
			const lc = apcaLc(text, bg);
			assert(Math.abs(Math.abs(lc) - FLOOR) >= 3, `q301-1 ${id} within 3 Lc of the floor (${lc})`);
			return { id, lc: r1(lc), raw: lc };
		});
		const reaching = exp.filter((e) => Math.abs(e.raw) >= FLOOR).map((e) => e.id);
		const byMag = [...exp].sort((a, b) => Math.abs(a.raw) - Math.abs(b.raw));
		const weakest = (byMag[0] as E).id;
		assert(Math.abs((byMag[1] as E).raw) - Math.abs((byMag[0] as E).raw) >= 3, "q301-1 weakest margin");
		assert(exp.some((e) => e.raw === 0), "q301-1 needs a sample inside the low-contrast clip");
		assert(exp.some((e) => e.raw < 0) && exp.some((e) => e.raw > 0), "q301-1 needs both polarities");
		const signedReaching = exp.filter((e) => e.raw >= FLOOR).map((e) => e.id);
		assert(signedReaching.join() !== reaching.join(), "q301-1 signed-comparison trap missing");
		const swapped = stops.map(([id, bg]) => ({ id, lc: r1(apcaLc(bg, text)) }));
		assert(swapped.some((s, i) => Math.abs(s.lc - (exp[i] as E).lc) > 2 * LC_TOL), "q301-1 role-swap trap invisible");
		const witness = { samples: exp.map(({ id, lc }) => ({ id, lc })), reaching, weakest };
		tasks.push(
			task(301, 1, {
				prompt: `The hero banner on our new landing page has a top-to-bottom gradient, and the photo caption sits on top of it in ${text}. Before I sign it off I'd like to know where along the gradient the caption is still readable. I sampled the background at six evenly spaced points:
${stops.map(([id, h]) => `- ${id}: ${h}`).join("\n")}

Measure the caption (as text) against each sample (as background) with ${APCA_STEPS}.

Our floor for any text at all, even a photo credit, is |Lc| ≥ ${FLOOR}, whichever polarity. Tell me the signed Lc at each sample (one decimal), which samples meet the floor, and which sample is the weakest spot (smallest |Lc|).
${contract(`{"samples": [{"id": "s1", "lc": 0.0}, ...all six], "reaching": ["s1", ...ids that meet the floor], "weakest": "s1"}`)}`,
				schema: obj({ samples: arr(obj({ id: STR, lc: NUM })), reaching: arr(STR), weakest: STR }),
				params: {
					list: "samples",
					rows: exp.map((e) => ({ key: e.id, checks: [spec(`lc-${e.id}`, ["lc"], num(e.lc, LC_TOL))] })),
					top: [spec("reaching", ["reaching"], { k: "set", v: reaching }), spec("weakest", ["weakest"], eq(weakest))],
					derivation: {
						inputs: { text, stops, floor: FLOOR },
						margins: "every |Lc| is >= 3 from the floor; the weakest sample is >= 3 Lc below the next weakest",
						tolerance: lcTolNote,
					},
				},
				witness,
				invalid: [
					// signed comparison: the light-on-dark samples are treated as failing
					{ samples: witness.samples, reaching: signedReaching, weakest },
					// text and background roles swapped
					{ samples: swapped, reaching, weakest },
				],
			}),
		);
	}

	// q301-2: inverse problem: the lightest (or darkest) neutral gray that still reaches a target |Lc| on a surface.
	{
		type Row = { id: string; bg: string; target: number; mode: "light" | "dark"; use: string };
		const rows: Row[] = [
			{ id: "hint-on-paper", bg: "#fcfbf8", target: 60, mode: "light", use: "form hint text, light theme" },
			{ id: "body-on-paper", bg: "#fcfbf8", target: 90, mode: "light", use: "long-form body copy, light theme" },
			{ id: "body-on-night", bg: "#15171c", target: 75, mode: "dark", use: "body copy, dark theme" },
			{ id: "label-on-panel", bg: "#22252b", target: 45, mode: "dark", use: "large labels, dark theme panel" },
		];
		const MARGIN = 0.15;
		const exp = rows.map((r) => {
			const lcAt = (v: number) => apcaLc(gray(v), r.bg);
			const ok = (v: number) => (r.mode === "light" ? lcAt(v) >= r.target : lcAt(v) <= -r.target);
			let best = -1;
			if (r.mode === "light") for (let v = 0; v < 256; v++) if (ok(v)) best = v;
			if (r.mode === "dark") for (let v = 255; v >= 0; v--) if (ok(v)) best = v;
			assert(best > 0 && best < 255, `q301-2 ${r.id} no boundary`);
			// the qualifying grays form one contiguous run ending at the boundary
			for (let v = 0; v < 256; v++) {
				const inside = r.mode === "light" ? v <= best : v >= best;
				assert(ok(v) === inside, `q301-2 ${r.id} qualifying set not contiguous at ${v}`);
			}
			const next = r.mode === "light" ? best + 1 : best - 1;
			assert(Math.abs(lcAt(best)) - r.target >= MARGIN, `q301-2 ${r.id} boundary too tight (${lcAt(best)})`);
			assert(r.target - Math.abs(lcAt(next)) >= MARGIN, `q301-2 ${r.id} next level too tight (${lcAt(next)})`);
			return { id: r.id, hex: gray(best), lc: r1(lcAt(best)), next: gray(next), lcNext: lcAt(next), lcBest: lcAt(best) };
		});
		const witness = { results: exp.map(({ id, hex, lc }) => ({ id, hex, lc })) };
		tasks.push(
			task(301, 2, {
				prompt: `I'm defining the neutral text grays for our theme and want each one to be as soft as the contrast rule allows. Candidates are the 256 neutral grays #000000, #010101, ... #ffffff (R = G = B). Contrast is ${APCA_STEPS}.

For each case below, find the gray that sits right at the limit:
${rows
	.map((r) =>
		r.mode === "light"
			? `- ${r.id} (${r.use}): text on ${r.bg}; the LIGHTEST gray whose Lc as text on this surface is at least +${r.target}`
			: `- ${r.id} (${r.use}): text on ${r.bg}; the DARKEST gray, lighter than the surface, whose Lc as text on this surface is −${r.target} or beyond (|Lc| ≥ ${r.target})`,
	)
	.join("\n")}

Give the gray as #rrggbb and its signed Lc on that surface (one decimal).
${contract(`{"results": [{"id": "hint-on-paper", "hex": "#rrggbb", "lc": 0.0}, ...one per case]}`)}`,
				schema: obj({ results: arr(obj({ id: STR, hex: HEX, lc: NUM })) }),
				params: {
					rows: exp.map((e) => ({
						key: e.id,
						checks: [spec(`gray-${e.id}`, ["hex"], { k: "hex", v: e.hex, tol: 0 }), spec(`lc-${e.id}`, ["lc"], num(e.lc, LC_TOL))],
					})),
					derivation: {
						inputs: { rows },
						boundaries: Object.fromEntries(exp.map((e) => [e.id, { gray: e.hex, lc: r2(e.lcBest), nextGray: e.next, nextLc: r2(e.lcNext) }])),
						tolerance: `gray exact: the answer lives on the 8-bit grid; the boundary gray clears the target by >= ${MARGIN} Lc and the next gray misses it by >= ${MARGIN} Lc (asserted); for grays the coefficient choice cannot matter (Y = v^2.4 times their sum); lc ${lcTolNote}`,
					},
				},
				witness,
				invalid: [
					// one step too far: the first gray that misses the target
					{ results: exp.map((e) => ({ id: e.id, hex: e.next, lc: r1(e.lcNext) })) },
					// dark-theme cases answered with pure white (polarity misunderstood: "no gray reaches +75, so use the brightest")
					{
						results: exp.map((e, i) => {
							const r = rows[i] as Row;
							return r.mode === "dark" ? { id: e.id, hex: "#ffffff", lc: r1(apcaLc("#ffffff", r.bg)) } : { id: e.id, hex: e.hex, lc: e.lc };
						}),
					},
				],
			}),
		);
	}

	// q301-3: carry a light-theme contrast level into dark mode: which candidate matches the light pair's |Lc| best.
	{
		const lightText = "#55627a";
		const lightBg = "#fbfcfe";
		const darkBg = "#1b1f27";
		const cands = shuffled(["#95a1b2", "#aab4c3", "#b8c1cf", "#cdd4de", "#d9dee6", "#e8ebf0"], 30103);
		const L0 = apcaLc(lightText, lightBg);
		const R0 = contrastRatio(lightText, lightBg);
		const lcs = cands.map((c) => apcaLc(c, darkBg));
		const dist = lcs.map((l) => Math.abs(Math.abs(l) - Math.abs(L0)));
		const distOf = (c: string) => dist[cands.indexOf(c)] as number;
		const order = [...cands].sort((a, b) => distOf(a) - distOf(b));
		const match = order[0] as string;
		assert(distOf(order[1] as string) - distOf(match) >= 2, "q301-3 match margin < 2 Lc");
		assert(lcs.every((l) => l < 0), "q301-3 all candidates should be light-on-dark");
		const wcagMatch = [...cands].sort(
			(a, b) => Math.abs(contrastRatio(a, darkBg) - R0) - Math.abs(contrastRatio(b, darkBg) - R0),
		)[0] as string;
		assert(wcagMatch !== match, "q301-3 WCAG-ratio trap missing");
		const strongest = cands[lcs.indexOf(Math.min(...lcs))] as string;
		assert(strongest !== match, "q301-3 strongest trap missing");
		const witness = {
			lightLc: r1(L0),
			candidates: cands.map((c, i) => ({ hex: c, lc: r1(lcs[i] as number) })),
			match,
		};
		tasks.push(
			task(301, 3, {
				prompt: `In light mode our secondary text is ${lightText} on ${lightBg} and everyone is happy with how it reads. For dark mode (surface ${darkBg}) I want a text color that keeps the same perceived contrast level, not more and not less. Measure with ${APCA_STEPS}.

Compare magnitudes only, since the polarity necessarily flips: the right dark-mode color is the candidate whose |Lc| on ${darkBg} is closest to the |Lc| of the light-mode pair.

Candidates: ${cands.join(", ")}

Give the light-mode Lc, the signed Lc of each candidate as text on ${darkBg} (one decimal each), and the best match.
${contract(`{"lightLc": 0.0, "candidates": [{"hex": "#rrggbb", "lc": 0.0}, ...all six], "match": "#rrggbb"}`)}`,
				schema: obj({ lightLc: NUM, candidates: arr(obj({ hex: HEX, lc: NUM })), match: HEX }),
				params: {
					list: "candidates",
					key: "hex",
					rows: witness.candidates.map((c) => ({ key: c.hex, checks: [spec(`lc-${c.hex}`, ["lc"], num(c.lc, LC_TOL))] })),
					top: [spec("light-lc", ["lightLc"], num(witness.lightLc, LC_TOL)), spec("match", ["match"], eq(match))],
					derivation: {
						inputs: { lightText, lightBg, darkBg, cands },
						magnitudeGaps: Object.fromEntries(cands.map((c) => [c, r2(distOf(c))])),
						wcagRatioMatch: wcagMatch,
						margin: "the best match is >= 2 Lc closer than the runner-up",
						tolerance: lcTolNote,
					},
				},
				witness,
				invalid: [
					// matched on WCAG 2 contrast ratio instead
					{ ...witness, match: wcagMatch },
					// picked the strongest candidate instead of the closest level
					{ ...witness, match: strongest },
				],
			}),
		);
	}

	// q301-4: the same five pairings ranked by WCAG 2 ratio and by APCA |Lc|; the two rankings differ.
	{
		const pairs: [string, string, string][] = [
			["promo-badge", "#fdfdfd", "#f66a08"],
			["map-pin", "#141a24", "#4c8bf5"],
			["success-toast", "#e6fcf5", "#0c7b72"],
			["sidebar-meta", "#9aa1a8", "#202428"],
			["sale-sticker", "#2d2000", "#f9b104"],
		];
		type E = { id: string; ratio: number; lc: number };
		const exp: E[] = pairs.map(([id, t, b]) => ({ id, ratio: contrastRatio(t, b), lc: apcaLc(t, b) }));
		const byRatio = [...exp].sort((a, b) => b.ratio - a.ratio);
		const byLc = [...exp].sort((a, b) => Math.abs(b.lc) - Math.abs(a.lc));
		const bySigned = [...exp].sort((a, b) => b.lc - a.lc);
		for (let i = 1; i < exp.length; i++) {
			assert((byRatio[i - 1] as E).ratio - (byRatio[i] as E).ratio >= 0.3, "q301-4 ratio gap");
			assert(Math.abs((byLc[i - 1] as E).lc) - Math.abs((byLc[i] as E).lc) >= 3, "q301-4 Lc gap");
		}
		const oR = byRatio.map((e) => e.id);
		const oL = byLc.map((e) => e.id);
		const oS = bySigned.map((e) => e.id);
		assert(oR.filter((x, i) => x !== oL[i]).length >= 3, "q301-4 rankings should differ in >= 3 places");
		assert(oS.join() !== oL.join(), "q301-4 signed-order trap missing");
		const witness = {
			results: exp.map((e) => ({ id: e.id, ratio: r2(e.ratio), lc: r1(e.lc) })),
			byWcag: oR,
			byApca: oL,
		};
		tasks.push(
			task(301, 4, {
				prompt: `For a talk on why our team is moving to APCA, I want a slide showing that the two contrast methods don't even agree on which pairings are the strongest. Take these five text/background pairings:
${pairs.map(([id, t, b]) => `- ${id}: text ${t} on ${b}`).join("\n")}

Method 1 is the WCAG 2 contrast ratio (L1 + 0.05)/(L2 + 0.05), L1 being the lighter relative luminance; relative luminance linearizes each sRGB channel (c ≤ 0.04045 → c/12.92, else ((c + 0.055)/1.055)^2.4) and weights them 0.2126, 0.7152, 0.0722.
Method 2 is ${APCA_STEPS}. For ranking, use the magnitude |Lc|.

Give each pairing's ratio (two decimals) and signed Lc (one decimal), then both rankings from strongest to weakest.
${contract(`{"results": [{"id": "promo-badge", "ratio": 0.00, "lc": 0.0}, ...all five], "byWcag": ["id", ...strongest first], "byApca": ["id", ...strongest first]}`)}`,
				schema: obj({
					results: arr(obj({ id: STR, ratio: NUM, lc: NUM })),
					byWcag: arr(STR, 5),
					byApca: arr(STR, 5),
				}),
				params: {
					rows: witness.results.map((e) => ({
						key: e.id,
						checks: [spec(`ratio-${e.id}`, ["ratio"], num(e.ratio, 0.05)), spec(`lc-${e.id}`, ["lc"], num(e.lc, LC_TOL))],
					})),
					top: [spec("by-wcag", ["byWcag"], { k: "seq", v: oR }), spec("by-apca", ["byApca"], { k: "seq", v: oL })],
					derivation: {
						inputs: { pairs },
						margins: "adjacent ratios >= 0.3 apart, adjacent |Lc| >= 3 apart",
						signedLcOrder: oS,
						tolerance: `ratio ±0.05 (two-decimal rounding, 0.03928 vs 0.04045 threshold variants); ${lcTolNote}`,
					},
				},
				witness,
				invalid: [
					// one ranking copied into both
					{ ...witness, byApca: oR },
					// APCA ranked by signed Lc
					{ ...witness, byApca: oS },
				],
			}),
		);
	}

	// q301-5: a layered card component: each element measured against the layer it actually sits on.
	{
		const page = "#f2efe9";
		const card = "#fdfcfa";
		const chip = "#2f5d50";
		type El = { id: string; color: string; parent: string; parentName: string; min: number; role: string };
		const els: El[] = [
			{ id: "card", color: card, parent: page, parentName: "page", min: 15, role: "surface edge" },
			{ id: "divider", color: "#d9d4cb", parent: card, parentName: "card", min: 15, role: "hairline divider" },
			{ id: "title", color: "#4a4f57", parent: card, parentName: "card", min: 75, role: "body/title text" },
			{ id: "meta", color: "#92979f", parent: card, parentName: "card", min: 60, role: "metadata text" },
			{ id: "chip", color: chip, parent: card, parentName: "card", min: 30, role: "control boundary" },
			{ id: "chip-label", color: "#e9f5f0", parent: chip, parentName: "chip", min: 60, role: "label text" },
			{ id: "icon", color: "#e0893a", parent: card, parentName: "card", min: 45, role: "meaningful icon" },
		];
		type E = { id: string; lc: number; passes: boolean; onPage: number };
		const exp: E[] = els.map((e) => {
			const lc = apcaLc(e.color, e.parent);
			assert(Math.abs(Math.abs(lc) - e.min) >= 3, `q301-5 ${e.id} within 3 Lc of its minimum (${lc})`);
			return { id: e.id, lc: r1(lc), passes: Math.abs(lc) >= e.min, onPage: apcaLc(e.color, page) };
		});
		const failing = exp.filter((e) => !e.passes).map((e) => e.id);
		assert(failing.length >= 2 && failing.length < exp.length, "q301-5 needs some failures");
		assert(exp.some((e) => e.lc < 0 && e.passes), "q301-5 needs a passing negative-polarity element");
		assert(exp.some((e) => e.lc === 0), "q301-5 needs a clipped element");
		const pageRows = els.map((e, i) => ({
			id: e.id,
			lc: r1((exp[i] as E).onPage),
			passes: Math.abs((exp[i] as E).onPage) >= e.min,
		}));
		assert(pageRows.some((p, i) => Math.abs(p.lc - (exp[i] as E).lc) > 2 * LC_TOL), "q301-5 page-only trap invisible");
		const signedRows = exp.map((e, i) => ({ id: e.id, lc: e.lc, passes: e.lc >= (els[i] as El).min }));
		const witness = { results: exp.map(({ id, lc, passes }) => ({ id, lc, passes })), failing };
		tasks.push(
			task(301, 5, {
				prompt: `Component review for our "saved article" card. The layers are: page background ${page}; the card sits on the page; everything else sits on the card, except the chip label, which sits on the chip. Measure every element against the layer directly beneath it, treating the element's color as the "text" color and the layer beneath as the background, with ${APCA_STEPS}.

Elements (color, what it sits on, minimum |Lc| for its role, polarity doesn't matter):
${els.map((e) => `- ${e.id}: ${e.color}, on the ${e.parentName}, ${e.role}, needs |Lc| ≥ ${e.min}`).join("\n")}

Give each element's signed Lc (one decimal) and whether it meets its minimum, plus the list of elements that fail.
${contract(`{"results": [{"id": "card", "lc": 0.0, "passes": true}, ...all seven], "failing": ["id", ...]}`)}`,
				schema: obj({ results: arr(obj({ id: STR, lc: NUM, passes: BOOL })), failing: arr(STR) }),
				params: {
					rows: exp.map((e) => ({
						key: e.id,
						checks: [spec(`lc-${e.id}`, ["lc"], num(e.lc, LC_TOL)), spec(`passes-${e.id}`, ["passes"], eq(e.passes))],
					})),
					top: [spec("failing", ["failing"], { k: "set", v: failing })],
					derivation: {
						inputs: { page, els: els.map(({ id, color, parent, min }) => ({ id, color, parent, min })) },
						margins: "every |Lc| is >= 3 from its element's minimum",
						tolerance: lcTolNote,
					},
				},
				witness,
				invalid: [
					// every element measured against the page background
					{ results: pageRows, failing: pageRows.filter((p) => !p.passes).map((p) => p.id) },
					// signed comparison: the light-on-dark chip label fails
					{ results: signedRows, failing: signedRows.filter((p) => !p.passes).map((p) => p.id) },
				],
			}),
		);
	}
	return tasks;
}

// =====================================================================================
// 302 delta-e
// =====================================================================================

function cat302(): Task[] {
	const tasks: Task[] = [];
	const TOL = 0.2;
	const labNote = "D65 white-constant variants (xy-derived vs 0.95047/1.08883) move CIELAB by < 0.02";
	const stable00 = (a: string, b: string) => labSensitivity(labOfHex(a), labOfHex(b), (x, y) => deltaE2000(x, y)) <= 0.05;

	// q302-1: CIE94 textiles in both reference directions, next to symmetric CIEDE2000.
	{
		const pairs: [string, string, string][] = [
			["cobalt", "#1f87e0", "#3f78b5"],
			["lime", "#7cb342", "#8a9f62"],
			["apricot", "#e3a57a", "#f4a261"],
			["violet", "#5e35b1", "#6a4f9c"],
		];
		const ASYM = 0.6;
		const exp = pairs.map(([id, studio, mill]) => {
			const S = labOfHex(studio);
			const M = labOfHex(mill);
			const dS = deltaE94(S, M, CIE94_TEXTILES);
			const dM = deltaE94(M, S, CIE94_TEXTILES);
			assert(Math.abs(dS - dM) >= ASYM, `q302-1 ${id} asymmetry too small`);
			assert(stable00(studio, mill), `q302-1 ${id} CIEDE2000 unstable`);
			return {
				id,
				studioRef: r2(dS),
				millRef: r2(dM),
				de2000: r2(de00Hex(studio, mill)),
				smaller: dS < dM ? "studio" : "mill",
				gaS: r2(deltaE94(S, M, CIE94_GRAPHIC_ARTS)),
				gaM: r2(deltaE94(M, S, CIE94_GRAPHIC_ARTS)),
			};
		});
		assert(new Set(exp.map((e) => e.smaller)).size === 2, "q302-1 both directions should win somewhere");
		assert(exp.some((e) => Math.abs(e.gaS - e.studioRef) > 2 * TOL), "q302-1 graphic-arts trap invisible");
		const witness = { results: exp.map(({ gaS: _a, gaM: _b, ...e }) => e) };
		tasks.push(
			task(302, 1, {
				prompt: `Our knitwear studio and the yarn mill keep arguing about lab-dip numbers, and I think it's because CIE94 is not symmetric: the answer depends on which color is the reference. For each yarn below, please compute CIE94 with the textile weights both ways, plus CIEDE2000 for comparison.

CIE94 (textiles): ΔE94 = √[(ΔL*/(kL·SL))² + (ΔC*/(kC·SC))² + (ΔH*/(kH·SH))²] with kL = 2, kC = kH = 1, SL = 1, SC = 1 + 0.048·C*ref, SH = 1 + 0.014·C*ref, where C*ref is the CIELAB chroma of whichever color is the reference, and ΔH*² = Δa*² + Δb*² − ΔC*².
CIEDE2000: Sharma, Wu & Dalal's formulation with kL = kC = kH = 1.
${LAB_V3}

Yarns (studio standard / mill dip):
${pairs.map(([id, s, m]) => `- ${id}: ${s} / ${m}`).join("\n")}

For each yarn: ΔE94 with the studio standard as reference ("studioRef"), ΔE94 with the mill dip as reference ("millRef"), ΔE00, all to two decimals, and which choice of reference gives the smaller ΔE94 ("studio" or "mill").
${contract(`{"results": [{"id": "cobalt", "studioRef": 0.00, "millRef": 0.00, "de2000": 0.00, "smaller": "studio"}, ...one per yarn]}`)}`,
				schema: obj({
					results: arr(obj({ id: STR, studioRef: NUM, millRef: NUM, de2000: NUM, smaller: { enum: ["studio", "mill"] } })),
				}),
				params: {
					rows: exp.map((e) => ({
						key: e.id,
						checks: [
							spec(`studio-ref-${e.id}`, ["studioRef"], num(e.studioRef, TOL)),
							spec(`mill-ref-${e.id}`, ["millRef"], num(e.millRef, TOL)),
							spec(`de2000-${e.id}`, ["de2000"], num(e.de2000, TOL)),
							spec(`smaller-${e.id}`, ["smaller"], eq(e.smaller)),
						],
					})),
					derivation: {
						inputs: { pairs },
						graphicArtsWeights: Object.fromEntries(exp.map((e) => [e.id, [e.gaS, e.gaM]])),
						margins: `the two reference directions differ by >= ${ASYM} for every yarn`,
						tolerance: `±${TOL}: ${labNote}; CIEDE2000 moves <= 0.05 under ±0.03 Lab perturbation (asserted)`,
					},
				},
				witness,
				invalid: [
					// graphic-arts weights (kL = 1, K1 0.045, K2 0.015)
					{
						results: exp.map((e) => ({
							id: e.id,
							studioRef: e.gaS,
							millRef: e.gaM,
							de2000: e.de2000,
							smaller: e.gaS < e.gaM ? "studio" : "mill",
						})),
					},
					// assumed symmetric: the studio-reference value copied into both
					{ results: exp.map((e) => ({ id: e.id, studioRef: e.studioRef, millRef: e.studioRef, de2000: e.de2000, smaller: "studio" })) },
				],
			}),
		);
	}

	// q302-2: CMC l:c acceptability (2:1) vs perceptibility (1:1) verdicts for production batches.
	{
		const TH = 1.0;
		const batches: [string, string, string][] = [
			["navy-carton", "#2f4b7c", "#304c7c"],
			["tan-sleeve", "#c08552", "#c48957"],
			["teal-label", "#1d6f8a", "#1a6c87"],
			["plum-insert", "#6b4f8c", "#71548f"],
			["mustard-band", "#d9a441", "#d4a53c"],
		];
		const safe = (d: number) => d <= TH * 0.85 || d >= TH * 1.15;
		const exp = batches.map(([id, std, bat]) => {
			const S = labOfHex(std);
			const B = labOfHex(bat);
			const c21 = deltaECmc(S, B, 2, 1);
			const c11 = deltaECmc(S, B, 1, 1);
			assert(safe(c21) && safe(c11), `q302-2 ${id} within 15% of the threshold (${c21}, ${c11})`);
			const H = toPolar(S)[2];
			assert(Math.abs(H - 164) >= 3 && Math.abs(H - 345) >= 3, `q302-2 ${id} standard hue near the T switch`);
			// swapping standard and batch never changes a verdict
			assert(
				deltaECmc(B, S, 2, 1) < TH === c21 < TH && deltaECmc(B, S, 1, 1) < TH === c11 < TH,
				`q302-2 ${id} verdict depends on direction`,
			);
			const d00 = de00Hex(std, bat);
			return {
				id,
				cmc21: r2(c21),
				cmc11: r2(c11),
				pass21: c21 < TH,
				pass11: c11 < TH,
				d00: r2(d00),
				lc12: r2(deltaECmc(S, B, 1, 2)),
				swap: r2(deltaECmc(B, S, 2, 1)),
			};
		});
		assert(
			exp.some((e) => e.pass21 && e.pass11) && exp.some((e) => e.pass21 && !e.pass11) && exp.some((e) => !e.pass21),
			"q302-2 needs all three verdict combinations",
		);
		assert(exp.some((e) => e.d00 < TH !== e.pass21), "q302-2 CIEDE2000 trap missing");
		assert(exp.some((e) => e.lc12 < TH !== e.pass21), "q302-2 l:c swap trap missing");
		const witness = { results: exp.map(({ id, cmc21, cmc11, pass21, pass11 }) => ({ id, cmc21, cmc11, pass21, pass11 })) };
		tasks.push(
			task(302, 2, {
				prompt: `Packaging print QA. Each production batch is compared with its approved standard using the CMC l:c color difference (Colour Measurement Committee, 1984), with the standard as the reference color. We run it twice: CMC(2:1) for acceptability and CMC(1:1) for perceptibility. A batch passes a check when the difference is below ${TH.toFixed(1)}.

Formula, with subscript 1 = standard and 2 = batch, computed on CIELAB / LCh(ab):
ΔE_CMC = √[(ΔL*/(l·SL))² + (ΔC*/(c·SC))² + (ΔH*/SH)²], ΔL* = L*1 − L*2, ΔC* = C*1 − C*2, ΔH*² = Δa*² + Δb*² − ΔC*²
SL = 0.511 if L*1 < 16, else 0.040975·L*1/(1 + 0.01765·L*1); SC = 0.0638·C*1/(1 + 0.0131·C*1) + 0.638
F = √(C*1⁴/(C*1⁴ + 1900)); T = 0.56 + |0.2·cos(h1 + 168°)| when 164° ≤ h1 ≤ 345°, otherwise 0.36 + |0.4·cos(h1 + 35°)|; SH = SC·(F·T + 1 − F)
(l, c) = (2, 1) for CMC(2:1) and (1, 1) for CMC(1:1); h1 is the standard's CIE hue angle in degrees.
${LAB_V3}

Batches (standard / batch):
${batches.map(([id, s, b]) => `- ${id}: ${s} / ${b}`).join("\n")}

For each batch give both CMC values (two decimals) and the two pass/fail verdicts.
${contract(`{"results": [{"id": "navy-carton", "cmc21": 0.00, "cmc11": 0.00, "pass21": true, "pass11": true}, ...one per batch]}`)}`,
				schema: obj({ results: arr(obj({ id: STR, cmc21: NUM, cmc11: NUM, pass21: BOOL, pass11: BOOL })) }),
				params: {
					rows: exp.map((e) => ({
						key: e.id,
						checks: [
							spec(`cmc21-${e.id}`, ["cmc21"], num(e.cmc21, 0.1)),
							spec(`cmc11-${e.id}`, ["cmc11"], num(e.cmc11, 0.1)),
							spec(`pass21-${e.id}`, ["pass21"], eq(e.pass21)),
							spec(`pass11-${e.id}`, ["pass11"], eq(e.pass11)),
						],
					})),
					derivation: {
						inputs: { batches, threshold: TH },
						ciede2000: Object.fromEntries(exp.map((e) => [e.id, e.d00])),
						batchAsReference21: Object.fromEntries(exp.map((e) => [e.id, e.swap])),
						margins: "every CMC value is >= 15% from the 1.0 threshold; standard hues are >= 3° from the T switch at 164°/345°; swapping roles never flips a verdict",
						tolerance: `±0.1: ${labNote} (CMC values here are < 2.5, so that is < 0.02 too); the 15% margin keeps verdicts outside the band`,
					},
				},
				witness,
				invalid: [
					// CIEDE2000 used for both columns
					{
						results: exp.map((e) => ({ id: e.id, cmc21: e.d00, cmc11: e.d00, pass21: e.d00 < TH, pass11: e.d00 < TH })),
					},
					// l and c swapped in the acceptability column (1:2)
					{ results: exp.map((e) => ({ id: e.id, cmc21: e.lc12, cmc11: e.cmc11, pass21: e.lc12 < TH, pass11: e.pass11 })) },
				],
			}),
		);
	}

	// q302-3: token deduplication by chained CIEDE2000 links (connected components), every pair >= 15% from the threshold.
	{
		const TH = 2.5;
		const tokens = shuffled<[string, string]>(
			[
				["axis-line", "#5b6b7a"],
				["icon-muted", "#5f6e7c"],
				["border-strong", "#64727f"],
				["link", "#3d6fb6"],
				["focus-ring", "#4171b5"],
				["warning-ink", "#b85c38"],
				["brick", "#b4603a"],
				["tag-violet", "#7a5c99"],
			],
			30203,
		);
		const n = tokens.length;
		const hexAt = (i: number) => (tokens[i] as [string, string])[1];
		const nameAt = (i: number) => (tokens[i] as [string, string])[0];
		const d = (i: number, j: number) => de00Hex(hexAt(i), hexAt(j));
		const d76 = (i: number, j: number) => de76Hex(hexAt(i), hexAt(j));
		const components = (link: (i: number, j: number) => boolean) => {
			const parent = tokens.map((_, i) => i);
			const find = (i: number): number => (parent[i] === i ? i : find(parent[i] as number));
			for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (link(i, j)) parent[find(i)] = find(j);
			return tokens.map((_, i) => find(i));
		};
		const pairTable: Record<string, number> = {};
		for (let i = 0; i < n; i++)
			for (let j = i + 1; j < n; j++) {
				const x = d(i, j);
				assert(x <= TH * 0.85 || x >= TH * 1.15, `q302-3 pair ${nameAt(i)}/${nameAt(j)} within 15% of the threshold (${x})`);
				assert(stable00(hexAt(i), hexAt(j)), "q302-3 CIEDE2000 unstable");
				pairTable[`${nameAt(i)}|${nameAt(j)}`] = r2(x);
			}
		const mates = (root: number[]) =>
			tokens.map(([name], i) => ({
				token: name,
				mergeWith: tokens.filter((_, j) => j !== i && root[j] === root[i]).map(([m]) => m),
			}));
		const comp = components((i, j) => d(i, j) < TH);
		const exp = mates(comp);
		const groups = new Set(comp).size;
		// direct links only (no chaining)
		const direct = tokens.map(([name], i) => ({
			token: name,
			mergeWith: tokens.filter((_, j) => j !== i && d(i, j) < TH).map(([m]) => m),
		}));
		assert(direct.some((x, i) => x.mergeWith.length !== (exp[i] as (typeof exp)[number]).mergeWith.length), "q302-3 chaining trap missing");
		const comp76 = components((i, j) => d76(i, j) < TH);
		const exp76 = mates(comp76);
		assert(exp76.some((x, i) => x.mergeWith.join() !== (exp[i] as (typeof exp)[number]).mergeWith.join()), "q302-3 CIE76 trap missing");
		const witness = { tokens: exp, groupCount: groups };
		tasks.push(
			task(302, 3, {
				prompt: `We're cleaning up near-duplicate color tokens. Rule: two tokens are "linked" when their CIEDE2000 difference (kL = kC = kH = 1) is below ${TH.toFixed(1)}, and links chain: if A is linked to B and B to C, all three end up as one merged token, even when A and C themselves are further apart. ${LAB_V3}

Tokens:
${tokens.map(([name, h]) => `- ${name}: ${h}`).join("\n")}

For every token, list the other tokens it ends up merged with (an empty list if it stays on its own), and tell me how many tokens remain after merging.
${contract(`{"tokens": [{"token": "axis-line", "mergeWith": ["token-name", ...]}, ...all eight], "groupCount": 0}`)}`,
				schema: obj({ tokens: arr(obj({ token: STR, mergeWith: arr(STR) })), groupCount: INT }),
				params: {
					list: "tokens",
					key: "token",
					rows: exp.map((e) => ({ key: e.token, checks: [spec(`merge-${e.token}`, ["mergeWith"], { k: "set", v: e.mergeWith })] })),
					top: [spec("group-count", ["groupCount"], eq(groups))],
					derivation: {
						inputs: { tokens, threshold: TH },
						pairwiseCiede2000: pairTable,
						margins: "every pair's CIEDE2000 is >= 15% away from the threshold and moves <= 0.05 under ±0.03 Lab perturbation",
						tolerance: "exact set membership; no numeric value is graded",
					},
				},
				witness,
				invalid: [
					// direct links only, no chaining
					{ tokens: direct, groupCount: groups + 1 },
					// CIE76 instead of CIEDE2000
					{ tokens: exp76, groupCount: new Set(comp76).size },
				],
			}),
		);
	}

	// q302-4: choose the new series color that is most distinct from every existing one (maximize the minimum CIEDE2000).
	{
		const existing = ["#3b6ea8", "#e07b39", "#4f9d69", "#c44e52", "#8172b3"];
		const cands = shuffled(["#64b5cd", "#937860", "#6d4c3d", "#da8bc3", "#2a9df4"], 30204);
		type R = { hex: string; minDe: number; nearest: string; min76: number; near76: string; avg: number };
		const rows: R[] = cands.map((c) => {
			const ds = existing.map((e) => de00Hex(c, e));
			const s = sortedAsc(ds);
			const near = existing[ds.indexOf(s[0] as number)] as string;
			assert((s[1] as number) - (s[0] as number) >= 0.5, `q302-4 ${c} nearest-series margin`);
			assert(stable00(c, near), "q302-4 CIEDE2000 unstable");
			const e76 = existing.map((e) => de76Hex(c, e));
			const avg = ds.reduce((a, b) => a + b, 0) / ds.length;
			return { hex: c, minDe: s[0] as number, nearest: near, min76: Math.min(...e76), near76: existing[e76.indexOf(Math.min(...e76))] as string, avg };
		});
		const byMin = [...rows].sort((a, b) => b.minDe - a.minDe);
		const best = (byMin[0] as R).hex;
		assert((byMin[0] as R).minDe - (byMin[1] as R).minDe >= 1.0, "q302-4 winner margin");
		const by76 = [...rows].sort((a, b) => b.min76 - a.min76);
		const best76 = (by76[0] as R).hex;
		assert(best76 !== best && (by76[0] as R).min76 - (by76[1] as R).min76 >= 1.0, "q302-4 CIE76 trap missing or ambiguous");
		const bestAvg = ([...rows].sort((a, b) => b.avg - a.avg)[0] as R).hex;
		const worst = (byMin[byMin.length - 1] as R).hex;
		const witness = { candidates: rows.map((r) => ({ hex: r.hex, nearest: r.nearest, minDeltaE: r2(r.minDe) })), pick: best };
		tasks.push(
			task(302, 4, {
				prompt: `Our dashboard charts have five series colors already: ${existing.join(", ")}. We need a sixth, and it should be as easy as possible to tell apart from all five. For each candidate below, find the existing series color it is closest to by CIEDE2000 (kL = kC = kH = 1) and that smallest difference (two decimals). The pick is the candidate whose smallest difference is the largest. ${LAB_V3}

Candidates: ${cands.join(", ")}
${contract(`{"candidates": [{"hex": "#rrggbb", "nearest": "#rrggbb", "minDeltaE": 0.00}, ...one per candidate], "pick": "#rrggbb"}`)}`,
				schema: obj({ candidates: arr(obj({ hex: HEX, nearest: HEX, minDeltaE: NUM })), pick: HEX }),
				params: {
					list: "candidates",
					key: "hex",
					rows: rows.map((r) => ({
						key: r.hex,
						checks: [spec(`nearest-${r.hex}`, ["nearest"], eq(r.nearest)), spec(`min-de-${r.hex}`, ["minDeltaE"], num(r2(r.minDe), TOL))],
					})),
					top: [spec("pick", ["pick"], eq(best))],
					derivation: {
						inputs: { existing, cands },
						cie76Pick: best76,
						largestAveragePick: bestAvg,
						margins: "the pick's minimum beats the runner-up's by >= 1.0; each candidate's nearest series beats the second nearest by >= 0.5",
						tolerance: `minDeltaE ±${TOL}: ${labNote}; CIEDE2000 moves <= 0.05 under ±0.03 Lab perturbation (asserted)`,
					},
				},
				witness,
				invalid: [
					// CIE76 throughout
					{ candidates: rows.map((r) => ({ hex: r.hex, nearest: r.near76, minDeltaE: r2(r.min76) })), pick: best76 },
					// picked by the largest average difference (or, if that coincides, the least distinct candidate)
					{ candidates: witness.candidates, pick: bestAvg === best ? worst : bestAvg },
				],
			}),
		);
	}

	// q302-5: decompose CIEDE2000 into its weighted lightness, chroma and hue terms and name the dominant one.
	{
		const pairs: [string, string, string][] = [
			["teal-tote", "#0a6e5c", "#178066"],
			["coral-mug", "#e85d75", "#d9667d"],
			["steel-cap", "#2c7da0", "#2a7a8f"],
			["saffron-pin", "#f2b134", "#e8b74a"],
			["iris-scarf", "#6a4c93", "#5a4588"],
		];
		const T = 0.2;
		const NAMES = ["lightness", "chroma", "hue"] as const;
		const exp = pairs.map(([id, ref, sam]) => {
			const A = labOfHex(ref);
			const B = labOfHex(sam);
			const t = deltaE2000Terms(A, B);
			assert(Math.abs(t.dE - deltaE2000(A, B)) < 1e-9, `q302-5 ${id} terms disagree with deltaE2000`);
			for (const k of ["tL", "tC", "tH"] as const)
				assert(labSensitivity(A, B, (a, b) => deltaE2000Terms(a, b)[k]) <= 0.05, `q302-5 ${id} ${k} unstable`);
			const mags = [Math.abs(t.tL), Math.abs(t.tC), Math.abs(t.tH)];
			const s = [...mags].sort((a, b) => b - a);
			assert((s[0] as number) >= 1.3 * (s[1] as number) && (s[0] as number) - (s[1] as number) >= 0.8, `q302-5 ${id} dominant term not clear`);
			// unweighted CIELAB attribute differences (sample minus reference) for the invalid answer
			const C1 = Math.hypot(A[1], A[2]);
			const C2 = Math.hypot(B[1], B[2]);
			const dH = Math.sqrt(Math.max(0, (A[1] - B[1]) ** 2 + (A[2] - B[2]) ** 2 - (C1 - C2) ** 2));
			const raw = [B[0] - A[0], C2 - C1, dH];
			const rawMags = raw.map(Math.abs);
			return {
				id,
				deltaE: r2(t.dE),
				lightness: r2(t.tL),
				chroma: r2(t.tC),
				hue: r2(t.tH),
				dominant: NAMES[mags.indexOf(s[0] as number)] as string,
				raw: raw.map(r2),
				rawDominant: NAMES[rawMags.indexOf(Math.max(...rawMags))] as string,
			};
		});
		assert(new Set(exp.map((e) => e.dominant)).size === 3, "q302-5 should cover all three dominant attributes");
		assert(exp.some((e) => e.rawDominant !== e.dominant || e.raw.some((v, k) => Math.abs(v - [e.lightness, e.chroma, e.hue][k]!) > 2 * T)), "q302-5 unweighted trap invisible");
		const witness = { results: exp.map(({ raw: _r, rawDominant: _d, ...e }) => e) };
		tasks.push(
			task(302, 5, {
				prompt: `Five merch items came back from a new supplier off-color, and I need to tell them *what* is off, not just by how much. For each item, break the CIEDE2000 difference (kL = kC = kH = 1, Sharma, Wu & Dalal 2005) between our reference color and their sample into its three weighted terms:
- lightness term ΔL′/(kL·SL)
- chroma term ΔC′/(kC·SC)
- hue term ΔH′/(kH·SH)
using the standard CIEDE2000 intermediates (a′ = (1 + G)·a*, C′, h′, mean values, T, SL, SC, SH, RT). Differences are sample minus reference: ΔL′ = L′sample − L′ref, ΔC′ = C′sample − C′ref, Δh′ = h′sample − h′ref wrapped into (−180°, 180°], ΔH′ = 2·√(C′ref·C′sample)·sin(Δh′/2). So the terms are signed. The total is ΔE00 = √(L² + C² + H² + RT·C·H) with L, C, H the three terms.

${LAB_V3}

Items (reference / sample):
${pairs.map(([id, r, s]) => `- ${id}: ${r} / ${s}`).join("\n")}

For each item give ΔE00 and the three signed terms (two decimals each), and which attribute dominates: "lightness", "chroma" or "hue" (the term with the largest magnitude).
${contract(`{"results": [{"id": "teal-tote", "deltaE": 0.00, "lightness": 0.00, "chroma": 0.00, "hue": 0.00, "dominant": "lightness"}, ...one per item]}`)}`,
				schema: obj({
					results: arr(
						obj({ id: STR, deltaE: NUM, lightness: NUM, chroma: NUM, hue: NUM, dominant: { enum: ["lightness", "chroma", "hue"] } }),
					),
				}),
				params: {
					rows: exp.map((e) => ({
						key: e.id,
						checks: [
							spec(`de-${e.id}`, ["deltaE"], num(e.deltaE, T)),
							spec(`lightness-${e.id}`, ["lightness"], num(e.lightness, T)),
							spec(`chroma-${e.id}`, ["chroma"], num(e.chroma, T)),
							spec(`hue-${e.id}`, ["hue"], num(e.hue, T)),
							spec(`dominant-${e.id}`, ["dominant"], eq(e.dominant)),
						],
					})),
					derivation: {
						inputs: { pairs },
						unweightedCielabDifferences: Object.fromEntries(exp.map((e) => [e.id, e.raw])),
						margins: "the dominant term's magnitude is >= 1.3x and >= 0.8 above the next; every term moves <= 0.05 under ±0.03 Lab perturbation",
						tolerance: `±${T} on the total and each term: ${labNote}`,
					},
				},
				witness,
				invalid: [
					// signs reversed (reference minus sample)
					{ results: witness.results.map((e) => ({ ...e, lightness: -e.lightness, chroma: -e.chroma, hue: -e.hue })) },
					// unweighted CIELAB differences ΔL*, ΔC*ab, ΔH*ab reported as the terms
					{
						results: exp.map((e) => ({
							id: e.id,
							deltaE: e.deltaE,
							lightness: e.raw[0],
							chroma: e.raw[1],
							hue: e.raw[2],
							dominant: e.rawDominant,
						})),
					},
				],
			}),
		);
	}
	return tasks;
}

// =====================================================================================
// 303 space-conversion
// =====================================================================================

function cat303(): Task[] {
	const tasks: Task[] = [];
	const D50: Vec3 = [0.96422, 1, 0.82521];
	const nearHalf = (v: number) => Math.abs(Math.abs((v * 255) % 1) - 0.5) <= 0.05;

	// q303-1: Display P3 values to linear sRGB, an sRGB-gamut verdict, and a hex for the ones that fit.
	{
		const inputs: { id: string; p3: Vec3 }[] = [
			{ id: "flame", p3: [0.92, 0.37, 0.22] },
			{ id: "mint", p3: [0.2, 0.78, 0.42] },
			{ id: "sky", p3: [0.45, 0.62, 0.82] },
			{ id: "lemon", p3: [0.98, 0.84, 0.12] },
			{ id: "orchid", p3: [0.62, 0.18, 0.74] },
			{ id: "fog", p3: [0.55, 0.55, 0.55] },
		];
		const T = 0.002;
		const exp = inputs.map((i) => {
			const lin = mulM(XYZ_TO_SRGB, mulM(P3_TO_XYZ, i.p3.map(srgbToLinear) as unknown as Vec3));
			const inside = lin.every((v) => v >= 0 && v <= 1);
			if (inside) {
				assert(lin.every((v) => v >= 0.01 && v <= 0.99), `q303-1 ${i.id} too close to the gamut edge`);
				assert(!lin.map(linearToSrgb).some(nearHalf), `q303-1 ${i.id} channel near a .5 rounding boundary`);
			} else assert(lin.some((v) => v <= -0.02 || v >= 1.02), `q303-1 ${i.id} only marginally outside`);
			return {
				id: i.id,
				linear: lin.map(r4),
				inSrgb: inside,
				hex: inside ? rgbToHex(lin.map(linearToSrgb) as unknown as Rgb) : null,
			};
		});
		assert(exp.filter((e) => e.inSrgb).length >= 3 && exp.some((e) => !e.inSrgb), "q303-1 needs both verdicts");
		const css = (p: Vec3) => `color(display-p3 ${p.map((v) => v.toFixed(2)).join(" ")})`;
		const witness = { results: exp };
		tasks.push(
			task(303, 1, {
				prompt: `Our designers picked some colors in Display P3, and I need to know which ones survive on plain sRGB screens. The values are CSS Color 4 \`color(display-p3 r g b)\`: Display P3 primaries, D65 white, the sRGB (IEC 61966-2-1) transfer curve on each channel.

For each one, convert to linear-light sRGB (decode the P3 channels with the transfer curve, go to CIE XYZ (D65) with the P3 primaries, then to linear sRGB with the sRGB primaries; no clipping and no gamut mapping, so values may come out below 0 or above 1). Report the three linear values to four decimals, whether the color is inside the sRGB gamut (all three linear values between 0 and 1 inclusive), and, only for colors inside the gamut, the sRGB hex (encode with the sRGB curve, round each channel to the nearest 8-bit value). For colors outside the gamut put null for the hex.

${inputs.map((i) => `- ${i.id}: ${css(i.p3)}`).join("\n")}
${contract(`{"results": [{"id": "flame", "linear": [r, g, b], "inSrgb": true, "hex": "#rrggbb or null"}, ...one per color]}`)}`,
				schema: obj({
					results: arr(obj({ id: STR, linear: arr(NUM, 3), inSrgb: BOOL, hex: { anyOf: [HEX, { type: "null" }] } })),
				}),
				params: {
					rows: exp.map((e) => ({
						key: e.id,
						checks: [
							spec(`linear-${e.id}`, ["linear"], vecE(e.linear, [T, T, T])),
							spec(`in-srgb-${e.id}`, ["inSrgb"], eq(e.inSrgb)),
							...(e.hex === null ? [] : [spec(`hex-${e.id}`, ["hex"], { k: "hex", v: e.hex, tol: 1 })]),
						],
					})),
					derivation: {
						inputs: { colors: inputs },
						margins: "in-gamut colors have every linear channel in [0.01, 0.99]; out-of-gamut colors have a channel <= -0.02 or >= 1.02",
						tolerance: `linear ±${T} (primaries-derived vs published 4- to 7-digit matrices differ by < 3e-4); hex ±1 per 8-bit channel (round-half conventions), no channel within 0.05 of a .5 boundary`,
					},
				},
				witness,
				invalid: [
					// P3 numbers treated as if they were sRGB
					{
						results: inputs.map((i) => ({
							id: i.id,
							linear: i.p3.map((v) => r4(srgbToLinear(v))),
							inSrgb: true,
							hex: rgbToHex(i.p3),
						})),
					},
					// clipped to the sRGB cube before reporting, so everything looks in gamut
					{
						results: exp.map((e) => {
							const c = e.linear.map((v) => Math.min(1, Math.max(0, v)));
							return { id: e.id, linear: c, inSrgb: true, hex: rgbToHex(c.map(linearToSrgb) as unknown as Rgb) };
						}),
					},
				],
			}),
		);
	}

	// q303-2: CIELAB (D65) token values straight to Oklab and Oklch, including white, black and a neutral gray.
	{
		const inputs: { id: string; lab: Vec3 }[] = [
			{ id: "accent", lab: [62.5, 18.2, -44.1] },
			{ id: "pistachio", lab: [85, -12, 34] },
			{ id: "graphite", lab: [47.3, 0, 0] },
			{ id: "paper", lab: [100, 0, 0] },
			{ id: "ink", lab: [0, 0, 0] },
			{ id: "brick", lab: [38.4, 52.6, 30.9] },
			{ id: "lagoon", lab: [71.2, -38.5, -6.4] },
		];
		const T = 0.002;
		const FLOOR = 0.02;
		const exp = inputs.map((i) => {
			const lin = xyzToSrgb(labToXyz(i.lab));
			assert(lin.every((v) => v >= -1e-9 && v <= 1 + 1e-9), `q303-2 ${i.id} outside sRGB`);
			const ok = rgbToOklab(lin);
			const lch = toPolar(ok);
			const skip = lch[1] < FLOOR;
			return { id: i.id, oklab: ok.map(r4), oklch: [r4(lch[0]), r4(lch[1]), skip ? 0 : r2(lch[2])], skip };
		});
		assert(
			exp.filter((e) => e.skip).length === 3 && exp.filter((e) => !e.skip).every((e) => (e.oklch[1] as number) >= 0.05),
			"q303-2 chroma classes",
		);
		const wrongD50 = inputs.map((i) => {
			const ok = rgbToOklab(xyzToSrgb(labToXyz(i.lab, D50)));
			const lch = toPolar(ok);
			return { id: i.id, oklab: ok.map(r4), oklch: [r4(lch[0]), r4(lch[1]), r2(lch[2])] };
		});
		const witness = { results: exp.map(({ skip: _s, ...e }) => e) };
		tasks.push(
			task(303, 2, {
				prompt: `We're migrating our design tokens from CSS lab() to oklab()/oklch(). The current values are CIELAB with a D65 white (Xn ≈ 0.9505, Yn = 1, Zn ≈ 1.0888, CIE 15 formulas, no chromatic adaptation), and they are all inside sRGB. Please convert each one to ${OKLAB_V3} and to its polar form Oklch (C = √(a² + b²), h = atan2(b, a) in degrees 0-360). Going through CIE XYZ (D65) and linear sRGB is fine; no clipping is needed.

Four decimals for Oklab L, a, b and Oklch L, C; two decimals for h. When Oklch C is below ${FLOOR} the hue means nothing: give 0 or whatever falls out.

${inputs.map((i) => `- ${i.id}: lab(${i.lab.join(" ")})`).join("\n")}
${contract(`{"results": [{"id": "accent", "oklab": [L, a, b], "oklch": [L, C, h]}, ...one per token]}`)}`,
				schema: obj({ results: arr(obj({ id: STR, oklab: arr(NUM, 3), oklch: arr(NUM, 3) })) }),
				params: {
					rows: exp.map((e) => ({
						key: e.id,
						checks: [
							spec(`oklab-${e.id}`, ["oklab"], vecE(e.oklab, [T, T, T])),
							spec(`oklch-${e.id}`, ["oklch"], vecE(e.oklch, [T, T, 1], 2, e.skip)),
						],
					})),
					derivation: {
						inputs: { tokens: inputs },
						tolerances: `Oklab and Oklch L, C ±${T} (the XYZ-based and linear-sRGB-based Oklab matrices and white-constant variants differ by < 3e-4); h ±1° when C >= ${FLOOR}, otherwise not checked`,
						d50WhiteAnswer: wrongD50,
					},
				},
				witness,
				invalid: [
					// Lab decoded against a D50 white
					{ results: wrongD50 },
					// Lab numbers rescaled instead of converted: L/100, a/100, b/100
					{
						results: inputs.map((i) => {
							const ok: Vec3 = [i.lab[0] / 100, i.lab[1] / 100, i.lab[2] / 100];
							const lch = toPolar(ok);
							return { id: i.id, oklab: ok.map(r4), oklch: [r4(lch[0]), r4(lch[1]), r2(lch[2])] };
						}),
					},
				],
			}),
		);
	}

	// q303-3: chromaticity: CIE xyY and CIE 1976 u'v' for sRGB colors, grays sitting on the D65 white point.
	{
		const colors = ["#2d7dd2", "#f45d01", "#97cc04", "#c3423f", "#7e7e7e", "#0b0b0b"];
		const T = 0.001;
		const exp = colors.map((hex) => {
			const X = srgbToXyz(hexToRgb(hex));
			return { hex, xyY: xyzToXyY(X).map(r4), uv: xyzToUvPrime(X).map(r4) };
		});
		const rgbChroma = (hex: string) => {
			const [r, g, b] = hexToRgb(hex).map(srgbToLinear) as [number, number, number];
			return [r4(r / (r + g + b)), r4(g / (r + g + b)), r4(srgbToXyz(hexToRgb(hex))[1])];
		};
		const uv1960 = (hex: string) => {
			const X = srgbToXyz(hexToRgb(hex));
			const den = X[0] + 15 * X[1] + 3 * X[2];
			return [r4((4 * X[0]) / den), r4((6 * X[1]) / den)];
		};
		assert(
			exp.every((e) => Math.abs((uv1960(e.hex)[1] as number) - (e.uv[1] as number)) > 2 * T),
			"q303-3 1960-uv trap",
		);
		assert(exp.some((e) => Math.abs((rgbChroma(e.hex)[0] as number) - (e.xyY[0] as number)) > 2 * T), "q303-3 RGB-proportion trap");
		const witness = { colors: exp };
		tasks.push(
			task(303, 3, {
				prompt: `I'm plotting our brand palette on a chromaticity diagram for a display-calibration report. For each sRGB hex, give:
- xyY: CIE 1931 chromaticity x = X/(X + Y + Z), y = Y/(X + Y + Z), plus the luminance Y, where X, Y, Z are CIE XYZ computed from the sRGB hex (IEC 61966-2-1 decoding, sRGB primaries, D65 white scaled so that #ffffff has Y = 1);
- uv: CIE 1976 UCS chromaticity u′ = 4X/(X + 15Y + 3Z), v′ = 9Y/(X + 15Y + 3Z).

Four decimals throughout.
Colors: ${colors.join(", ")}
${contract(`{"colors": [{"hex": "#rrggbb", "xyY": [x, y, Y], "uv": [u, v]}, ...one per color]}`)}`,
				schema: obj({ colors: arr(obj({ hex: HEX, xyY: arr(NUM, 3), uv: arr(NUM, 2) })) }),
				params: {
					list: "colors",
					key: "hex",
					rows: exp.map((e) => ({
						key: e.hex,
						checks: [spec(`xyY-${e.hex}`, ["xyY"], vecE(e.xyY, [T, T, T])), spec(`uv-${e.hex}`, ["uv"], vecE(e.uv, [T, T]))],
					})),
					derivation: {
						inputs: { colors },
						tolerances: `±${T} on x, y, Y, u′, v′ (four-decimal answers; primaries-derived vs published sRGB matrices move these by < 2e-4); every neutral gray, however dark, sits on the D65 point (0.3127, 0.3290)`,
					},
				},
				witness,
				invalid: [
					// chromaticity taken from linear RGB proportions instead of XYZ
					{ colors: exp.map((e) => ({ hex: e.hex, xyY: rgbChroma(e.hex), uv: e.uv })) },
					// CIE 1960 uv (v = 6Y/...) instead of 1976 u'v'
					{ colors: exp.map((e) => ({ hex: e.hex, xyY: e.xyY, uv: uv1960(e.hex) })) },
				],
			}),
		);
	}

	// q303-4: linear-light renderer output to 8-bit sRGB hex, then CSS HSL and HWB of that hex (clip stated for an HDR value).
	{
		const inputs: { id: string; lin: Vec3 }[] = [
			{ id: "ember", lin: [0.8, 0.2, 0.05] },
			{ id: "shadow", lin: [0.0021, 0.0021, 0.0021] },
			{ id: "deep-sea", lin: [0.05, 0.3, 0.6] },
			{ id: "flare", lin: [1.35, 0.6, 0.1] },
			{ id: "highlight", lin: [1, 1, 1] },
			{ id: "moss", lin: [0.12, 0.2, 0.03] },
		];
		const T = { h: 1, p: 0.5 };
		const cyl = (q: Rgb, gray: boolean) => {
			const hsl = srgbToHsl(q);
			const hwb = srgbToHwb(q);
			return {
				hsl: [gray ? 0 : r1(hsl[0]), pct1(hsl[1]), pct1(hsl[2])],
				hwb: [gray ? 0 : r1(hwb[0]), pct1(hwb[1]), pct1(hwb[2])],
			};
		};
		let worstUnrounded = 0;
		const exp = inputs.map((i) => {
			const enc = i.lin.map((v) => linearToSrgb(Math.min(1, Math.max(0, v)))) as unknown as Rgb;
			assert(!enc.some((v) => v > 0 && v < 1 && nearHalf(v)), `q303-4 ${i.id} channel near a .5 rounding boundary`);
			const hex = rgbToHex(enc);
			const q = hexToRgb(hex);
			const isGray = q[0] === q[1] && q[1] === q[2];
			const hslU = srgbToHsl(enc);
			const hwbU = srgbToHwb(enc);
			const c = cyl(q, isGray);
			for (const k of [1, 2])
				worstUnrounded = Math.max(
					worstUnrounded,
					Math.abs(pct1(hslU[k] as number) - (c.hsl[k] as number)),
					Math.abs(pct1(hwbU[k] as number) - (c.hwb[k] as number)),
				);
			if (!isGray) assert(Math.abs(hslU[0] - srgbToHsl(q)[0]) <= T.h * 0.5, `q303-4 ${i.id} hue moves with 8-bit rounding`);
			return { id: i.id, hex, ...c, gray: isGray };
		});
		assert(worstUnrounded <= T.p, `q303-4 skipping the 8-bit rounding moves a component by ${worstUnrounded}`);
		assert(exp.some((e) => e.gray) && exp.some((e) => e.hex === "#ffffff"), "q303-4 needs a gray and white");
		const enc22 = (i: (typeof inputs)[number]) =>
			rgbToHex(i.lin.map((v) => Math.min(1, Math.max(0, v)) ** (1 / 2.2)) as unknown as Rgb);
		assert(inputs.filter((i, k) => enc22(i) !== (exp[k] as (typeof exp)[number]).hex).length >= 3, "q303-4 gamma-2.2 trap");
		const wrongRow = (id: string, hex: string) => {
			const q = hexToRgb(hex);
			return { id, hex, ...cyl(q, false) };
		};
		const witness = { results: exp.map(({ gray: _g, ...e }) => e) };
		tasks.push(
			task(303, 4, {
				prompt: `Our WebGL scene computes colors in linear light, and I need the CSS equivalents for the DOM overlays. For each linear RGB triple below: clip each channel to 0-1 (one of them is an HDR value above 1), encode with the sRGB transfer function from IEC 61966-2-1 (12.92·c for c ≤ 0.0031308, otherwise 1.055·c^(1/2.4) − 0.055), and round each channel to the nearest 8-bit value to get the hex. Then give the CSS Color 4 HSL and HWB of that 8-bit color: hue in degrees, other components as percentages 0-100 with one decimal. For a neutral gray the hue is meaningless; use 0 or anything.

${inputs.map((i) => `- ${i.id}: linear (${i.lin.join(", ")})`).join("\n")}
${contract(`{"results": [{"id": "ember", "hex": "#rrggbb", "hsl": [h, s, l], "hwb": [h, w, b]}, ...one per triple]}`)}`,
				schema: obj({ results: arr(obj({ id: STR, hex: HEX, hsl: arr(NUM, 3), hwb: arr(NUM, 3) })) }),
				params: {
					rows: exp.map((e) => ({
						key: e.id,
						checks: [
							spec(`hex-${e.id}`, ["hex"], { k: "hex", v: e.hex, tol: 1 }),
							spec(`hsl-${e.id}`, ["hsl"], vecE(e.hsl, [T.h, T.p, T.p], 0, e.gray)),
							spec(`hwb-${e.id}`, ["hwb"], vecE(e.hwb, [T.h, T.p, T.p], 0, e.gray)),
						],
					})),
					derivation: {
						inputs: { triples: inputs },
						tolerances: `hex ±1 per channel (no encoded channel within 0.05 of a .5 boundary); hue ±${T.h}° (skipped for grays); percentages ±${T.p}: computing HSL/HWB from the unrounded encoded values instead moves them by <= ${r2(worstUnrounded)} (asserted)`,
					},
				},
				witness,
				invalid: [
					// plain 2.2 gamma instead of the piecewise sRGB curve
					{ results: inputs.map((i) => wrongRow(i.id, enc22(i))) },
					// no encoding at all: linear values written straight into the hex
					{ results: inputs.map((i) => wrongRow(i.id, rgbToHex(i.lin))) },
				],
			}),
		);
	}

	// q303-5: one hand-off, two destinations: naive CMYK percentages for print and BT.2020 signals with 10-bit narrow-range codes for broadcast.
	{
		const colors = ["#e4572e", "#29335c", "#f3a712", "#669bbc", "#101820", "#a8c686"];
		const T = { cmyk: 0.5, e: 0.002, code: 1 };
		const exp = colors.map((hex) => {
			const rgb = hexToRgb(hex);
			const e = srgbToRec2020(rgb);
			assert(e.every((v) => v >= 0 && v <= 1), `q303-5 ${hex} Rec.2020 out of range`);
			return {
				hex,
				cmyk: srgbToCmykNaive(rgb).map(pct1),
				rec2020: e.map(r4),
				codes: e.map((v) => bt2020NarrowCode(v)),
			};
		});
		const witness = { colors: exp };
		tasks.push(
			task(303, 5, {
				prompt: `Our event branding goes to two places this week: the print shop and the broadcast graphics team. For each sRGB hex below I need:
- cmyk: naive, profile-free CMYK as percentages 0-100 (one decimal): with R, G, B as 0-1 fractions, K = 1 − max(R, G, B), C = (1 − R − K)/(1 − K), M = (1 − G − K)/(1 − K), Y = (1 − B − K)/(1 − K);
- rec2020: the same color as non-linear ITU-R BT.2020 R′G′B′ (0-1, four decimals): decode the sRGB with the IEC 61966-2-1 curve, convert the linear light to BT.2020 primaries (D65 white, through CIE XYZ), then apply the BT.2020 transfer function E′ = 4.5·E for E < 0.018053968510807, otherwise 1.09929682680944·E^0.45 − 0.09929682680944;
- codes: 10-bit narrow-range ("video range") code values for those R′G′B′ signals, D = round((219·E′ + 16)·4), as integers.

Colors: ${colors.join(", ")}
${contract(`{"colors": [{"hex": "#rrggbb", "cmyk": [c, m, y, k], "rec2020": [r, g, b], "codes": [r, g, b]}, ...one per color]}`)}`,
				schema: obj({ colors: arr(obj({ hex: HEX, cmyk: arr(NUM, 4), rec2020: arr(NUM, 3), codes: arr(INT, 3) })) }),
				params: {
					list: "colors",
					key: "hex",
					rows: exp.map((e) => ({
						key: e.hex,
						checks: [
							spec(`cmyk-${e.hex}`, ["cmyk"], vecE(e.cmyk, [T.cmyk, T.cmyk, T.cmyk, T.cmyk])),
							spec(`rec2020-${e.hex}`, ["rec2020"], vecE(e.rec2020, [T.e, T.e, T.e])),
							spec(`codes-${e.hex}`, ["codes"], vecE(e.codes, [T.code, T.code, T.code])),
						],
					})),
					derivation: {
						inputs: { colors },
						tolerances: `CMYK ±${T.cmyk} points (exact formula, one-decimal answers); E′ ±${T.e} (primaries-derived vs published BT.2020 matrices differ by < 3e-4 before the transfer function); codes ±${T.code} (an E′ that differs by < 3e-4 moves the unrounded code by < 0.3, so after rounding it lands at most one code away)`,
					},
				},
				witness,
				invalid: [
					// sRGB values sent as if they were BT.2020 signals, full-range codes
					{
						colors: exp.map((e) => {
							const rgb = hexToRgb(e.hex);
							return { ...e, rec2020: rgb.map(r4), codes: rgb.map((v) => Math.round(v * 1023)) };
						}),
					},
					// CMYK without the 1/(1 − K) normalization, codes full-range
					{
						colors: exp.map((e) => {
							const rgb = hexToRgb(e.hex);
							const k = 1 - Math.max(...rgb);
							return { ...e, cmyk: [...rgb.map((v) => pct1(1 - v - k)), pct1(k)], codes: e.rec2020.map((v) => Math.round(v * 1023)) };
						}),
					},
				],
			}),
		);
	}
	return tasks;
}

// =====================================================================================
// 304 color-properties
// =====================================================================================

function cat304(): Task[] {
	const tasks: Task[] = [];

	// q304-1: arrange swatches around the Oklch hue wheel (ascending from 0°), with a near-neutral set aside.
	{
		const colors = shuffled(["#c0315a", "#d64550", "#f28f3b", "#e2c044", "#4a7c59", "#3d5a80", "#8a4fbf", "#a63d86", "#c8c2b4"], 30401);
		const FLOOR = 0.03;
		const GAP = 6;
		const ok = colors.map((h) => srgbToOklchV(hexToRgb(h)));
		const okOf = (h: string) => ok[colors.indexOf(h)] as Vec3;
		const chromatic = colors.filter((h) => okOf(h)[1] >= FLOOR);
		const neutral = colors.filter((h) => okOf(h)[1] < FLOOR);
		for (const h of colors) assert(okOf(h)[1] <= FLOOR * 0.75 || okOf(h)[1] >= FLOOR * 1.5, `q304-1 ${h} chroma too close to the floor`);
		const hue = (h: string) => okOf(h)[2];
		const order = [...chromatic].sort((a, b) => hue(a) - hue(b));
		const hs = order.map(hue);
		for (let i = 1; i < hs.length; i++) assert((hs[i] as number) - (hs[i - 1] as number) >= GAP, "q304-1 adjacent hue gap");
		assert((hs[0] as number) >= GAP && 360 - (hs[hs.length - 1] as number) >= GAP, "q304-1 hue too close to 0/360");
		const hslHue = (h: string) => srgbToHsl(hexToRgb(h))[0];
		const hslOrder = [...chromatic].sort((a, b) => hslHue(a) - hslHue(b));
		assert(hslOrder.join() !== order.join(), "q304-1 HSL trap missing");
		const witness = {
			swatches: chromatic.map((h) => ({ hex: h, hue: r2(hue(h)) })),
			neutral,
			order,
		};
		tasks.push(
			task(304, 1, {
				prompt: `I'm laying out a swatch book as a color wheel and want the swatches in hue order. Use the Oklch hue: h = atan2(b, a) in degrees (0-360) from ${OKLAB_V3}. Anything with Oklch chroma C = √(a² + b²) below ${FLOOR} counts as a neutral and goes on a separate gray page instead of the wheel.

Swatches: ${colors.join(", ")}

Give the Oklch hue (two decimals) of every swatch that goes on the wheel, the list of neutrals, and the wheel order: the wheel swatches sorted by increasing hue, starting from 0°.
${contract(`{"swatches": [{"hex": "#rrggbb", "hue": 0.00}, ...wheel swatches only], "neutral": ["#rrggbb", ...], "order": ["#rrggbb", ...lowest hue first]}`)}`,
				schema: obj({ swatches: arr(obj({ hex: HEX, hue: NUM })), neutral: arr(HEX), order: arr(HEX) }),
				params: {
					list: "swatches",
					key: "hex",
					rows: chromatic.map((h) => ({ key: h, checks: [spec(`hue-${h}`, ["hue"], { k: "hue", v: r2(hue(h)), tol: 1 })] })),
					top: [spec("neutral", ["neutral"], { k: "set", v: neutral }), spec("order", ["order"], { k: "seq", v: order })],
					derivation: {
						inputs: { colors, floor: FLOOR },
						chroma: Object.fromEntries(colors.map((h) => [h, r4(okOf(h)[1])])),
						hslOrder,
						margins: `adjacent wheel hues >= ${GAP}° apart and >= ${GAP}° from 0/360; every chroma <= 0.75x or >= 1.5x the floor`,
						tolerance: "hue ±1° (matrix variants move hue by < 0.1° at these chromas)",
					},
				},
				witness,
				invalid: [
					// HSL hue order
					{ swatches: chromatic.map((h) => ({ hex: h, hue: r2(hslHue(h)) })), neutral, order: hslOrder },
					// the neutral placed on the wheel by its (meaningless) hue
					{
						swatches: colors.map((h) => ({ hex: h, hue: r2(hue(h)) })),
						neutral: [],
						order: [...colors].sort((a, b) => hue(a) - hue(b)),
					},
				],
			}),
		);
	}

	// q304-2: "is it a light or a dark color?" by three lightness definitions (CIE L*, Oklab L, HSL L), plus the CIE mid gray.
	{
		const colors = ["#2f5bea", "#b8a000", "#c3420d", "#3f8f6b", "#3b3561", "#e0566c"];
		const M = 3;
		const T = { lstar: 0.15, ok: 0.002, hsl: 0.2 };
		const exp = colors.map((hex) => {
			const rgb = hexToRgb(hex);
			const lstar = srgbToLab(rgb)[0];
			const okL = rgbToOklab(rgb)[0];
			const hslL = srgbToHsl(rgb)[2];
			for (const v of [lstar, okL * 100, hslL * 100]) assert(Math.abs(v - 50) >= M, `q304-2 ${hex} within ${M} of 50 (${v})`);
			return {
				hex,
				lStar: r2(lstar),
				oklabL: r4(okL),
				hslL: pct1(hslL),
				lightCie: lstar >= 50,
				lightOklab: okL >= 0.5,
				lightHsl: hslL >= 0.5,
				y: relativeLuminance(rgb),
			};
		});
		assert(new Set(exp.map((e) => `${e.lightCie}${e.lightOklab}${e.lightHsl}`)).size >= 4, "q304-2 needs varied verdict patterns");
		const levels = Array.from({ length: 256 }, (_, v) => srgbToLab(hexToRgb(gray(v)))[0]);
		const dist = levels.map((l) => Math.abs(l - 50));
		const mid = dist.indexOf(Math.min(...dist));
		assert((sortedAsc(dist)[1] as number) >= 0.2 + (dist[mid] as number), "q304-2 mid gray not unique");
		const midGray = gray(mid);
		const linMid = gray(Math.round(linearToSrgb(0.5) * 255));
		const witness = { results: exp.map(({ y: _y, ...e }) => e), midGray };
		tasks.push(
			task(304, 2, {
				prompt: `Our theming code decides "is this a light or a dark color?" and three engineers each implemented it differently. Show me where they disagree. A color counts as light when its lightness is 50 or more on a 0-100 scale, measured as:
- cie: CIE L* (CIELAB lightness). ${LAB_V3}
- oklab: ${OKLAB_V3}, so L ≥ 0.5 means light.
- hsl: CSS Color 4 HSL lightness (max + min)/2 of the 0-1 sRGB channels, as a percentage.

For each color give L* (two decimals), Oklab L (four decimals, 0-1 scale), HSL lightness (percent, one decimal) and the three verdicts. Also tell me which 8-bit neutral gray (#vvvvvv, R = G = B) has the CIE L* closest to 50.

Colors: ${colors.join(", ")}
${contract(`{"results": [{"hex": "#rrggbb", "lStar": 0.00, "oklabL": 0.0000, "hslL": 0.0, "lightCie": true, "lightOklab": true, "lightHsl": true}, ...one per color], "midGray": "#rrggbb"}`)}`,
				schema: obj({
					results: arr(obj({ hex: HEX, lStar: NUM, oklabL: NUM, hslL: NUM, lightCie: BOOL, lightOklab: BOOL, lightHsl: BOOL })),
					midGray: HEX,
				}),
				params: {
					key: "hex",
					rows: exp.map((e) => ({
						key: e.hex,
						checks: [
							spec(`lstar-${e.hex}`, ["lStar"], num(e.lStar, T.lstar)),
							spec(`oklab-l-${e.hex}`, ["oklabL"], num(e.oklabL, T.ok)),
							spec(`hsl-l-${e.hex}`, ["hslL"], num(e.hslL, T.hsl)),
							spec(`light-cie-${e.hex}`, ["lightCie"], eq(e.lightCie)),
							spec(`light-oklab-${e.hex}`, ["lightOklab"], eq(e.lightOklab)),
							spec(`light-hsl-${e.hex}`, ["lightHsl"], eq(e.lightHsl)),
						],
					})),
					top: [spec("mid-gray", ["midGray"], { k: "hex", v: midGray, tol: 0 })],
					derivation: {
						inputs: { colors },
						midGrayLstar: r4(levels[mid] as number),
						neighbourLstar: [r4(levels[mid - 1] as number), r4(levels[mid + 1] as number)],
						margins: `every lightness value is >= ${M} points from 50; the mid gray is >= 0.2 L* closer to 50 than any other gray`,
						tolerance: `L* ±${T.lstar} (white-constant variants < 0.02); Oklab L ±${T.ok}; HSL L ±${T.hsl} (exact formula)`,
					},
				},
				witness,
				invalid: [
					// HSL verdict used for all three
					{ results: witness.results.map((e) => ({ ...e, lightCie: e.lightHsl, lightOklab: e.lightHsl })), midGray },
					// L* taken as 100 × relative luminance; mid gray = linear 0.5
					{
						results: exp.map(({ y, ...e }) => ({ ...e, lStar: r2(100 * y), lightCie: y >= 0.5 })),
						midGray: linMid,
					},
				],
			}),
		);
	}

	// q304-3: pairs where WCAG relative luminance and Oklab L disagree about which color is lighter.
	{
		const pairs: [string, string, string][] = [
			["cta-vs-text", "#3355ff", "#6d6d6d"],
			["error-vs-text", "#e0201b", "#747474"],
			["success-vs-text", "#0f9d58", "#868686"],
			["badge-vs-icon", "#7a2fd0", "#575757"],
			["promo-vs-link", "#c71585", "#2d4fd6"],
		];
		const T = 0.002;
		const luma = (h: string) => {
			const [r, g, b] = hexToRgb(h);
			return 0.2126 * r + 0.7152 * g + 0.0722 * b;
		};
		const exp = pairs.map(([id, a, b]) => {
			const ya = relativeLuminance(hexToRgb(a));
			const yb = relativeLuminance(hexToRgb(b));
			const la = rgbToOklab(hexToRgb(a))[0];
			const lb = rgbToOklab(hexToRgb(b))[0];
			assert(Math.abs(ya - yb) >= 0.004, `q304-3 ${id} luminance gap`);
			assert(Math.abs(la - lb) >= 0.006, `q304-3 ${id} Oklab gap`);
			return {
				id,
				luminance: [r4(ya), r4(yb)],
				oklabL: [r4(la), r4(lb)],
				lighterByLuminance: ya > yb ? "first" : "second",
				lighterByOklab: la > lb ? "first" : "second",
				luma: [r4(luma(a)), r4(luma(b))],
				lighterByLuma: luma(a) > luma(b) ? "first" : "second",
			};
		});
		const disagree = exp.filter((e) => e.lighterByLuminance !== e.lighterByOklab).map((e) => e.id);
		assert(disagree.length >= 2 && disagree.length < exp.length, "q304-3 needs both agreeing and disagreeing pairs");
		assert(new Set(exp.filter((e) => disagree.includes(e.id)).map((e) => e.lighterByOklab)).size === 2, "q304-3 disagreements in both directions");
		const lumaDis = exp.filter((e) => e.lighterByLuma !== e.lighterByOklab).map((e) => e.id);
		assert(lumaDis.join() !== disagree.join(), "q304-3 luma trap missing");
		const witness = { results: exp.map(({ luma: _a, lighterByLuma: _b, ...e }) => e), disagree };
		tasks.push(
			task(304, 3, {
				prompt: `A colleague claims "WCAG relative luminance and Oklab lightness always agree on which of two colors is lighter, they're just different scales." I don't think that's true for saturated colors. Check these pairs (first color, second color):
${pairs.map(([id, a, b]) => `- ${id}: ${a} vs ${b}`).join("\n")}

Measures:
- luminance: WCAG 2.x relative luminance, 0-1: linearize each sRGB channel (c/12.92 up to 0.04045, ((c + 0.055)/1.055)^2.4 above), then 0.2126·R + 0.7152·G + 0.0722·B.
- oklabL: the L of ${OKLAB_V3}.

For each pair give both colors' luminance and Oklab L (four decimals, first color then second), which color is lighter by each measure ("first" or "second"), and finally the ids of the pairs where the two measures disagree.
${contract(`{"results": [{"id": "cta-vs-text", "luminance": [0.0000, 0.0000], "oklabL": [0.0000, 0.0000], "lighterByLuminance": "first", "lighterByOklab": "first"}, ...one per pair], "disagree": ["id", ...]}`)}`,
				schema: obj({
					results: arr(
						obj({
							id: STR,
							luminance: arr(NUM, 2),
							oklabL: arr(NUM, 2),
							lighterByLuminance: { enum: ["first", "second"] },
							lighterByOklab: { enum: ["first", "second"] },
						}),
					),
					disagree: arr(STR),
				}),
				params: {
					rows: exp.map((e) => ({
						key: e.id,
						checks: [
							spec(`luminance-${e.id}`, ["luminance"], vecE(e.luminance, [T, T])),
							spec(`oklab-l-${e.id}`, ["oklabL"], vecE(e.oklabL, [T, T])),
							spec(`by-luminance-${e.id}`, ["lighterByLuminance"], eq(e.lighterByLuminance)),
							spec(`by-oklab-${e.id}`, ["lighterByOklab"], eq(e.lighterByOklab)),
						],
					})),
					top: [spec("disagree", ["disagree"], { k: "set", v: disagree })],
					derivation: {
						inputs: { pairs },
						lumaOnEncodedDisagreements: lumaDis,
						margins: "within each pair the luminances differ by >= 0.004 and the Oklab L values by >= 0.006",
						tolerance: `±${T} on luminance and Oklab L (threshold and matrix variants < 2e-4)`,
					},
				},
				witness,
				invalid: [
					// "they always agree": the Oklab verdict copied from luminance
					{ results: witness.results.map((e) => ({ ...e, lighterByOklab: e.lighterByLuminance })), disagree: [] },
					// luminance computed without linearization (luma on encoded values)
					{
						results: exp.map((e) => ({
							id: e.id,
							luminance: e.luma,
							oklabL: e.oklabL,
							lighterByLuminance: e.lighterByLuma,
							lighterByOklab: e.lighterByOklab,
						})),
						disagree: lumaDis,
					},
				],
			}),
		);
	}

	// q304-4: correlated color temperature of off-white surface tokens with McCamy's formula; warm-to-cool order.
	{
		const tokens = shuffled<[string, string]>(
			[
				["candle", "#ffe9cc"],
				["ivory", "#fff8e7"],
				["linen", "#fdf6ec"],
				["bone", "#f0f0e8"],
				["cloud", "#ececec"],
				["frost", "#f4f7ff"],
				["glacier", "#eaf2ff"],
			],
			30404,
		);
		const T = { xy: 0.001, cct: 20 };
		const GAP = 150;
		type E = { id: string; x: number; y: number; cct: number };
		const exp: E[] = tokens.map(([id, hex]) => {
			const [x, y] = xyzToXyY(srgbToXyz(hexToRgb(hex)));
			return { id, x, y, cct: mccamyCct(x, y) };
		});
		const order = [...exp].sort((a, b) => a.cct - b.cct);
		for (let i = 1; i < order.length; i++) assert((order[i] as E).cct - (order[i - 1] as E).cct >= GAP, "q304-4 adjacent CCT gap");
		for (const e of exp) assert(Math.abs(mccamyCct(r4(e.x), r4(e.y)) - e.cct) < 5, `q304-4 ${e.id} CCT sensitive to xy rounding`);
		const signSlip = (x: number, y: number) => {
			const n = (x - 0.332) / (y - 0.1858);
			return 449 * n ** 3 + 3525 * n ** 2 + 6823.3 * n + 5520.33;
		};
		const witness = {
			results: exp.map((e) => ({ id: e.id, x: r4(e.x), y: r4(e.y), cct: Math.round(e.cct) })),
			warmToCool: order.map((e) => e.id),
		};
		tasks.push(
			task(304, 4, {
				prompt: `We describe our off-white surface tokens to clients by "temperature" and I want real numbers behind the words. For each token, compute its CIE 1931 chromaticity x, y from CIE XYZ (sRGB hex decoded with the IEC 61966-2-1 curve, sRGB primaries, D65 white), then estimate the correlated color temperature with McCamy's 1992 cubic: n = (x − 0.3320)/(0.1858 − y), CCT = 449·n³ + 3525·n² + 6823.3·n + 5520.33 kelvin.

Tokens:
${tokens.map(([id, h]) => `- ${id}: ${h}`).join("\n")}

Give x and y (four decimals) and the CCT (whole kelvin) for each, then the token ids ordered from warmest (lowest CCT) to coolest.
${contract(`{"results": [{"id": "candle", "x": 0.0000, "y": 0.0000, "cct": 0}, ...one per token], "warmToCool": ["id", ...]}`)}`,
				schema: obj({ results: arr(obj({ id: STR, x: NUM, y: NUM, cct: NUM })), warmToCool: arr(STR, tokens.length) }),
				params: {
					rows: witness.results.map((e) => ({
						key: e.id,
						checks: [
							spec(`x-${e.id}`, ["x"], num(e.x, T.xy)),
							spec(`y-${e.id}`, ["y"], num(e.y, T.xy)),
							spec(`cct-${e.id}`, ["cct"], num(e.cct, T.cct)),
						],
					})),
					top: [spec("warm-to-cool", ["warmToCool"], { k: "seq", v: witness.warmToCool })],
					derivation: {
						inputs: { tokens },
						margins: `adjacent CCTs >= ${GAP} K apart; computing CCT from four-decimal x, y moves it by < 5 K (asserted)`,
						tolerance: `x, y ±${T.xy}; CCT ±${T.cct} K (matrix variants move x, y by < 2e-4, i.e. < 10 K)`,
					},
				},
				witness,
				invalid: [
					// order reversed (cool to warm)
					{ ...witness, warmToCool: [...witness.warmToCool].reverse() },
					// sign slip in n: (x − 0.3320)/(y − 0.1858)
					{
						results: exp.map((e) => ({ id: e.id, x: r4(e.x), y: r4(e.y), cct: Math.round(signSlip(e.x, e.y)) })),
						warmToCool: [...exp].sort((a, b) => signSlip(a.x, a.y) - signSlip(b.x, b.y)).map((e) => e.id),
					},
				],
			}),
		);
	}

	// q304-5: chroma headroom: each swatch's Oklch chroma as a share of the most chroma sRGB allows at the same L and h.
	{
		const colors = ["#7d9c7a", "#ff6a13", "#5b7db1", "#c58b9a", "#2e8b57", "#d3a118"];
		const T = { L: 0.002, C: 0.002, h: 1, max: 0.004, pct: 2 };
		type E = { hex: string; L: number; C: number; h: number; maxC: number; pct: number; sens: number };
		const exp: E[] = colors.map((hex) => {
			const [L, C, h] = srgbToOklchV(hexToRgb(hex));
			const max = maxSrgbChroma(L, h);
			// implementation variants (matrix digits move L by < 2e-4 and h by < 0.1°) must stay well inside the Cmax tolerance
			let worst = 0;
			for (const dL of [-0.0002, 0.0002]) for (const dh of [-0.1, 0.1]) worst = Math.max(worst, Math.abs(maxSrgbChroma(L + dL, h + dh) - max));
			assert(worst <= T.max / 2, `q304-5 ${hex} max chroma too sensitive (${worst})`);
			return { hex, L: r4(L), C: r4(C), h: r2(h), maxC: r4(max), pct: r1((100 * C) / max), sens: worst };
		});
		const byPct = [...exp].sort((a, b) => a.pct - b.pct);
		const most = (byPct[0] as E).hex;
		const least = (byPct[byPct.length - 1] as E).hex;
		assert((byPct[1] as E).pct - (byPct[0] as E).pct >= 5, "q304-5 most-headroom margin");
		assert((byPct[byPct.length - 1] as E).pct - (byPct[byPct.length - 2] as E).pct >= 2.5, "q304-5 least-headroom margin");
		// CSS reference-range trap: oklch() percentages map 100% chroma to 0.4
		const cssPct = exp.map((e) => ({ ...e, maxC: 0.4, pct: r1((100 * e.C) / 0.4) }));
		const cssSorted = [...cssPct].sort((a, b) => a.pct - b.pct);
		const strip = (rows: E[]) => rows.map(({ sens: _s, ...e }) => e);
		const witness = { results: strip(exp), mostHeadroom: most, leastHeadroom: least };
		tasks.push(
			task(304, 5, {
				prompt: `For our palette generator I want to know how much more chroma each brand swatch could take before leaving sRGB. Work in Oklch, the polar form of ${OKLAB_V3}. For each swatch give its Oklch L, C and h, then the maximum chroma Cmax that an sRGB color with the same L and h can have (the largest C for which converting back to sRGB keeps every channel within 0-1, no clipping), and C as a percentage of Cmax.

Precision: L, C and Cmax to four decimals, h to two, the percentage to one decimal. Then name the swatch with the most headroom (lowest percentage) and the one with the least.

Swatches: ${colors.join(", ")}
${contract(`{"results": [{"hex": "#rrggbb", "L": 0.0000, "C": 0.0000, "h": 0.00, "maxC": 0.0000, "pct": 0.0}, ...one per swatch], "mostHeadroom": "#rrggbb", "leastHeadroom": "#rrggbb"}`)}`,
				schema: obj({
					results: arr(obj({ hex: HEX, L: NUM, C: NUM, h: NUM, maxC: NUM, pct: NUM })),
					mostHeadroom: HEX,
					leastHeadroom: HEX,
				}),
				params: {
					key: "hex",
					rows: exp.map((e) => ({
						key: e.hex,
						checks: [
							spec(`L-${e.hex}`, ["L"], num(e.L, T.L)),
							spec(`C-${e.hex}`, ["C"], num(e.C, T.C)),
							spec(`h-${e.hex}`, ["h"], { k: "hue", v: e.h, tol: T.h }),
							spec(`max-c-${e.hex}`, ["maxC"], num(e.maxC, T.max)),
							spec(`pct-${e.hex}`, ["pct"], num(e.pct, T.pct)),
						],
					})),
					top: [spec("most-headroom", ["mostHeadroom"], eq(most)), spec("least-headroom", ["leastHeadroom"], eq(least))],
					derivation: {
						inputs: { colors },
						maxChromaSensitivity: Object.fromEntries(exp.map((e) => [e.hex, round(e.sens, 5)])),
						cssPercentMostHeadroom: (cssSorted[0] as E).hex,
						margins: "most-headroom swatch >= 5 points below the next; least-headroom swatch >= 2.5 points above the next",
						tolerance: `L, C ±${T.L}; h ±${T.h}°; Cmax ±${T.max} (L ±0.0002 and h ±0.1° move it by at most half that, asserted); percentage ±${T.pct}`,
					},
				},
				witness,
				invalid: [
					// CSS oklch() percentage reference (0.4 = 100%) used as the maximum
					{ results: strip(cssPct), mostHeadroom: (cssSorted[0] as E).hex, leastHeadroom: (cssSorted[cssSorted.length - 1] as E).hex },
					// right numbers, extremes swapped
					{ results: witness.results, mostHeadroom: least, leastHeadroom: most },
				],
			}),
		);
	}
	return tasks;
}

/** Neutral suite v3, author A: returns this author's categories' tasks. */
export function neutral3A(): Task[] {
	return [...cat301(), ...cat302(), ...cat303(), ...cat304()];
}
