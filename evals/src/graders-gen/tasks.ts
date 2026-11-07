import { chk, get, isHexStr, isNum, normHex, rgbOf } from "../graders/helpers.js";
import {
	contrastRatio,
	deutanDeltaE,
	hueDiff,
	type Oklch,
	rgbToOklab,
	rgbToOklch,
} from "../reference/color.js";
import {
	channelMatches,
	hexToRgb8,
	scrimContrast,
} from "../reference-gen/composite.js";
import { inHueBand } from "../reference-gen/hue.js";
import type { Check } from "../tasks/types.js";

const lchOf = (hex: unknown): Oklch => rgbToOklch(rgbOf(hex));
const arrayOf = (v: unknown, n: number): unknown[] => {
	if (!Array.isArray(v) || v.length !== n) throw new Error("bad array");
	return v;
};

export interface HueBand {
	min: number;
	max: number;
}

// ---- 101 constrained pick and 103 dual surface ----
export interface PickParams {
	hue: HueBand;
	cMin: number;
	lMin?: number;
	lMax?: number;
	contrasts: { name: string; against: string; min: number }[];
}
export function gradePick(answer: unknown, p: PickParams): Check[] {
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
	for (const c of p.contrasts)
		out.push(
			chk(
				`contrast_${c.name}`,
				() => contrastRatio(normHex(hex), c.against) >= c.min,
			),
		);
	return out;
}

// ---- 102 scrim ----
export interface ScrimParams {
	text: string;
	scrim: string;
	regions: string[];
	target: number;
	step: number;
	alphaStar: number;
}
export function gradeScrim(answer: unknown, p: ScrimParams): Check[] {
	const a = get(answer, "opacity");
	const ok = () => isNum(a) && a >= 0 && a <= 1;
	return [
		chk("valid_opacity", ok),
		chk("on_step_grid", () => {
			const k = (a as number) / p.step;
			return ok() && Math.abs(k - Math.round(k)) < 1e-6;
		}),
		chk(
			"reaches_target",
			() =>
				ok() &&
				p.regions.every(
					(r) => scrimContrast(p.text, p.scrim, a as number, r) >= p.target,
				),
		),
		chk(
			"not_wasteful",
			() => ok() && (a as number) <= p.alphaStar + p.step + 1e-9,
		),
	];
}

// ---- 104 composite and mix ----
export interface MixParams {
	items: { expected: [number, number, number] }[];
}
export function gradeMix(answer: unknown, p: MixParams): Check[] {
	return p.items.map((item, i) =>
		chk(`item${i}`, () => {
			const got = hexToRgb8(normHex(get(answer, "results", i, "hex")));
			return got.every((v, k) => channelMatches(v, item.expected[k] as number));
		}),
	);
}

// ---- 105 grayscale-safe set ----
export interface GrayscaleParams {
	n: number;
	background: string;
	minContrast: number;
	lGap: number;
	cMin: number;
	hueGap: number;
}
export function gradeGrayscale(answer: unknown, p: GrayscaleParams): Check[] {
	const colors = get(answer, "colors");
	const hexes = () => arrayOf(colors, p.n).map(normHex);
	const pairs = <T>(xs: T[], f: (a: T, b: T) => boolean) =>
		xs.every((a, i) => xs.every((b, j) => j <= i || f(a, b)));
	return [
		chk("count", () => Array.isArray(colors) && colors.length === p.n),
		chk("valid_hex", () => arrayOf(colors, p.n).every(isHexStr)),
		chk("contrast", () =>
			hexes().every((h) => contrastRatio(h, p.background) >= p.minContrast),
		),
		chk("lightness_gap", () =>
			pairs(
				hexes().map((h) => rgbToOklab(rgbOf(h))[0]),
				(a, b) => Math.abs(a - b) >= p.lGap,
			),
		),
		chk("chroma", () => hexes().every((h) => lchOf(h).C >= p.cMin)),
		chk("hue_separation", () =>
			pairs(
				hexes().map((h) => lchOf(h).H),
				(a, b) => hueDiff(a, b) >= p.hueGap,
			),
		),
	];
}

// ---- 106 diverging scale ----
export interface DivergingParams {
	hueA: HueBand;
	hueB: HueBand;
	centerLMin: number;
	centerCMax: number;
	symTol: number;
	minStep: number;
	endLMax: number;
	sideCMin: number;
	endCMin: number;
	deutanMin: number;
}
export function gradeDiverging(answer: unknown, p: DivergingParams): Check[] {
	const steps = get(answer, "steps");
	const lch = () => arrayOf(steps, 7).map(lchOf);
	const at = (i: number) => lch()[i] as Oklch;
	const side = (idx: number[], band: HueBand) => () =>
		idx.every(
			(i) => at(i).C >= p.sideCMin && inHueBand(at(i).H, band.min, band.max),
		);
	return [
		chk("count", () => Array.isArray(steps) && steps.length === 7),
		chk("valid_hex", () => arrayOf(steps, 7).every(isHexStr)),
		chk(
			"center_neutral",
			() => at(3).L >= p.centerLMin && at(3).C <= p.centerCMax,
		),
		chk("symmetric_lightness", () =>
			[0, 1, 2].every((i) => Math.abs(at(i).L - at(6 - i).L) <= p.symTol),
		),
		chk("monotonic_lightness", () =>
			[1, 2, 3].every(
				(i) =>
					at(i).L - at(i - 1).L >= p.minStep &&
					at(6 - i).L - at(7 - i).L >= p.minStep,
			),
		),
		chk("end_depth", () => at(0).L <= p.endLMax && at(6).L <= p.endLMax),
		chk("side_a_hue", side([0, 1, 2], p.hueA)),
		chk("side_b_hue", side([4, 5, 6], p.hueB)),
		chk("end_chroma", () => at(0).C >= p.endCMin && at(6).C >= p.endCMin),
		chk("deutan_endpoints", () => {
			const s = arrayOf(steps, 7);
			return deutanDeltaE(normHex(s[0]), normHex(s[6])) >= p.deutanMin;
		}),
	];
}

// ---- 107 video Y'CbCr ----
export type YcbcrItem =
	| { kind: "encode"; expected: [number, number, number] }
	| { kind: "decode"; expected: [number, number, number] }
	| { kind: "legal"; legal: boolean; expected: [number, number, number] };
export function gradeYcbcr(
	answer: unknown,
	p: { items: YcbcrItem[] },
): Check[] {
	return p.items.map((item, i) =>
		chk(`item${i}`, () => {
			const r = get(answer, "results", i);
			if (item.kind === "encode")
				return ["y", "cb", "cr"].every((k, j) =>
					channelMatches(get(r, k), item.expected[j] as number),
				);
			if (item.kind === "legal" && get(r, "legal") !== item.legal) return false;
			const got = hexToRgb8(normHex(get(r, "hex")));
			return got.every((v, k) => channelMatches(v, item.expected[k] as number));
		}),
	);
}
