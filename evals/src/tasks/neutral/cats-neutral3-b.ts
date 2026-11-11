/**
 * Neutral suite v3, author B: categories 305-308 (cvd-simulation, interpolation, harmony,
 * naming-and-text-color), five fresh tasks each (ids q305-1 .. q308-5). Same domains and standards
 * as v1 (cats-neutral-b.ts) and v2 (cats-neutral2-b.ts); new scenarios, inputs, wording and, where
 * SPEC-B allows, task shapes neither earlier version used (one color under all three dichromacies,
 * one-versus-many confusion, naming the deficiency behind a simulated color, ranking colors by how
 * far the simulation moves them, recovering a mix percentage, CSS color hints, hue-offset audits,
 * wheel-dependent scheme reading, completing a scheme, keyword sets within a distance, luminance
 * order of keywords, the black/white flip along a ramp, ranked non-text contrast failures and
 * keyword-name collisions). Every expected value comes from the hand-written references in
 * src/reference-neutral/b-*.ts, and every margin is asserted at build time, so an input change that
 * breaks a margin fails the build instead of shipping an ambiguous task.
 */
import { gradeNeutral } from "../../graders-neutral/index.js";
import type { PathSeg } from "../../graders-neutral/b-checks.js";
import type { CheckSpec3, Expect3 } from "../../graders-neutral/v3-b-checks.js";
import { deltaE2000, hexToRgb, inGamut, oklchToRgb, relativeLuminance, rgbToLab } from "../../reference/color.js";
import { type Cvd, CVDS, cvdDeltaEBoth, simulate, simulateEncodedWrong, simulateHex } from "../../reference-neutral/b-cvd.js";
import {
	hslRotateHex,
	oklchMaxChroma,
	oklchRotate,
	type Scheme,
	SCHEME_OFFSETS,
	SCHEMES,
	schemeError,
} from "../../reference-neutral/b-harmony.js";
import { gamutExcess, interpolateHex, sampleGradient, type Space, stops, toSpace } from "../../reference-neutral/b-interp.js";
import { apcaLc, CSS_NAMED, namesFor, rankNamed, wcag } from "../../reference-neutral/b-naming.js";
import { hexChannelDiff, hexOf, hslOfHex, hslToRgb, hueDist, oklchOfHex, type Rgb } from "../../reference-neutral/b-spaces.js";
import { mulberry32, round } from "../build/common.js";
import { CATEGORY_NAMES, type Task } from "../types.js";

// ---------- small builders (copied from cats-neutral2-b.ts and adapted: q-ids, v3 check specs) ----------

function assert(cond: boolean, msg: string): void {
	if (!cond) throw new Error(`neutral3B build: ${msg}`);
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
	checks: CheckSpec3[];
	derivation: Record<string, unknown>;
	witness: unknown;
	invalid: unknown[];
	toolUseful?: boolean;
	/** Grader kind when the category's v1 kind lacks a needed check (see registry3-b.ts). */
	kind?: string;
}

