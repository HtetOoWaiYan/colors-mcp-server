import { gamutMap, type Rgb, rgbToOklch } from "./color.js";

const TOP = 0.97;
const BOTTOM = 0.2;

export function stepNames(n: number): string[] {
	if (n === 11)
		return [
			"50",
			"100",
			"200",
			"300",
			"400",
			"500",
			"600",
			"700",
			"800",
			"900",
			"950",
		];
	if (n === 10)
		return [
			"50",
			"100",
			"200",
			"300",
			"400",
			"500",
			"600",
			"700",
			"800",
			"900",
		];
	return Array.from({ length: n }, (_, i) => String((i + 1) * 100));
}

export interface Ramp {
	steps: Rgb[];
	seedIndex: number;
}

// Chroma follows the seed and is cut only where the sRGB gamut forces it (very light and very dark ends).
export function buildRamp(seed: Rgb, n = 11): Ramp {
	const s = rgbToOklch(seed);
	const k = Math.min(
		n - 2,
		Math.max(1, Math.round(((n - 1) * (TOP - s.l)) / (TOP - BOTTOM))),
	);
	const steps: Rgb[] = [];
	for (let i = 0; i < n; i++) {
		if (i === k) {
			steps.push(seed);
			continue;
		}
		const l =
			i < k
				? TOP - ((TOP - s.l) * i) / k
				: s.l - ((s.l - BOTTOM) * (i - k)) / (n - 1 - k);
		steps.push(gamutMap({ l, c: s.c, h: s.h }).rgb);
	}
	return { steps, seedIndex: k };
}
