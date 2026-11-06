import { clamp01, type Rgb } from "./color.js";
import { deltaE2000 } from "./distance.js";

export type Cvd =
	| "protanopia"
	| "deuteranopia"
	| "tritanopia"
	| "achromatopsia";
export const CVD_TYPES: Cvd[] = [
	"protanopia",
	"deuteranopia",
	"tritanopia",
	"achromatopsia",
];

type M = [
	[number, number, number],
	[number, number, number],
	[number, number, number],
];

// Machado, Oliveira & Fernandes (2009), severity 1.0, applied in linear sRGB.
const MATRICES: Record<Exclude<Cvd, "achromatopsia">, M> = {
	protanopia: [
		[0.152286, 1.052583, -0.204868],
		[0.114503, 0.786281, 0.099216],
		[-0.003882, -0.048116, 1.051998],
	],
	deuteranopia: [
		[0.367322, 0.860646, -0.227968],
		[0.280085, 0.672501, 0.047413],
		[-0.01182, 0.04294, 0.968881],
	],
	tritanopia: [
		[1.255528, -0.076749, -0.178779],
		[-0.078411, 0.930809, 0.147602],
		[0.004733, 0.691367, 0.3039],
	],
};

const toLinear = (v: number): number => {
	const a = Math.abs(v);
	return a <= 0.04045 ? v / 12.92 : Math.sign(v) * ((a + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (v: number): number =>
	v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;

export function simulate(rgb: Rgb, type: Cvd): Rgb {
	const lin: Rgb = [
		toLinear(clamp01(rgb[0])),
		toLinear(clamp01(rgb[1])),
		toLinear(clamp01(rgb[2])),
	];
	if (type === "achromatopsia") {
		const y = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
		const g = fromLinear(y);
		return [g, g, g];
	}
	const m = MATRICES[type];
	const out = m.map((row) =>
		clamp01(row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]),
	) as Rgb;
	return [fromLinear(out[0]), fromLinear(out[1]), fromLinear(out[2])];
}

export function minSeparation(
	colors: Rgb[],
	type: Cvd | null,
): { min: number; pair: [number, number] } {
	let min = Number.POSITIVE_INFINITY;
	let pair: [number, number] = [0, 0];
	const sim = type ? colors.map((c) => simulate(c, type)) : colors;
	for (let i = 0; i < sim.length; i++) {
		for (let j = i + 1; j < sim.length; j++) {
			const d = deltaE2000(sim[i] as Rgb, sim[j] as Rgb);
			if (d < min) {
				min = d;
				pair = [i, j];
			}
		}
	}
	return { min, pair };
}
