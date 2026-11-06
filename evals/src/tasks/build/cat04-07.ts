import {
	deltaE2000,
	hexDeltaE2000,
	hexToRgb,
	type Oklch,
	okDistance,
	rgbToHex,
	rgbToLab,
	rgbToOklab,
} from "../../reference/color.js";
import { enumerateBest, hueConstraintApplies } from "../../reference/fix.js";
import type { Task } from "../types.js";
import {
	contract,
	HEX_SCHEMA,
	hexOfOklch,
	makeTask,
	mapped,
	mulberry32,
	objectSchema,
	oklchOf,
	resultsSchema,
	round,
} from "./common.js";

export interface FixSeed {
	fg: string;
	bg: string;
	target: number;
	label: string;
}

/** Cache of the (slow) exhaustive search so a rebuild with unchanged inputs is instant. */
export function fixParams(
	s: FixSeed,
	cache: Record<string, { dStar: number; witness: string }>,
) {
	const key = `${s.fg}|${s.bg}|${s.target}`;
	const found = cache[key] ?? enumerateBest(s.fg, s.bg, s.target);
	cache[key] = found;
	return {
		fg: s.fg,
		bg: s.bg,
		target: s.target,
		dStar: found.dStar,
		hueConstrained: hueConstraintApplies(s.fg),
		witnessHex: found.witness,
	};
}

export const FIX_SEEDS: FixSeed[] = [
	{ fg: "#7a9bd1", bg: "#ffffff", target: 4.5, label: "link text" },
	{ fg: "#f2a65a", bg: "#ffffff", target: 4.5, label: "warning label" },
	{
		fg: "#4b5563",
		bg: "#111827",
		target: 4.5,
		label: "caption on a dark panel",
	},
	{ fg: "#e11d48", bg: "#fef2f2", target: 7, label: "error message" },
];

export function fixPrompt(s: FixSeed): string {
	return `The ${s.label} uses text color ${s.fg} on background ${s.bg} and must reach a WCAG 2 contrast ratio of at least ${s.target}:1. Return a replacement text color as an opaque 8-bit sRGB hex. Change only the text color (not the background), keep its hue as close as possible, and keep it as visually close to the original as you can. ${contract('{"hex": "#rrggbb"}')}`;
}

export function cat4(
	cache: Record<string, { dStar: number; witness: string }>,
): Task[] {
	return FIX_SEEDS.map((s, i) => {
		const p = fixParams(s, cache);
		return makeTask({
			category: 4,
			n: i + 1,
			prompt: fixPrompt(s),
			schema: objectSchema({ hex: HEX_SCHEMA }),
			grader: {
				kind: "fix",
				params: {
					fg: p.fg,
					bg: p.bg,
					target: p.target,
					dStar: p.dStar,
					hueConstrained: p.hueConstrained,
				},
			},
			witness: { hex: p.witnessHex },
			// original color fails the contrast target; a lighter/darker unrelated color fails minimal_change
			invalid: [
				{},
				{ hex: s.fg },
				{ hex: s.target >= 7 ? "#000000" : "#000000" },
			],
			toolUseful: true,
		});
	});
}

interface Op {
	desc: string;
	apply: (c: Oklch) => Oklch;
}
const dL = (d: number): Op => ({
	desc: `${d < 0 ? "lower" : "raise"} OKLCH lightness by ${Math.abs(d)}, keeping chroma and hue`,
	apply: (c) => ({ ...c, L: c.L + d }),
});
const setL = (l: number): Op => ({
	desc: `set OKLCH lightness to ${l}, keeping chroma and hue`,
	apply: (c) => ({ ...c, L: l }),
});
const rotH = (d: number): Op => ({
	desc: `rotate the OKLCH hue by ${d > 0 ? "+" : ""}${d} degrees, keeping lightness and chroma`,
	apply: (c) => ({ ...c, H: (c.H + d + 360) % 360 }),
});
const mulC = (m: number): Op => ({
	desc: `multiply the OKLCH chroma by ${m}, keeping lightness and hue`,
	apply: (c) => ({ ...c, C: c.C * m }),
});
const compose = (...ops: Op[]): Op => ({
	desc: ops.map((o) => o.desc).join(", then "),
	apply: (c) => ops.reduce((acc, o) => o.apply(acc), c),
});

