import { chk, get, isHexStr, normHex, rgbOf } from "../graders/helpers.js";
import {
	contrastRatio,
	deutanDeltaE,
	type Oklch,
	rgbToOklch,
} from "../reference/color.js";
import { gradientMinContrast } from "../reference-fresh/gradient.js";
import type { HueBand } from "../graders-gen/tasks.js";
import { inHueBand } from "../reference-gen/hue.js";
import type { Check } from "../tasks/types.js";

const lchOf = (hex: unknown): Oklch => rgbToOklch(rgbOf(hex));
const arrayOf = (v: unknown, n: number): unknown[] => {
	if (!Array.isArray(v) || v.length !== n) throw new Error("bad array");
	return v;
};

// ---- 206 diverging scale with any odd step count and a light or dark middle ----
export interface DivergingNParams {
	n: number;
	/** light: the middle is the lightest step and ends are dark; dark: the reverse, for dark-mode maps. */
	middle: "light" | "dark";
	/** Lower bound on the middle's lightness for a light middle, upper bound for a dark one. */
	centerL: number;
	centerCMax: number;
	symTol: number;
	minStep: number;
	/** Upper bound on the ends' lightness for a light middle, lower bound for a dark one. */
	endL: number;
	sideCMin: number;
	endCMin: number;
	hueA: HueBand;
	hueB: HueBand;
	deutanMin: number;
}

export function gradeDivergingN(answer: unknown, p: DivergingNParams): Check[] {
	const steps = get(answer, "steps");
	const m = (p.n - 1) / 2;
	const lch = () => arrayOf(steps, p.n).map(lchOf);
	const at = (i: number) => lch()[i] as Oklch;
	const left = Array.from({ length: m }, (_, i) => i);
	const right = left.map((i) => p.n - 1 - i);
	const light = p.middle === "light";
	// Positive when step b is lighter than step a for a light middle, darker for a dark one.
	const toward = (a: number, b: number) =>
		light ? at(b).L - at(a).L : at(a).L - at(b).L;
	const side = (idx: number[], band: HueBand) => () =>
		idx.every(
			(i) => at(i).C >= p.sideCMin && inHueBand(at(i).H, band.min, band.max),
		);
	const endOk = (i: number) => (light ? at(i).L <= p.endL : at(i).L >= p.endL);
	return [
		chk("count", () => Array.isArray(steps) && steps.length === p.n),
		chk("valid_hex", () => arrayOf(steps, p.n).every(isHexStr)),
		chk("center_neutral", () => {
			const c = at(m);
			return (light ? c.L >= p.centerL : c.L <= p.centerL) && c.C <= p.centerCMax;
		}),
		chk("symmetric_lightness", () =>
			left.every((i) => Math.abs(at(i).L - at(p.n - 1 - i).L) <= p.symTol),
		),
		chk("monotonic_lightness", () =>
			left.every(
				(i) =>
					toward(i, i + 1) >= p.minStep &&
					toward(p.n - 1 - i, p.n - 2 - i) >= p.minStep,
			),
		),
		chk("end_lightness", () => endOk(0) && endOk(p.n - 1)),
		chk("side_a_hue", side(left, p.hueA)),
		chk("side_b_hue", side(right, p.hueB)),
		chk("end_chroma", () => at(0).C >= p.endCMin && at(p.n - 1).C >= p.endCMin),
		chk("deutan_endpoints", () => {
			const s = arrayOf(steps, p.n);
			return deutanDeltaE(normHex(s[0]), normHex(s[p.n - 1])) >= p.deutanMin;
		}),
	];
}

// ---- 208 text color over a CSS gradient ----
export interface GradientTextParams {
	stops: string[];
	target: number;
	hue: HueBand;
	cMin: number;
	lMin?: number;
	lMax?: number;
	/** Solid surfaces the same text also sits on, such as the fallback background. */
	also: { name: string; against: string; min: number }[];
}

export function gradeGradientText(
	answer: unknown,
	p: GradientTextParams,
): Check[] {
	const hex = get(answer, "hex");
	const out = [
		chk("valid_hex", () => isHexStr(hex)),
		chk("hue_band", () => inHueBand(lchOf(hex).H, p.hue.min, p.hue.max)),
		chk("chroma_min", () => lchOf(hex).C >= p.cMin),
	];
	if (p.lMin !== undefined) {
		const lMin = p.lMin;
		out.push(chk("lightness_min", () => lchOf(hex).L >= lMin));
	}
	if (p.lMax !== undefined) {
		const lMax = p.lMax;
		out.push(chk("lightness_max", () => lchOf(hex).L <= lMax));
	}
	out.push(
		chk(
			"contrast_gradient",
			() => gradientMinContrast(normHex(hex), p.stops) >= p.target,
		),
	);
	for (const c of p.also)
		out.push(
			chk(
				`contrast_${c.name}`,
				() => contrastRatio(normHex(hex), c.against) >= c.min,
			),
		);
	return out;
}