function task(category: number, n: number, t: TaskBody): Task {
	const id = `q${category}-${n}`;
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
const INT = { type: "integer" };
const STR = { type: "string" };
const obj = (properties: Record<string, unknown>) => ({
	type: "object",
	properties,
	required: Object.keys(properties),
});
const arr = (items: unknown, n?: number) =>
	n === undefined ? { type: "array", items } : { type: "array", items, minItems: n, maxItems: n };
const CVD_ENUM = { type: "string", enum: [...CVDS] };
const BW_ENUM = { type: "string", enum: ["black", "white"] };

const c = (name: string, path: PathSeg[], e: Expect3): CheckSpec3 => ({ name, path, e });
const byId = (id: string): PathSeg => ({ by: "id", eq: id });
const hexE = (v: string, tol: number): Expect3 => ({ k: "hex", v, tol });
const eqE = (v: string | number | boolean): Expect3 => ({ k: "eq", v });
const numE = (v: number, tol: number): Expect3 => ({ k: "num", v, tol });
const oneOfE = (v: string[]): Expect3 => ({ k: "oneOf", v });
const setE = (v: string[]): Expect3 => ({ k: "set", v });
const r1 = (v: number) => round(v, 1);
const r2 = (v: number) => round(v, 2);
const r3 = (v: number) => round(v, 3);
const norm360 = (h: number) => ((h % 360) + 360) % 360;

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

/** Output contract in v3's own wording (the freshness test rejects sentences shared with v1/v2 prompts). */
const contract = (shape: string): string =>
	`Return only JSON, inside a single \`\`\`json fenced block, laid out exactly as follows:\n${shape}`;

// ---------- prompt fragments (v3 wording) ----------

const SRGB_CURVE =
	"the standard sRGB transfer curve of IEC 61966-2-1 (a channel v in 0-1 becomes v / 12.92 if v ≤ 0.04045, else ((v + 0.055) / 1.055)^2.4)";
const machado = (what: string) =>
	`Simulate with Machado, Oliveira & Fernandes (2009) at severity 1.0, using the paper's full-strength ${what}. The matrix works on linear light, not on the hex values: take each 8-bit channel to 0-1, linearize it with ${SRGB_CURVE}, multiply the [R, G, B] column vector by the 3×3 matrix, clamp every component to [0, 1], and gamma-encode it again with the inverse of the same curve.`;
const DE00 =
	"All differences are CIEDE2000 with kL, kC and kH equal to 1, on CIE L*a*b* reached from sRGB via linear RGB and XYZ under the D65 white point (Xn 0.95047, Yn 1.0, Zn 1.08883); do not adapt to D50.";
const ROUND_NOTE = "Rounding the simulated colors to 8-bit hex before you measure, or skipping that, gives the same answers.";
const LAB_D65 =
	'"CIELAB" in this note means L*a*b* derived from sRGB through linear RGB and XYZ against the D65 white (Xn 0.95047, Yn 1.0, Zn 1.08883), without any chromatic adaptation; it is not the D50-based Lab of CSS lab().';
const OKLAB =
	"Oklab is the perceptual space Björn Ottosson published, computed from linear-light sRGB; Oklch is the same space in polar coordinates (lightness L, chroma C, hue angle h in degrees).";
const OUT_HEX = "Bring each result back to sRGB, clamp any channel that falls outside 0-1, and write it as 8-bit #rrggbb.";
const HSL_WHEEL =
	"Use the hue of CSS hsl() as the wheel: convert to HSL, add the offset to H (wrapping at 360), keep the base's S and L unchanged, convert back to RGB and round to 8-bit hex.";
const OKLCH_WHEEL =
	"Use the Oklch hue as the wheel (Ottosson's Oklab from linear-light sRGB, in polar form L, C, h): add the offset to h, keep the base's L and C, convert to sRGB and round to 8-bit hex. A rotated color that would leave the sRGB gamut keeps its L and h and has its C lowered only as far as needed to fit.";
const WCAG =
	"WCAG 2 contrast ratio is (Y_lighter + 0.05) / (Y_darker + 0.05), with relative luminance Y = 0.2126 R + 0.7152 G + 0.0722 B taken on channels linearized by the sRGB curve (v / 12.92 when v ≤ 0.04045, otherwise ((v + 0.055) / 1.055)^2.4).";
const APCA =
	"APCA is APCA-W3 0.0.98G-4g, computed as follows. Screen luminance per color: Y = 0.2126729·R^2.4 + 0.7151522·G^2.4 + 0.0721750·B^2.4 on the 0-1 channels (a pure 2.4 power with no linear toe). Soft clamp near black: when Y < 0.022, use Y + (0.022 − Y)^1.414 instead. If the text and background values differ by under 0.0005, Lc is 0. With the background brighter (Ybg > Ytxt), S = 1.14 × (Ybg^0.56 − Ytxt^0.57) and the result is 0 when S < 0.1, else S − 0.027. With the text brighter, S = 1.14 × (Ybg^0.65 − Ytxt^0.62) and the result is 0 when S > −0.1, else S + 0.027. Lc is that result times 100, so dark-on-light is positive and light-on-dark negative.";

// =====================================================================================
// 305 cvd-simulation
// =====================================================================================

const SIM_TOL = 3;
const SIM_TOL_NOTE = `±${SIM_TOL} per 8-bit channel: output rounding (±0.5), matrices quoted to 4-6 decimals, and clamping before or after re-encoding move a channel by < 1.5 in total`;
const DE_TOL = 1.0;

/** CIEDE2000 between a color and its own simulation; both conventions (unrounded, 8-bit rounded). */
function shiftBoth(hex: string, k: Cvd): [number, number] {
	const lab0 = rgbToLab(hexToRgb(hex));
	const s = simulate(hexToRgb(hex), k);
	return [deltaE2000(lab0, rgbToLab(s)), deltaE2000(lab0, rgbToLab(hexToRgb(hexOf(s))))];
}

function cat305(): Task[] {
	const tasks: Task[] = [];

	// q305-1: each wing color of a museum's wayfinding system under all three dichromacies.
	{
		const wings: [string, string][] = [
			["east", "#c4513a"],
			["north", "#1f7a8c"],
			["west", "#e2b33c"],
			["south", "#6d4e9e"],
		];
		const rows = wings.map(([id, h]) => ({
			id,
			sim: CVDS.map((k) => simulateHex(h, k)),
			enc: CVDS.map((k) => simulateEncodedWrong(h, k)),
		}));
		const worstEnc = Math.max(...rows.flatMap((r) => r.sim.map((s, i) => hexChannelDiff(s, r.enc[i] as string))));
		assert(worstEnc >= SIM_TOL + 5, "q305-1 gamma-encoded variant must be distinguishable");
		const asRow = (id: string, hs: string[]) => ({ id, protanopia: hs[0], deuteranopia: hs[1], tritanopia: hs[2] });
		tasks.push(
			task(305, 1, {
				prompt: `The museum's wayfinding uses one color per wing, painted on floor stripes and door frames. For the accessibility section of the signage handbook I want a small table: each wing color next to how it looks with protanopia, with deuteranopia and with tritanopia.

${machado("matrix for each of the three dichromacies")}

Wing colors:
${wings.map(([id, h]) => `- ${id} wing: ${h}`).join("\n")}

Give the three simulated colors of every wing as 8-bit hex; use the wing name (east, north, west, south) as the id.
${contract(`{"wings": [{"id": "east", "protanopia": "#rrggbb", "deuteranopia": "#rrggbb", "tritanopia": "#rrggbb"}, ...one object per wing]}`)}`,
				schema: obj({ wings: arr(obj({ id: STR, protanopia: HEX, deuteranopia: HEX, tritanopia: HEX })) }),
				checks: rows.flatMap((r) => CVDS.map((k, i) => c(`${k}-${r.id}`, ["wings", byId(r.id), k], hexE(r.sim[i] as string, SIM_TOL)))),
				derivation: {
					model: "Machado 2009, severity 1.0, all three dichromacies, linear sRGB, clamp then encode",
					tolerance: `${SIM_TOL_NOTE}; the matrices applied to gamma-encoded values miss by up to ${worstEnc}`,
				},
				witness: { wings: rows.map((r) => asRow(r.id, r.sim)) },
				invalid: [
					{ wings: rows.map((r) => asRow(r.id, r.enc)) },
					{ wings: rows.map((r) => asRow(r.id, [r.sim[1], r.sim[0], r.sim[2]] as string[])) },
					{ wings: wings.map(([id, h]) => asRow(id, [h, h, h])) },
				],
			}),
		);
	}

	// q305-2: which map markers vanish into the park green under deuteranopia (one background vs many).
	{
		const T = 16;
		const park = "#7a9e3b";
		const markers: [string, string][] = [
			["cafe", "#cb5a3c"],
			["toilets", "#dd9c41"],
			["parking", "#3e5c86"],
			["playground", "#9a6a55"],
			["first-aid", "#b26478"],
			["picnic", "#f3dca6"],
			["boat-hire", "#529a6c"],
			["info", "#8b7bbd"],
		];
		const k: Cvd = "deuteranopia";
		const rows = markers.map(([id, h]) => {
			const d = cvdDeltaEBoth(park, h, k);
			assert(Math.max(...d) <= 0.85 * T || Math.min(...d) >= 1.15 * T, `q305-2 ${id} within 15% of ${T}`);
			return { id, d, prot: cvdDeltaEBoth(park, h, "protanopia")[0], plain: plainDE(park, h) };
		});
		const lost = rows.filter((r) => r.d[0] < T);
		assert(lost.length >= 3 && lost.length <= rows.length - 3, "q305-2 needs lost and visible markers");
		const byD = [...rows].sort((a, b) => a.d[0] - b.d[0]);
		const closest = byD[0] as (typeof rows)[number];
		const second = byD[1] as (typeof rows)[number];
		assert(Math.min(...second.d) >= 1.15 * Math.max(...closest.d) && Math.min(...second.d) - Math.max(...closest.d) >= 1, "q305-2 closest margin");
		const protLost = rows.filter((r) => r.prot < T).map((r) => r.id);
		const plainLost = rows.filter((r) => r.plain < T).map((r) => r.id);
		assert(protLost.join() !== lost.map((r) => r.id).join(), "q305-2 protanopia reading must differ");
		const protClosest = [...rows].sort((a, b) => a.prot - b.prot)[0]?.id as string;
		tasks.push(
			task(305, 2, {
				prompt: `City-parks map: all lawns are filled with ${park} and the point markers sit on top of that green. A deuteranopic volunteer tested the printed map and said several markers simply disappear into the lawn. Which ones? Count a marker as lost when the difference between the lawn and the marker, both simulated for deuteranopia, is below ${T}. Also tell me which marker ends up closest to the lawn.

${machado("deuteranopia matrix")}
${DE00} ${ROUND_NOTE}

Markers:
${markers.map(([id, h]) => `- ${id}: ${h}`).join("\n")}

List the lost markers by id (any order; an empty list if none), and give the single closest marker's id.
${contract(`{"lost": ["<marker id>", ...], "closest": "<marker id>"}`)}`,
				schema: obj({ lost: arr(STR), closest: STR }),
				checks: [
					...rows.map((r) => c(`${r.d[0] < T ? "lost" : "visible"}-${r.id}`, ["lost"], { k: "has", v: r.id, want: r.d[0] < T })),
					c("closest", ["closest"], eqE(closest.id)),
				],
				derivation: {
					deficiency: k,
					background: park,
					threshold: T,
					margin: "every marker at least 15% from the threshold, and the closest at least 15% and 1.0 ΔE00 ahead of the next, with and without 8-bit rounding",
					deltaE: Object.fromEntries(rows.map((r) => [r.id, r2(r.d[0])])),
					wrong: { protanopiaLost: protLost, normalVisionLost: plainLost },
				},
				witness: { lost: lost.map((r) => r.id), closest: closest.id },
				invalid: [
					{ lost: protLost, closest: protClosest },
					{ lost: plainLost, closest: closest.id },
					{ lost: lost.map((r) => r.id), closest: second.id },
				],
			}),
		);
	}

	// q305-3: name the deficiency behind each before/after pair from an unlabeled simulator export.
	{
		const shots: [string, string, Cvd][] = [
			["shot-1", "#e8743b", "protanopia"],
			["shot-2", "#a83279", "deuteranopia"],
			["shot-3", "#5f8f2a", "tritanopia"],
			["shot-4", "#ff6f61", "deuteranopia"],
			["shot-5", "#d8572a", "protanopia"],
			["shot-6", "#8a5cc2", "tritanopia"],
		];
		const rows = shots.map(([id, orig, k]) => {
			const shown = simulateHex(orig, k);
			const others = CVDS.filter((x) => x !== k);
			const gap = Math.min(...others.map((x) => hexChannelDiff(simulateHex(orig, x), shown)));
			const gapEnc = Math.min(...others.map((x) => hexChannelDiff(simulateEncodedWrong(orig, x), shown)));
			assert(gap >= 25, `q305-3 ${id}: another deficiency lands within ${gap} of the shown color`);
			return { id, orig, k, shown, gap, gapEnc };
		});
		assert(new Set(rows.map((r) => r.k)).size === 3, "q305-3 all three deficiencies appear");
		const swapRG = (k: Cvd): Cvd => (k === "protanopia" ? "deuteranopia" : k === "deuteranopia" ? "protanopia" : k);
		tasks.push(
			task(305, 3, {
				prompt: `A teammate batch-exported "before / after" swatches from a color-blindness simulator, but the file names lost the part that said which deficiency each one was simulated for. Every pair below is one original color and the color the simulator produced for it, rounded to 8-bit hex. Each was made for exactly one of protanopia, deuteranopia or tritanopia; please work out which.

The simulator follows Machado, Oliveira & Fernandes (2009) at severity 1.0 (the full-strength dichromat matrices). It linearizes the 0-1 channels with ${SRGB_CURVE}, multiplies by the deficiency's matrix, clamps to [0, 1] and re-encodes with the inverse curve.

Pairs (original → simulated):
${rows.map((r) => `- ${r.id}: ${r.orig} → ${r.shown}`).join("\n")}

Answer with one of the words protanopia, deuteranopia, tritanopia for each id.
${contract(`{"results": [{"id": "shot-1", "deficiency": "<protanopia|deuteranopia|tritanopia>"}, ...one per pair]}`)}`,
				schema: obj({ results: arr(obj({ id: STR, deficiency: CVD_ENUM })) }),
				checks: rows.map((r) => c(`deficiency-${r.id}`, ["results", byId(r.id), "deficiency"], oneOfE([r.k]))),
				derivation: {
					truth: Object.fromEntries(rows.map((r) => [r.id, r.k])),
					margin: "for every pair, the other two deficiencies' simulations land at least 25 steps (8-bit) away from the shown color on some channel",
					gaps: Object.fromEntries(rows.map((r) => [r.id, { correct: r.gap, gammaEncodedMistake: r.gapEnc }])),
				},
				witness: { results: rows.map((r) => ({ id: r.id, deficiency: r.k })) },
				invalid: [
					{ results: rows.map((r) => ({ id: r.id, deficiency: swapRG(r.k) })) },
					{ results: rows.map((r) => ({ id: r.id, deficiency: "deuteranopia" })) },
				],
			}),
		);
	}

	// q305-4: rank UI colors by how far tritanopia moves them from themselves.
	{
		const k: Cvd = "tritanopia";
		const colors = ["#5d5fcb", "#4bbde0", "#e93a8b", "#f9bd14", "#3b5b42", "#f5814f", "#7fb21c"];
		const rows = colors.map((h) => ({ h, d: shiftBoth(h, k) }));
		const order = [...rows].sort((a, b) => b.d[0] - a.d[0]);
		for (let i = 0; i < order.length - 1; i++) {
			const a = order[i] as (typeof order)[number];
			const b = order[i + 1] as (typeof order)[number];
			assert(Math.min(...a.d) - Math.max(...b.d) >= 1.0, `q305-4 gap < 1.0 between ${a.h} and ${b.h}`);
		}
		const want = order.map((o) => o.h);
		const top = order[0] as (typeof order)[number];
		const deut = [...colors].sort((a, b) => shiftBoth(b, "deuteranopia")[0] - shiftBoth(a, "deuteranopia")[0]);
		const encShift = (h: string) => plainDE(h, simulateEncodedWrong(h, k));
		const enc = [...colors].sort((a, b) => encShift(b) - encShift(a));
		assert(deut[0] !== want[0] && enc.join() !== want.join(), "q305-4 wrong variants must change the ranking");
		tasks.push(
			task(305, 4, {
				prompt: `We are reviewing the seven accent colors of our note-taking app for people with tritanopia. Rather than comparing colors with each other, I want to know how much each color itself changes: for every accent, measure the difference between the original color and its tritanopia simulation, then rank the accents from the one that changes most to the one that changes least. Also give the size of the largest change.

${machado("tritanopia matrix")}
${DE00} ${ROUND_NOTE}

Accents: ${colors.join(", ")}

List all seven hex values, biggest change first; the change may be given to one decimal.
${contract(`{"ranking": ["#rrggbb", ...all seven], "largestChange": <number>}`)}`,
				schema: obj({ ranking: arr(HEX, colors.length), largestChange: NUM }),
				checks: [
					c("changes-most", ["ranking", 0], eqE(want[0] as string)),
					c("changes-least", ["ranking", colors.length - 1], eqE(want[colors.length - 1] as string)),
					c("full-ranking", ["ranking"], { k: "seq", v: want }),
					c("largest-change", ["largestChange"], numE(r1(top.d[0]), DE_TOL)),
				],
				derivation: {
					deficiency: k,
					shift: Object.fromEntries(order.map((o) => [o.h, r2(o.d[0])])),
					margin: "adjacent ranks at least 1.0 ΔE00 apart with and without 8-bit rounding of the simulated color",
					tolerance: `largest change ±${DE_TOL} ΔE00 (rounding moves it by < 0.5)`,
					wrong: { deuteranopia: deut, gammaEncodedMatrix: enc },
				},
				witness: { ranking: want, largestChange: r1(top.d[0]) },
				invalid: [
					{ ranking: deut, largestChange: r1(shiftBoth(deut[0] as string, "deuteranopia")[0]) },
					{ ranking: enc, largestChange: r1(encShift(enc[0] as string)) },
					{ ranking: [...want].reverse(), largestChange: r1(top.d[0]) },
				],
			}),
		);
	}

	// q305-5: per team matchup, the deficiencies under which the two colors stay apart, and the weakest one.
	{
		const T = 20;
		const pairs: [string, string, string][] = [
			["otters-vs-herons", "#2b5f9e", "#b03a6e"],
			["lynx-vs-moths", "#71b340", "#61b2a7"],
			["bees-vs-foxes", "#e3c565", "#f2a541"],
			["crows-vs-hares", "#6e9f3a", "#d9734e"],
			["owls-vs-newts", "#3f7d5a", "#a4c2e8"],
		];
		const rows = pairs.map(([id, a, b]) => {
			const both = CVDS.map((k) => cvdDeltaEBoth(a, b, k));
			both.forEach((d, i) =>
				assert(Math.max(...d) <= 0.85 * T || Math.min(...d) >= 1.15 * T, `q305-5 ${id} ${CVDS[i]} within 15% of ${T}`),
			);
			const hi = both.map((d) => Math.max(...d));
			const lo = both.map((d) => Math.min(...d));
			const w = hi.indexOf(Math.min(...hi));
			const others = lo.filter((_, i) => i !== w);
			assert(
				Math.min(...others) >= 1.15 * (hi[w] as number) && Math.min(...others) - (hi[w] as number) >= 1,
				`q305-5 ${id} weakest margin`,
			);
			const enc = CVDS.map((k) => plainDE(simulateEncodedWrong(a, k), simulateEncodedWrong(b, k)));
			return {
				id,
				de: both.map((d) => r1(d[0])),
				safe: CVDS.filter((_, i) => (both[i] as [number, number])[0] >= T),
				weakest: CVDS[w] as Cvd,
				plainSafe: plainDE(a, b) >= T ? [...CVDS] : [],
				encSafe: CVDS.filter((_, i) => (enc[i] as number) >= T),
				encWeakest: CVDS[enc.indexOf(Math.min(...enc))] as Cvd,
			};
		});
		assert(new Set(rows.map((r) => r.safe.join())).size === rows.length, "q305-5 every matchup has a different safe set");
		assert(rows.some((r) => r.safe.length === 0) && rows.some((r) => r.safe.length === 3), "q305-5 needs none and all");
		const row = (id: string, safeUnder: string[], weakest: string) => ({ id, safeUnder, weakest });
		tasks.push(
			task(305, 5, {
				prompt: `Board-game prototype: each team plays with its own colored pieces, and some matchups put two team colors next to each other on the board. For each matchup below, tell me under which of protanopia, deuteranopia and tritanopia the two team colors stay safely distinguishable, meaning their difference after both colors are simulated for that deficiency is ${T} or more. Also name the deficiency under which the pair is weakest (smallest difference).

${machado("matrix for each of protanopia, deuteranopia and tritanopia")} Both colors of a matchup go through the same matrix.
${DE00} ${ROUND_NOTE}

Matchups:
${pairs.map(([id, a, b]) => `- ${id}: ${a} and ${b}`).join("\n")}

"safeUnder" lists the deficiencies (words protanopia, deuteranopia, tritanopia; any order; empty when none) that keep the pair at ${T} or above.
${contract(`{"matchups": [{"id": "otters-vs-herons", "safeUnder": ["<deficiency>", ...], "weakest": "<deficiency>"}, ...one per matchup]}`)}`,
				schema: obj({ matchups: arr(obj({ id: STR, safeUnder: arr(CVD_ENUM), weakest: CVD_ENUM })) }),
				checks: rows.flatMap((r) => [
					c(`safe-under-${r.id}`, ["matchups", byId(r.id), "safeUnder"], setE(r.safe)),
					c(`weakest-${r.id}`, ["matchups", byId(r.id), "weakest"], oneOfE([r.weakest])),
				]),
				derivation: {
					threshold: T,
					deltaE: Object.fromEntries(rows.map((r) => [r.id, Object.fromEntries(CVDS.map((k, i) => [k, r.de[i]]))])),
					margin: "every value at least 15% from the threshold; the weakest deficiency at least 15% and 1.0 ΔE00 below the other two; with and without 8-bit rounding",
				},
				witness: { matchups: rows.map((r) => row(r.id, r.safe, r.weakest)) },
				invalid: [
					{ matchups: rows.map((r) => row(r.id, r.plainSafe, r.weakest)) },
					{ matchups: rows.map((r) => row(r.id, r.encSafe, r.encWeakest)) },
					{ matchups: rows.map((r) => row(r.id, CVDS.filter((k) => !r.safe.includes(k)), r.weakest)) },
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
const INTERP_TOL_NOTE = `±${INTERP_TOL} per 8-bit channel: output rounding plus matrix variants (Oklab: Ottosson's published matrices vs CSS Color 4's recomputed ones; Lab: D65 white quoted to 4 or 5 decimals), which move results by < 0.5/255`;

/** Asserts the stated-space result is in sRGB (so clamping vs gamut mapping is moot) and returns its hex. */
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

/** Least-squares progress of r along b → a in a space (1 = all a), plus per-component estimates. */
function mixShare(a: string, b: string, r: string, space: Space): { ls: number; per: number[] } {
	const A = toSpace(hexToRgb(a), space);
	const B = toSpace(hexToRgb(b), space);
	const R = toSpace(hexToRgb(r), space);
	const d = [0, 1, 2].map((i) => (A[i] as number) - (B[i] as number));
	const big = Math.max(...d.map(Math.abs));
	let num = 0;
	let den = 0;
	const per: number[] = [];
	d.forEach((di, i) => {
		num += ((R[i] as number) - (B[i] as number)) * di;
		den += di * di;
		if (Math.abs(di) >= 0.25 * big) per.push(((R[i] as number) - (B[i] as number)) / di);
	});
	return { ls: num / den, per };
}

function cat306(): Task[] {
	const tasks: Task[] = [];
	const hexes = (rs: Rgb[]) => rs.map(hexOf);

	// q306-1: six legend classes along the shorter Oklch hue arc.
	{
		const a = "#3b1c5a";
		const b = "#f6d743";
		const want = stops(a, b, 6, "oklch", "shorter").map((s, i) => inGamutHex(s, `q306-1 stop ${i}`));
		const oklab = hexes(stops(a, b, 6, "oklab"));
		const longer = hexes(stops(a, b, 6, "oklch", "longer"));
		const gamma = hexes(stops(a, b, 6, "srgb"));
		distinct(want, oklab, "q306-1 oklab");
		distinct(want, longer, "q306-1 longer arc");
		distinct(want, gamma, "q306-1 gamma sRGB");
		const [, , ha] = oklchOfHex(a);
		const [, , hb] = oklchOfHex(b);
		tasks.push(
			task(306, 1, {
				prompt: `Election-night heat map: turnout is shown in six classes running from aubergine ${a} (lowest) to bright straw ${b} (highest). The art director wants the in-between classes to stay saturated, so the ramp is built in Oklch rather than by blending RGB: L, C and h each move linearly, with h taking the shorter way around the hue circle. I need the six class colors, evenly spaced, both ends included.

${OKLAB} Hue rule (CSS Color 4 "shorter"): with h1 the start hue and h2 the end hue, both in [0, 360), add 360 to h1 when h2 − h1 > 180, or add 360 to h2 when h2 − h1 < −180; then interpolate and wrap the result into [0, 360). ${OUT_HEX}
${contract(`{"classes": ["#rrggbb", ...six hex strings in total, lowest turnout first]}`)}`,
				schema: obj({ classes: arr(HEX, 6) }),
				checks: want.map((h, i) => c(`class-${i + 1}`, ["classes", i], hexE(h, INTERP_TOL))),
				derivation: {
					space: "oklch shorter",
					hues: { start: r2(ha), end: r2(hb) },
					gamut: "every class is inside sRGB, so clamping vs gamut mapping does not matter",
					tolerance: INTERP_TOL_NOTE,
					wrong: { oklab, longerArc: longer, gammaSrgb: gamma },
				},
				witness: { classes: want },
				invalid: [{ classes: oklab }, { classes: longer }, { classes: gamma }],
			}),
		);
	}

	// q306-2: recover the whole-number percentage behind four flattened mixes, each made in a different space.
	{
		const P_TOL = 1;
		const mixes: { id: string; a: string; b: string; p: number; space: Space; text: string }[] = [
			{ id: "shade-berry", a: "#c8417a", b: "#000000", p: 55, space: "oklab", text: "Oklab (L, a and b mixed)" },
			{ id: "shade-amber", a: "#d6862b", b: "#000000", p: 45, space: "srgb", text: "gamma-encoded sRGB (the 0-255 channel values mixed as they are)" },
			{ id: "blush", a: "#b0303f", b: "#f7e9d7", p: 60, space: "srgb-linear", text: "linear-light sRGB (channels decoded with the sRGB curve, mixed, re-encoded)" },
			{ id: "dusk", a: "#20639b", b: "#ed553b", p: 40, space: "lab", text: "CIELAB with the D65 white (L*, a*, b* mixed)" },
		];
		const OTHER: Space[] = ["srgb", "srgb-linear", "oklab", "lab"];
		const rows = mixes.map((m) => {
			const result = inGamutHex(interpolateHex(m.a, m.b, 1 - m.p / 100, m.space), `q306-2 ${m.id}`);
			const own = mixShare(m.a, m.b, result, m.space);
			assert(Math.abs(own.ls * 100 - m.p) <= 0.5, `q306-2 ${m.id} least-squares share ${own.ls * 100}`);
			assert(own.per.every((x) => Math.abs(x * 100 - m.p) <= 0.75), `q306-2 ${m.id} per-component shares ${own.per}`);
			const wrong = Object.fromEntries(
				OTHER.filter((s) => s !== m.space).map((s) => [s, r1(mixShare(m.a, m.b, result, s).ls * 100)]),
			);
			for (const [s, v] of Object.entries(wrong)) assert(Math.abs(v - m.p) >= P_TOL + 3, `q306-2 ${m.id} ${s} reading ${v} too close`);
			return { ...m, result, wrong };
		});
		tasks.push(
			task(306, 2, {
				prompt: `Archaeology on an old token file: four colors were once defined as two-color mixes, but only the flattened hex results survived. I still have both ingredients and know which color space each mix was made in. Each mix was "P% of the first color with (100 − P)% of the second", meaning every component in that space was (P/100) × first + (1 − P/100) × second, and P was always a whole number. Recover P for each.

- shade-berry: first ${rows[0]?.a}, second ${rows[0]?.b}, made in ${rows[0]?.text}; stored result ${rows[0]?.result}.
- shade-amber: first ${rows[1]?.a}, second ${rows[1]?.b}, made in ${rows[1]?.text}; stored result ${rows[1]?.result}.
- blush: first ${rows[2]?.a}, second ${rows[2]?.b}, made in ${rows[2]?.text}; stored result ${rows[2]?.result}.
- dusk: first ${rows[3]?.a}, second ${rows[3]?.b}, made in ${rows[3]?.text}; stored result ${rows[3]?.result}.

${OKLAB} ${LAB_D65} The stored results were rounded to 8-bit hex after mixing, so expect the components to agree on P only approximately.
${contract(`{"mixes": [{"id": "shade-berry", "percentFirst": <whole number>}, ...one per mix]}`)}`,
				schema: obj({ mixes: arr(obj({ id: STR, percentFirst: INT })) }),
				checks: rows.map((r) => c(`percent-${r.id}`, ["mixes", byId(r.id), "percentFirst"], numE(r.p, P_TOL))),
				derivation: {
					tolerance: `±${P_TOL} percentage point: the 8-bit rounding of the stored result moves the least-squares estimate by ≤ 0.5 and every well-conditioned component's estimate by ≤ 0.75`,
					margin: `reading a result in any of the other three spaces moves P by at least ${P_TOL + 3}`,
					wrongSpaceReadings: Object.fromEntries(rows.map((r) => [r.id, r.wrong])),
				},
				witness: { mixes: rows.map((r) => ({ id: r.id, percentFirst: r.p })) },
				invalid: [
					{ mixes: rows.map((r) => ({ id: r.id, percentFirst: Math.round((r.wrong.srgb ?? r.wrong["srgb-linear"]) as number) })) },
					{ mixes: rows.map((r) => ({ id: r.id, percentFirst: 100 - r.p })) },
				],
			}),
		);
	}

	// q306-3: a three-stop CIELAB gradient with the middle stop at 40%, resampled at five positions.
	{
		const g = [
			{ color: "#2b2f9e", pos: 0 },
			{ color: "#e86a33", pos: 0.4 },
			{ color: "#fbf6e4", pos: 1 },
		];
		const at = [10, 25, 55, 70, 90];
		const want = at.map((p) => inGamutHex(sampleGradient(g, p / 100, "lab"), `q306-3 ${p}`));
		const mid50 = at.map((p) => hexOf(sampleGradient([g[0]!, { ...g[1]!, pos: 0.5 }, g[2]!], p / 100, "lab")));
		const oklab = at.map((p) => hexOf(sampleGradient(g, p / 100, "oklab")));
		const gamma = at.map((p) => hexOf(sampleGradient(g, p / 100, "srgb")));
		distinct(want, mid50, "q306-3 middle stop at 50");
		distinct(want, oklab, "q306-3 oklab");
		distinct(want, gamma, "q306-3 gamma sRGB");
		tasks.push(
			task(306, 3, {
				prompt: `Our sunset illustration uses a three-stop background: indigo ${g[0]?.color} at 0%, flame orange ${g[1]?.color} at 40% and ivory ${g[2]?.color} at 100%, interpolated in CIELAB. The animation team is moving to a format that only takes evenly spaced keys, so I need the actual colors at 10%, 25%, 55%, 70% and 90%. At a position p that lies between two adjacent stops placed at s0 and s1, use the progress (p − s0) / (s1 − s0) and interpolate L*, a* and b* linearly between those two stop colors.

${LAB_D65} ${OUT_HEX}
${contract(`{"keys": [{"at": 10, "hex": "#rrggbb"}, {"at": 25, "hex": "#rrggbb"}, {"at": 55, "hex": "#rrggbb"}, {"at": 70, "hex": "#rrggbb"}, {"at": 90, "hex": "#rrggbb"}]}`)}`,
				schema: obj({ keys: arr(obj({ at: NUM, hex: HEX }), at.length) }),
				checks: at.map((p, i) => c(`at-${p}`, ["keys", { by: "at", eq: p }, "hex"], hexE(want[i] as string, INTERP_TOL))),
				derivation: {
					space: "lab (D65)",
					tolerance: `${INTERP_TOL_NOTE}. The prompt names D65 and rules out the D50 Lab of CSS lab(): that variant moves the blue-to-orange segment by more than the tolerance, so it fails there (see v3-b-crosscheck.test.ts)`,
					wrong: { middleStopAt50: mid50, oklab, gammaSrgb: gamma },
				},
				witness: { keys: at.map((p, i) => ({ at: p, hex: want[i] })) },
				invalid: [
					{ keys: at.map((p, i) => ({ at: p, hex: mid50[i] })) },
					{ keys: at.map((p, i) => ({ at: p, hex: oklab[i] })) },
					{ keys: at.map((p, i) => ({ at: p, hex: gamma[i] })) },
				],
			}),
		);
	}

	// q306-4: keyframes along the longer Oklch arc between two colors ~150° apart, with their hue angles.
	{
		const HUE_TOL = 2;
		const a = "#3a8f6b";
		const b = "#a05cc0";
		const [, , ha] = oklchOfHex(a);
		const [, , hb] = oklchOfHex(b);
		const d = hb - ha;
		assert(d > 140 && d < 165, `q306-4 hue gap ${d} should be ~150° (so the longer arc is ~210°)`);
		const at = [25, 50, 75];
		const want = at.map((p) => inGamutHex(interpolateHex(a, b, p / 100, "oklch", "longer"), `q306-4 ${p}`));
		// "longer" with 0 < h2 − h1 < 180 adds 360 to h1: the hue decreases from h1 + 360 to h2.
		const hues = at.map((p) => r2(norm360(ha + 360 + (hb - ha - 360) * (p / 100))));
		const shorter = at.map((p) => hexOf(interpolateHex(a, b, p / 100, "oklch", "shorter")));
		const shorterHues = at.map((p) => r2(norm360(ha + (hb - ha) * (p / 100))));
		const hslLonger = at.map((p) => hexOf(interpolateHex(a, b, p / 100, "hsl", "longer")));
		distinct(want, shorter, "q306-4 shorter arc");
		distinct(want, hslLonger, "q306-4 HSL longer arc");
		tasks.push(
			task(306, 4, {
				prompt: `Loading spinner: its color animates from jade ${a} to orchid ${b}, and the motion designer explicitly wants it to sweep the long way around the hue circle (through the warm hues) instead of the short route. Interpolate in Oklch with the CSS Color 4 "longer" hue arc: L and C go linearly, and h goes linearly after this fix-up, where h1 is the start hue and h2 the end hue, both in [0, 360): if 0 < h2 − h1 < 180, add 360 to h1; if −180 < h2 − h1 ≤ 0, add 360 to h2. Wrap interpolated hues back into [0, 360).

${OKLAB} ${OUT_HEX}

Give the keyframes at 25%, 50% and 75% of the way (0% being ${a}), each with its interpolated Oklch hue h in degrees, and say whether h increases or decreases along this arc.
${contract(`{"direction": "<increasing|decreasing>", "keyframes": [{"at": 25, "hex": "#rrggbb", "hue": <degrees>}, {"at": 50, "hex": "#rrggbb", "hue": <degrees>}, {"at": 75, "hex": "#rrggbb", "hue": <degrees>}]}`)}`,
				schema: obj({
					direction: { type: "string", enum: ["increasing", "decreasing"] },
					keyframes: arr(obj({ at: NUM, hex: HEX, hue: NUM }), at.length),
				}),
				checks: [
					c("direction", ["direction"], eqE("decreasing")),
					...at.flatMap((p, i) => [
						c(`hex-${p}`, ["keyframes", { by: "at", eq: p }, "hex"], hexE(want[i] as string, INTERP_TOL)),
						c(`hue-${p}`, ["keyframes", { by: "at", eq: p }, "hue"], numE(hues[i] as number, HUE_TOL)),
					]),
				],
				derivation: {
					space: "oklch longer",
					hues: { start: r2(ha), end: r2(hb), difference: r2(d) },
					gamut: "all three keyframes are inside sRGB",
					tolerance: `${INTERP_TOL_NOTE}; hue ±${HUE_TOL}° (Oklab matrix variants move it by < 0.3°)`,
					wrong: { shorterArc: shorter, shorterHues, hslLonger },
				},
				witness: { direction: "decreasing", keyframes: at.map((p, i) => ({ at: p, hex: want[i], hue: hues[i] })) },
				invalid: [
					{ direction: "increasing", keyframes: at.map((p, i) => ({ at: p, hex: shorter[i], hue: shorterHues[i] })) },
					{ direction: "decreasing", keyframes: at.map((p, i) => ({ at: p, hex: hslLonger[i], hue: hues[i] })) },
				],
			}),
		);
	}

	// q306-5: a two-stop Oklab gradient with a CSS color hint at 30%.
	{
		const a = "#0b3954";
		const b = "#ffd166";
		const H = 0.3;
		const at = [15, 30, 60, 85];
		const prog = (p: number) => p ** (Math.log(0.5) / Math.log(H));
		const want = at.map((p) => inGamutHex(interpolateHex(a, b, prog(p / 100), "oklab"), `q306-5 ${p}`));
		const noHint = at.map((p) => hexOf(interpolateHex(a, b, p / 100, "oklab")));
		const inverted = at.map((p) => hexOf(interpolateHex(a, b, (p / 100) ** (Math.log(H) / Math.log(0.5)), "oklab")));
		const gamma = at.map((p) => hexOf(interpolateHex(a, b, prog(p / 100), "srgb")));
		distinct(want, noHint, "q306-5 no hint");
		distinct(want, inverted, "q306-5 inverted exponent");
		distinct(want, gamma, "q306-5 gamma sRGB");
		tasks.push(
			task(306, 5, {
				prompt: `Hero section: a left-to-right gradient from petrol ${a} at 0% to butter yellow ${b} at 100%, interpolated in Oklab, with a color hint at 30% so the transition reaches its halfway color early. CSS Images 3 defines the hint like this: for a position p (as a fraction 0-1 between the two stops) and a hint at H (also a fraction between them), the interpolation progress is p^(ln 0.5 / ln H); then L, a and b are each interpolated linearly at that progress. At p = H the progress is exactly 0.5.

${OKLAB} ${OUT_HEX}

What colors does the banner show at 15%, 30%, 60% and 85% of its width?
${contract(`{"samples": [{"at": 15, "hex": "#rrggbb"}, {"at": 30, "hex": "#rrggbb"}, {"at": 60, "hex": "#rrggbb"}, {"at": 85, "hex": "#rrggbb"}]}`)}`,
				schema: obj({ samples: arr(obj({ at: NUM, hex: HEX }), at.length) }),
				checks: at.map((p, i) => c(`at-${p}`, ["samples", { by: "at", eq: p }, "hex"], hexE(want[i] as string, INTERP_TOL))),
				derivation: {
					space: "oklab",
					hint: H,
					progress: Object.fromEntries(at.map((p) => [p, round(prog(p / 100), 4)])),
					tolerance: INTERP_TOL_NOTE,
					wrong: { noHint, invertedExponent: inverted, gammaSrgb: gamma },
				},
				witness: { samples: at.map((p, i) => ({ at: p, hex: want[i] })) },
				invalid: [
					{ samples: at.map((p, i) => ({ at: p, hex: noHint[i] })) },
					{ samples: at.map((p, i) => ({ at: p, hex: inverted[i] })) },
					{ samples: at.map((p, i) => ({ at: p, hex: gamma[i] })) },
				],
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
function hslChecks(prefix: string, path: PathSeg[], h: number, s: number, l: number, witnessHex: string): CheckSpec3[] {
	const rgb = hexToRgb(witnessHex);
	assert(Math.max(...rgb) - Math.min(...rgb) >= 0.25, `${prefix} too little chroma for a ±${HUE_TOL}° hue check`);
	return [
		c(`${prefix}-hue`, path, { k: "coord", space: "hsl", i: 0, v: r2(norm360(h)), tol: HUE_TOL }),
		c(`${prefix}-saturation`, path, { k: "coord", space: "hsl", i: 1, v: r2(s * 100), tol: HSL_S_TOL }),
		c(`${prefix}-lightness`, path, { k: "coord", space: "hsl", i: 2, v: r2(l * 100), tol: HSL_L_TOL }),
	];
}

function oklchChecks(prefix: string, path: PathSeg[], L: number, C: number, H: number): CheckSpec3[] {
	assert(C >= 0.08, `${prefix} chroma too low for a ±${HUE_TOL}° hue check`);
	return [
		c(`${prefix}-hue`, path, { k: "coord", space: "oklch", i: 2, v: r2(norm360(H)), tol: HUE_TOL }),
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

/** A hex at given Oklch coordinates that must be inside sRGB. */
function okHex(L: number, C: number, H: number, where: string): string {
	const rgb = oklchToRgb({ L, C, H: norm360(H) });
	assert(inGamut(rgb, 0), `${where} leaves sRGB`);
	return hexOf(rgb);
}

const SCHEME_LIST =
	"complementary (0°, 180°), split-complementary (0°, +150°, +210°), triadic (0°, +120°, +240°), tetradic or rectangle (0°, +60°, +180°, +240°), square (0°, +90°, +180°, +270°), analogous (0°, +30°, −30°)";

function cat307(): Task[] {
	const tasks: Task[] = [];

	// q307-1: full HSL schemes for two product lines: a rectangle and a split-complementary.
	{
		const rect = "#d98a2b";
		const split = "#2a7fb8";
		const rectOffs = [60, 180, 240];
		const splitOffs = [150, 210];
		const [rh, rs, rl] = hslOfHex(rect);
		const [sh, ss, sl] = hslOfHex(split);
		const rectHex = rectOffs.map((d) => hslRotateHex(rect, d));
		const splitHex = splitOffs.map((d) => hslRotateHex(split, d));
		const rectOk = rectOffs.map((d) => oklchRotate(rect, d).hex);
		const splitOk = splitOffs.map((d) => oklchRotate(split, d).hex);
		const failsHsl = (hex: string, want: number) => hueDist(hslOfHex(hex)[0], want) > HUE_TOL;
		assert(rectOk.filter((x, i) => failsHsl(x, rh + (rectOffs[i] as number))).length >= 2, "q307-1 Oklch rectangle must miss");
		assert(splitOk.some((x, i) => failsHsl(x, sh + (splitOffs[i] as number))), "q307-1 Oklch split must miss");
		tasks.push(
			task(307, 1, {
				prompt: `Packaging refresh for two product lines, each with its own harmony on the classic wheel.

- Spice line, base ${rect}: a rectangle (tetradic) scheme, members at +60°, +180° and +240° from the base.
- Sea-salt line, base ${split}: a split-complementary scheme, members at +150° and +210° from the base.

${HSL_WHEEL}

Give each line's new members in the order of the offsets listed (the base itself is not needed).
${contract(`{"spice": ["#rrggbb", "#rrggbb", "#rrggbb"], "seaSalt": ["#rrggbb", "#rrggbb"]}`)}`,
				schema: obj({ spice: arr(HEX, 3), seaSalt: arr(HEX, 2) }),
				checks: [
					...rectOffs.flatMap((d, i) => hslChecks(`spice-plus${d}`, ["spice", i], rh + d, rs, rl, rectHex[i] as string)),
					...splitOffs.flatMap((d, i) => hslChecks(`sea-salt-plus${d}`, ["seaSalt", i], sh + d, ss, sl, splitHex[i] as string)),
				],
				derivation: {
					wheel: "hsl",
					bases: { spice: { h: r2(rh), s: r2(rs * 100), l: r2(rl * 100) }, seaSalt: { h: r2(sh), s: r2(ss * 100), l: r2(sl * 100) } },
					tolerance: HSL_TOL_NOTE,
					wrong: { oklchWheel: { spice: rectOk, seaSalt: splitOk } },
				},
				witness: { spice: rectHex, seaSalt: splitHex },
				invalid: [
					{ spice: rectOk, seaSalt: splitOk },
					{ spice: rectOffs.map((d) => hslRotateHex(rect, -d)), seaSalt: splitHex },
					{ spice: rectHex, seaSalt: [...splitHex].reverse() },
				],
			}),
		);
	}

	// q307-2: audit a vendor's "square" palette by measuring each swatch's Oklch hue offset from the base.
	{
		const RULE = 5;
		const OFF_TOL = 1.5;
		const base = { L: 0.6, C: 0.13, H: 32 };
		const baseHex = okHex(base.L, base.C, base.H, "q307-2 base");
		const swatches: { id: string; target: number; L: number; C: number }[] = [
			{ id: "leaf", target: 89, L: 0.7, C: 0.12 },
			{ id: "lagoon", target: 190.5, L: 0.55, C: 0.1 },
			{ id: "iris", target: 279.5, L: 0.5, C: 0.14 },
		];
		const [, , bh] = oklchOfHex(baseHex);
		const rows = swatches.map((s, i) => {
			const hex = okHex(s.L, s.C, base.H + s.target, `q307-2 ${s.id}`);
			const [, C, h] = oklchOfHex(hex);
			assert(C >= 0.08, `q307-2 ${s.id} chroma`);
			const offset = norm360(h - bh);
			const ideal = 90 * (i + 1);
			const err = Math.abs(offset - ideal);
			assert(err <= 2.5 || err >= 8, `q307-2 ${s.id} offset ${offset} too near the ±${RULE}° rule`);
			const [hh] = hslOfHex(hex);
			return { id: s.id, hex, offset, off: err > RULE, hslOffset: norm360(hh - hslOfHex(baseHex)[0]) };
		});
		const offIds = rows.filter((r) => r.off).map((r) => r.id);
		assert(offIds.length >= 1 && offIds.length <= 2, "q307-2 needs some swatches on and some off");
		const hslOff = rows.filter((r, i) => Math.abs(r.hslOffset - 90 * (i + 1)) > RULE).map((r) => r.id);
		assert(rows.some((r) => Math.abs(r.hslOffset - r.offset) >= OFF_TOL + 3), "q307-2 HSL offsets must differ");
		tasks.push(
			task(307, 2, {
				prompt: `A branding vendor delivered a four-color identity and says it is a square scheme on the Oklch wheel around the base ${baseHex}: the other swatches should sit at +90°, +180° and +270° of Oklch hue from it. Lightness and chroma were varied on purpose, so judge the hue angle h only. Please measure each swatch's hue offset from the base, as (h_swatch − h_base) taken into [0, 360), and list every swatch that is more than ${RULE}° from the position it is supposed to fill (leaf → +90°, lagoon → +180°, iris → +270°).

Oklch here is Björn Ottosson's Oklab, computed from linear-light sRGB, in polar form (L, C, h in degrees).

Swatches:
${rows.map((r) => `- ${r.id}: ${r.hex}`).join("\n")}

Give offsets in degrees (one decimal is plenty).
${contract(`{"offsets": [{"id": "leaf", "offset": <degrees>}, {"id": "lagoon", "offset": <degrees>}, {"id": "iris", "offset": <degrees>}], "offScheme": ["<id>", ...]}`)}`,
				schema: obj({ offsets: arr(obj({ id: STR, offset: NUM }), 3), offScheme: arr(STR) }),
				checks: [
					...rows.map((r) => c(`offset-${r.id}`, ["offsets", byId(r.id), "offset"], numE(r1(r.offset), OFF_TOL))),
					c("off-scheme", ["offScheme"], setE(offIds)),
				],
				derivation: {
					wheel: "oklch",
					baseHue: r2(bh),
					offsets: Object.fromEntries(rows.map((r) => [r.id, r2(r.offset)])),
					margin: `swatches on the scheme are within 2.5° of their position, off ones at least 8° away (rule ${RULE}°)`,
					tolerance: `offset ±${OFF_TOL}°: inputs are exact hex values; Oklab matrix variants move h by < 0.3° at C ≥ 0.08`,
					hslWheelOffsets: Object.fromEntries(rows.map((r) => [r.id, r2(r.hslOffset)])),
				},
				witness: { offsets: rows.map((r) => ({ id: r.id, offset: r1(r.offset) })), offScheme: offIds },
				invalid: [
					{ offsets: rows.map((r) => ({ id: r.id, offset: r1(r.hslOffset) })), offScheme: hslOff },
					{ offsets: rows.map((r) => ({ id: r.id, offset: r1(360 - r.offset) })), offScheme: offIds },
					{ offsets: rows.map((r) => ({ id: r.id, offset: r1(r.offset) })), offScheme: [] },
				],
			}),
		);
	}

	// q307-3: the same swatch sets read on the HSL wheel and on the Oklch wheel (answers may differ).
	{
		const TOL = 5;
		type Reading = Scheme | "none";
		const readAs = (hues: number[]): { scheme: Reading; errs: Record<string, number> } => {
			const errs = Object.fromEntries(SCHEMES.map((s) => [s, schemeError(hues, s)]));
			const fits = SCHEMES.filter((s) => (errs[s] as number) <= TOL);
			return { scheme: fits.length === 1 ? (fits[0] as Scheme) : "none", errs };
		};
		/** The reading must be clear: a fitting scheme within 1.5°, every other same-size scheme ≥ 2.5×TOL away. */
		const clear = (r: { scheme: Reading; errs: Record<string, number> }, where: string) => {
			for (const s of SCHEMES) {
				const e = r.errs[s] as number;
				if (e === Number.POSITIVE_INFINITY) continue;
				if (s === r.scheme) assert(e <= 1.5, `q307-3 ${where} fits ${s} only at ${e}`);
				else assert(e >= 2.5 * TOL, `q307-3 ${where} too near ${s} (${r2(e)})`);
			}
		};
		// [id, wheel the set was built on, scheme, base hue, per-swatch (S, L) or (L, C)]
		const defs: [string, "hsl" | "oklch", Scheme, number, [number, number][]][] = [
			["deck-a", "hsl", "triadic", 44, [[0.7, 0.5], [0.55, 0.42], [0.6, 0.58]]],
			["deck-b", "oklch", "square", 68, [[0.66, 0.11], [0.58, 0.12], [0.7, 0.1], [0.62, 0.12]]],
			["deck-c", "hsl", "analogous", 140, [[0.6, 0.5], [0.65, 0.45], [0.55, 0.55]]],
			["deck-d", "oklch", "complementary", 264, [[0.62, 0.13], [0.68, 0.12]]],
			["deck-e", "oklch", "split-complementary", 116, [[0.62, 0.12], [0.68, 0.11], [0.58, 0.12]]],
		];
		const sets = defs.map(([id, wheel, scheme, h0, params], si) => {
			const offs = SCHEME_OFFSETS[scheme];
			const raw = offs.map((o, i) => {
				const [p, q] = params[i] as [number, number];
				return wheel === "hsl" ? hexOf(hslToRgb([norm360(h0 + o), p, q])) : okHex(p, q, h0 + o, `q307-3 ${id} ${i}`);
			});
			const hexes = shuffled(raw, 900 + si);
			assert(Math.min(...hexes.map((h) => oklchOfHex(h)[1])) >= 0.08, `q307-3 ${id} Oklch chroma too low`);
			assert(
				Math.min(
					...hexes.map((h) => {
						const x = hexToRgb(h);
						return Math.max(...x) - Math.min(...x);
					}),
				) >= 0.25,
				`q307-3 ${id} HSL chroma too low`,
			);
			const hsl = readAs(hexes.map((h) => hslOfHex(h)[0]));
			const ok = readAs(hexes.map((h) => oklchOfHex(h)[2]));
			clear(hsl, `${id} hsl`);
			clear(ok, `${id} oklch`);
			assert((wheel === "hsl" ? hsl : ok).scheme === scheme, `q307-3 ${id} does not read as ${scheme} on its own wheel`);
			return { id, hexes, hsl: hsl.scheme, oklch: ok.scheme };
		});
		assert(sets.filter((s) => s.hsl !== s.oklch).length >= 3, "q307-3 the wheels must disagree on most sets");
		assert(sets.some((s) => s.hsl === s.oklch && s.hsl !== "none"), "q307-3 one deck should read the same on both wheels");
		const SYN: Record<Reading, string[]> = {
			complementary: ["complementary"],
			"split-complementary": ["split-complementary"],
			triadic: ["triadic"],
			tetradic: ["tetradic", "rectangle", "rectangular"],
			square: ["square"],
			analogous: ["analogous"],
			none: ["none"],
		};
		const bySize = (n: number): Reading => (n === 2 ? "complementary" : n === 3 ? "triadic" : "square");
		tasks.push(
			task(307, 3, {
				prompt: `Our illustrators pick harmonies on the HSL wheel and our product designers on the Oklch wheel, and they keep arguing about whether the same deck of swatches "is" a scheme. For each deck below, tell me which scheme it forms on each wheel, judging by hue alone (saturation, lightness and chroma vary on purpose).

- HSL wheel: the hue H of CSS hsl().
- Oklch wheel: the hue h of Björn Ottosson's Oklch (Oklab from linear-light sRGB, polar form).

A deck forms a scheme on a wheel when some swatch can serve as the base so that each scheme position is taken by exactly one swatch whose hue is within ${TOL}° of it (deck size equals the number of positions). Positions relative to the base: ${SCHEME_LIST}. When no scheme fits, answer "none". Swatches are listed in no particular order.

Decks:
${sets.map((s) => `- ${s.id}: ${s.hexes.join(", ")}`).join("\n")}

Use the words complementary, split-complementary, triadic, tetradic, square, analogous or none.
${contract(`{"decks": [{"id": "deck-a", "hsl": "<scheme or none>", "oklch": "<scheme or none>"}, ...one per deck]}`)}`,
				schema: obj({ decks: arr(obj({ id: STR, hsl: STR, oklch: STR })) }),
				checks: sets.flatMap((s) => [
					c(`hsl-${s.id}`, ["decks", byId(s.id), "hsl"], oneOfE(SYN[s.hsl])),
					c(`oklch-${s.id}`, ["decks", byId(s.id), "oklch"], oneOfE(SYN[s.oklch])),
				]),
				derivation: {
					tolerance: `${TOL}° per swatch`,
					margin: `a fitting scheme fits within 1.5°; every other scheme of the same size is ≥ ${2.5 * TOL}° off on that wheel`,
					truth: Object.fromEntries(sets.map((s) => [s.id, { hsl: s.hsl, oklch: s.oklch }])),
				},
				witness: { decks: sets.map((s) => ({ id: s.id, hsl: s.hsl, oklch: s.oklch })) },
				invalid: [
					{ decks: sets.map((s) => ({ id: s.id, hsl: s.oklch, oklch: s.hsl })) },
					{ decks: sets.map((s) => ({ id: s.id, hsl: bySize(s.hexes.length), oklch: bySize(s.hexes.length) })) },
					{ decks: sets.map((s) => ({ id: s.id, hsl: s.hsl, oklch: s.hsl })) },
				],
			}),
		);
	}

	// q307-4: the +210° partner on the Oklch wheel, then on the HSL wheel, with each answer's hue.
	{
		const base = "#4e8f3a";
		const D = 210;
		const [h, s, l] = hslOfHex(base);
		const [L, C, H] = oklchOfHex(base);
		const ok = okRotate(base, D, "q307-4 oklch");
		const hsl = hslRotateHex(base, D);
		const hslHue = r2(norm360(h + D));
		const okHue = r2(norm360(H + D));
		assert(hueDist(oklchOfHex(hsl)[2], okHue) >= HUE_TOL + 5, "q307-4 HSL answer must fail the Oklch hue check");
		assert(hueDist(hslOfHex(ok.hex)[0], hslHue) >= HUE_TOL + 5, "q307-4 Oklch answer must fail the HSL hue check");
		tasks.push(
			task(307, 4, {
				prompt: `For a garden-center campaign our moss green ${base} needs the second partner of a split-complementary pair, the one at +210°. The product UI uses a perceptual wheel and the print team the classic one, so I need it twice, along with the hue angle each wheel ends up at.

1. Oklch wheel. ${OKLCH_WHEEL}
2. HSL wheel. ${HSL_WHEEL}

For each, give the hex and the resulting hue angle on that same wheel (Oklch h for the first, HSL H for the second), in degrees within [0, 360).
${contract(`{"oklch": {"hex": "#rrggbb", "hue": <degrees>}, "hsl": {"hex": "#rrggbb", "hue": <degrees>}}`)}`,
				schema: obj({ oklch: obj({ hex: HEX, hue: NUM }), hsl: obj({ hex: HEX, hue: NUM }) }),
				checks: [
					...oklchChecks("oklch", ["oklch", "hex"], L, C, ok.H),
					c("oklch-hue-value", ["oklch", "hue"], numE(okHue, HUE_TOL)),
					...hslChecks("hsl", ["hsl", "hex"], h + D, s, l, hsl),
					c("hsl-hue-value", ["hsl", "hue"], numE(hslHue, HUE_TOL)),
				],
				derivation: {
					base: { hsl: { h: r2(h), s: r2(s * 100), l: r2(l * 100) }, oklch: { L: round(L, 4), C: round(C, 4), H: r2(H) } },
					gamut: "the Oklch rotation is inside sRGB with ≥ 0.04 chroma headroom",
					tolerance: { hsl: HSL_TOL_NOTE, oklch: OK_TOL_NOTE, hueValues: `±${HUE_TOL}°` },
				},
				witness: { oklch: { hex: ok.hex, hue: okHue }, hsl: { hex: hsl, hue: hslHue } },
				invalid: [
					{ oklch: { hex: hsl, hue: hslHue }, hsl: { hex: ok.hex, hue: okHue } },
					{
						oklch: { hex: okRotate(base, 150, "q307-4 +150").hex, hue: r2(norm360(H + 150)) },
						hsl: { hex: hslRotateHex(base, 150), hue: r2(norm360(h + 150)) },
					},
				],
			}),
		);
	}

	// q307-5: complete two schemes that each lost one member (Oklch square, HSL rectangle).
	{
		const sq = { L: 0.67, C: 0.1, H: 25 };
		const sqAll = SCHEME_OFFSETS.square.map((o) => okHex(sq.L, sq.C, sq.H + o, `q307-5 square ${o}`));
		const sqMissing = 2; // +180
		const sqGiven = shuffled(
			sqAll.filter((_, i) => i !== sqMissing),
			51,
		);
		const rc = { h: 40, s: 0.55, l: 0.52 };
		const rcAll = SCHEME_OFFSETS.tetradic.map((o) => hexOf(hslToRgb([norm360(rc.h + o), rc.s, rc.l])));
		const rcMissing = 2; // +180
		const rcGiven = shuffled(
			rcAll.filter((_, i) => i !== rcMissing),
			52,
		);
		const sqWant = sqAll[sqMissing] as string;
		const rcWant = rcAll[rcMissing] as string;
		const sqH = norm360(sq.H + 180);
		const rcH = norm360(rc.h + 180);
		assert(schemeError(sqAll.map((x) => oklchOfHex(x)[2]), "square") <= 1.5, "q307-5 square reads clean");
		assert(schemeError(rcAll.map((x) => hslOfHex(x)[0]), "tetradic") <= 1.5, "q307-5 rectangle reads clean");
		// Wrong: completing the square on the HSL wheel and the rectangle on the Oklch wheel.
		const [s0h, s0s, s0l] = hslOfHex(sqAll[0] as string);
		const sqHslWrong = hexOf(hslToRgb([norm360(s0h + 180), s0s, s0l]));
		const rcOkWrong = oklchRotate(rcAll[0] as string, 180).hex;
		const rcOpp = hexOf(hslToRgb([norm360(rc.h + 120), rc.s, rc.l]));
		tasks.push(
			task(307, 5, {
				prompt: `Two tile sets from our pattern collection each lost one swatch in a file migration, and I'd like them restored.

Set "terrazzo" is a square scheme on the Oklch wheel (Björn Ottosson's Oklab from linear-light sRGB, polar L, C, h): four members 90° of hue apart, all with the same L and C. Remaining swatches: ${sqGiven.join(", ")}.

Set "majolica" is a rectangle (tetradic) scheme on the HSL wheel (hue of CSS hsl()): members at 0°, +60°, +180° and +240° from a base, all with the same S and L. Remaining swatches: ${rcGiven.join(", ")}.

For each set give the missing swatch: the hue position nobody fills, with the L and C (terrazzo) or S and L (majolica) the remaining swatches share, converted to sRGB and rounded to 8-bit hex. Swatches are listed in no particular order.
${contract(`{"terrazzo": "#rrggbb", "majolica": "#rrggbb"}`)}`,
				schema: obj({ terrazzo: HEX, majolica: HEX }),
				checks: [
					...oklchChecks("terrazzo", ["terrazzo"], sq.L, sq.C, sqH),
					...hslChecks("majolica", ["majolica"], rcH, rc.s, rc.l, rcWant),
				],
				derivation: {
					terrazzo: { wheel: "oklch", L: sq.L, C: sq.C, hues: SCHEME_OFFSETS.square.map((o) => norm360(sq.H + o)), missingHue: sqH },
					majolica: { wheel: "hsl", s: rc.s, l: rc.l, hues: SCHEME_OFFSETS.tetradic.map((o) => norm360(rc.h + o)), missingHue: rcH },
					uniqueness: "three members of a square or of a +60/+180/+240 rectangle fix the fourth uniquely (the rectangle is symmetric under a 180° turn)",
					tolerance: { hsl: HSL_TOL_NOTE, oklch: OK_TOL_NOTE },
				},
				witness: { terrazzo: sqWant, majolica: rcWant },
				invalid: [
					{ terrazzo: sqHslWrong, majolica: rcOkWrong },
					{ terrazzo: sqWant, majolica: rcOpp },
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

	// q308-1: every CSS keyword within a CIEDE2000 radius of three paint chips, plus the closest one.
	{
		const T = 8;
		const chips = ["#de86d7", "#ff766b", "#722d92"];
		const rows = chips.map((hex) => {
			const d = rankNamed(hex, "ciede2000");
			for (const x of d) assert(x.d <= 0.9 * T || x.d >= 1.1 * T, `q308-1 ${hex} ${x.names[0]} within 10% of ${T}`);
			assert((d[1]?.d as number) >= 1.1 * (d[0]?.d as number), `q308-1 ${hex} closest margin < 10%`);
			const inside = d.filter((x) => x.d < T);
			assert(inside.length >= 2 && inside.length <= 4, `q308-1 ${hex} has ${inside.length} keywords inside`);
			const e = rankNamed(hex, "srgb-euclid");
			const next = d[inside.length] as (typeof d)[number];
			return {
				hex,
				inside,
				closest: d[0]?.names as string[],
				next,
				euclidClosest: e[0]?.names as string[],
				euclidInside: e.slice(0, inside.length).map((x) => x.names[0] as string),
			};
		});
		assert(rows.some((r) => !r.euclidClosest.includes(r.closest[0] as string)), "q308-1 the RGB-distance reading must differ somewhere");
		tasks.push(
			task(308, 1, {
				kind: "neutral-keyword-checks",
				prompt: `A paint-swatch app suggests CSS color keywords as nicknames. For each chip below, I want every keyword (from the 148 named colors of CSS Color 4) whose CIEDE2000 difference from the chip is below ${T}, plus the single closest keyword. Use CIEDE2000 with kL = kC = kH = 1 on CIELAB. ${LAB_D65}

Keywords that share a value (gray and grey, for example) count as one color; naming either spelling is enough, and listing both is fine.

Chips: ${chips.join(", ")}
${contract(`{"chips": [{"id": "${chips[0]}", "within": ["<keyword>", ...], "closest": "<keyword>"}, ...one per chip, id = the chip hex]}`)}`,
				schema: obj({ chips: arr(obj({ id: STR, within: arr(STR), closest: STR })) }),
				checks: rows.flatMap((r) => [
					...r.inside.map((x) => c(`within-${r.hex}-${x.names[0]}`, ["chips", byId(r.hex), "within"], { k: "kwHas", value: x.value })),
					c(`only-${r.hex}`, ["chips", byId(r.hex), "within"], { k: "kwOnly", values: r.inside.map((x) => x.value) }),
					c(`closest-${r.hex}`, ["chips", byId(r.hex), "closest"], oneOfE(r.closest)),
				]),
				derivation: {
					threshold: T,
					margin: "every keyword's ΔE00 is at least 10% away from the threshold, and the closest is at least 10% ahead of the runner-up",
					rows: rows.map((r) => ({
						hex: r.hex,
						within: Object.fromEntries(r.inside.map((x) => [x.names.join("/"), r2(x.d)])),
						nextOutside: { [r.next.names.join("/")]: r2(r.next.d) },
						euclidClosest: r.euclidClosest,
					})),
				},
				witness: { chips: rows.map((r) => ({ id: r.hex, within: r.inside.map((x) => x.names[0]), closest: r.closest[0] })) },
				invalid: [
					{ chips: rows.map((r) => ({ id: r.hex, within: r.euclidInside, closest: r.euclidClosest[0] })) },
					{ chips: rows.map((r) => ({ id: r.hex, within: [...r.inside.map((x) => x.names[0]), r.next.names[0]], closest: r.closest[0] })) },
					{ chips: rows.map((r) => ({ id: r.hex, within: r.inside.slice(0, 1).map((x) => x.names[0]), closest: r.closest[0] })) },
				],
			}),
		);
	}

	// q308-2: keyword hex values and their WCAG relative luminance, ordered dark to light.
	{
		const names = ["lightseagreen", "rebeccapurple", "darkkhaki", "steelblue", "dimgrey", "palevioletred", "lightsteelblue"];
		const LUM_TOL = 0.003;
		const rows = names.map((n) => {
			const hex = CSS_NAMED[n] as string;
			assert(namesFor(hex).includes(n), `q308-2 ${n}`);
			return { n, hex, lum: relativeLuminance(hexToRgb(hex)) };
		});
		const order = [...rows].sort((a, b) => a.lum - b.lum);
		for (let i = 0; i < order.length - 1; i++)
			assert((order[i + 1]?.lum as number) >= 1.1 * (order[i]?.lum as number), `q308-2 luminance gap < 10% at ${order[i]?.n}`);
		const hslOrder = [...rows].sort((a, b) => hslOfHex(a.hex)[2] - hslOfHex(b.hex)[2]).map((r) => r.n);
		assert(hslOrder.join() !== order.map((r) => r.n).join(), "q308-2 HSL-lightness order must differ");
		const x11: Record<string, string> = { ...Object.fromEntries(rows.map((r) => [r.n, r.hex])), rebeccapurple: "#800080", dimgrey: "#808080" };
		tasks.push(
			task(308, 2, {
				prompt: `I'm converting an old stylesheet's keyword colors into design tokens, and the tokens are sorted from darkest to lightest by WCAG relative luminance. For each keyword, give its hex value from the CSS Color 4 named-color table (not some other color-name list) and its relative luminance (three decimals), then the keywords in order from lowest to highest luminance.

Relative luminance (WCAG 2): Y = 0.2126 R + 0.7152 G + 0.0722 B, with each 0-1 channel first linearized by the sRGB curve (v / 12.92 when v ≤ 0.04045, otherwise ((v + 0.055) / 1.055)^2.4).

Keywords: ${names.join(", ")}
${contract(`{"keywords": [{"id": "${names[0]}", "hex": "#rrggbb", "luminance": <number>}, ...one per keyword], "darkToLight": ["<keyword>", ...all seven]}`)}`,
				schema: obj({ keywords: arr(obj({ id: STR, hex: HEX, luminance: NUM })), darkToLight: arr(STR, names.length) }),
				checks: [
					...rows.flatMap((r) => [
						c(`hex-${r.n}`, ["keywords", byId(r.n), "hex"], hexE(r.hex, 0)),
						c(`luminance-${r.n}`, ["keywords", byId(r.n), "luminance"], numE(r3(r.lum), LUM_TOL)),
					]),
					c("dark-to-light", ["darkToLight"], { k: "seq", v: order.map((r) => r.n) }),
				],
				derivation: {
					source: "CSS Color 4 named colors",
					luminance: Object.fromEntries(order.map((r) => [r.n, round(r.lum, 4)])),
					margin: "each keyword at least 10% brighter (in Y) than the previous one",
					tolerance: `luminance ±${LUM_TOL}: three-decimal rounding, and the 0.03928 vs 0.04045 curve threshold changes nothing at these values`,
					wrong: { hslLightnessOrder: hslOrder },
				},
				witness: {
					keywords: rows.map((r) => ({ id: r.n, hex: r.hex, luminance: r3(r.lum) })),
					darkToLight: order.map((r) => r.n),
				},
				invalid: [
					{
						keywords: rows.map((r) => ({ id: r.n, hex: x11[r.n], luminance: r3(relativeLuminance(hexToRgb(x11[r.n] as string))) })),
						darkToLight: order.map((r) => r.n),
					},
					{ keywords: rows.map((r) => ({ id: r.n, hex: r.hex, luminance: r3(r.lum) })), darkToLight: hslOrder },
				],
			}),
		);
	}

	// q308-3: along a teal tint ramp, where black or white text wins under WCAG 2 and under APCA.
	{
		const ramp = [0.9, 0.82, 0.76, 0.66, 0.62, 0.5, 0.44].map((L, i) => okHex(L, 0.07, 205, `q308-3 step ${i + 1}`));
		const rows = ramp.map((bg, i) => {
			const wb = wcag("#000000", bg);
			const ww = wcag("#ffffff", bg);
			const lb = apcaLc("#000000", bg);
			const lw = apcaLc("#ffffff", bg);
			assert(Math.max(wb, ww) / Math.min(wb, ww) >= 1.15, `q308-3 step ${i + 1} WCAG too close`);
			assert(Math.abs(Math.abs(lb) - Math.abs(lw)) >= 5, `q308-3 step ${i + 1} APCA too close`);
			return { step: i + 1, bg, wcag: wb > ww ? "black" : "white", apca: Math.abs(lb) > Math.abs(lw) ? "black" : "white" };
		});
		const flip = (k: "wcag" | "apca") => rows.findIndex((r) => r[k] === "white") + 1;
		const fw = flip("wcag");
		const fa = flip("apca");
		assert(fw > 1 && fa > 1 && fw !== fa, "q308-3 the two rules must flip at different steps");
		for (const k of ["wcag", "apca"] as const)
			assert(rows.every((r) => (r.step < flip(k)) === (r[k] === "black")), `q308-3 ${k} picks must be monotone`);
		const picks = (k: "wcag" | "apca") => rows.map((r) => r[k]);
		tasks.push(
			task(308, 3, {
				prompt: `Our tag component comes in a seven-step teal ramp, from the palest tint (step 1) to the deepest (step 7), and the label on a tag is either pure black (#000000) or pure white (#ffffff). Two candidate rules for picking the label color:

- WCAG rule: whichever of black and white has the higher contrast ratio against the tag. ${WCAG}
- APCA rule: whichever of black and white has the larger |Lc|, with the label as text and the tag as background. ${APCA}

Ramp: ${rows.map((r) => `step ${r.step} ${r.bg}`).join(", ")}

For each rule give the label color for steps 1 to 7 in order, and the first step at which that rule switches to white.
${contract(`{"wcag": {"labels": ["black", ...seven entries], "firstWhiteStep": <step number>}, "apca": {"labels": ["black", ...seven entries], "firstWhiteStep": <step number>}}`)}`,
				schema: obj({
					wcag: obj({ labels: arr(BW_ENUM, 7), firstWhiteStep: INT }),
					apca: obj({ labels: arr(BW_ENUM, 7), firstWhiteStep: INT }),
				}),
				checks: (["wcag", "apca"] as const).flatMap((k) => [
					...rows.map((r, i) => c(`${k}-step-${r.step}`, [k, "labels", i], eqE(r[k]))),
					c(`${k}-first-white`, [k, "firstWhiteStep"], eqE(flip(k))),
				]),
				derivation: {
					margin: "at every step the WCAG winner beats the loser by ≥ 15% in ratio, and the APCA winner by ≥ 5 Lc",
					flips: { wcag: fw, apca: fa },
					rows,
				},
				witness: { wcag: { labels: picks("wcag"), firstWhiteStep: fw }, apca: { labels: picks("apca"), firstWhiteStep: fa } },
				invalid: [
					{ wcag: { labels: picks("wcag"), firstWhiteStep: fw }, apca: { labels: picks("wcag"), firstWhiteStep: fw } },
					{ wcag: { labels: picks("apca"), firstWhiteStep: fa }, apca: { labels: picks("apca"), firstWhiteStep: fa } },
				],
			}),
		);
	}

	// q308-4: non-text contrast (WCAG 1.4.11, 3:1): which UI parts fail, ranked worst first.
	{
		const T = 3;
		const pairs: [string, string, string][] = [
			["toggle-track", "#97a3b0", "#f3f5f7"],
			["divider-dark", "#454b57", "#1a1d23"],
			["icon-dark", "#7f8899", "#1a1d23"],
			["badge-outline", "#e48a45", "#fff7ef"],
			["focus-ring", "#3d7be0", "#ffffff"],
			["check-mark", "#2e9a5a", "#ffffff"],
			["chip-border", "#a08cd0", "#faf8ff"],
			["slider-thumb", "#5a68bd", "#e8eaf6"],
		];
		const rows = pairs.map(([id, fg, bg]) => {
			const ratio = wcag(fg, bg);
			assert(ratio <= 0.95 * T || ratio >= 1.05 * T, `q308-4 ${id} too close to ${T} (${ratio})`);
			return { id, fg, bg, ratio };
		});
		const failing = rows.filter((r) => r.ratio < T).sort((a, b) => a.ratio - b.ratio);
		assert(failing.length >= 3 && failing.length <= rows.length - 3, "q308-4 needs passes and failures");
		for (let i = 0; i < failing.length - 1; i++)
			assert((failing[i + 1]?.ratio as number) - (failing[i]?.ratio as number) >= 0.1, "q308-4 failing ratios too close to rank");
		const want = failing.map((r) => r.id);
		const at45 = rows
			.filter((r) => r.ratio < 4.5)
			.sort((a, b) => a.ratio - b.ratio)
			.map((r) => r.id);
		assert(at45.length > want.length, "q308-4 the 4.5:1 reading must flag more parts");
		tasks.push(
			task(308, 4, {
				prompt: `Accessibility pass on our form controls. Under WCAG 2 success criterion 1.4.11 (non-text contrast), the visual parts needed to identify a control or its state must reach a contrast ratio of at least ${T}:1 against the adjacent color. Which of the parts below fall short? Rank the failing ones from the lowest ratio (worst) upward.

${WCAG}

Parts (part color on adjacent background):
${pairs.map(([id, fg, bg]) => `- ${id}: ${fg} on ${bg}`).join("\n")}

List only the failing part ids, worst first (an empty list if everything passes).
${contract(`{"failing": ["<part id>", ...worst first]}`)}`,
				schema: obj({ failing: arr(STR) }),
				checks: [
					...rows.map((r) => c(`${r.ratio < T ? "fails" : "passes"}-${r.id}`, ["failing"], { k: "has", v: r.id, want: r.ratio < T })),
					c("worst", ["failing", 0], eqE(want[0] as string)),
					c("ranking", ["failing"], { k: "seq", v: want }),
				],
				derivation: {
					threshold: T,
					ratios: Object.fromEntries(rows.map((r) => [r.id, r2(r.ratio)])),
					margin: "every ratio at least 5% away from 3:1; consecutive failing ratios at least 0.1 apart",
					wrong: { textThreshold45: at45 },
				},
				witness: { failing: want },
				invalid: [{ failing: at45 }, { failing: [...want].reverse() }, { failing: want.slice(1) }],
			}),
		);
	}

	// q308-5: naming a palette by nearest keyword (8-bit RGB distance) and finding name collisions.
	{
		const palette: [string, string][] = [
			["sky", "#5a8bbd"],
			["harbor", "#4f7fae"],
			["brick", "#c86464"],
			["clay", "#d2706a"],
			["mustard", "#e2b04a"],
			["ochre", "#c2a35a"],
			["fern", "#3c7a4b"],
		];
		const rows = palette.map(([id, hex]) => {
			const e = rankNamed(hex, "srgb-euclid");
			assert((e[1]?.d as number) >= 1.1 * (e[0]?.d as number), `q308-5 ${id} margin < 10%`);
			const de = rankNamed(hex, "ciede2000");
			return { id, hex, names: e[0]?.names as string[], value: e[0]?.value as string, deNames: de[0]?.names as string[], deValue: de[0]?.value as string };
		});
		const pairsOf = (key: "value" | "deValue") => {
			const out: [string, string][] = [];
			for (let i = 0; i < rows.length; i++)
				for (let j = i + 1; j < rows.length; j++) if (rows[i]?.[key] === rows[j]?.[key]) out.push([rows[i]?.id as string, rows[j]?.id as string]);
			return out;
		};
		const clash = pairsOf("value");
		const deClash = pairsOf("deValue");
		assert(clash.length >= 2, "q308-5 needs at least two collisions");
		assert(clash.map((p) => p.join()).join() !== deClash.map((p) => p.join()).join(), "q308-5 CIEDE2000 reading must collide differently");
		const all: [string, string][] = [];
		for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) all.push([rows[i]?.id as string, rows[j]?.id as string]);
		const isClash = (p: [string, string]) => clash.some((q) => q[0] === p[0] && q[1] === p[1]);
		tasks.push(
			task(308, 5, {
				kind: "neutral-keyword-checks",
				prompt: `Our palette export labels every swatch with the nearest CSS color keyword (one of the 148 named colors of CSS Color 4), and the screen-reader text reads those labels out, so two swatches with the same label are a problem. "Nearest" here means the smallest straight-line distance between the 8-bit R, G, B values (each 0-255). When several keywords share the winning value, any of them may be used, and swatches whose nearest value is the same keyword value count as colliding even if different spellings were picked.

Swatches:
${palette.map(([id, hex]) => `- ${id}: ${hex}`).join("\n")}

Give each swatch's keyword, then every pair of swatch ids that collide (each pair once, either order; an empty list if none).
${contract(`{"labels": [{"id": "sky", "keyword": "<keyword>"}, ...one per swatch], "collisions": [["<id>", "<id>"], ...]}`)}`,
				schema: obj({ labels: arr(obj({ id: STR, keyword: STR })), collisions: arr(arr(STR, 2)) }),
				checks: [
					...rows.map((r) => c(`keyword-${r.id}`, ["labels", byId(r.id), "keyword"], oneOfE(r.names))),
					...all.map((p) => c(`${isClash(p) ? "collide" : "apart"}-${p[0]}-${p[1]}`, ["collisions"], { k: "pair", v: p, want: isClash(p) })),
				],
				derivation: {
					metric: "Euclidean distance on 8-bit sRGB",
					margin: "for every swatch the runner-up keyword value is at least 10% farther than the winner",
					names: Object.fromEntries(rows.map((r) => [r.id, r.names])),
					wrong: { ciede2000Names: Object.fromEntries(rows.map((r) => [r.id, r.deNames[0]])), ciede2000Collisions: deClash },
				},
				witness: { labels: rows.map((r) => ({ id: r.id, keyword: r.names[0] })), collisions: clash },
				invalid: [
					{ labels: rows.map((r) => ({ id: r.id, keyword: r.deNames[0] })), collisions: deClash },
					{ labels: rows.map((r) => ({ id: r.id, keyword: r.names[0] })), collisions: clash.slice(1) },
				],
			}),
		);
	}

	return tasks;
}

/** Neutral suite v3, author B: categories 305-308, five tasks each. */
export function neutral3B(): Task[] {
	return [...cat305(), ...cat306(), ...cat307(), ...cat308()];
}
