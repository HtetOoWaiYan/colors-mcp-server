import { mulberry32 } from "./tasks/build/common.js";

export interface Interval {
	mean: number;
	lo: number;
	hi: number;
	n: number;
}

export const mean = (xs: number[]): number =>
	xs.length === 0 ? Number.NaN : xs.reduce((a, b) => a + b, 0) / xs.length;

// Resamples whole tasks (trials already averaged in), since trials of one task are not independent.
export function bootstrapMean(
	taskDiffs: number[],
	seed = 20260611,
	resamples = 10_000,
): Interval {
	const n = taskDiffs.length;
	if (n === 0)
		return { mean: Number.NaN, lo: Number.NaN, hi: Number.NaN, n: 0 };
	const rnd = mulberry32(seed);
	const means: number[] = new Array(resamples);
	for (let r = 0; r < resamples; r++) {
		let sum = 0;
		for (let i = 0; i < n; i++)
			sum += taskDiffs[Math.floor(rnd() * n)] as number;
		means[r] = sum / n;
	}
	means.sort((a, b) => a - b);
	return {
		mean: mean(taskDiffs),
		lo: means[Math.floor(0.025 * resamples)] as number,
		hi: means[Math.floor(0.975 * resamples)] as number,
		n,
	};
}