function adjustTask(n: number, items: { hex: string; op: Op }[]) {
	const gi = items.map((it) => ({
		expectedHex: mapped(it.op.apply(oklchOf(it.hex))).hex,
	}));
	const lines = items
		.map((it, i) => `${i + 1}. ${it.hex}: ${it.op.desc}`)
		.join("\n");
	return makeTask({
		category: 5,
		n,
		prompt: `Apply the stated operation to each color. If the result is outside the sRGB gamut, reduce chroma only (keep lightness and hue) until it fits. Return opaque sRGB hex.\n\n${lines}\n\n${contract('{"results": [{"hex": "#rrggbb"}, ... one per color, in order]}')}`,
		schema: resultsSchema({ type: "object" }),
		grader: { kind: "adjust", params: { items: gi } },
		witness: { results: gi.map((g) => ({ hex: g.expectedHex })) },
		toolUseful: true,
	});
}

export function cat5(): Task[] {
	return [
		adjustTask(1, [
			{ hex: "#3b82f6", op: dL(-0.1) },
			{ hex: "#f97316", op: dL(0.08) },
		]),
		adjustTask(2, [
			{ hex: "#16a34a", op: rotH(40) },
			{ hex: "#9333ea", op: rotH(-30) },
		]),
		adjustTask(3, [
			{ hex: "#e11d48", op: mulC(0.6) },
			{ hex: "#0ea5e9", op: mulC(1.3) },
		]),
		adjustTask(4, [
			{ hex: "#7c3aed", op: setL(0.85) },
			{ hex: "#84cc16", op: compose(dL(-0.15), rotH(20)) },
		]),
	];
}

export function gradientReference(
	from: string,
	to: string,
	n: number,
): { hexes: string[]; labs: [number, number, number][] } {
	const a = oklchOf(from);
	const b = oklchOf(to);
	let dh = b.H - a.H;
	if (dh > 180) dh -= 360;
	if (dh < -180) dh += 360;
	const hexes: string[] = [];
	const labs: [number, number, number][] = [];
	for (let i = 0; i < n; i++) {
		const t = i / (n - 1);
		const m = mapped({
			L: a.L + (b.L - a.L) * t,
			C: a.C + (b.C - a.C) * t,
			H: (a.H + dh * t + 360) % 360,
		});
		hexes.push(m.hex);
		labs.push([...rgbToOklab(m.rgb)] as [number, number, number]);
	}
	return { hexes, labs };
}

function gradientTask(n: number, from: string, to: string, stops: number) {
	const ref = gradientReference(from, to, stops);
	return makeTask({
		category: 6,
		n,
		prompt: `Create a smooth ${stops}-stop gradient from ${from} to ${to} that interpolates in OKLCH (lightness, chroma and hue each interpolated linearly, hue along the shorter arc), so that the midpoints do not turn gray or muddy. Include both endpoints as the first and last stop. Stops must be opaque sRGB hex (reduce chroma only if a stop falls outside the sRGB gamut).\n\n${contract(`{"stops": [${stops} hex strings, first to last]}`)}`,
		schema: objectSchema({ stops: { type: "array", items: HEX_SCHEMA } }),
		grader: { kind: "gradient", params: { n: stops, ref: ref.labs } },
		witness: { stops: ref.hexes },
		// reversed order, and (when the hues are far apart) the classic muddy sRGB interpolation
		invalid: [
			{},
			{ stops: [...ref.hexes].reverse() },
			...(Math.abs(oklchOf(from).H - oklchOf(to).H) > 90
				? [
						{
							stops: Array.from({ length: stops }, (_, i) => {
								const t = i / (stops - 1);
								const x = hexToRgb(from);
								const y = hexToRgb(to);
								return rgbToHex([
									x[0] + (y[0] - x[0]) * t,
									x[1] + (y[1] - x[1]) * t,
									x[2] + (y[2] - x[2]) * t,
								]);
							}),
						},
					]
				: []),
		],
		toolUseful: true,
	});
}

