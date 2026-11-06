import { describe, expect, it } from "vitest";
import { bootstrapMean, mean } from "./stats.js";

describe("bootstrapMean", () => {
	it("is deterministic for a seed", () => {
		const xs = [0.5, 0, 1, -0.5, 0.5, 0, 0.5, 1];
		expect(bootstrapMean(xs, 1, 2000)).toEqual(bootstrapMean(xs, 1, 2000));
	});
	it("brackets the mean and is degenerate for constant data", () => {
		const b = bootstrapMean([0.2, 0.2, 0.2, 0.2], 3, 1000);
		expect(b.lo).toBeCloseTo(0.2, 9);
		expect(b.hi).toBeCloseTo(0.2, 9);
		const c = bootstrapMean([1, 0, 1, 0, 1, 1, 0, 1], 5, 2000);
		expect(c.lo).toBeLessThanOrEqual(c.mean);
		expect(c.hi).toBeGreaterThanOrEqual(c.mean);
	});
	it("excludes zero for a consistently positive difference", () => {
		expect(
			bootstrapMean(
				Array(20)
					.fill(0.3)
					.map((v, i) => v + (i % 2) * 0.1),
				7,
			).lo,
		).toBeGreaterThan(0);
	});
	it("handles empty input", () => {
		expect(bootstrapMean([]).n).toBe(0);
		expect(mean([])).toBeNaN();
	});
});
