/**
 * Neutral suite, author A: categories 301-304 (apca-contrast, delta-e, space-conversion,
 * color-properties). Every expected value comes from the hand-written references in
 * src/reference-neutral/a-*.ts; every margin the brief requires is asserted at build time, so a
 * change of inputs that breaks a margin fails the build instead of shipping an ambiguous task.
 */
import type { CheckSpec, Expect, TableParams } from "../../graders-neutral/a-table.js";
import {
	contrastRatio,
	deltaE2000,
	hexToRgb,
	linearToSrgb,
	type Rgb,
	rgbToHex,
	type Vec3,
} from "../../reference/color.js";
import { apcaLc, apcaLc1 } from "../../reference-neutral/a-apca.js";
import { de00Hex, de76Hex, de94Hex, labOfHex } from "../../reference-neutral/a-deltae.js";
import {
	bt709Gray,
	hslS,
	oklabGray,
	oklabL,
	oklchC,
	wcagLuminance,
} from "../../reference-neutral/a-properties.js";
import {
	hslToSrgb,
	hsvToSrgb,
	labToSrgb,
	labToXyz,
	lchToSrgb,
	mulM,
	oklchToSrgb,
	p3ToSrgb,
	SRGB_TO_XYZ,
	srgbToCmykNaive,
	srgbToHsl,
	srgbToHsv,
	srgbToHwb,
	srgbToLab,
	srgbToLch,
	srgbToLinearRgb,
	srgbToOklabV,
	srgbToOklchV,
	srgbToP3,
	srgbToRec2020,
	srgbToRec2020Linear,
	srgbToXyz,
	toPolar,
	xyzToLab,
	xyzToSrgb,
} from "../../reference-neutral/a-spaces.js";
import { contract, mulberry32, round } from "../build/common.js";
import { CATEGORY_NAMES, type Task } from "../types.js";

// ---------- small builders ----------

function assert(cond: boolean, msg: string): void {
	if (!cond) throw new Error(`neutralA build: ${msg}`);
}

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
const argmin = (xs: number[]) => xs.indexOf(Math.min(...xs));
const secondMin = (xs: number[]) => [...xs].sort((a, b) => a - b)[1] as number;

/** Max change of CIEDE2000 when either color's Lab moves by 0.03 along any axis (guards the formula's hue discontinuity). */
function de00Sensitivity(a: string, b: string): number {
	const la = labOfHex(a);
	const lb = labOfHex(b);
	const base = deltaE2000(la, lb);
	let worst = 0;
	for (const which of [0, 1])
		for (let k = 0; k < 3; k++)
			for (const s of [-0.03, 0.03]) {
				const p = [...(which === 0 ? la : lb)] as [number, number, number];
				p[k] = (p[k] as number) + s;
				const d = which === 0 ? deltaE2000(p, lb) : deltaE2000(la, p);
				worst = Math.max(worst, Math.abs(d - base));
			}
	return worst;
}

// ---------- shared prompt fragments ----------

const APCA_STD =
	"APCA-W3 version 0.0.98G-4g, computed as follows. Screen luminance of each color: Y = 0.2126729·R^2.4 + 0.7151522·G^2.4 + 0.0721750·B^2.4 on the 0-1 sRGB channel values (simple 2.4 exponent, no linear segment). Soft black clamp: if Y < 0.022 then Y += (0.022 − Y)^1.414. If |Ybg − Ytxt| < 0.0005 then Lc = 0. Normal polarity (Ybg > Ytxt): S = (Ybg^0.56 − Ytxt^0.57) × 1.14, and Lc = 0 if S < 0.1, otherwise S − 0.027. Reverse polarity (Ybg ≤ Ytxt): S = (Ybg^0.65 − Ytxt^0.62) × 1.14, and Lc = 0 if S > −0.1, otherwise S + 0.027. Finally multiply by 100";
const APCA_SIGN =
	"Lc is signed: positive when darker text sits on a lighter background, negative when lighter text sits on a darker background.";
const WCAG_STD =
	"WCAG 2.x contrast ratio ((L1 + 0.05) / (L2 + 0.05) with WCAG relative luminance from linearized sRGB)";
const LAB_STD =
	"CIELAB here means: hex as sRGB (IEC 61966-2-1 transfer curve), linearized, converted to CIE XYZ with the D65 white (Y of white = 1), then to L*a*b* with the D65 reference white (Xn ≈ 0.9505, Yn = 1, Zn ≈ 1.0888), with no chromatic adaptation to D50.";

// =====================================================================================
// 301 apca-contrast
// =====================================================================================

