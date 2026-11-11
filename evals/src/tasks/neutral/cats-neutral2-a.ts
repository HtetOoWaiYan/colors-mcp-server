/**
 * Neutral suite v2, author A: categories 301-304 (apca-contrast, delta-e, space-conversion,
 * color-properties), ids p<category>-<n>. Fresh scenarios, inputs and task shapes relative to v1
 * (cats-neutral-a.ts). Expected values come from the hand-written references in
 * src/reference-neutral/a-*.ts and v2-a-*.ts; grading reuses v1's table engine (a-table.ts) under
 * v1's four kind names. Every margin is asserted at build time, so a change of inputs that breaks a
 * margin fails the build instead of shipping an ambiguous task. Each task's grader.params.derivation
 * carries its raw inputs (`inputs`) so the colorjs.io cross-check test can recompute them.
 */
import type { CheckSpec, Expect, TableParams } from "../../graders-neutral/a-table.js";
import {
	contrastRatio,
	deltaE2000,
	hexToRgb,
	linearToSrgb,
	oklabToRgb,
	type Rgb,
	rgbToHex,
	srgbToLinear,
	type Vec3,
} from "../../reference/color.js";
import { apcaFromY, apcaLc, apcaY } from "../../reference-neutral/a-apca.js";
import { de00Hex, de76Hex, de94Hex, labOfHex } from "../../reference-neutral/a-deltae.js";
import { bt709Gray, hslS, oklabGray, oklabL, wcagLuminance } from "../../reference-neutral/a-properties.js";
import {
	hslToSrgb,
	hsvToSrgb,
	srgbToHsl,
	srgbToHsv,
	srgbToHwb,
	srgbToLab,
	srgbToLch,
	srgbToLinearRgb,
	srgbToOklchV,
	srgbToP3,
	srgbToRec2020,
	srgbToRec2020Linear,
	srgbToXyz,
	toPolar,
	xyzToLab,
	xyzToSrgb,
} from "../../reference-neutral/a-spaces.js";
import {
	cmykNaiveToSrgb,
	compositeHex,
	compositeRgb,
	hwbToSrgb,
	rec2020ToSrgb,
} from "../../reference-neutral/v2-a-spaces.js";
import { contract, mulberry32, round } from "../build/common.js";
import { CATEGORY_NAMES, type Task } from "../types.js";

// ---------- small builders (copied from v1's cats-neutral-a.ts, ids changed to p<cat>-<n>) ----------