export function cat6(): Task[] {
	return [
		gradientTask(1, "#2563eb", "#f97316", 5),
		gradientTask(2, "#dc2626", "#16a34a", 7),
		gradientTask(3, "#7c3aed", "#06b6d4", 6),
		gradientTask(4, "#f43f5e", "#facc15", 5),
	];
}

function randHex(rnd: () => number): string {
	return hexOfOklch(0.3 + rnd() * 0.55, 0.03 + rnd() * 0.17, rnd() * 360);
}

const de = (a: string, b: string) =>
	deltaE2000(rgbToLab(hexToRgb(a)), rgbToLab(hexToRgb(b)));
const okd = (a: string, b: string) =>
	okDistance(rgbToOklab(hexToRgb(a)), rgbToOklab(hexToRgb(b)));

// Gaps of at least 1 dE keep the nearest candidate unambiguous.
export function pickNearest(
	seed: number,
	count: number,
	metricSensitive: boolean,
) {
	const rnd = mulberry32(seed);
	for (let attempt = 0; attempt < 20000; attempt++) {
		const ref = randHex(rnd);
		const near = (cand: string) => de(ref, cand) < 25;
		const cands: string[] = [];
		while (cands.length < count) {
			const c = randHex(rnd);
			if (near(c) && !cands.includes(c) && c !== ref) cands.push(c);
			if (rnd() < 0.05 && cands.length === 0) break;
		}
		if (cands.length < count) continue;
		const byDe = [...cands].sort((a, b) => de(ref, a) - de(ref, b));
		const gaps = byDe
			.slice(1)
			.map((c, i) => de(ref, c) - de(ref, byDe[i] as string));
		if (gaps.some((g) => g < 1)) continue;
		const byOk = [...cands].sort((a, b) => okd(ref, a) - okd(ref, b));
		const sameOrder = byOk.every((c, i) => c === byDe[i]);
		if (sameOrder === metricSensitive) continue;
		return { ref, cands, order: byDe };
	}
	throw new Error(`no nearest-match set found for seed ${seed}`);
}

function nearestTask(
	n: number,
	seed: number,
	count: number,
	sensitive: boolean,
) {
	const { ref, cands, order } = pickNearest(seed, count, sensitive);
	const shuffled = [...cands].sort(() => 0).reverse();
	return makeTask({
		category: 7,
		n,
		prompt: `Using the CIEDE2000 color difference (computed from CIELAB with a D65 white point, standard kL = kC = kH = 1), find which candidate is closest to the reference ${ref} and order all candidates from closest to farthest.\n\nCandidates: ${shuffled.join(", ")}\n\n${contract('{"nearest": "#rrggbb", "order": ["#rrggbb", ... all candidates, closest first]}')}`,
		schema: objectSchema({
			nearest: HEX_SCHEMA,
			order: { type: "array", items: HEX_SCHEMA },
		}),
		grader: { kind: "nearest", params: { order } },
		witness: { nearest: order[0], order },
		invalid: [
			{},
			{ nearest: order[order.length - 1], order: [...order].reverse() },
		],
		toolUseful: true,
	});
}

export function cat7(): Task[] {
	return [
		nearestTask(1, 101, 5, false),
		nearestTask(2, 202, 6, false),
		nearestTask(3, 303, 5, false),
		nearestTask(4, 404, 5, true), // metric-sensitive: Oklab-Euclid order differs from CIEDE2000
	];
}

export { round };