function cat301(): Task[] {
	const tasks: Task[] = [];
	const LC_TOL = 1.0;

	// n301-1: report signed Lc for six token pairings, including reversed polarity and a low-contrast clip.
	{
		const pairs: [string, string, string][] = [
			["heading-on-page", "#1f2937", "#ffffff"],
			["muted-on-subtle", "#6b7280", "#f9fafb"],
			["dark-mode-body", "#e5e7eb", "#111827"],
			["primary-button", "#ffffff", "#2563eb"],
			["warning-banner", "#b45309", "#fef3c7"],
			["divider-label", "#3a3a3a", "#1a1a1a"],
		];
		assert(apcaLc1("#3a3a3a", "#1a1a1a") === 0, "divider-label should fall under the low-contrast clip");
		const witness = { results: pairs.map(([id, t, b]) => ({ id, lc: apcaLc1(t, b) })) };
		tasks.push(
			task(301, 1, {
				prompt: `I'm writing the contrast table for our design-system docs and want APCA numbers next to each token pairing. Use ${APCA_STD}. ${APCA_SIGN} Report each Lc to about one decimal.

Pairings (text color on background color):
${pairs.map(([id, t, b]) => `- ${id}: text ${t} on background ${b}`).join("\n")}

Use the ids exactly as written.
${contract(`{"results": [{"id": "heading-on-page", "lc": 0.0}, ...one entry per pairing]}`)}`,
				schema: obj({ results: arr(obj({ id: STR, lc: NUM })) }),
				params: {
					rows: pairs.map(([id, t, b]) => ({ key: id, checks: [spec(`lc-${id}`, ["lc"], num(apcaLc1(t, b), LC_TOL))] })),
					derivation: {
						standard: "APCA-W3 0.0.98G-4g",
						tolerance: `±${LC_TOL} Lc: reference rounded to 0.1; absorbs rounding of intermediate luminances`,
					},
				},
				witness,
				invalid: [
					// sign dropped
					{ results: witness.results.map((r) => ({ ...r, lc: Math.abs(r.lc) })) },
					// text and background swapped
					{ results: pairs.map(([id, t, b]) => ({ id, lc: apcaLc1(b, t) })) },
				],
			}),
		);
	}

	// n301-2: threshold verdicts per use (body 75, large 60, incidental 45), every pair >= 3 Lc from its threshold.
	{
		const BODY = 75;
		const LARGE = 60;
		const INCID = 45;
		const rows0: [string, string, string, number][] = [
			["article-body", "#4b5563", "#ffffff", BODY],
			["footer-links", "#a3a3a3", "#262626", BODY],
			["form-help-text", "#767676", "#ffffff", BODY],
			["promo-headline", "#ffffff", "#d97706", LARGE],
			["cta-button-label", "#000000", "#2563eb", LARGE],
			["search-placeholder", "#9ca3af", "#ffffff", INCID],
			["sale-badge", "#000000", "#f97316", INCID],
		];
		const useName = (th: number) => (th === BODY ? "body text" : th === LARGE ? "large text" : "incidental text");
		const exp = rows0.map(([id, t, b, th]) => {
			const lc = apcaLc(t, b);
			assert(Math.abs(Math.abs(lc) - th) >= 3, `n301-2 ${id} too close to threshold (${lc})`);
			return { id, lc: r1(lc), passes: Math.abs(lc) >= th, th };
		});
		assert(exp.some((e) => e.passes) && exp.some((e) => !e.passes), "n301-2 needs both verdicts");
		assert(exp.some((e) => e.passes && e.lc < 0), "n301-2 needs a passing negative-polarity row");
		const witness = { results: exp.map(({ th: _t, ...e }) => e) };
		tasks.push(
			task(301, 2, {
				prompt: `Accessibility review for our new landing page. We grade text with ${APCA_STD}. ${APCA_SIGN} Our policy only looks at the magnitude, so a pairing passes when |Lc| is at least the minimum for its use, whichever polarity it has:
- body text: |Lc| >= ${BODY}
- large text (headlines, big button labels): |Lc| >= ${LARGE}
- incidental text (placeholders, badges): |Lc| >= ${INCID}

Elements (text color on background color, use):
${rows0.map(([id, t, b, th]) => `- ${id}: ${t} on ${b}, ${useName(th)}`).join("\n")}

For each element give the signed Lc (about one decimal) and whether it passes.
${contract(`{"results": [{"id": "article-body", "lc": 0.0, "passes": true}, ...one entry per element]}`)}`,
				schema: obj({ results: arr(obj({ id: STR, lc: NUM, passes: BOOL })) }),
				params: {
					rows: exp.map((e) => ({
						key: e.id,
						checks: [spec(`passes-${e.id}`, ["passes"], eq(e.passes)), spec(`lc-${e.id}`, ["lc"], num(e.lc, LC_TOL))],
					})),
					derivation: { thresholds: { body: BODY, large: LARGE, incidental: INCID }, minMarginLc: 3 },
				},
				witness,
				invalid: [
					// signed comparison: a negative Lc never passes
					{ results: exp.map(({ th, ...e }) => ({ ...e, passes: e.lc >= th })) },
					// everything passes
					{ results: exp.map(({ th: _t, ...e }) => ({ ...e, passes: true })) },
				],
			}),
		);
	}

	// n301-3: best text color among six candidates on a mid-tone background.
	{
		const bg = "#0891b2";
		const cands = ["#0f172a", "#fef08a", "#fff7ed", "#431407", "#e2e8f0", "#334155"];
		const lcs = cands.map((c) => apcaLc(c, bg));
		const mags = lcs.map(Math.abs);
		const bi = mags.indexOf(Math.max(...mags));
		const best = cands[bi] as string;
		const sorted = [...mags].sort((a, b) => b - a);
		assert((sorted[0] as number) - (sorted[1] as number) >= 3, "n301-3 best not 3 Lc clear");
		const bestLc = lcs[bi] as number;
		assert(Math.abs(Math.abs(bestLc) - 60) >= 3, "n301-3 best too close to 60");
		const meets = Math.abs(bestLc) >= 60;
		// The candidate a WCAG 2 ratio would favor, for the invalid answer.
		const wcagBest = cands.reduce((a, c) => (contrastRatio(c, bg) > contrastRatio(a, bg) ? c : a));
		assert(wcagBest !== best, "n301-3 should separate WCAG and APCA picks");
		const witness = { best, lc: r1(bestLc), meetsLc60: meets };
		tasks.push(
			task(301, 3, {
				prompt: `Our status chips use a cyan fill, ${bg}, and the brand team gave me six approved text colors to choose from: ${cands.join(", ")}. I want the one that gives the strongest perceptual contrast on that fill according to ${APCA_STD}, i.e. the largest |Lc|. ${APCA_SIGN}

Tell me which candidate wins, its signed Lc (about one decimal), and whether its |Lc| reaches 60, which is what we need at the chip label size.
${contract(`{"best": "#rrggbb", "lc": 0.0, "meetsLc60": true}`)}`,
				schema: obj({ best: HEX, lc: NUM, meetsLc60: BOOL }),
				params: {
					top: [
						spec("best", ["best"], eq(best)),
						spec("lc-best", ["lc"], num(r1(bestLc), LC_TOL)),
						spec("meets-lc60", ["meetsLc60"], eq(meets)),
					],
					derivation: {
						background: bg,
						lcByCandidate: Object.fromEntries(cands.map((c, i) => [c, r1(lcs[i] as number)])),
						marginToRunnerUpLc: r1((sorted[0] as number) - (sorted[1] as number)),
						wcagRatioWinner: wcagBest,
					},
				},
				witness,
				invalid: [
					{ best: wcagBest, lc: r1(apcaLc(wcagBest, bg)), meetsLc60: false },
					{ best, lc: r1(Math.abs(bestLc)), meetsLc60: meets },
				],
			}),
		);
	}

	// n301-4: WCAG 2 AA vs APCA Lc 60 verdicts, flag the disagreements.
	{
		const pairs: [string, string, string][] = [
			["r1", "#000000", "#3b82f6"],
			["r2", "#ffffff", "#16a34a"],
			["r3", "#595959", "#ffffff"],
			["r4", "#000000", "#d97706"],
			["r5", "#9ca3af", "#ffffff"],
			["r6", "#ffffff", "#ef4444"],
		];
		const exp = pairs.map(([id, t, b]) => {
			const ratio = contrastRatio(t, b);
			const lc = apcaLc(t, b);
			assert(Math.abs(ratio - 4.5) >= 0.3, `n301-4 ${id} ratio too close to 4.5`);
			assert(Math.abs(Math.abs(lc) - 60) >= 3, `n301-4 ${id} Lc too close to 60`);
			return { id, wcagPass: ratio >= 4.5, apcaPass: Math.abs(lc) >= 60, ratio, lc };
		});
		const dis = exp.filter((e) => e.wcagPass !== e.apcaPass).map((e) => e.id);
		assert(dis.length >= 2 && dis.length < exp.length, "n301-4 needs a mix of agreements and disagreements");
		const witness = {
			results: exp.map((e) => ({ id: e.id, wcagPass: e.wcagPass, apcaPass: e.apcaPass })),
			disagreements: dis,
		};
		tasks.push(
			task(301, 4, {
				prompt: `We're moving our design system's components from WCAG 2 AA to APCA and I need to know which existing pairings change verdict. For each pairing below (text on background):
- WCAG verdict: passes if the ${WCAG_STD} is at least 4.5:1.
- APCA verdict: passes if |Lc| is at least 60 under ${APCA_STD}, regardless of polarity.

${pairs.map(([id, t, b]) => `- ${id}: ${t} on ${b}`).join("\n")}

Give both verdicts per pairing, then list the ids where the two verdicts differ.
${contract(`{"results": [{"id": "r1", "wcagPass": true, "apcaPass": false}, ...one per pairing], "disagreements": ["r1", ...]}`)}`,
				schema: obj({
					results: arr(obj({ id: STR, wcagPass: BOOL, apcaPass: BOOL })),
					disagreements: arr(STR),
				}),
				params: {
					rows: exp.map((e) => ({
						key: e.id,
						checks: [spec(`wcag-${e.id}`, ["wcagPass"], eq(e.wcagPass)), spec(`apca-${e.id}`, ["apcaPass"], eq(e.apcaPass))],
					})),
					top: [spec("disagreements", ["disagreements"], { k: "set", v: dis })],
					derivation: {
						values: Object.fromEntries(exp.map((e) => [e.id, { ratio: r2(e.ratio), lc: r1(e.lc) }])),
						margins: "every ratio >= 0.3 from 4.5, every |Lc| >= 3 from 60",
					},
				},
				witness,
				invalid: [
					// copied the WCAG verdict into APCA
					{ results: exp.map((e) => ({ id: e.id, wcagPass: e.wcagPass, apcaPass: e.wcagPass })), disagreements: [] },
					// signed APCA comparison (negative Lc treated as failing)
					{
						results: exp.map((e) => ({ id: e.id, wcagPass: e.wcagPass, apcaPass: e.lc >= 60 })),
						disagreements: exp.filter((e) => e.wcagPass !== e.lc >= 60).map((e) => e.id),
					},
				],
			}),
		);
	}

	// n301-5: white or black label per fill, under WCAG 2 and under APCA.
	{
		const fills = ["#ea580c", "#0d9488", "#9333ea", "#d4a017", "#65a30d"];
		const exp = fills.map((bg) => {
			const rw = contrastRatio("#ffffff", bg);
			const rk = contrastRatio("#000000", bg);
			const lw = apcaLc("#ffffff", bg);
			const lk = apcaLc("#000000", bg);
			assert(Math.max(rw, rk) / Math.min(rw, rk) >= 1.1, `n301-5 ${bg} WCAG ratios too close`);
			assert(Math.abs(Math.abs(lw) - Math.abs(lk)) >= 3, `n301-5 ${bg} APCA too close`);
			const apca = Math.abs(lw) > Math.abs(lk) ? "white" : "black";
			return { background: bg, wcag: rw > rk ? "white" : "black", apca, lc: r1(apca === "white" ? lw : lk) };
		});
		assert(
			exp.some((e) => e.wcag !== e.apca) && exp.some((e) => e.wcag === e.apca),
			"n301-5 needs agreement and disagreement",
		);
		const witness = { results: exp };
		const labelHex = (c: string) => (c === "white" ? "#ffffff" : "#000000");
		tasks.push(
			task(301, 5, {
				prompt: `Our button generator puts either pure white (#ffffff) or pure black (#000000) label text on each brand fill. Two teammates disagree about the rule: one picks whichever gives the higher ${WCAG_STD}, the other picks whichever gives the larger |Lc| under ${APCA_STD}. ${APCA_SIGN}

For each fill, tell me which label color each rule picks, and the signed Lc (about one decimal) of the label the APCA rule picks.
Fills: ${fills.join(", ")}
${contract(`{"results": [{"background": "#rrggbb", "wcag": "white" | "black", "apca": "white" | "black", "lc": 0.0}, ...one per fill]}`)}`,
				schema: obj({
					results: arr(obj({ background: HEX, wcag: { enum: ["white", "black"] }, apca: { enum: ["white", "black"] }, lc: NUM })),
				}),
				params: {
					key: "background",
					rows: exp.map((e) => ({
						key: e.background,
						checks: [
							spec(`wcag-${e.background}`, ["wcag"], eq(e.wcag)),
							spec(`apca-${e.background}`, ["apca"], eq(e.apca)),
							spec(`lc-${e.background}`, ["lc"], num(e.lc, LC_TOL)),
						],
					})),
					derivation: { margins: "WCAG ratios differ by >= 10%, |Lc| differ by >= 3" },
				},
				witness,
				invalid: [
					{ results: exp.map((e) => ({ ...e, apca: e.wcag, lc: r1(apcaLc(labelHex(e.wcag), e.background)) })) },
					{ results: exp.map((e) => ({ ...e, wcag: "white", apca: "white" })) },
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
	const stable = (a: string, b: string, where: string) =>
		assert(de00Sensitivity(a, b) <= 0.05, `${where}: CIEDE2000 unstable for ${a} ${b}`);

	// n302-1: three metrics for four reference/proof pairs.
	{
		const pairs: [string, string, string][] = [
			["red", "#c8102e", "#d22630"],
			["navy", "#1e3a8a", "#1d4ed8"],
			["gray", "#9ca3af", "#a1a1aa"],
			["yellow", "#ffd100", "#f2c700"],
		];
		const exp = pairs.map(([id, a, b]) => {
			stable(a, b, "n302-1");
			return { id, de76: r2(de76Hex(a, b)), de94: r2(de94Hex(a, b)), de2000: r2(de00Hex(a, b)) };
		});
		// the CIE94 asymmetry must matter somewhere, so the "wrong reference" invalid answer fails
		assert(
			pairs.some(([, a, b]) => Math.abs(de94Hex(a, b) - de94Hex(b, a)) > 3 * TOL),
			"n302-1 CIE94 asymmetry invisible",
		);
		const witness = { results: exp };
		tasks.push(
			task(302, 1, {
				prompt: `Print QA: for each pair below, the first color is our approved reference and the second is what came back on the press proof (both given as sRGB hex). I need three color-difference numbers per pair, each to about two decimals:
- de76: CIE76, the Euclidean distance in L*a*b*.
- de94: CIE94 with graphic-arts weights (kL = kC = kH = 1, K1 = 0.045, K2 = 0.015, SL = 1, SC = 1 + K1·C1, SH = 1 + K2·C1), where C1 is the chroma of the reference (first) color.
- de2000: CIEDE2000 with kL = kC = kH = 1.

${LAB_STD}

${pairs.map(([id, a, b]) => `- ${id}: reference ${a}, proof ${b}`).join("\n")}
${contract(`{"results": [{"id": "red", "de76": 0.00, "de94": 0.00, "de2000": 0.00}, ...one per pair]}`)}`,
				schema: obj({ results: arr(obj({ id: STR, de76: NUM, de94: NUM, de2000: NUM })) }),
				params: {
					rows: exp.map((e) => ({
						key: e.id,
						checks: [
							spec(`de76-${e.id}`, ["de76"], num(e.de76, TOL)),
							spec(`de94-${e.id}`, ["de94"], num(e.de94, TOL)),
							spec(`de2000-${e.id}`, ["de2000"], num(e.de2000, TOL)),
						],
					})),
					derivation: {
						tolerance: `±${TOL}: D65 white-constant variants move these by < 0.02; CIEDE2000 moves <= 0.05 under ±0.03 Lab perturbation`,
					},
				},
				witness,
				invalid: [
					// CIE94 with the proof as the reference
					{ results: pairs.map(([id, a, b], i) => ({ ...exp[i], id, de94: r2(de94Hex(b, a)) })) },
					// CIE76 reported for every metric
					{ results: exp.map((e) => ({ id: e.id, de76: e.de76, de94: e.de76, de2000: e.de76 })) },
				],
			}),
		);
	}

	// n302-2: nearest to a target and full order, adjacent gaps >= 1.0 dE00.
	{
		const target = "#c8102e";
		const cands = ["#c4122f", "#d50032", "#b31b34", "#a6192e", "#da291c"];
		const ds = cands.map((c) => {
			stable(target, c, "n302-2");
			return de00Hex(target, c);
		});
		const order = [...cands].sort((a, b) => de00Hex(target, a) - de00Hex(target, b));
		const sortedD = [...ds].sort((a, b) => a - b);
		for (let i = 1; i < sortedD.length; i++)
			assert((sortedD[i] as number) - (sortedD[i - 1] as number) >= 1.0, "n302-2 adjacent gap < 1.0");
		const shown = shuffled(cands, 3022);
		const nearest = order[0] as string;
		const nearestDe = r2(sortedD[0] as number);
		const witness = { nearest, nearestDeltaE: nearestDe, order };
		tasks.push(
			task(302, 2, {
				prompt: `Our brand red is ${target}. Five ink vendors sent swatches (as sRGB hex): ${shown.join(", ")}. Rank the swatches from closest to farthest from the brand red using CIEDE2000 (kL = kC = kH = 1). ${LAB_STD}

Give the closest swatch, its CIEDE2000 difference from the brand red (about two decimals), and the full ranking.
${contract(`{"nearest": "#rrggbb", "nearestDeltaE": 0.00, "order": ["#rrggbb", ...all five, closest first]}`)}`,
				schema: obj({ nearest: HEX, nearestDeltaE: NUM, order: arr(HEX, 5) }),
				params: {
					top: [
						spec("nearest", ["nearest"], eq(nearest)),
						spec("nearest-de", ["nearestDeltaE"], num(nearestDe, TOL)),
						spec("order", ["order"], { k: "seq", v: order }),
					],
					derivation: { de2000: Object.fromEntries(cands.map((c, i) => [c, r2(ds[i] as number)])), minAdjacentGap: 1.0 },
				},
				witness,
				invalid: [
					{ nearest, nearestDeltaE: nearestDe, order: [...order].reverse() },
					{ nearest, nearestDeltaE: r2(de76Hex(target, nearest)), order },
				],
			}),
		);
	}

	// n302-3: classify pairs against a just-noticeable threshold, every pair >= 15% from it.
	{
		const TH = 2.0;
		const pairs: [string, string, string][] = [
			["primary-hover", "#5c7cfa", "#6080f5"],
			["surface-tint", "#d0d0d0", "#d6d0d0"],
			["border-subtle", "#e9ecef", "#e3e7ea"],
			["text-strong", "#212529", "#2a2e33"],
			["link-visited", "#3b5bdb", "#3d5fe0"],
			["info-fill", "#0b7285", "#0c7c8f"],
		];
		const exp = pairs.map(([id, a, b]) => {
			stable(a, b, "n302-3");
			const d = de00Hex(a, b);
			assert(Math.abs(d - TH) >= 0.15 * TH, `n302-3 ${id} within 15% of threshold (${d})`);
			return { id, deltaE: r2(d), mergeable: d < TH };
		});
		assert(
			pairs.some(([, a, b]) => de76Hex(a, b) < TH !== de00Hex(a, b) < TH),
			"n302-3 no pair where CIE76 lands on the other side",
		);
		const witness = { results: exp };
		tasks.push(
			task(302, 3, {
				prompt: `We're collapsing near-duplicate color tokens. Rule: two tokens may be merged when their CIEDE2000 difference (kL = kC = kH = 1) is below ${TH.toFixed(1)}. ${LAB_STD}

For each token pair, give the CIEDE2000 difference (about two decimals) and whether the pair may be merged.
${pairs.map(([id, a, b]) => `- ${id}: ${a} vs ${b}`).join("\n")}
${contract(`{"results": [{"id": "primary-hover", "deltaE": 0.00, "mergeable": true}, ...one per pair]}`)}`,
				schema: obj({ results: arr(obj({ id: STR, deltaE: NUM, mergeable: BOOL })) }),
				params: {
					rows: exp.map((e) => ({
						key: e.id,
						checks: [spec(`merge-${e.id}`, ["mergeable"], eq(e.mergeable)), spec(`de-${e.id}`, ["deltaE"], num(e.deltaE, TOL))],
					})),
					derivation: {
						threshold: TH,
						minRelativeMargin: 0.15,
						cie76: Object.fromEntries(pairs.map(([id, a, b]) => [id, r2(de76Hex(a, b))])),
					},
				},
				witness,
				invalid: [
					// CIE76 used instead
					{ results: pairs.map(([id, a, b]) => ({ id, deltaE: r2(de76Hex(a, b)), mergeable: de76Hex(a, b) < TH })) },
					{ results: exp.map((e) => ({ ...e, mergeable: !e.mergeable })) },
				],
			}),
		);
	}

	// n302-4: the two most similar colors in a set of seven.
	{
		const set = ["#4c6ef5", "#e8590c", "#b8b8b8", "#2b8a3e", "#486aff", "#f59f00", "#beb8b8"];
		const pairs: { a: string; b: string; d00: number; d76: number }[] = [];
		for (let i = 0; i < set.length; i++)
			for (let j = i + 1; j < set.length; j++) {
				const a = set[i] as string;
				const b = set[j] as string;
				pairs.push({ a, b, d00: de00Hex(a, b), d76: de76Hex(a, b) });
			}
		const by00 = [...pairs].sort((x, y) => x.d00 - y.d00);
		const by76 = [...pairs].sort((x, y) => x.d76 - y.d76);
		const best = by00[0] as (typeof pairs)[number];
		const second = by00[1] as (typeof pairs)[number];
		stable(best.a, best.b, "n302-4");
		assert(best.d00 <= 0.85 * second.d00 && second.d00 - best.d00 >= 0.5, "n302-4 margin");
		const wrong = by76[0] as (typeof pairs)[number];
		assert(wrong.a !== best.a || wrong.b !== best.b, "n302-4 CIE76 trap missing");
		const witness = { pair: [best.a, best.b], deltaE: r2(best.d00) };
		tasks.push(
			task(302, 4, {
				prompt: `I'm reviewing a seven-series chart palette and suspect two of the series colors are too close to tell apart. Palette: ${set.join(", ")}.

Comparing every pair with CIEDE2000 (kL = kC = kH = 1), which two colors are the most similar, and what is their difference (about two decimals)? ${LAB_STD}
${contract(`{"pair": ["#rrggbb", "#rrggbb"], "deltaE": 0.00}`)}`,
				schema: obj({ pair: arr(HEX, 2), deltaE: NUM }),
				params: {
					top: [spec("pair", ["pair"], { k: "set", v: [best.a, best.b] }), spec("de", ["deltaE"], num(r2(best.d00), TOL))],
					derivation: {
						closest: r2(best.d00),
						runnerUp: { pair: [second.a, second.b], de2000: r2(second.d00) },
						cie76Closest: { pair: [wrong.a, wrong.b], de76: r2(wrong.d76) },
						margin: "best <= 0.85 x runner-up and >= 0.5 below it",
					},
				},
				witness,
				invalid: [
					{ pair: [wrong.a, wrong.b], deltaE: r2(wrong.d76) },
					{ pair: [best.a, best.b], deltaE: r2(best.d76) },
				],
			}),
		);
	}

	// n302-5: CIE76 and CIEDE2000 disagree on the nearest candidate (found by seeded search at build time).
	{
		const target = "#2a9d8f";
		const seed = 30205;
		const rnd = mulberry32(seed);
		const [tr, tg, tb] = hexToRgb(target).map((v) => Math.round(v * 255)) as [number, number, number];
		const jitter = () => {
			const ch = (c: number) => Math.min(255, Math.max(0, c + Math.round((rnd() * 2 - 1) * 40)));
			return rgbToHex([ch(tr) / 255, ch(tg) / 255, ch(tb) / 255]);
		};
		let found: { cands: string[]; trial: number } | undefined;
		for (let trial = 0; trial < 50000 && !found; trial++) {
			const cands = Array.from({ length: 5 }, jitter);
			if (new Set(cands).size < 5) continue;
			const d76 = cands.map((c) => de76Hex(target, c));
			const d00 = cands.map((c) => de00Hex(target, c));
			if (Math.min(...d00) < 2) continue;
			const i76 = argmin(d76);
			const i00 = argmin(d00);
			if (i76 === i00) continue;
			const m76 = secondMin(d76) - (d76[i76] as number);
			const m00 = secondMin(d00) - (d00[i00] as number);
			if (m76 < 0.5 || m76 < 0.1 * (d76[i76] as number)) continue;
			if (m00 < 0.5 || m00 < 0.1 * (d00[i00] as number)) continue;
			if (cands.some((c) => de00Sensitivity(target, c) > 0.05)) continue;
			found = { cands, trial };
		}
		assert(found !== undefined, "n302-5 search found nothing");
		const { cands, trial } = found as { cands: string[]; trial: number };
		const d76 = cands.map((c) => de76Hex(target, c));
		const d00 = cands.map((c) => de00Hex(target, c));
		const n76 = cands[argmin(d76)] as string;
		const n00 = cands[argmin(d00)] as string;
		const witness = {
			nearestCie76: n76,
			cie76: r2(Math.min(...d76)),
			nearestCiede2000: n00,
			ciede2000: r2(Math.min(...d00)),
		};
		tasks.push(
			task(302, 5, {
				prompt: `Two engineers on my team match colors differently: one uses plain CIE76 (Euclidean distance in L*a*b*), the other uses CIEDE2000 (kL = kC = kH = 1). ${LAB_STD}

Target: ${target}. Candidates: ${cands.join(", ")}.
Which candidate is nearest to the target under each metric, and what is that winner's distance under its own metric (about two decimals)?
${contract(`{"nearestCie76": "#rrggbb", "cie76": 0.00, "nearestCiede2000": "#rrggbb", "ciede2000": 0.00}`)}`,
				schema: obj({ nearestCie76: HEX, cie76: NUM, nearestCiede2000: HEX, ciede2000: NUM }),
				params: {
					top: [
						spec("nearest-cie76", ["nearestCie76"], eq(n76)),
						spec("cie76-value", ["cie76"], num(witness.cie76, TOL)),
						spec("nearest-ciede2000", ["nearestCiede2000"], eq(n00)),
						spec("ciede2000-value", ["ciede2000"], num(witness.ciede2000, TOL)),
					],
					derivation: {
						search: `mulberry32(${seed}); 5 candidates per trial, each channel of ${target} jittered by up to ±40; first trial (${trial}) where the argmins differ, each winner beats its runner-up by >= 0.5 and >= 10%, min dE00 >= 2, CIEDE2000 stable under ±0.03 Lab`,
						cie76: Object.fromEntries(cands.map((c, i) => [c, r2(d76[i] as number)])),
						ciede2000: Object.fromEntries(cands.map((c, i) => [c, r2(d00[i] as number)])),
					},
				},
				witness,
				invalid: [
					{ nearestCie76: n76, cie76: witness.cie76, nearestCiede2000: n76, ciede2000: r2(de00Hex(target, n76)) },
					{ nearestCie76: n00, cie76: r2(de76Hex(target, n00)), nearestCiede2000: n00, ciede2000: witness.ciede2000 },
				],
			}),
		);
	}
	return tasks;
}

// =====================================================================================
// 303 space-conversion
// =====================================================================================

/** Vector expectation; the hue component (hueIdx) is circular and skipped when skipHue. */
const vecE = (v: number[], tol: number[], hueIdx?: number, skipHue = false): Expect => ({
	k: "vec",
	v,
	tol: tol.map((t, i) => (skipHue && i === hueIdx ? null : t)),
	...(hueIdx === undefined ? {} : { hue: [hueIdx] }),
});

/** Lab decoded against the D50 white without adaptation, then treated as D65 XYZ (a classic mix-up). */
const labToSrgbD50Naive = (lab: Vec3): Rgb => xyzToSrgb(labToXyz(lab, [0.96422, 1, 0.82521]));

function cat303(): Task[] {
	const tasks: Task[] = [];

	// n303-1: XYZ, CIELAB, LCh(ab) for a chromatic color and a neutral gray.
	{
		const colors = ["#e76f51", "#7a7a7a"];
		const HUE_FLOOR = 0.5;
		const T = { xyz: 0.001, lab: 0.15, h: 0.5 };
		const exp = colors.map((hex) => {
			const rgb = hexToRgb(hex);
			const lch = srgbToLch(rgb);
			const skipHue = lch[1] < HUE_FLOOR;
			return {
				hex,
				xyz: srgbToXyz(rgb).map(r4),
				lab: srgbToLab(rgb).map(r2),
				lch: [r2(lch[0]), r2(lch[1]), skipHue ? 0 : r2(lch[2])],
				skipHue,
			};
		});
		assert(exp.some((e) => e.skipHue) && exp.some((e) => !e.skipHue), "n303-1 needs chromatic and neutral");
		const witness = { colors: exp.map(({ skipHue: _s, ...rest }) => rest) };
		const fromXyz = (hex: string, xyz: Vec3, white?: Vec3) => {
			const lab = xyzToLab(xyz, white);
			const lch = toPolar(lab);
			return { hex, xyz: xyz.map(r4), lab: lab.map(r2), lch: [r2(lch[0]), r2(lch[1]), r2(lch[2])] };
		};
		tasks.push(
			task(303, 1, {
				prompt: `I'm documenting two colors for a print partner who wants device-independent values. For each sRGB hex below, give:
- xyz: CIE XYZ relative to D65, scaled so that white #ffffff has Y = 1 (about four decimals);
- lab: CIELAB L*, a*, b* (about two decimals);
- lch: CIE LCh(ab), i.e. L*, chroma C*ab = sqrt(a*² + b*²) and hue angle h = atan2(b*, a*) in degrees 0-360 (about two decimals).

${LAB_STD} If C*ab comes out below ${HUE_FLOOR}, the hue angle is undefined; give any value for h (it is not meaningful for achromatic colors).

Colors: ${colors.join(", ")}
${contract(`{"colors": [{"hex": "#rrggbb", "xyz": [X, Y, Z], "lab": [L, a, b], "lch": [L, C, h]}, ...one per color]}`)}`,
				schema: obj({ colors: arr(obj({ hex: HEX, xyz: arr(NUM, 3), lab: arr(NUM, 3), lch: arr(NUM, 3) })) }),
				params: {
					list: "colors",
					key: "hex",
					rows: exp.map((e) => ({
						key: e.hex,
						checks: [
							spec(`xyz-${e.hex}`, ["xyz"], vecE(e.xyz, [T.xyz, T.xyz, T.xyz])),
							spec(`lab-${e.hex}`, ["lab"], vecE(e.lab, [T.lab, T.lab, T.lab])),
							spec(`lch-${e.hex}`, ["lch"], vecE(e.lch, [T.lab, T.lab, T.h], 2, e.skipHue)),
						],
					})),
					derivation: {
						tolerances: `xyz ±${T.xyz} (matrix/white variants differ by < 3e-4); L*, a*, b*, C* ±${T.lab} (white-constant variants < 0.02); h ±${T.h}° when C* >= ${HUE_FLOOR}, otherwise skipped`,
					},
				},
				witness,
				invalid: [
					// sRGB not linearized: encoded values pushed through the matrix
					{ colors: colors.map((hex) => fromXyz(hex, mulM(SRGB_TO_XYZ, hexToRgb(hex)))) },
					// Lab against the D50 white without adaptation
					{ colors: colors.map((hex) => fromXyz(hex, srgbToXyz(hexToRgb(hex)), [0.96422, 1, 0.82521])) },
				],
			}),
		);
	}

	// n303-2: HSV/HSB, HSL, HWB and naive CMYK, including black.
	{
		const colors = ["#3d7ea6", "#000000"];
		const T = { h: 0.5, p: 0.5 };
		const exp = colors.map((hex) => {
			const rgb = hexToRgb(hex);
			const hsv = srgbToHsv(rgb);
			const hsl = srgbToHsl(rgb);
			const hwb = srgbToHwb(rgb);
			return {
				hex,
				gray: Math.max(...rgb) === Math.min(...rgb),
				hsv: [r1(hsv[0]), pct1(hsv[1]), pct1(hsv[2])],
				hsl: [r1(hsl[0]), pct1(hsl[1]), pct1(hsl[2])],
				hwb: [r1(hwb[0]), pct1(hwb[1]), pct1(hwb[2])],
				cmyk: srgbToCmykNaive(rgb).map(pct1),
			};
		});
		const witness = { colors: exp.map(({ gray: _g, ...rest }) => rest) };
		const frac = (v: number[]) => [v[0] as number, ...v.slice(1).map((x) => r4(x / 100))];
		tasks.push(
			task(303, 2, {
				prompt: `I'm filling in a color spec sheet that has columns for several cylindrical models and a rough CMYK. For each sRGB hex, give (hue in degrees 0-360, whole degrees or one decimal; every other component as a percentage 0-100, whole percent or one decimal):
- hsv: HSV, also called HSB (hue, saturation, value), the usual hexcone model;
- hsl: HSL as in CSS Color 4 (hue, saturation, lightness);
- hwb: HWB as in CSS Color 4 (hue, whiteness, blackness);
- cmyk: naive formula CMYK (no ICC profile) from the gamma-encoded channels R, G, B in 0-1: K = 1 - max(R, G, B), C = (1 - R - K) / (1 - K), M = (1 - G - K) / (1 - K), Y = (1 - B - K) / (1 - K); when K = 1 use C = M = Y = 0.

For a gray (R = G = B) the hue is undefined: give any value for it (saturation is then 0).
Colors: ${colors.join(", ")}
${contract(`{"colors": [{"hex": "#rrggbb", "hsv": [h, s, v], "hsl": [h, s, l], "hwb": [h, w, b], "cmyk": [c, m, y, k]}, ...one per color]}`)}`,
				schema: obj({
					colors: arr(obj({ hex: HEX, hsv: arr(NUM, 3), hsl: arr(NUM, 3), hwb: arr(NUM, 3), cmyk: arr(NUM, 4) })),
				}),
				params: {
					list: "colors",
					key: "hex",
					rows: exp.map((e) => ({
						key: e.hex,
						checks: [
							spec(`hsv-${e.hex}`, ["hsv"], vecE(e.hsv, [T.h, T.p, T.p], 0, e.gray)),
							spec(`hsl-${e.hex}`, ["hsl"], vecE(e.hsl, [T.h, T.p, T.p], 0, e.gray)),
							spec(`hwb-${e.hex}`, ["hwb"], vecE(e.hwb, [T.h, T.p, T.p], 0, e.gray)),
							spec(`cmyk-${e.hex}`, ["cmyk"], vecE(e.cmyk, [T.p, T.p, T.p, T.p])),
						],
					})),
					derivation: { tolerances: `hue ±${T.h}° (skipped for grays); percentages ±${T.p} (accepts whole-percent rounding)` },
				},
				witness,
				invalid: [
					// HSV and HSL swapped
					{ colors: witness.colors.map((c) => ({ ...c, hsv: c.hsl, hsl: c.hsv })) },
					// fractions instead of percentages
					{
						colors: witness.colors.map((c) => ({
							...c,
							hsv: frac(c.hsv),
							hsl: frac(c.hsl),
							hwb: frac(c.hwb),
							cmyk: c.cmyk.map((v) => r4(v / 100)),
						})),
					},
				],
			}),
		);
	}

	// n303-3: Display P3 and Rec.2020 (BT.2020 OETF) for two saturated colors and white.
	{
		const colors = ["#ff5a1f", "#22a06b", "#ffffff"];
		const TOL = 0.002;
		const exp = colors.map((hex) => {
			const rgb = hexToRgb(hex);
			const p3 = srgbToP3(rgb).map(r4);
			const rec = srgbToRec2020(rgb).map(r4);
			assert([...p3, ...rec].every((v) => v >= 0 && v <= 1), `n303-3 ${hex} out of gamut`);
			return { hex, p3, rec2020: rec };
		});
		const css = (v: readonly number[]) => `color(display-p3 ${v.map((x) => x.toFixed(4)).join(" ")})`;
		const witness = { colors: exp.map((e) => ({ hex: e.hex, p3: css(e.p3), rec2020: e.rec2020 })) };
		tasks.push(
			task(303, 3, {
				prompt: `We're adding wide-gamut tokens next to our sRGB ones and I want the same colors re-expressed in the wider spaces (no gamut expansion, the colors must look identical). For each sRGB hex give:
- p3: the CSS Color 4 string \`color(display-p3 r g b)\` with r, g, b as plain numbers 0-1 (about four decimals). Display P3 has the DCI-P3 primaries, the D65 white and the sRGB transfer curve.
- rec2020: ITU-R BT.2020 R'G'B' (D65 white), encoded with the BT.2020 transfer function (V = 1.09929682680944·L^0.45 − 0.09929682680944 for L ≥ 0.018053968510807, otherwise V = 4.5·L), as numbers 0-1 (about four decimals).

Linearize the sRGB input with the IEC 61966-2-1 curve and go through CIE XYZ (D65), no chromatic adaptation.
Colors: ${colors.join(", ")}
${contract(`{"colors": [{"hex": "#rrggbb", "p3": "color(display-p3 0.0000 0.0000 0.0000)", "rec2020": [r, g, b]}, ...one per color]}`)}`,
				schema: obj({ colors: arr(obj({ hex: HEX, p3: STR, rec2020: arr(NUM, 3) })) }),
				params: {
					list: "colors",
					key: "hex",
					rows: exp.map((e) => ({
						key: e.hex,
						checks: [
							spec(`p3-${e.hex}`, ["p3"], { k: "css", space: "display-p3", v: e.p3, tol: [TOL, TOL, TOL] }),
							spec(`rec2020-${e.hex}`, ["rec2020"], vecE(e.rec2020, [TOL, TOL, TOL])),
						],
					})),
					derivation: {
						tolerance: `±${TOL} per channel; primaries-derived vs published 7-digit matrices differ by < 3e-4. A pure 2.4-gamma Rec.2020 encoding differs by up to ~0.1 and is not accepted (the prompt names the BT.2020 OETF).`,
					},
				},
				witness,
				invalid: [
					// sRGB numbers copied into display-p3
					{ colors: colors.map((hex, i) => ({ hex, p3: css([...hexToRgb(hex)].map(r4)), rec2020: exp[i]?.rec2020 })) },
					// Rec.2020 encoded with the sRGB curve instead of the BT.2020 OETF
					{
						colors: colors.map((hex, i) => ({
							hex,
							p3: css(exp[i]?.p3 ?? []),
							rec2020: srgbToRec2020Linear(hexToRgb(hex)).map((l) => r4(linearToSrgb(l))),
						})),
					},
				],
			}),
		);
	}

	// n303-4: linear sRGB, Oklab and Oklch, including a near-achromatic warm gray.
	{
		const colors = ["#6d28d9", "#f5f5f4"];
		const HUE_FLOOR = 0.02;
		const T = { lin: 0.0005, ok: 0.002, h: 1 };
		const exp = colors.map((hex) => {
			const rgb = hexToRgb(hex);
			const lch = srgbToOklchV(rgb);
			return {
				hex,
				linear: srgbToLinearRgb(rgb).map(r4),
				oklab: srgbToOklabV(rgb).map(r4),
				oklch: [r4(lch[0]), r4(lch[1]), r2(lch[2])],
				skipHue: lch[1] < HUE_FLOOR,
			};
		});
		assert(exp.some((e) => e.skipHue) && exp.some((e) => !e.skipHue), "n303-4 needs a near-achromatic color");
		const witness = { colors: exp.map(({ skipHue: _s, ...rest }) => rest) };
		tasks.push(
			task(303, 4, {
				prompt: `I'm porting our theme to Oklch and want to double-check a couple of conversions. For each sRGB hex give:
- linear: linear-light sRGB channels (IEC 61966-2-1 transfer curve removed), 0-1, about four decimals;
- oklab: Oklab L, a, b per Björn Ottosson's 2020 definition (L on a 0-1 scale), about four decimals;
- oklch: Oklch L (0-1, about four decimals), chroma C = sqrt(a² + b²) (about four decimals), hue h = atan2(b, a) in degrees 0-360 (about two decimals).

If C is below ${HUE_FLOOR} the hue is not meaningful; give whatever your computation produces for h.
Colors: ${colors.join(", ")}
${contract(`{"colors": [{"hex": "#rrggbb", "linear": [r, g, b], "oklab": [L, a, b], "oklch": [L, C, h]}, ...one per color]}`)}`,
				schema: obj({ colors: arr(obj({ hex: HEX, linear: arr(NUM, 3), oklab: arr(NUM, 3), oklch: arr(NUM, 3) })) }),
				params: {
					list: "colors",
					key: "hex",
					rows: exp.map((e) => ({
						key: e.hex,
						checks: [
							spec(`linear-${e.hex}`, ["linear"], vecE(e.linear, [T.lin, T.lin, T.lin])),
							spec(`oklab-${e.hex}`, ["oklab"], vecE(e.oklab, [T.ok, T.ok, T.ok])),
							spec(`oklch-${e.hex}`, ["oklch"], vecE(e.oklch, [T.ok, T.ok, T.h], 2, e.skipHue)),
						],
					})),
					derivation: {
						tolerances: `linear ±${T.lin}; Oklab/Oklch L, a, b, C ±${T.ok} (matrix variants < 2e-4); h ±${T.h}° when C >= ${HUE_FLOOR}, otherwise skipped`,
					},
				},
				witness,
				invalid: [
					// encoded values reported as linear, hue in radians
					{
						colors: witness.colors.map((c) => ({
							...c,
							linear: [...hexToRgb(c.hex)].map(r4),
							oklch: [c.oklch[0], c.oklch[1], r4(((c.oklch[2] as number) * Math.PI) / 180)],
						})),
					},
					// L given in percent
					{
						colors: witness.colors.map((c) => ({
							...c,
							oklab: [r2((c.oklab[0] as number) * 100), c.oklab[1], c.oklab[2]],
							oklch: [r2((c.oklch[0] as number) * 100), c.oklch[1], c.oklch[2]],
						})),
					},
				],
			}),
		);
	}

	// n303-5: reverse direction, from Lab / LCh / HSV / P3 / Oklch values to the nearest 8-bit hex.
	{
		const inputs: { id: string; text: string; rgb: Rgb; wrong: Rgb }[] = [
			{
				id: "lab",
				text: "CIELAB L* 62.5, a* 18, b* -40",
				rgb: labToSrgb([62.5, 18, -40]),
				wrong: labToSrgbD50Naive([62.5, 18, -40]),
			},
			{
				id: "lch",
				text: "CIE LCh(ab) L* 48, C* 35, h 145°",
				rgb: lchToSrgb([48, 35, 145]),
				wrong: labToSrgb([48, 35, 145]),
			},
			{
				id: "hsv",
				text: "HSV/HSB hue 200°, saturation 65%, value 80%",
				rgb: hsvToSrgb([200, 0.65, 0.8]),
				wrong: hslToSrgb([200, 0.65, 0.8]),
			},
			{
				id: "p3",
				text: "color(display-p3 0.35 0.62 0.48)",
				rgb: p3ToSrgb([0.35, 0.62, 0.48]),
				wrong: [0.35, 0.62, 0.48],
			},
			{
				id: "oklch",
				text: "oklch(0.72 0.11 75), i.e. Oklch L 0.72 (0-1 scale), C 0.11, hue 75°",
				rgb: oklchToSrgb([0.72, 0.11, 75]),
				wrong: oklchToSrgb([0.72, 0.11, 255]),
			},
		];
		for (const i of inputs)
			assert(i.rgb.every((v) => v * 255 >= 0.5 && v * 255 <= 254.5), `n303-5 ${i.id} out of sRGB gamut`);
		const exp = inputs.map((i) => ({ id: i.id, hex: rgbToHex(i.rgb) }));
		const witness = { results: exp };
		const wrongHex = inputs.map((i) => rgbToHex(i.wrong));
		for (let k = 0; k < inputs.length; k++) {
			const a = hexToRgb(exp[k]?.hex as string);
			const b = hexToRgb(wrongHex[k] as string);
			assert(a.some((v, c) => Math.abs(Math.round(v * 255) - Math.round((b[c] as number) * 255)) > 1), `n303-5 wrong variant of ${inputs[k]?.id} indistinguishable`);
		}
		tasks.push(
			task(303, 5, {
				prompt: `A client sent color specs in assorted notations and I need them all as sRGB hex for the web build. Convert each to sRGB (IEC 61966-2-1 transfer curve, D65 white, no chromatic adaptation), then round each channel to the nearest 8-bit value. All of them are inside the sRGB gamut.

${inputs.map((i) => `- ${i.id}: ${i.text}`).join("\n")}

The CIELAB and LCh(ab) values use the inverse of this definition. ${LAB_STD}
${contract(`{"results": [{"id": "lab", "hex": "#rrggbb"}, ...one per spec]}`)}`,
				schema: obj({ results: arr(obj({ id: STR, hex: HEX })) }),
				params: {
					rows: exp.map((e) => ({ key: e.id, checks: [spec(`hex-${e.id}`, ["hex"], { k: "hex", v: e.hex, tol: 1 })] })),
					derivation: {
						tolerance: "±1 per 8-bit channel (channel values near .5 and white-constant variants)",
						exact255: Object.fromEntries(inputs.map((i) => [i.id, i.rgb.map((v) => round(v * 255, 2))])),
					},
				},
				witness,
				invalid: [
					// D50 Lab, LCh read as Lab, HSV read as HSL, P3 numbers used as sRGB, hue flipped
					{ results: inputs.map((i, k) => ({ id: i.id, hex: wrongHex[k] })) },
					// only the HSV/HSL mix-up
					{ results: exp.map((e, k) => ({ ...e, hex: e.id === "hsv" ? wrongHex[k] : e.hex })) },
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

	// n304-1: WCAG 2 relative luminance.
	{
		const colors = ["#808080", "#e63946", "#1d3557", "#a8dadc", "#f1faee"];
		const TOL = 0.002;
		const exp = colors.map((hex) => ({ hex, luminance: r4(wcagLuminance(hex)) }));
		const witness = { results: exp };
		tasks.push(
			task(304, 1, {
				prompt: `Before I run contrast checks on a new palette I want the WCAG 2.x relative luminance of each swatch, as WCAG 2.2 defines it: linearize each sRGB channel c in 0-1 (c/12.92 if c <= 0.04045, otherwise ((c + 0.055)/1.055)^2.4), then L = 0.2126·R + 0.7152·G + 0.0722·B on a 0-1 scale. About four decimals please.

Swatches: ${colors.join(", ")}
${contract(`{"results": [{"hex": "#rrggbb", "luminance": 0.0000}, ...one per swatch]}`)}`,
				schema: obj({ results: arr(obj({ hex: HEX, luminance: NUM })) }),
				params: {
					key: "hex",
					rows: exp.map((e) => ({ key: e.hex, checks: [spec(`lum-${e.hex}`, ["luminance"], num(e.luminance, TOL))] })),
					derivation: { tolerance: `±${TOL}` },
				},
				witness,
				invalid: [
					// linearization skipped
					{
						results: colors.map((hex) => {
							const [r, g, b] = hexToRgb(hex);
							return { hex, luminance: r4(0.2126 * r + 0.7152 * g + 0.0722 * b) };
						}),
					},
					// percent
					{ results: exp.map((e) => ({ ...e, luminance: r2(e.luminance * 100) })) },
				],
				toolUseful: true,
			}),
		);
	}

	// n304-2: sort seven colors darkest to lightest by Oklab L (adjacent gaps >= 0.02).
	{
		const colors = ["#ffeb3b", "#3949ab", "#e53935", "#43a047", "#8e24aa", "#757575", "#00acc1"];
		const order = [...colors].sort((a, b) => oklabL(a) - oklabL(b));
		for (let i = 1; i < order.length; i++)
			assert(oklabL(order[i] as string) - oklabL(order[i - 1] as string) >= 0.02, "n304-2 adjacent gap < 0.02");
		const hslOrder = [...colors].sort((a, b) => srgbToHsl(hexToRgb(a))[2] - srgbToHsl(hexToRgb(b))[2]);
		assert(hslOrder.join() !== order.join(), "n304-2 HSL order should differ");
		const shown = shuffled(colors, 3042);
		const witness = { order };
		tasks.push(
			task(304, 2, {
				prompt: `For a grayscale-friendly legend I need these seven category colors sorted from darkest to lightest by perceptual lightness, measured as Oklab L (Björn Ottosson's Oklab, computed from linearized sRGB). There are no ties.

Colors: ${shown.join(", ")}
${contract(`{"order": ["#rrggbb", ...all seven, darkest first]}`)}`,
				schema: obj({ order: arr(HEX, 7) }),
				params: {
					top: [
						spec("darkest", ["order", 0], eq(order[0] as string)),
						spec("lightest", ["order", 6], eq(order[6] as string)),
						spec("order", ["order"], { k: "seq", v: order }),
					],
					derivation: { oklabL: Object.fromEntries(order.map((c) => [c, r4(oklabL(c))])), minAdjacentGap: 0.02 },
				},
				witness,
				invalid: [{ order: hslOrder }, { order: [...order].reverse() }],
			}),
		);
	}

	// n304-3: most saturated by Oklch chroma vs by HSL saturation (they disagree).
	{
		const colors = ["#ffd6e0", "#c2410c", "#7c3aed", "#15803d", "#a16207"];
		const C = colors.map(oklchC);
		const S = colors.map(hslS);
		const iC = C.indexOf(Math.max(...C));
		const iS = S.indexOf(Math.max(...S));
		assert(iC !== iS, "n304-3 winners should differ");
		const sortedC = [...C].sort((a, b) => b - a);
		const sortedS = [...S].sort((a, b) => b - a);
		assert((sortedC[0] as number) - (sortedC[1] as number) >= 0.02, "n304-3 chroma margin");
		assert((sortedS[0] as number) - (sortedS[1] as number) >= 0.05, "n304-3 HSL margin");
		const TOL = 0.003;
		const exp = colors.map((hex, i) => ({ hex, C: r4(C[i] as number) }));
		const byC = colors[iC] as string;
		const byS = colors[iS] as string;
		const witness = { byOklchChroma: byC, byHslSaturation: byS, chroma: exp };
		tasks.push(
			task(304, 3, {
				prompt: `Design review argument: which of these five swatches is "the most saturated"? One reviewer goes by HSL saturation (CSS Color 4 HSL), the other by Oklch chroma (Björn Ottosson's Oklab/Oklch, C = sqrt(a² + b²)). Tell me the winner under each definition, and list every swatch's Oklch chroma (about four decimals).

Swatches: ${colors.join(", ")}
${contract(`{"byOklchChroma": "#rrggbb", "byHslSaturation": "#rrggbb", "chroma": [{"hex": "#rrggbb", "C": 0.0000}, ...one per swatch]}`)}`,
				schema: obj({ byOklchChroma: HEX, byHslSaturation: HEX, chroma: arr(obj({ hex: HEX, C: NUM })) }),
				params: {
					list: "chroma",
					key: "hex",
					rows: exp.map((e) => ({ key: e.hex, checks: [spec(`c-${e.hex}`, ["C"], num(e.C, TOL))] })),
					top: [spec("oklch-winner", ["byOklchChroma"], eq(byC)), spec("hsl-winner", ["byHslSaturation"], eq(byS))],
					derivation: {
						hslSaturationPct: Object.fromEntries(colors.map((c, i) => [c, pct1(S[i] as number)])),
						margins: "chroma winner >= 0.02 ahead; HSL winner >= 5 points ahead",
						tolerance: `C ±${TOL}`,
					},
				},
				witness,
				invalid: [
					{ ...witness, byOklchChroma: byS },
					// CIELAB chroma (scaled to 0-1-ish) reported instead of Oklch chroma
					{ ...witness, chroma: colors.map((hex) => ({ hex, C: r4(srgbToLch(hexToRgb(hex))[1] / 100) })) },
				],
			}),
		);
	}

	// n304-4: two grayscale conversions per color (BT.709 luma on encoded values vs Oklab-L gray).
	{
		const colors = ["#2b50ff", "#e63946", "#ffd60a", "#2a9d8f"];
		const TOL = 2;
		const exp = colors.map((hex) => ({ hex, lumaGray: bt709Gray(hex), oklabGray: oklabGray(hex) }));
		const lvl = (h: string) => Math.round(hexToRgb(h)[0] * 255);
		assert(
			exp.filter((e) => Math.abs(lvl(e.lumaGray) - lvl(e.oklabGray)) > 2 * TOL).length >= 2,
			"n304-4 the two grays are too similar",
		);
		const linGray = (hex: string) => {
			const y = wcagLuminance(hex);
			return rgbToHex([y, y, y]);
		};
		const witness = { results: exp };
		tasks.push(
			task(304, 4, {
				prompt: `I'm comparing two ways of turning brand colors into grays for a monochrome print version. For each color give both grays as neutral #rrggbb values:
- lumaGray: BT.709 luma computed directly on the gamma-encoded sRGB channels (no linearization), Y' = 0.2126·R' + 0.7152·G' + 0.0722·B' with channels in 0-1; gray level = round(255·Y').
- oklabGray: the neutral gray that has the same Oklab L (Björn Ottosson's Oklab) as the color, each channel rounded to the nearest 8-bit value.

Colors: ${colors.join(", ")}
${contract(`{"results": [{"hex": "#rrggbb", "lumaGray": "#rrggbb", "oklabGray": "#rrggbb"}, ...one per color]}`)}`,
				schema: obj({ results: arr(obj({ hex: HEX, lumaGray: HEX, oklabGray: HEX })) }),
				params: {
					key: "hex",
					rows: exp.map((e) => ({
						key: e.hex,
						checks: [
							spec(`luma-${e.hex}`, ["lumaGray"], { k: "hex", v: e.lumaGray, tol: TOL }),
							spec(`oklab-${e.hex}`, ["oklabGray"], { k: "hex", v: e.oklabGray, tol: TOL }),
						],
					})),
					derivation: { tolerance: `±${TOL} per channel`, oklabL: Object.fromEntries(colors.map((c) => [c, r4(oklabL(c))])) },
				},
				witness,
				invalid: [
					{ results: exp.map((e) => ({ ...e, lumaGray: e.oklabGray, oklabGray: e.lumaGray })) },
					// linear luminance written straight into the gray channel
					{ results: exp.map((e) => ({ ...e, lumaGray: linGray(e.hex), oklabGray: linGray(e.hex) })) },
				],
			}),
		);
	}

	// n304-5: candidate closest in Oklab L to a reference, with margin.
	{
		const ref = "#5b8def";
		const cands = ["#f15bb5", "#118ab2", "#ef476f", "#e9c46a", "#9b5de5", "#8cb369"];
		const refL = oklabL(ref);
		const dL = cands.map((c) => Math.abs(oklabL(c) - refL));
		const iBest = argmin(dL);
		assert(secondMin(dL) - (dL[iBest] as number) >= 0.02, "n304-5 margin");
		const hslL = (h: string) => srgbToHsl(hexToRgb(h))[2];
		const hslD = cands.map((c) => Math.abs(hslL(c) - hslL(ref)));
		const hslBest = cands[argmin(hslD)] as string;
		const best = cands[iBest] as string;
		const witness = { closest: best, referenceL: r4(refL), deltaL: r4(dL[iBest] as number) };
		const otherWrong = hslBest === best ? (cands[(iBest + 1) % cands.length] as string) : hslBest;
		tasks.push(
			task(304, 5, {
				prompt: `Our chart uses ${ref} for the main series, and for a grayscale-safe print version I want the second series to have about the same perceived lightness. Measuring lightness as Oklab L (Björn Ottosson's Oklab, L on a 0-1 scale), which of these candidates is closest in L to ${ref}? Also give ${ref}'s Oklab L and the absolute L difference to the winner (about four decimals each).

Candidates: ${cands.join(", ")}
${contract(`{"closest": "#rrggbb", "referenceL": 0.0000, "deltaL": 0.0000}`)}`,
				schema: obj({ closest: HEX, referenceL: NUM, deltaL: NUM }),
				params: {
					top: [
						spec("closest", ["closest"], eq(best)),
						spec("reference-l", ["referenceL"], num(r4(refL), 0.003)),
						spec("delta-l", ["deltaL"], num(r4(dL[iBest] as number), 0.004)),
					],
					derivation: {
						deltaL: Object.fromEntries(cands.map((c, i) => [c, r4(dL[i] as number)])),
						hslLightnessWinner: hslBest,
						margin: "winner >= 0.02 closer than the runner-up",
					},
				},
				witness,
				invalid: [
					{ closest: otherWrong, referenceL: r4(refL), deltaL: r4(dL[cands.indexOf(otherWrong)] as number) },
					{ closest: best, referenceL: r2(refL * 100), deltaL: r2((dL[iBest] as number) * 100) },
				],
			}),
		);
	}
	return tasks;
}

/** Neutral suite, author A: returns this author's categories' tasks. */
export function neutralA(): Task[] {
	return [...cat301(), ...cat302(), ...cat303(), ...cat304()];
}