function assert(cond: boolean, msg: string): void {
	if (!cond) throw new Error(`neutral2A build: ${msg}`);
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
		id: `p${category}-${n}`,
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
const sortedAsc = (xs: number[]) => [...xs].sort((a, b) => a - b);
const lvl = (hex: string) => Math.round(hexToRgb(hex)[0] * 255);
const maxCh = (a: string, b: string) => {
	const x = hexToRgb(a);
	const y = hexToRgb(b);
	return Math.max(...x.map((v, i) => Math.abs(Math.round(v * 255) - Math.round((y[i] as number) * 255))));
};

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

/** Vector expectation; the hue component (hueIdx) is circular and skipped when skipHue. */
const vecE = (v: number[], tol: number[], hueIdx?: number, skipHue = false): Expect => ({
	k: "vec",
	v,
	tol: tol.map((t, i) => (skipHue && i === hueIdx ? null : t)),
	...(hueIdx === undefined ? {} : { hue: [hueIdx] }),
});

// ---------- shared prompt fragments (re-worded from v1; same constants) ----------

const APCA_RECIPE = `the APCA-W3 0.0.98G-4g algorithm, step by step:
1. For each color take the sRGB channels as 0-1 numbers and compute Y = 0.2126729·R^2.4 + 0.7151522·G^2.4 + 0.0721750·B^2.4 (a plain 2.4 power, no piecewise linear part).
2. Soft-clamp near-black: when Y < 0.022, replace it with Y + (0.022 − Y)^1.414.
3. If the two Y values differ by less than 0.0005, Lc is 0.
4. Background lighter than text (Ybg > Ytxt): S = 1.14 × (Ybg^0.56 − Ytxt^0.57); Lc = 0 when S < 0.1, else Lc = S − 0.027.
5. Otherwise (text lighter than background): S = 1.14 × (Ybg^0.65 − Ytxt^0.62); Lc = 0 when S > −0.1, else Lc = S + 0.027.
6. Multiply by 100.
So Lc comes out positive for dark-on-light text and negative for light-on-dark text`;

const LAB_D65 =
	"For CIELAB: treat the hex as sRGB, undo the IEC 61966-2-1 transfer curve, convert the linear RGB to CIE XYZ with the D65 white (white has Y = 1), and compute L*a*b* against the D65 white itself (Xn ≈ 0.9505, Yn = 1, Zn ≈ 1.0888) - no Bradford or other adaptation to D50.";

const OKLAB_DEF = "Oklab as published by Björn Ottosson (2020), computed from linear-light sRGB, with L on a 0-1 scale";

// =====================================================================================
// 301 apca-contrast
// =====================================================================================

function cat301(): Task[] {
	const tasks: Task[] = [];
	const LC_TOL = 1.0;
	const lcTolNote = `±${LC_TOL} Lc: the reference is exact from the stated constants and rounded to 0.1; the band absorbs rounding of intermediate values and of the reported number`;

	// p301-1: polarity asymmetry - the same two colors in light-mode and dark-mode orientation.
	{
		const pairs: [string, string, string][] = [
			["evergreen", "#0b3d2e", "#d9f2e6"],
			["graphite", "#141414", "#8a8a8a"],
			["amber", "#9a6b00", "#fff4d6"],
		];
		const exp = pairs.map(([id, dark, light]) => {
			assert(oklabL(dark) < oklabL(light), `p301-1 ${id} dark/light order`);
			const dol = apcaLc(dark, light);
			const lod = apcaLc(light, dark);
			assert(dol > 0 && lod < 0, `p301-1 ${id} polarity signs`);
			assert(Math.abs(Math.abs(dol) - Math.abs(lod)) >= 2, `p301-1 ${id} orientations too close to call`);
			return {
				id,
				darkOnLight: r1(dol),
				lightOnDark: r1(lod),
				stronger: Math.abs(dol) > Math.abs(lod) ? "dark-on-light" : "light-on-dark",
			};
		});
		assert(new Set(exp.map((e) => e.stronger)).size === 2, "p301-1 needs both orientations to win somewhere");
		const witness = { results: exp };
		tasks.push(
			task(301, 1, {
				prompt: `Our theme switcher just swaps text and background between light and dark mode, and I've heard APCA isn't symmetric, so I'd like to see how much that matters for three of our color pairs. For each pair, compute the contrast of the dark color as text on the light color as background ("darkOnLight"), and of the light color as text on the dark color as background ("lightOnDark"). Then tell me which orientation has the larger magnitude |Lc|.

Use ${APCA_RECIPE}.

Pairs (dark color / light color):
${pairs.map(([id, d, l]) => `- ${id}: ${d} / ${l}`).join("\n")}

Lc values signed, to one decimal. "stronger" is either "dark-on-light" or "light-on-dark".
${contract(`{"results": [{"id": "evergreen", "darkOnLight": 0.0, "lightOnDark": 0.0, "stronger": "dark-on-light"}, ...one entry per pair]}`)}`,
				schema: obj({
					results: arr(
						obj({ id: STR, darkOnLight: NUM, lightOnDark: NUM, stronger: { enum: ["dark-on-light", "light-on-dark"] } }),
					),
				}),
				params: {
					rows: exp.map((e) => ({
						key: e.id,
						checks: [
							spec(`dark-on-light-${e.id}`, ["darkOnLight"], num(e.darkOnLight, LC_TOL)),
							spec(`light-on-dark-${e.id}`, ["lightOnDark"], num(e.lightOnDark, LC_TOL)),
							spec(`stronger-${e.id}`, ["stronger"], eq(e.stronger)),
						],
					})),
					derivation: {
						inputs: { pairs },
						standard: "APCA-W3 0.0.98G-4g",
						tolerance: lcTolNote,
						margin: "the two orientations' |Lc| differ by >= 2 for every pair",
					},
				},
				witness,
				invalid: [
					// assumes symmetry: copies the dark-on-light magnitude into the other orientation
					{ results: exp.map((e) => ({ ...e, lightOnDark: -e.darkOnLight, stronger: "dark-on-light" })) },
					// unsigned values
					{ results: exp.map((e) => ({ ...e, lightOnDark: Math.abs(e.lightOnDark) })) },
				],
			}),
		);
	}

	// p301-2: classify each pairing into the highest use tier it reaches (five tiers), every |Lc| >= 3 from any tier edge.
	{
		const TIERS: [string, number][] = [
			["body", 75],
			["content", 60],
			["headline", 45],
			["spot", 30],
		];
		const tierOf = (m: number) => (TIERS.find(([, t]) => m >= t) ?? ["none", 0])[0];
		const rows0: [string, string, string][] = [
			["order-summary", "#3f4a5a", "#ffffff"],
			["receipt-footnote", "#6b6b6b", "#f5f5f0"],
			["sale-banner", "#ffffff", "#c2185b"],
			["map-legend-dark", "#7aa2c8", "#0e1a26"],
			["input-hint", "#b7b7b7", "#ffffff"],
			["watermark-dark", "#5a5a5a", "#000000"],
		];
		const exp = rows0.map(([id, t, b]) => {
			const lc = apcaLc(t, b);
			for (const [, th] of TIERS) assert(Math.abs(Math.abs(lc) - th) >= 3, `p301-2 ${id} within 3 Lc of tier edge ${th} (${lc})`);
			return { id, lc: r1(lc), tier: tierOf(Math.abs(lc)), signedTier: tierOf(lc) };
		});
		assert(new Set(exp.map((e) => e.tier)).size >= 5, "p301-2 should cover all five tiers");
		assert(exp.some((e) => e.tier !== e.signedTier), "p301-2 needs a negative-polarity row");
		const witness = { results: exp.map(({ signedTier: _s, ...e }) => e) };
		tasks.push(
			task(301, 2, {
				prompt: `I'm writing usage notes for the checkout flow: for every text/background pairing, which kind of text is it allowed to carry? We use ${APCA_RECIPE}.

Tiers, judged on the magnitude |Lc| (polarity doesn't matter), take the highest one reached:
- "body": |Lc| ≥ 75 (running text of any size)
- "content": 60 ≤ |Lc| < 75 (short content text at 16px and up)
- "headline": 45 ≤ |Lc| < 60 (large or bold headlines only)
- "spot": 30 ≤ |Lc| < 45 (placeholders, disabled labels, copyright lines)
- "none": |Lc| < 30 (not for text)

Pairings (text on background):
${rows0.map(([id, t, b]) => `- ${id}: ${t} on ${b}`).join("\n")}

For each, give the signed Lc to one decimal and the tier name.
${contract(`{"results": [{"id": "order-summary", "lc": 0.0, "tier": "body"}, ...one entry per pairing]}`)}`,
				schema: obj({
					results: arr(obj({ id: STR, lc: NUM, tier: { enum: ["body", "content", "headline", "spot", "none"] } })),
				}),
				params: {
					rows: exp.map((e) => ({
						key: e.id,
						checks: [spec(`tier-${e.id}`, ["tier"], eq(e.tier)), spec(`lc-${e.id}`, ["lc"], num(e.lc, LC_TOL))],
					})),
					derivation: {
						inputs: { pairs: rows0 },
						tiers: Object.fromEntries(TIERS),
						minMarginLc: 3,
						tolerance: lcTolNote,
					},
				},
				witness,
				invalid: [
					// signed comparison: negative Lc falls to "none"
					{ results: exp.map((e) => ({ id: e.id, lc: e.lc, tier: e.signedTier })) },
					// everything one tier too generous
					{
						results: exp.map((e) => {
							const i = ["body", "content", "headline", "spot", "none"].indexOf(e.tier);
							return { id: e.id, lc: e.lc, tier: ["body", "body", "content", "headline", "spot"][i] };
						}),
					},
				],
			}),
		);
	}

	// p301-3: choose the background for a fixed text color; rank all surfaces by |Lc| (best is negative polarity).
	{
		const text = "#ff922b";
		const surfaces = ["#ffffff", "#f8f9fa", "#343a40", "#0b1d33", "#868e96"];
		const lcs = surfaces.map((b) => apcaLc(text, b));
		const order = [...surfaces].sort((a, b) => Math.abs(apcaLc(text, b)) - Math.abs(apcaLc(text, a)));
		const mags = order.map((b) => Math.abs(apcaLc(text, b)));
		for (let i = 1; i < mags.length; i++)
			assert((mags[i - 1] as number) - (mags[i] as number) >= 3, `p301-3 adjacent |Lc| gap < 3 at ${i}`);
		const best = order[0] as string;
		const signedMax = surfaces[lcs.indexOf(Math.max(...lcs))] as string;
		assert(signedMax !== best, "p301-3 signed-max trap missing");
		const bestLc = apcaLc(text, best);
		assert(Math.abs(Math.abs(bestLc) - 45) >= 3, "p301-3 best too close to 45");
		const exp = surfaces.map((b, i) => ({ background: b, lc: r1(lcs[i] as number) }));
		const witness = { results: exp, best, ranking: order, headlineOk: Math.abs(bestLc) >= 45 };
		tasks.push(
			task(301, 3, {
				prompt: `Our "LIVE" tag uses the brand orange ${text} as its text color, and I can put the tag on any of five card surfaces: ${surfaces.join(", ")}. Which surface makes the orange text stand out most? Measure with ${APCA_RECIPE}.

"Stand out most" means the largest |Lc|, whichever polarity. Please give the signed Lc of the orange text on each surface (one decimal), the winning surface, all five surfaces ranked from largest to smallest |Lc|, and whether the winner's |Lc| reaches 45 (our minimum for bold headline-size text).
${contract(`{"results": [{"background": "#rrggbb", "lc": 0.0}, ...one per surface], "best": "#rrggbb", "ranking": ["#rrggbb", ...all five, largest |Lc| first], "headlineOk": true}`)}`,
				schema: obj({
					results: arr(obj({ background: HEX, lc: NUM })),
					best: HEX,
					ranking: arr(HEX, 5),
					headlineOk: BOOL,
				}),
				params: {
					key: "background",
					rows: exp.map((e) => ({ key: e.background, checks: [spec(`lc-${e.background}`, ["lc"], num(e.lc, LC_TOL))] })),
					top: [
						spec("best", ["best"], eq(best)),
						spec("ranking", ["ranking"], { k: "seq", v: order }),
						spec("headline-ok", ["headlineOk"], eq(Math.abs(bestLc) >= 45)),
					],
					derivation: {
						inputs: { text, surfaces },
						adjacentGapsLc: mags.slice(1).map((m, i) => r1((mags[i] as number) - m)),
						signedMaxSurface: signedMax,
						wcagRatios: Object.fromEntries(surfaces.map((b) => [b, r2(contrastRatio(text, b))])),
						tolerance: lcTolNote,
					},
				},
				witness,
				invalid: [
					// picks the largest signed Lc (ignores light-on-dark)
					{
						results: exp,
						best: signedMax,
						ranking: [...surfaces].sort((a, b) => apcaLc(text, b) - apcaLc(text, a)),
						headlineOk: Math.abs(apcaLc(text, signedMax)) >= 45,
					},
					// roles swapped: surface measured as text on the orange
					{
						results: surfaces.map((b) => ({ background: b, lc: r1(apcaLc(b, text)) })),
						best,
						ranking: [...surfaces].sort((a, b) => Math.abs(apcaLc(b, text)) - Math.abs(apcaLc(a, text))),
						headlineOk: true,
					},
				],
			}),
		);
	}

	// p301-4: dark-mode audit, WCAG AAA (7:1) vs APCA Lc 75: four-way verdict per pairing.
	{
		const pairs: [string, string, string][] = [
			["sidebar-nav", "#e0e0e0", "#2d2d2d"],
			["timestamp", "#b3b3b3", "#121212"],
			["code-comment", "#8fb3ff", "#101826"],
			["toast-message", "#ffffff", "#666666"],
			["chip-label", "#f1f3f5", "#5f3dc4"],
			["muted-caption", "#909090", "#262626"],
		];
		const exp = pairs.map(([id, t, b]) => {
			const ratio = contrastRatio(t, b);
			const lc = apcaLc(t, b);
			assert(Math.abs(ratio - 7) >= 0.3, `p301-4 ${id} ratio too close to 7`);
			assert(Math.abs(ratio - 4.5) >= 0.2, `p301-4 ${id} ratio too close to 4.5 (AA invalid answer)`);
			assert(Math.abs(Math.abs(lc) - 75) >= 3, `p301-4 ${id} Lc too close to 75`);
			const w = ratio >= 7;
			const a = Math.abs(lc) >= 75;
			const verdict = w && a ? "both" : w ? "wcag-only" : a ? "apca-only" : "neither";
			return { id, ratio: r2(ratio), lc: r1(lc), verdict };
		});
		assert(new Set(exp.map((e) => e.verdict)).size === 4, "p301-4 should use all four verdicts");
		const witness = { results: exp };
		tasks.push(
			task(301, 4, {
				prompt: `Dark-mode audit. Our enhanced-accessibility theme used to require WCAG 2 AAA, and we're evaluating APCA as a replacement, so I want to know where the two rules disagree for the pairings below (text on background).
- WCAG rule: contrast ratio (Lmax + 0.05) / (Lmin + 0.05) of at least 7, where L is the WCAG 2.x relative luminance (each sRGB channel linearized with c/12.92 up to 0.04045, ((c + 0.055)/1.055)^2.4 above; L = 0.2126 R + 0.7152 G + 0.0722 B).
- APCA rule: |Lc| of at least 75, using ${APCA_RECIPE}.

${pairs.map(([id, t, b]) => `- ${id}: ${t} on ${b}`).join("\n")}

For each pairing give the WCAG ratio (two decimals), the signed Lc (one decimal) and a verdict: "both" (passes both rules), "wcag-only", "apca-only" or "neither".
${contract(`{"results": [{"id": "sidebar-nav", "ratio": 0.00, "lc": 0.0, "verdict": "both"}, ...one per pairing]}`)}`,
				schema: obj({
					results: arr(
						obj({ id: STR, ratio: NUM, lc: NUM, verdict: { enum: ["both", "wcag-only", "apca-only", "neither"] } }),
					),
				}),
				params: {
					rows: exp.map((e) => ({
						key: e.id,
						checks: [
							spec(`verdict-${e.id}`, ["verdict"], eq(e.verdict)),
							spec(`ratio-${e.id}`, ["ratio"], num(e.ratio, 0.05)),
							spec(`lc-${e.id}`, ["lc"], num(e.lc, LC_TOL)),
						],
					})),
					derivation: {
						inputs: { pairs },
						margins: "every ratio >= 0.3 from 7, every |Lc| >= 3 from 75",
						tolerance: `ratio ±0.05 (two-decimal rounding and luminance rounding); ${lcTolNote}`,
					},
				},
				witness,
				invalid: [
					// signed APCA comparison: every light-on-dark pairing fails APCA
					{ results: exp.map((e) => ({ ...e, verdict: e.ratio >= 7 ? "wcag-only" : "neither" })) },
					// AA (4.5) used instead of AAA
					{
						results: exp.map((e) => {
							const w = e.ratio >= 4.5;
							const a = Math.abs(e.lc) >= 75;
							return { ...e, verdict: w && a ? "both" : w ? "wcag-only" : a ? "apca-only" : "neither" };
						}),
					},
				],
			}),
		);
	}

	// p301-5: semi-transparent text tokens: composite first (gamma-encoded source-over), then Lc against role thresholds.
	{
		const tokens: { id: string; text: string; alpha: number; bg: string; min: number; role: string }[] = [
			{ id: "light-primary", text: "#000000", alpha: 0.87, bg: "#fafafa", min: 75, role: "primary" },
			{ id: "light-secondary", text: "#000000", alpha: 0.6, bg: "#fafafa", min: 60, role: "secondary" },
			{ id: "light-disabled", text: "#000000", alpha: 0.38, bg: "#fafafa", min: 30, role: "disabled" },
			{ id: "dark-primary", text: "#ffffff", alpha: 0.87, bg: "#1f2430", min: 75, role: "primary" },
			{ id: "dark-secondary", text: "#ffffff", alpha: 0.6, bg: "#1f2430", min: 60, role: "secondary" },
		];
		const linBlend = (t: string, a: number, b: string): string => {
			const x = hexToRgb(t);
			const y = hexToRgb(b);
			return rgbToHex(x.map((v, i) => linearToSrgb(srgbToLinear(v) * a + srgbToLinear(y[i] as number) * (1 - a))) as unknown as Rgb);
		};
		let worstUnrounded = 0;
		const exp = tokens.map((k) => {
			const hex = compositeHex(k.text, k.alpha, k.bg);
			const lc = apcaLc(hex, k.bg);
			// an implementation that skips the 8-bit rounding of the composite must still land inside the tolerance
			const lcU = apcaFromY(apcaY(compositeRgb(k.text, k.alpha, k.bg)), apcaY(hexToRgb(k.bg)));
			worstUnrounded = Math.max(worstUnrounded, Math.abs(lc - lcU));
			assert(Math.abs(Math.abs(lc) - k.min) >= 3, `p301-5 ${k.id} too close to its threshold`);
			assert(Math.abs(Math.abs(lcU) - k.min) >= 3, `p301-5 ${k.id} unrounded too close to its threshold`);
			assert(Math.abs(apcaLc(k.text, k.bg) - lc) > 2, `p301-5 ${k.id} opaque trap invisible`);
			return { id: k.id, composite: hex, lc: r1(lc), passes: Math.abs(lc) >= k.min, lin: linBlend(k.text, k.alpha, k.bg) };
		});
		assert(worstUnrounded < 0.3, "p301-5 composite rounding matters too much");
		assert(exp.some((e) => !e.passes) && exp.some((e) => e.passes), "p301-5 needs both verdicts");
		const witness = { results: exp.map(({ lin: _l, ...e }) => e) };
		tasks.push(
			task(301, 5, {
				prompt: `Our text tokens are pure black or pure white with an opacity, and I need APCA numbers for what actually lands on screen. For each token, first composite the text color over its surface the way browsers do by default: source-over on the gamma-encoded sRGB values, per channel  result = alpha·text + (1 − alpha)·surface  (channels 0-255), rounded to the nearest integer. Then measure that composited color as text on the surface with ${APCA_RECIPE}.

A token passes when |Lc| reaches its role's minimum: primary 75, secondary 60, disabled 30.

${tokens.map((k) => `- ${k.id}: ${k.text} at ${Math.round(k.alpha * 100)}% opacity on ${k.bg} (${k.role})`).join("\n")}

For each token give the composited hex, the signed Lc (one decimal) and whether it passes.
${contract(`{"results": [{"id": "light-primary", "composite": "#rrggbb", "lc": 0.0, "passes": true}, ...one per token]}`)}`,
				schema: obj({ results: arr(obj({ id: STR, composite: HEX, lc: NUM, passes: BOOL })) }),
				params: {
					rows: exp.map((e) => ({
						key: e.id,
						checks: [
							spec(`composite-${e.id}`, ["composite"], { k: "hex", v: e.composite, tol: 1 }),
							spec(`lc-${e.id}`, ["lc"], num(e.lc, LC_TOL)),
							spec(`passes-${e.id}`, ["passes"], eq(e.passes)),
						],
					})),
					derivation: {
						inputs: { tokens },
						tolerance: `composite ±1 per 8-bit channel (round-half conventions); ${lcTolNote}; skipping the 8-bit rounding of the composite changes Lc by <= ${r2(worstUnrounded)}`,
						linearLightBlend: Object.fromEntries(
							exp.map((e, i) => [e.id, { composite: e.lin, lc: r1(apcaLc(e.lin, (tokens[i] as (typeof tokens)[number]).bg)) }]),
						),
					},
				},
				witness,
				invalid: [
					// opacity ignored: the opaque token color measured directly
					{
						results: tokens.map((k) => {
							const lc = apcaLc(k.text, k.bg);
							return { id: k.id, composite: k.text, lc: r1(lc), passes: Math.abs(lc) >= k.min };
						}),
					},
					// blended in linear light instead of on encoded values
					{
						results: tokens.map((k, i) => {
							const c = exp[i]?.lin as string;
							const lc = apcaLc(c, k.bg);
							return { id: k.id, composite: c, lc: r1(lc), passes: Math.abs(lc) >= k.min };
						}),
					},
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
	const tolNote = `±${TOL}: D65 white-constant variants (xy-derived vs 0.95047/1.08883) move these by < 0.02; CIEDE2000 moves <= 0.05 under ±0.03 Lab perturbation (asserted)`;
	const stable = (a: string, b: string, where: string) =>
		assert(de00Sensitivity(a, b) <= 0.05, `${where}: CIEDE2000 unstable for ${a} ${b}`);

	// p302-1: full pairwise CIEDE2000 matrix of four near-neutral surface tints, plus most similar / most different pair.
	{
		const tints: [string, string][] = [
			["canvas", "#f3efe7"],
			["sand", "#ece6da"],
			["mist", "#e9ecef"],
			["sage", "#eef1ea"],
		];
		type P = { id: string; a: string; b: string; d00: number; d76: number; names: [string, string] };
		const pairs: P[] = [];
		for (let i = 0; i < tints.length; i++)
			for (let j = i + 1; j < tints.length; j++) {
				const [na, a] = tints[i] as [string, string];
				const [nb, b] = tints[j] as [string, string];
				stable(a, b, "p302-1");
				pairs.push({ id: `${na}-${nb}`, a, b, d00: de00Hex(a, b), d76: de76Hex(a, b), names: [na, nb] });
			}
		const by00 = [...pairs].sort((x, y) => x.d00 - y.d00);
		const by76 = [...pairs].sort((x, y) => x.d76 - y.d76);
		const sim = by00[0] as P;
		const dif = by00[by00.length - 1] as P;
		assert((by00[1] as P).d00 - sim.d00 >= 0.5, "p302-1 most-similar margin");
		assert(dif.d00 - (by00[by00.length - 2] as P).d00 >= 0.5, "p302-1 most-different margin");
		const sim76 = by76[0] as P;
		assert(sim76.id !== sim.id, "p302-1 CIE76 most-similar trap missing");
		const witness = {
			results: pairs.map((p) => ({ pair: p.id, deltaE: r2(p.d00) })),
			mostSimilar: sim.names,
			mostDifferent: dif.names,
		};
		tasks.push(
			task(302, 1, {
				prompt: `We have four off-white surface tints in the dashboard and I suspect some are redundant. Please give me the CIEDE2000 difference (kL = kC = kH = 1) between every pair of them - six numbers, two decimals each - and name the most similar and the most different pair. ${LAB_D65}

Tints: ${tints.map(([n, h]) => `${n} ${h}`).join(", ")}

Name each pair by joining the two tint names with a hyphen in the order they're listed above (canvas-sand, canvas-mist, ...).
${contract(`{"results": [{"pair": "canvas-sand", "deltaE": 0.00}, ...all six pairs], "mostSimilar": ["name", "name"], "mostDifferent": ["name", "name"]}`)}`,
				schema: obj({
					results: arr(obj({ pair: STR, deltaE: NUM })),
					mostSimilar: arr(STR, 2),
					mostDifferent: arr(STR, 2),
				}),
				params: {
					key: "pair",
					rows: pairs.map((p) => ({ key: p.id, checks: [spec(`de-${p.id}`, ["deltaE"], num(r2(p.d00), TOL))] })),
					top: [
						spec("most-similar", ["mostSimilar"], { k: "set", v: sim.names }),
						spec("most-different", ["mostDifferent"], { k: "set", v: dif.names }),
					],
					derivation: {
						inputs: { tints },
						cie76: Object.fromEntries(pairs.map((p) => [p.id, r2(p.d76)])),
						margins: "most similar and most different each >= 0.5 dE00 clear of the next pair",
						tolerance: tolNote,
					},
				},
				witness,
				invalid: [
					// CIE76 throughout
					{
						results: pairs.map((p) => ({ pair: p.id, deltaE: r2(p.d76) })),
						mostSimilar: sim76.names,
						mostDifferent: (by76[by76.length - 1] as P).names,
					},
					// right numbers, extremes swapped
					{ results: witness.results, mostSimilar: dif.names, mostDifferent: sim.names },
				],
			}),
		);
	}

	// p302-2: three-band acceptance with CIE94 (graphic arts, catalog color as reference); every value >= 15% from both edges.
	{
		const LO = 2.0;
		const HI = 4.0;
		const bandOf = (d: number) => (d < LO ? "accept" : d < HI ? "review" : "reject");
		const safe = (d: number) => d <= LO * 0.85 || (d >= LO * 1.15 && d <= HI * 0.85) || d >= HI * 1.15;
		const items: [string, string, string][] = [
			["copper-mug", "#b5651d", "#b16724"],
			["forest-tote", "#2e5e4e", "#2a5648"],
			["slate-hoodie", "#7a8b99", "#808899"],
			["cobalt-cap", "#3b4cca", "#414bc4"],
			["mustard-scarf", "#e3c16f", "#d4b055"],
			["plum-socks", "#6b4e71", "#5c4466"],
		];
		let maxSwap = 0;
		const exp = items.map(([id, ref, photo]) => {
			const d = de94Hex(ref, photo);
			assert(safe(d), `p302-2 ${id} within 15% of a band edge (${d})`);
			const swapped = de94Hex(photo, ref);
			maxSwap = Math.max(maxSwap, Math.abs(swapped - d));
			assert(bandOf(swapped) === bandOf(d), `p302-2 ${id} band depends on which color is the reference`);
			return { id, deltaE: r2(d), band: bandOf(d), b00: bandOf(de00Hex(ref, photo)), b76: bandOf(de76Hex(ref, photo)) };
		});
		assert(new Set(exp.map((e) => e.band)).size === 3, "p302-2 needs all three bands");
		assert(exp.some((e) => e.b00 !== e.band), "p302-2 CIEDE2000 trap missing");
		assert(exp.some((e) => e.b76 !== e.band), "p302-2 CIE76 trap missing");
		const witness = { results: exp.map(({ b00: _a, b76: _b, ...e }) => e) };
		tasks.push(
			task(302, 2, {
				prompt: `Product-photo QA for our merch store: each item has a catalog color (the reference) and the color sampled from the retouched photo. We grade the difference with CIE94 using the graphic-arts weights: kL = kC = kH = 1, SL = 1, SC = 1 + 0.045·C1, SH = 1 + 0.015·C1, where C1 is the CIELAB chroma of the catalog (reference) color, and ΔH² = Δa² + Δb² − ΔC². ${LAB_D65}

Bands: "accept" when ΔE94 < ${LO.toFixed(1)}, "review" when ${LO.toFixed(1)} ≤ ΔE94 < ${HI.toFixed(1)}, "reject" when ΔE94 ≥ ${HI.toFixed(1)}.

${items.map(([id, r, p]) => `- ${id}: catalog ${r}, photo ${p}`).join("\n")}

For each item give ΔE94 (two decimals) and the band.
${contract(`{"results": [{"id": "copper-mug", "deltaE": 0.00, "band": "accept"}, ...one per item]}`)}`,
				schema: obj({ results: arr(obj({ id: STR, deltaE: NUM, band: { enum: ["accept", "review", "reject"] } })) }),
				params: {
					rows: exp.map((e) => ({
						key: e.id,
						checks: [spec(`band-${e.id}`, ["band"], eq(e.band)), spec(`de-${e.id}`, ["deltaE"], num(e.deltaE, TOL))],
					})),
					derivation: {
						inputs: { items },
						edges: [LO, HI],
						minRelativeMargin: 0.15,
						ciede2000: Object.fromEntries(items.map(([id, r, p]) => [id, r2(de00Hex(r, p))])),
						cie76: Object.fromEntries(items.map(([id, r, p]) => [id, r2(de76Hex(r, p))])),
						cie94PhotoAsReference: Object.fromEntries(items.map(([id, r, p]) => [id, r2(de94Hex(p, r))])),
						tolerance: `±${TOL}: D65 white-constant variants move CIE94 by < 0.02; swapping the reference moves these pairs by <= ${r2(maxSwap)} and never changes a band (asserted)`,
					},
				},
				witness,
				invalid: [
					// CIEDE2000 used
					{ results: items.map(([id, r, p]) => ({ id, deltaE: r2(de00Hex(r, p)), band: bandOf(de00Hex(r, p)) })) },
					// CIE76 used
					{ results: items.map(([id, r, p]) => ({ id, deltaE: r2(de76Hex(r, p)), band: bandOf(de76Hex(r, p)) })) },
				],
			}),
		);
	}

	// p302-3: snap four logo colors to the nearest ink of a ten-ink screen-print palette (CIEDE2000), margins >= 1.0.
	{
		const inks = ["#1d1d1b", "#f4f1e8", "#c8102e", "#e87722", "#ffcd00", "#007a33", "#0057b8", "#6d2077", "#8a8d8f", "#00a3ad"];
		const logo: [string, string][] = [
			["wordmark", "#4a7091"],
			["flame", "#f85637"],
			["crest", "#4a2c6b"],
			["leaf", "#3fa34d"],
		];
		const rgbDist = (a: string, b: string) => {
			const x = hexToRgb(a);
			const y = hexToRgb(b);
			return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
		};
		const exp = logo.map(([id, t]) => {
			const d00 = inks.map((k) => de00Hex(t, k));
			const s = sortedAsc(d00);
			assert((s[1] as number) - (s[0] as number) >= 1.0, `p302-3 ${id} margin`);
			const ink = inks[argmin(d00)] as string;
			stable(t, ink, "p302-3");
			const ink76 = inks[argmin(inks.map((k) => de76Hex(t, k)))] as string;
			const inkRgb = inks[argmin(inks.map((k) => rgbDist(t, k)))] as string;
			return { id, ink, deltaE: r2(s[0] as number), margin: r2((s[1] as number) - (s[0] as number)), ink76, inkRgb, t };
		});
		assert(exp.filter((e) => e.ink76 !== e.ink).length >= 2, "p302-3 CIE76 trap missing");
		assert(exp.some((e) => e.inkRgb !== e.ink), "p302-3 RGB trap missing");
		const witness = { results: exp.map((e) => ({ id: e.id, ink: e.ink, deltaE: e.deltaE })) };
		tasks.push(
			task(302, 3, {
				prompt: `We're screen-printing our logo and the shop only stocks ten inks. For each logo color, pick the ink that's perceptually closest by CIEDE2000 (kL = kC = kH = 1) and tell me the CIEDE2000 difference to it (two decimals). ${LAB_D65}

Inks (sRGB hex): ${inks.join(", ")}
Logo colors:
${logo.map(([id, h]) => `- ${id}: ${h}`).join("\n")}
${contract(`{"results": [{"id": "wordmark", "ink": "#rrggbb", "deltaE": 0.00}, ...one per logo color]}`)}`,
				schema: obj({ results: arr(obj({ id: STR, ink: HEX, deltaE: NUM })) }),
				params: {
					rows: exp.map((e) => ({
						key: e.id,
						checks: [spec(`ink-${e.id}`, ["ink"], eq(e.ink)), spec(`de-${e.id}`, ["deltaE"], num(e.deltaE, TOL))],
					})),
					derivation: {
						inputs: { inks, logo },
						marginToRunnerUp: Object.fromEntries(exp.map((e) => [e.id, e.margin])),
						cie76Nearest: Object.fromEntries(exp.map((e) => [e.id, e.ink76])),
						rgbNearest: Object.fromEntries(exp.map((e) => [e.id, e.inkRgb])),
						margin: "nearest ink beats the runner-up by >= 1.0 dE00 for every logo color",
						tolerance: tolNote,
					},
				},
				witness,
				invalid: [
					{ results: exp.map((e) => ({ id: e.id, ink: e.ink76, deltaE: r2(de76Hex(e.t, e.ink76)) })) },
					{ results: exp.map((e) => ({ id: e.id, ink: e.inkRgb, deltaE: r2(de00Hex(e.t, e.inkRgb)) })) },
				],
			}),
		);
	}

	// p302-4: full rankings of four candidates under CIE76 and under CIEDE2000; the two orders differ (seeded build-time search).
	{
		const target = "#8e3b46";
		const seed = 30224;
		const GAP = 0.75;
		const rnd = mulberry32(seed);
		const base = hexToRgb(target).map((v) => Math.round(v * 255));
		const jitter = () =>
			rgbToHex(base.map((c) => Math.min(255, Math.max(0, c + Math.round((rnd() * 2 - 1) * 30))) / 255) as unknown as Rgb);
		const gapsOk = (ds: number[]) => {
			const s = sortedAsc(ds);
			return s.every((v, i) => i === 0 || v - (s[i - 1] as number) >= GAP);
		};
		const orderBy = (cands: string[], f: (a: string, b: string) => number) =>
			[...cands].sort((a, b) => f(target, a) - f(target, b));
		let found: { cands: string[]; trial: number } | undefined;
		for (let trial = 0; trial < 100000 && !found; trial++) {
			const cands = Array.from({ length: 4 }, jitter);
			if (new Set(cands).size < 4) continue;
			const d76 = cands.map((c) => de76Hex(target, c));
			const d00 = cands.map((c) => de00Hex(target, c));
			if (Math.min(...d00) < 2 || !gapsOk(d76) || !gapsOk(d00)) continue;
			const o76 = orderBy(cands, de76Hex);
			const o00 = orderBy(cands, de00Hex);
			if (o76.filter((c, i) => c !== o00[i]).length < 3) continue;
			if (cands.some((c) => de00Sensitivity(target, c) > 0.05)) continue;
			found = { cands, trial };
		}
		assert(found !== undefined, "p302-4 search found nothing");
		const { cands, trial } = found as { cands: string[]; trial: number };
		const o76 = orderBy(cands, de76Hex);
		const o00 = orderBy(cands, de00Hex);
		const exp = cands.map((c) => ({ hex: c, de76: r2(de76Hex(target, c)), de2000: r2(de00Hex(target, c)) }));
		const witness = { results: exp, orderCie76: o76, orderCiede2000: o00 };
		tasks.push(
			task(302, 4, {
				prompt: `I'm writing a short internal note on why we switched our color matching from CIE76 to CIEDE2000, and I want a concrete example. Target swatch: ${target}. Four lab dips came back: ${cands.join(", ")}.

For every dip, give its distance from the target under CIE76 (plain Euclidean distance in L*a*b*) and under CIEDE2000 (kL = kC = kH = 1), two decimals each. Then rank the four dips from closest to farthest under each metric. ${LAB_D65}
${contract(`{"results": [{"hex": "#rrggbb", "de76": 0.00, "de2000": 0.00}, ...one per dip], "orderCie76": ["#rrggbb", ...closest first], "orderCiede2000": ["#rrggbb", ...closest first]}`)}`,
				schema: obj({
					results: arr(obj({ hex: HEX, de76: NUM, de2000: NUM })),
					orderCie76: arr(HEX, 4),
					orderCiede2000: arr(HEX, 4),
				}),
				params: {
					key: "hex",
					rows: exp.map((e) => ({
						key: e.hex,
						checks: [spec(`de76-${e.hex}`, ["de76"], num(e.de76, TOL)), spec(`de2000-${e.hex}`, ["de2000"], num(e.de2000, TOL))],
					})),
					top: [
						spec("order-cie76", ["orderCie76"], { k: "seq", v: o76 }),
						spec("order-ciede2000", ["orderCiede2000"], { k: "seq", v: o00 }),
					],
					derivation: {
						inputs: { target, cands },
						search: `mulberry32(${seed}); 4 candidates per trial, each channel of ${target} jittered by up to ±30; first trial (${trial}) where the two orders differ in >= 3 positions, adjacent gaps >= ${GAP} in both metrics, min dE00 >= 2, CIEDE2000 stable under ±0.03 Lab`,
						tolerance: tolNote,
					},
				},
				witness,
				invalid: [
					// one order copied into both
					{ results: exp, orderCie76: o00, orderCiede2000: o00 },
					// metrics swapped
					{
						results: exp.map((e) => ({ hex: e.hex, de76: e.de2000, de2000: e.de76 })),
						orderCie76: o00,
						orderCiede2000: o76,
					},
				],
			}),
		);
	}

	// p302-5: step uniformity of a seven-step tonal ramp: consecutive CIEDE2000 steps, smallest and largest step.
	{
		const ramp: [string, string][] = [
			["50", "#fff4e6"],
			["100", "#ffe0bf"],
			["200", "#ffc68f"],
			["300", "#ffa94d"],
			["400", "#f08c28"],
			["500", "#c96a14"],
			["600", "#8f4708"],
		];
		type S = { step: string; d00: number; d76: number };
		const steps: S[] = ramp.slice(1).map(([n, h], i) => {
			const [pn, ph] = ramp[i] as [string, string];
			stable(ph, h, "p302-5");
			return { step: `${pn}-${n}`, d00: de00Hex(ph, h), d76: de76Hex(ph, h) };
		});
		const by00 = [...steps].sort((a, b) => a.d00 - b.d00);
		const by76 = [...steps].sort((a, b) => a.d76 - b.d76);
		const small = (by00[0] as S).step;
		const large = (by00[by00.length - 1] as S).step;
		assert((by00[1] as S).d00 - (by00[0] as S).d00 >= 0.5, "p302-5 smallest margin");
		assert((by00[by00.length - 1] as S).d00 - (by00[by00.length - 2] as S).d00 >= 0.5, "p302-5 largest margin");
		const large76 = (by76[by76.length - 1] as S).step;
		assert(large76 !== large, "p302-5 CIE76 largest-step trap missing");
		const witness = { steps: steps.map((s) => ({ step: s.step, deltaE: r2(s.d00) })), smallest: small, largest: large };
		tasks.push(
			task(302, 5, {
				prompt: `I'm checking whether our orange ramp has even perceptual steps. For each pair of neighbouring steps, compute the CIEDE2000 difference (kL = kC = kH = 1, two decimals), then tell me which step-to-step jump is the smallest and which is the largest. ${LAB_D65}

Ramp: ${ramp.map(([n, h]) => `orange-${n} ${h}`).join(", ")}

Name each jump by the two step numbers joined with a hyphen, lower first, e.g. "50-100".
${contract(`{"steps": [{"step": "50-100", "deltaE": 0.00}, ...all six jumps], "smallest": "50-100", "largest": "50-100"}`)}`,
				schema: obj({ steps: arr(obj({ step: STR, deltaE: NUM })), smallest: STR, largest: STR }),
				params: {
					list: "steps",
					key: "step",
					rows: steps.map((s) => ({ key: s.step, checks: [spec(`de-${s.step}`, ["deltaE"], num(r2(s.d00), TOL))] })),
					top: [spec("smallest", ["smallest"], eq(small)), spec("largest", ["largest"], eq(large))],
					derivation: {
						inputs: { ramp },
						cie76: Object.fromEntries(steps.map((s) => [s.step, r2(s.d76)])),
						margins: "smallest and largest jump each >= 0.5 dE00 clear of the next",
						tolerance: tolNote,
					},
				},
				witness,
				invalid: [
					// CIE76 used
					{
						steps: steps.map((s) => ({ step: s.step, deltaE: r2(s.d76) })),
						smallest: (by76[0] as S).step,
						largest: large76,
					},
					// extremes swapped
					{ steps: witness.steps, smallest: large, largest: small },
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

	// p303-1: CIE LCh(ab) next to Oklch for a saturated blue, a warm yellow and white.
	{
		const colors = ["#2f6bff", "#f2c14e", "#ffffff"];
		const LCH_FLOOR = 0.5;
		const OK_FLOOR = 0.02;
		const T = { lab: 0.15, h: 0.5, ok: 0.002, okh: 1 };
		const exp = colors.map((hex) => {
			const rgb = hexToRgb(hex);
			const lch = srgbToLch(rgb);
			const ok = srgbToOklchV(rgb);
			return {
				hex,
				lch: [r2(lch[0]), r2(lch[1]), lch[1] < LCH_FLOOR ? 0 : r2(lch[2])],
				oklch: [r4(ok[0]), r4(ok[1]), ok[1] < OK_FLOOR ? 0 : r2(ok[2])],
				skipL: lch[1] < LCH_FLOOR,
				skipO: ok[1] < OK_FLOOR,
			};
		});
		type E = (typeof exp)[number];
		assert(exp.some((e) => e.skipL && e.skipO) && exp.some((e) => !e.skipL), "p303-1 needs chromatic and achromatic");
		const blue = exp[0] as E;
		assert(Math.abs((blue.lch[2] as number) - (blue.oklch[2] as number)) > 10, "p303-1 hue difference should be visible");
		const witness = { colors: exp.map(({ skipL: _a, skipO: _b, ...e }) => e) };
		tasks.push(
			task(303, 1, {
				prompt: `We're moving our CSS from lch() to oklch() and the designers keep asking why the hue numbers changed. For each color below give both polar forms:
- lch: CIE LCh(ab) - L* (0-100), chroma C* = √(a*² + b*²), hue h = atan2(b*, a*) in degrees 0-360. ${LAB_D65}
- oklch: Oklch from ${OKLAB_DEF}: L (0-1), C = √(a² + b²), h = atan2(b, a) in degrees 0-360.

Precision: CIE L*, C* and h to two decimals; Oklch L and C to four decimals and h to two. When a color is achromatic (C* below ${LCH_FLOOR}, or Oklch C below ${OK_FLOOR}) its hue is meaningless - put 0 or whatever you get.

Colors: ${colors.join(", ")}
${contract(`{"colors": [{"hex": "#rrggbb", "lch": [L, C, h], "oklch": [L, C, h]}, ...one per color]}`)}`,
				schema: obj({ colors: arr(obj({ hex: HEX, lch: arr(NUM, 3), oklch: arr(NUM, 3) })) }),
				params: {
					list: "colors",
					key: "hex",
					rows: exp.map((e) => ({
						key: e.hex,
						checks: [
							spec(`lch-${e.hex}`, ["lch"], vecE(e.lch, [T.lab, T.lab, T.h], 2, e.skipL)),
							spec(`oklch-${e.hex}`, ["oklch"], vecE(e.oklch, [T.ok, T.ok, T.okh], 2, e.skipO)),
						],
					})),
					derivation: {
						inputs: { colors },
						tolerances: `CIE L*, C* ±${T.lab} (white-constant variants < 0.02), h ±${T.h}° (skipped when C* < ${LCH_FLOOR}); Oklch L, C ±${T.ok} (matrix variants < 2e-4), h ±${T.okh}° (skipped when C < ${OK_FLOOR})`,
					},
				},
				witness,
				invalid: [
					// CIE Lab reported instead of LCh, Oklch L in percent
					{
						colors: colors.map((hex, i) => ({
							hex,
							lch: srgbToLab(hexToRgb(hex)).map(r2),
							oklch: [r2(((exp[i] as E).oklch[0] as number) * 100), ...(exp[i] as E).oklch.slice(1)],
						})),
					},
					// LCh against D50 without adaptation; Oklch hue copied from CIE hue
					{
						colors: colors.map((hex, i) => {
							const lch = toPolar(xyzToLab(srgbToXyz(hexToRgb(hex)), D50)).map(r2);
							const e = exp[i] as E;
							return { hex, lch, oklch: [e.oklch[0], e.oklch[1], e.lch[2]] };
						}),
					},
				],
			}),
		);
	}

	// p303-2: reverse direction from seven specs (HSL, HWB, Oklab, XYZ, naive CMYK incl. rich black, BT.2020-encoded) to hex.
	{
		const xyzIn: Vec3 = [0.265, 0.214, 0.56];
		const inputs: { id: string; text: string; rgb: Rgb; wrong: Rgb }[] = [
			{ id: "hsl", text: "hsl(152 48% 36%) - CSS Color 4 HSL", rgb: hslToSrgb([152, 0.48, 0.36]), wrong: hsvToSrgb([152, 0.48, 0.36]) },
			{
				id: "hwb",
				text: "hwb(28 12% 9%) - CSS Color 4 HWB (hue, whiteness, blackness)",
				rgb: hwbToSrgb([28, 0.12, 0.09]),
				wrong: hwbToSrgb([28, 0.09, 0.12]),
			},
			{
				id: "oklab",
				text: `Oklab L 0.62, a −0.05, b −0.10 (${OKLAB_DEF})`,
				rgb: oklabToRgb([0.62, -0.05, -0.1]),
				wrong: oklabToRgb([0.62, -0.1, -0.05]),
			},
			{
				id: "xyz",
				text: "CIE XYZ (D65, white has Y = 1): X 0.2650, Y 0.2140, Z 0.5600",
				rgb: xyzToSrgb(xyzIn),
				wrong: srgbToLinearRgb(xyzToSrgb(xyzIn)) as Rgb,
			},
			{
				id: "cmyk",
				text: "naive CMYK C 8%, M 64%, Y 0%, K 22%",
				rgb: cmykNaiveToSrgb([0.08, 0.64, 0, 0.22]),
				wrong: [1 - 0.08 - 0.22, 1 - 0.64 - 0.22, 1 - 0 - 0.22],
			},
			{
				id: "rich-black",
				text: "naive CMYK C 60%, M 40%, Y 40%, K 100% (our printer's rich black)",
				rgb: cmykNaiveToSrgb([0.6, 0.4, 0.4, 1]),
				wrong: [1 - 0.6, 1 - 0.4, 1 - 0.4],
			},
			{
				id: "rec2020",
				text: "ITU-R BT.2020 R'G'B' 0.62, 0.48, 0.31, encoded with the BT.2020 transfer function (V = 1.09929682680944·L^0.45 − 0.09929682680944 for L ≥ 0.018053968510807, else V = 4.5·L), D65 white",
				rgb: rec2020ToSrgb([0.62, 0.48, 0.31]),
				wrong: [0.62, 0.48, 0.31],
			},
		];
		const exp = inputs.map((i) => ({ id: i.id, hex: rgbToHex(i.rgb) }));
		const wrongHex = inputs.map((i) => rgbToHex(i.wrong));
		inputs.forEach((i, k) => {
			assert(i.rgb.every((v) => v * 255 >= -0.5 && v * 255 <= 255.5), `p303-2 ${i.id} out of sRGB gamut`);
			assert(maxCh(exp[k]?.hex as string, wrongHex[k] as string) > 1, `p303-2 wrong variant of ${i.id} indistinguishable`);
			// no channel sits within 0.05 of a .5 rounding boundary, so the nearest 8-bit value is unambiguous
			for (const v of i.rgb) {
				const f = (v * 255) % 1;
				assert(Math.abs(Math.abs(f) - 0.5) > 0.05, `p303-2 ${i.id} channel too near a .5 boundary`);
			}
		});
		const witness = { results: exp };
		tasks.push(
			task(303, 2, {
				prompt: `Handoff cleanup: the brand guide lists colors in a mix of notations and I need every one as an sRGB hex. Convert each to sRGB (IEC 61966-2-1 transfer curve, D65 white, no chromatic adaptation) and round each channel to the nearest 8-bit value. All of them are inside the sRGB gamut. For naive CMYK use the profile-free formulas R = (1 − C)(1 − K), G = (1 − M)(1 − K), B = (1 − Y)(1 − K) with all values as fractions 0-1.

${inputs.map((i) => `- ${i.id}: ${i.text}`).join("\n")}
${contract(`{"results": [{"id": "hsl", "hex": "#rrggbb"}, ...one per entry]}`)}`,
				schema: obj({ results: arr(obj({ id: STR, hex: HEX })) }),
				params: {
					rows: exp.map((e) => ({ key: e.id, checks: [spec(`hex-${e.id}`, ["hex"], { k: "hex", v: e.hex, tol: 1 })] })),
					derivation: {
						inputs: Object.fromEntries(inputs.map((i) => [i.id, i.text])),
						exact255: Object.fromEntries(inputs.map((i) => [i.id, i.rgb.map((v) => round(v * 255, 2))])),
						tolerance: "±1 per 8-bit channel (round-half conventions; matrix and white-constant variants move channels by < 0.2)",
						wrongVariants: Object.fromEntries(inputs.map((i, k) => [i.id, wrongHex[k]])),
					},
				},
				witness,
				invalid: [
					// HSL read as HSV, whiteness/blackness swapped, a/b swapped, linear values not encoded, K subtracted, rich black as CMY, BT.2020 values used as sRGB
					{ results: inputs.map((i, k) => ({ id: i.id, hex: wrongHex[k] })) },
					// only the naive-CMYK mistakes
					{ results: exp.map((e, k) => ({ ...e, hex: e.id === "cmyk" || e.id === "rich-black" ? wrongHex[k] : e.hex })) },
				],
			}),
		);
	}

	// p303-3: linear-light pipeline values: linear sRGB, XYZ and linear Rec.2020 for a rose and a near-black.
	{
		const colors = ["#d1495b", "#0a0a0a"];
		const T = { lin: 0.0005, xyz: 0.001, rec: 0.001 };
		const r5 = (v: number) => round(v, 5);
		const exp = colors.map((hex) => {
			const rgb = hexToRgb(hex);
			return {
				hex,
				linear: srgbToLinearRgb(rgb).map(r5),
				xyz: srgbToXyz(rgb).map(r5),
				rec2020Linear: srgbToRec2020Linear(rgb).map(r5),
			};
		});
		assert(hexToRgb("#0a0a0a")[0] <= 0.04045, "p303-3 near-black should be in the linear toe");
		const gamma22 = (hex: string) => hexToRgb(hex).map((v) => v ** 2.2) as unknown as Vec3;
		assert(Math.abs(gamma22("#0a0a0a")[0] - (exp[1]?.linear[0] as number)) > 2 * T.lin, "p303-3 gamma-2.2 trap invisible");
		const witness = { colors: exp };
		tasks.push(
			task(303, 3, {
				prompt: `I'm feeding brand colors into a linear-light compositing pipeline (HDR video graphics) and need their linear values. For each sRGB hex give:
- linear: linear-light sRGB, i.e. each channel c in 0-1 decoded with the IEC 61966-2-1 curve (c/12.92 when c ≤ 0.04045, otherwise ((c + 0.055)/1.055)^2.4);
- xyz: CIE XYZ with the D65 white, scaled so #ffffff has Y = 1;
- rec2020Linear: linear-light RGB in the ITU-R BT.2020 primaries (D65 white, same colors, no gamut mapping), with no transfer function applied.

About five decimals for everything.
Colors: ${colors.join(", ")}
${contract(`{"colors": [{"hex": "#rrggbb", "linear": [r, g, b], "xyz": [X, Y, Z], "rec2020Linear": [r, g, b]}, ...one per color]}`)}`,
				schema: obj({
					colors: arr(obj({ hex: HEX, linear: arr(NUM, 3), xyz: arr(NUM, 3), rec2020Linear: arr(NUM, 3) })),
				}),
				params: {
					list: "colors",
					key: "hex",
					rows: exp.map((e) => ({
						key: e.hex,
						checks: [
							spec(`linear-${e.hex}`, ["linear"], vecE(e.linear, [T.lin, T.lin, T.lin])),
							spec(`xyz-${e.hex}`, ["xyz"], vecE(e.xyz, [T.xyz, T.xyz, T.xyz])),
							spec(`rec2020-linear-${e.hex}`, ["rec2020Linear"], vecE(e.rec2020Linear, [T.rec, T.rec, T.rec])),
						],
					})),
					derivation: {
						inputs: { colors },
						tolerances: `linear ±${T.lin} (exact formula); XYZ and linear Rec.2020 ±${T.xyz} (primaries-derived vs published 4- to 7-digit matrices differ by < 3e-4)`,
					},
				},
				witness,
				invalid: [
					// pure 2.2 gamma instead of the piecewise curve
					{
						colors: colors.map((hex) => {
							const lin = gamma22(hex);
							return {
								hex,
								linear: lin.map(r5),
								xyz: srgbToXyz(hexToRgb(hex)).map(r5),
								rec2020Linear: srgbToRec2020Linear(hexToRgb(hex)).map(r5),
							};
						}),
					},
					// Rec.2020 given with the BT.2020 transfer function applied
					{ colors: exp.map((e) => ({ ...e, rec2020Linear: srgbToRec2020(hexToRgb(e.hex)).map(r5) })) },
				],
			}),
		);
	}

	// p303-4: cylindrical-to-cylindrical: CSS HSL values to HSV/HSB and HWB (no hex in between), including a gray.
	{
		const specs: { id: string; hsl: Vec3; css: string }[] = [
			{ id: "link", hsl: [210, 0.6, 0.45], css: "hsl(210 60% 45%)" },
			{ id: "blush", hsl: [340, 0.85, 0.92], css: "hsl(340 85% 92%)" },
			{ id: "fog", hsl: [48, 0, 0.85], css: "hsl(48 0% 85%)" },
		];
		const T = { h: 0.5, p: 0.5 };
		let worstHexRoute = 0;
		const exp = specs.map((s) => {
			const rgb = hslToSrgb(s.hsl);
			const hsv = srgbToHsv(rgb);
			const hwb = srgbToHwb(rgb);
			const gray = s.hsl[1] === 0;
			if (!gray) assert(Math.abs(hsv[0] - s.hsl[0]) < 1e-6 && Math.abs(hwb[0] - s.hsl[0]) < 1e-6, `p303-4 ${s.id} hue drift`);
			// a model that rounds through an 8-bit hex must still pass
			const q = hexToRgb(rgbToHex(rgb));
			const hsvQ = srgbToHsv(q);
			const hwbQ = srgbToHwb(q);
			for (const k of [1, 2]) {
				worstHexRoute = Math.max(
					worstHexRoute,
					Math.abs(pct1(hsvQ[k] as number) - pct1(hsv[k] as number)),
					Math.abs(pct1(hwbQ[k] as number) - pct1(hwb[k] as number)),
				);
			}
			return {
				id: s.id,
				hsv: [gray ? 0 : r1(hsv[0]), pct1(hsv[1]), pct1(hsv[2])],
				hwb: [gray ? 0 : r1(hwb[0]), pct1(hwb[1]), pct1(hwb[2])],
				gray,
			};
		});
		assert(worstHexRoute <= T.p, `p303-4 the 8-bit route moves a component by ${worstHexRoute}`);
		type E = (typeof exp)[number];
		const witness = { results: exp.map(({ gray: _g, ...e }) => e) };
		tasks.push(
			task(303, 4, {
				prompt: `Our color picker shows HSB and HWB sliders, but the tokens are stored as CSS HSL. Convert each HSL value below into HSV (a.k.a. HSB: hue, saturation, value/brightness - the usual hexcone model) and into CSS Color 4 HWB (hue, whiteness, blackness). Work from the exact HSL numbers; don't round through an 8-bit hex.

Hue in degrees 0-360; all other components as percentages 0-100, to one decimal. For a gray (saturation 0) the hue doesn't matter - use 0 or anything.

${specs.map((s) => `- ${s.id}: ${s.css}`).join("\n")}
${contract(`{"results": [{"id": "link", "hsv": [h, s, v], "hwb": [h, w, b]}, ...one per token]}`)}`,
				schema: obj({ results: arr(obj({ id: STR, hsv: arr(NUM, 3), hwb: arr(NUM, 3) })) }),
				params: {
					rows: exp.map((e) => ({
						key: e.id,
						checks: [
							spec(`hsv-${e.id}`, ["hsv"], vecE(e.hsv, [T.h, T.p, T.p], 0, e.gray)),
							spec(`hwb-${e.id}`, ["hwb"], vecE(e.hwb, [T.h, T.p, T.p], 0, e.gray)),
						],
					})),
					derivation: {
						inputs: Object.fromEntries(specs.map((s) => [s.id, s.css])),
						tolerances: `hue ±${T.h}° (skipped for the gray); percentages ±${T.p}: going through an 8-bit hex instead moves components by <= ${r2(worstHexRoute)} points for these inputs (asserted)`,
					},
				},
				witness,
				invalid: [
					// HSL saturation and lightness copied into HSV unchanged
					{
						results: specs.map((s, i) => ({
							id: s.id,
							hsv: [s.hsl[0], pct1(s.hsl[1]), pct1(s.hsl[2])],
							hwb: (exp[i] as E).hwb,
						})),
					},
					// whiteness and blackness swapped
					{ results: exp.map((e) => ({ id: e.id, hsv: e.hsv, hwb: [e.hwb[0], e.hwb[2], e.hwb[1]] })) },
				],
			}),
		);
	}

	// p303-5: Display P3 (CSS color()) and CIELAB (D65) for a cyan, a deep red and a warm near-white.
	{
		const colors = ["#00b4d8", "#9d0208", "#f7f7f2"];
		const T = { p3: 0.002, lab: 0.15 };
		const exp = colors.map((hex) => {
			const rgb = hexToRgb(hex);
			const p3 = srgbToP3(rgb).map(r4);
			assert(p3.every((v) => v >= 0 && v <= 1), `p303-5 ${hex} P3 out of range`);
			return { hex, p3, lab: srgbToLab(rgb).map(r2) };
		});
		const css = (v: readonly number[]) => `color(display-p3 ${v.map((x) => x.toFixed(4)).join(" ")})`;
		const witness = { colors: exp.map((e) => ({ hex: e.hex, p3: css(e.p3), lab: e.lab })) };
		tasks.push(
			task(303, 5, {
				prompt: `I'm adding Display P3 fallbacks to our stylesheet and also need Lab values for the print vendor. For each sRGB hex give:
- p3: a CSS Color 4 \`color(display-p3 r g b)\` string with r, g, b as plain decimals 0-1 (four decimals) for the same color - not a "more vivid" remap. Display P3 = DCI-P3 primaries, D65 white, sRGB transfer curve; go through linear light and CIE XYZ (D65).
- lab: CIELAB L*, a*, b* to two decimals. ${LAB_D65}

Colors: ${colors.join(", ")}
${contract(`{"colors": [{"hex": "#rrggbb", "p3": "color(display-p3 0.0000 0.0000 0.0000)", "lab": [L, a, b]}, ...one per color]}`)}`,
				schema: obj({ colors: arr(obj({ hex: HEX, p3: STR, lab: arr(NUM, 3) })) }),
				params: {
					list: "colors",
					key: "hex",
					rows: exp.map((e) => ({
						key: e.hex,
						checks: [
							spec(`p3-${e.hex}`, ["p3"], { k: "css", space: "display-p3", v: e.p3, tol: [T.p3, T.p3, T.p3] }),
							spec(`lab-${e.hex}`, ["lab"], vecE(e.lab, [T.lab, T.lab, T.lab])),
						],
					})),
					derivation: {
						inputs: { colors },
						tolerances: `P3 ±${T.p3} per channel (primaries-derived vs published matrices < 2e-4); L*, a*, b* ±${T.lab} (white-constant variants < 0.02)`,
					},
				},
				witness,
				invalid: [
					// sRGB numbers relabelled as display-p3; Lab against D50 without adaptation
					{
						colors: colors.map((hex) => ({
							hex,
							p3: css([...hexToRgb(hex)].map(r4)),
							lab: xyzToLab(srgbToXyz(hexToRgb(hex)), D50).map(r2),
						})),
					},
					// P3 left linear (transfer curve not applied)
					{ colors: exp.map((e) => ({ hex: e.hex, p3: css(e.p3.map((v) => r4(srgbToLinear(v)))), lab: e.lab })) },
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

	// p304-1: Oklch L / C / h attributes of five palette colors, one of them near-neutral (hue skipped).
	{
		const colors = ["#7f5539", "#a3c4bc", "#e07a5f", "#3d405b", "#f0efeb"];
		const FLOOR = 0.02;
		const T = { L: 0.002, C: 0.002, h: 1 };
		const exp = colors.map((hex) => {
			const [L, C, h] = srgbToOklchV(hexToRgb(hex));
			return { hex, L: r4(L), C: r4(C), h: C < FLOOR ? 0 : r2(h), skip: C < FLOOR };
		});
		assert(exp.some((e) => e.skip) && exp.filter((e) => !e.skip).length >= 3, "p304-1 needs a near-neutral and chromatic colors");
		const witness = { results: exp.map(({ skip: _s, ...e }) => e) };
		tasks.push(
			task(304, 1, {
				prompt: `I'm tagging an earthy illustration palette with perceptual attributes so we can generate matching tints later. For each swatch give its Oklch lightness L (0-1), chroma C and hue h, where Oklch is the polar form of ${OKLAB_DEF}: C = √(a² + b²), h = atan2(b, a) in degrees 0-360.

Four decimals for L and C, two for h. If C is under ${FLOOR} the hue is unstable - report 0 or whatever you compute; I won't use it.

Swatches: ${colors.join(", ")}
${contract(`{"results": [{"hex": "#rrggbb", "L": 0.0000, "C": 0.0000, "h": 0.00}, ...one per swatch]}`)}`,
				schema: obj({ results: arr(obj({ hex: HEX, L: NUM, C: NUM, h: NUM })) }),
				params: {
					key: "hex",
					rows: exp.map((e) => ({
						key: e.hex,
						checks: [
							spec(`L-${e.hex}`, ["L"], num(e.L, T.L)),
							spec(`C-${e.hex}`, ["C"], num(e.C, T.C)),
							...(e.skip ? [] : [spec(`h-${e.hex}`, ["h"], { k: "hue", v: e.h, tol: T.h })]),
						],
					})),
					derivation: {
						inputs: { colors },
						tolerances: `L, C ±${T.L} (matrix variants < 2e-4); h ±${T.h}° when C >= ${FLOOR}, otherwise not checked`,
					},
				},
				witness,
				invalid: [
					// CIE LCh(ab) scaled to look like Oklch
					{
						results: colors.map((hex) => {
							const [L, C, h] = srgbToLch(hexToRgb(hex));
							return { hex, L: r4(L / 100), C: r4(C / 100), h: r2(h) };
						}),
					},
					// hue in radians
					{ results: exp.map(({ skip: _s, ...e }) => ({ ...e, h: r4((e.h * Math.PI) / 180) })) },
				],
			}),
		);
	}

	// p304-2: WCAG relative luminance and the black-or-white text crossover (L ≈ 0.1791), every L >= 15% from it.
	{
		const CROSS = Math.sqrt(1.05 * 0.05) - 0.05;
		const colors = ["#f77f00", "#003049", "#22a39f", "#4a4e69", "#7b8cde", "#c1121f"];
		const TOL = 0.002;
		const exp = colors.map((hex) => {
			const L = wcagLuminance(hex);
			assert(Math.abs(L - CROSS) >= 0.15 * CROSS, `p304-2 ${hex} too close to the crossover (${L})`);
			return { hex, luminance: r4(L), text: L > CROSS ? "black" : "white" };
		});
		assert(exp.some((e) => e.text === "black") && exp.some((e) => e.text === "white"), "p304-2 needs both text colors");
		const hslPick = (hex: string) => (srgbToHsl(hexToRgb(hex))[2] >= 0.5 ? "black" : "white");
		assert(exp.some((e) => hslPick(e.hex) !== e.text), "p304-2 HSL-lightness trap missing");
		const witness = { results: exp };
		tasks.push(
			task(304, 2, {
				prompt: `Our badge component auto-picks black or white text from the fill's WCAG 2 relative luminance L. The rule: use black text when L > ${r4(CROSS)} (the point where black and white text give equal WCAG contrast, √(1.05 × 0.05) − 0.05), otherwise white.

Relative luminance as WCAG 2.2 defines it: each sRGB channel c in 0-1 is linearized (c/12.92 if c ≤ 0.04045, else ((c + 0.055)/1.055)^2.4), then L = 0.2126·R + 0.7152·G + 0.0722·B, on a 0-1 scale.

For each fill give L (four decimals) and the text color the rule picks.
Fills: ${colors.join(", ")}
${contract(`{"results": [{"hex": "#rrggbb", "luminance": 0.0000, "text": "black"}, ...one per fill; text is "black" or "white"]}`)}`,
				schema: obj({ results: arr(obj({ hex: HEX, luminance: NUM, text: { enum: ["black", "white"] } })) }),
				params: {
					key: "hex",
					rows: exp.map((e) => ({
						key: e.hex,
						checks: [spec(`lum-${e.hex}`, ["luminance"], num(e.luminance, TOL)), spec(`text-${e.hex}`, ["text"], eq(e.text))],
					})),
					derivation: {
						inputs: { colors },
						crossover: r4(CROSS),
						minRelativeMargin: 0.15,
						tolerance: `±${TOL} (0.04045 vs 0.03928 threshold variants and coefficient rounding move L by < 1e-4)`,
					},
				},
				witness,
				invalid: [
					// no linearization (luma on encoded values)
					{
						results: colors.map((hex) => {
							const [r, g, b] = hexToRgb(hex);
							const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
							return { hex, luminance: r4(y), text: y > CROSS ? "black" : "white" };
						}),
					},
					// HSL lightness heuristic for the text color
					{ results: exp.map((e) => ({ ...e, text: hslPick(e.hex) })) },
				],
			}),
		);
	}

	// p304-3: a "light to dark" illustration ramp: Oklab L per swatch and the steps that fail to get darker.
	{
		const ramp: [string, string][] = [
			["s1", "#fef3c7"],
			["s2", "#fecaca"],
			["s3", "#bbf7d0"],
			["s4", "#fdba74"],
			["s5", "#bae6fd"],
			["s6", "#a78bfa"],
			["s7", "#4ade80"],
		];
		const Ls = ramp.map(([, h]) => oklabL(h));
		const stepIds = ramp.slice(1).map(([id], i) => `${(ramp[i] as [string, string])[0]}-${id}`);
		for (let i = 1; i < Ls.length; i++)
			assert(Math.abs((Ls[i] as number) - (Ls[i - 1] as number)) >= 0.02, `p304-3 step ${i} gap < 0.02`);
		const viol = stepIds.filter((_, i) => (Ls[i + 1] as number) > (Ls[i] as number));
		const hslL = ramp.map(([, h]) => srgbToHsl(hexToRgb(h))[2]);
		const violHsl = stepIds.filter((_, i) => (hslL[i + 1] as number) > (hslL[i] as number));
		assert(viol.length >= 2 && viol.length < stepIds.length, "p304-3 needs some but not all violations");
		assert(violHsl.join() !== viol.join(), "p304-3 HSL trap missing");
		const TOL = 0.003;
		const exp = ramp.map(([id, hex], i) => ({ id, hex, L: r4(Ls[i] as number) }));
		const witness = { swatches: exp.map(({ id, L }) => ({ id, L })), notDarker: viol };
		tasks.push(
			task(304, 3, {
				prompt: `The illustrator says these seven swatches are ordered from lightest to darkest, but on a grayscale proof some look out of order. Measure each swatch's perceptual lightness as Oklab L (${OKLAB_DEF}, four decimals), then list every step from one swatch to the next where L does not decrease (the next swatch is as light or lighter).

${ramp.map(([id, h]) => `- ${id}: ${h}`).join("\n")}

Name steps as "s1-s2", "s2-s3", and so on.
${contract(`{"swatches": [{"id": "s1", "L": 0.0000}, ...all seven], "notDarker": ["s1-s2", ...]}`)}`,
				schema: obj({ swatches: arr(obj({ id: STR, L: NUM })), notDarker: arr(STR) }),
				params: {
					list: "swatches",
					rows: exp.map((e) => ({ key: e.id, checks: [spec(`L-${e.id}`, ["L"], num(e.L, TOL))] })),
					top: [spec("not-darker", ["notDarker"], { k: "set", v: viol })],
					derivation: {
						inputs: { ramp },
						hslLightnessViolations: violHsl,
						margin: "every step changes Oklab L by >= 0.02",
						tolerance: `L ±${TOL}`,
					},
				},
				witness,
				invalid: [
					// HSL lightness used for the flags
					{ swatches: witness.swatches, notDarker: violHsl },
					// L in percent, and flags inverted
					{
						swatches: exp.map((e) => ({ id: e.id, L: r2(e.L * 100) })),
						notDarker: stepIds.filter((s) => !viol.includes(s)),
					},
				],
			}),
		);
	}

	// p304-4: office-printer grayscale (BT.709 luma on encoded values): gray per series and the pair that collides.
	{
		const series = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", "#e377c2"];
		const TOL = 2;
		const grays = series.map((h) => bt709Gray(h));
		type P = { a: string; b: string; d: number; dOk: number };
		const pairs: P[] = [];
		for (let i = 0; i < series.length; i++)
			for (let j = i + 1; j < series.length; j++)
				pairs.push({
					a: series[i] as string,
					b: series[j] as string,
					d: Math.abs(lvl(grays[i] as string) - lvl(grays[j] as string)),
					dOk: Math.abs(lvl(oklabGray(series[i] as string)) - lvl(oklabGray(series[j] as string))),
				});
		const by = [...pairs].sort((x, y) => x.d - y.d);
		const best = by[0] as P;
		// two grays each off by up to ±TOL cannot reorder the closest pair
		assert((by[1] as P).d - best.d >= 2 * TOL + 1, "p304-4 collision margin");
		const byOk = [...pairs].sort((x, y) => x.dOk - y.dOk)[0] as P;
		assert(byOk.a !== best.a || byOk.b !== best.b, "p304-4 Oklab-gray trap missing");
		const linGray = (hex: string) => {
			const y = wcagLuminance(hex);
			return rgbToHex([y, y, y]);
		};
		const witness = { results: series.map((h, i) => ({ hex: h, gray: grays[i] as string })), collision: [best.a, best.b] };
		tasks.push(
			task(304, 4, {
				prompt: `Our reports get printed on an office laser printer that converts color to gray by BT.709 luma computed straight on the gamma-encoded sRGB values: Y' = 0.2126·R' + 0.7152·G' + 0.0722·B' (channels 0-1, no linearization), gray level = round(255·Y'). For each chart series color, what gray does it print as (#rrggbb with R = G = B)? And which two series end up closest in gray level, i.e. hardest to tell apart on paper?

Series: ${series.join(", ")}
${contract(`{"results": [{"hex": "#rrggbb", "gray": "#rrggbb"}, ...one per series], "collision": ["#rrggbb", "#rrggbb"]}`)}`,
				schema: obj({ results: arr(obj({ hex: HEX, gray: HEX })), collision: arr(HEX, 2) }),
				params: {
					key: "hex",
					rows: series.map((h, i) => ({ key: h, checks: [spec(`gray-${h}`, ["gray"], { k: "hex", v: grays[i] as string, tol: TOL })] })),
					top: [spec("collision", ["collision"], { k: "set", v: [best.a, best.b] })],
					derivation: {
						inputs: { series },
						grayLevels: Object.fromEntries(series.map((h, i) => [h, lvl(grays[i] as string)])),
						closestGap: best.d,
						runnerUpGap: (by[1] as P).d,
						oklabGrayCollision: [byOk.a, byOk.b],
						tolerance: `gray ±${TOL} per channel; collision pair is >= ${2 * TOL + 1} levels clear of the runner-up`,
					},
				},
				witness,
				invalid: [
					// Oklab-L grays (a different method than the printer's)
					{ results: series.map((h) => ({ hex: h, gray: oklabGray(h) })), collision: [byOk.a, byOk.b] },
					// linear luminance written straight into the gray level
					{ results: series.map((h) => ({ hex: h, gray: linGray(h) })), collision: [best.a, best.b] },
				],
			}),
		);
	}

	// p304-5: rank five colors by Oklch chroma and by HSL saturation; the two rankings differ.
	{
		const colors = ["#e9ff70", "#f72585", "#4361ee", "#ade8f4", "#0b090a"];
		const C = colors.map((h) => srgbToOklchV(hexToRgb(h))[1]);
		const S = colors.map(hslS);
		const at = (xs: number[], h: string) => xs[colors.indexOf(h)] as number;
		const byC = [...colors].sort((a, b) => at(C, b) - at(C, a));
		const byS = [...colors].sort((a, b) => at(S, b) - at(S, a));
		const gaps = (xs: number[]) => {
			const s = sortedAsc(xs);
			return s.slice(1).map((v, i) => v - (s[i] as number));
		};
		assert(gaps(C).every((g) => g >= 0.02), "p304-5 chroma gaps < 0.02");
		assert(gaps(S).every((g) => g >= 0.05), "p304-5 HSL saturation gaps < 0.05");
		assert(byC.join() !== byS.join(), "p304-5 rankings should differ");
		const hsvS = (h: string) => srgbToHsv(hexToRgb(h))[1];
		const shown = shuffled(colors, 30405);
		const T = { C: 0.003, S: 0.5 };
		const exp = colors.map((hex, i) => ({ hex, chroma: r4(C[i] as number), hslSaturation: pct1(S[i] as number) }));
		const witness = { results: exp, byChroma: byC, byHslSaturation: byS };
		tasks.push(
			task(304, 5, {
				prompt: `Our palette generator sorts swatches by "saturation", and two engineers implemented it differently: one sorts by HSL saturation (CSS Color 4 HSL, S as a percentage), the other by Oklch chroma C = √(a² + b²) from ${OKLAB_DEF}. Show me how the two disagree: for each swatch give its Oklch chroma (four decimals) and HSL saturation (percent, one decimal), then rank all five from most to least saturated under each definition.

Swatches: ${shown.join(", ")}
${contract(`{"results": [{"hex": "#rrggbb", "chroma": 0.0000, "hslSaturation": 0.0}, ...one per swatch], "byChroma": ["#rrggbb", ...most first], "byHslSaturation": ["#rrggbb", ...most first]}`)}`,
				schema: obj({
					results: arr(obj({ hex: HEX, chroma: NUM, hslSaturation: NUM })),
					byChroma: arr(HEX, 5),
					byHslSaturation: arr(HEX, 5),
				}),
				params: {
					key: "hex",
					rows: exp.map((e) => ({
						key: e.hex,
						checks: [
							spec(`chroma-${e.hex}`, ["chroma"], num(e.chroma, T.C)),
							spec(`hsl-s-${e.hex}`, ["hslSaturation"], num(e.hslSaturation, T.S)),
						],
					})),
					top: [
						spec("by-chroma", ["byChroma"], { k: "seq", v: byC }),
						spec("by-hsl-saturation", ["byHslSaturation"], { k: "seq", v: byS }),
					],
					derivation: {
						inputs: { colors: shown },
						hsvSaturationPct: Object.fromEntries(colors.map((h) => [h, pct1(hsvS(h))])),
						margins: "adjacent chroma >= 0.02 apart, adjacent HSL saturation >= 5 points apart",
						tolerance: `C ±${T.C} (matrix variants < 2e-4); S ±${T.S} points`,
					},
				},
				witness,
				invalid: [
					// one ranking copied into both
					{ results: exp, byChroma: byS, byHslSaturation: byS },
					// saturation as a 0-1 fraction, rankings reversed
					{
						results: exp.map((e) => ({ ...e, hslSaturation: r4(e.hslSaturation / 100) })),
						byChroma: [...byC].reverse(),
						byHslSaturation: [...byS].reverse(),
					},
				],
			}),
		);
	}
	return tasks;
}

/** Neutral suite v2, author A: returns this author's categories' tasks. */
export function neutral2A(): Task[] {
	return [...cat301(), ...cat302(), ...cat303(), ...cat304()];
}
