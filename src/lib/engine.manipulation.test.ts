import {
	type Oklch,
	converter,
	differenceEuclidean,
	wcagContrast,
} from "culori";
import { describe, expect, it } from "vitest";
import {
	adjustColor,
	calculateDifference,
	createScale,
	mixColors,
} from "./engine.js";

describe("Engine Manipulation", () => {
	const toOklch = converter("oklch");

	describe("adjustColor", () => {
		it("should adjust lightness absolutely", () => {
			// Black (l=0) + 0.5 = 0.5
			const result = adjustColor("black", "lightness", 0.5) as Oklch;
			expect(result.l).toBeCloseTo(0.5);
		});

		it("should adjust lightness relatively", () => {
			// Gray (l=0.5) * 1.5 = 0.75
			// Note: We use explicit oklch to ensure starting L value
			const startColor = "oklch(0.5 0 0)";
			const result = adjustColor(startColor, "lightness", 0.5, true) as Oklch;
			expect(result.l).toBeCloseTo(0.75);
		});

		it("should adjust chroma absolutely", () => {
			const result = adjustColor("gray", "chroma", 0.1) as Oklch;
			expect(result.c).toBeCloseTo(0.1);
		});

		it("should adjust hue absolutely", () => {
			// oklch hue is 0-360
			const result = adjustColor("oklch(0.5 0.2 0)", "hue", 180) as Oklch;
			expect(result.h).toBeCloseTo(180);
		});
	});

	describe("mixColors", () => {
		it("should mix black and white to gray", () => {
			const result = mixColors("black", "white", 0.5);
			const lch = toOklch(result);
			expect(lch.l).toBeGreaterThan(0.4);
			expect(lch.l).toBeLessThan(0.6);
		});

		it("should return start color at ratio 0", () => {
			const result = mixColors("red", "blue", 0);
			const diff = differenceEuclidean("rgb")("red", result);
			expect(diff).toBeCloseTo(0);
		});

		it("should return end color at ratio 1", () => {
			const result = mixColors("red", "blue", 1);
			const diff = differenceEuclidean("rgb")("blue", result);
			expect(diff).toBeCloseTo(0);
		});
	});

	describe("createScale", () => {
		it("should return correct number of steps", () => {
			const scale = createScale(["black", "white"], 5);
			expect(scale).toHaveLength(5);
		});

		it("should interpolate start and end colors", () => {
			const scale = createScale(["black", "white"], 3);
			const start = toOklch(scale[0]);
			const end = toOklch(scale[2]);

			expect(start.l).toBeCloseTo(0); // black
			expect(end.l).toBeCloseTo(1); // white
		});

		it("should handle multiple color stops", () => {
			const scale = createScale(["red", "green", "blue"], 5);
			expect(scale).toHaveLength(5);
		});
	});

	describe("calculateDifference", () => {
		it("should calculate max contrast for black/white", () => {
			const contrast = calculateDifference("black", "white", "contrast");
			expect(contrast).toBe(21);
		});

		it("should calculate min contrast for same color", () => {
			const contrast = calculateDifference("red", "red", "contrast");
			expect(contrast).toBe(1);
		});

		it("should calculate zero DeltaE for same color", () => {
			const diff = calculateDifference("blue", "blue", "deltaE");
			expect(diff).toBeCloseTo(0);
		});

		it("should calculate non-zero DeltaE for different colors", () => {
			const diff = calculateDifference("black", "white", "deltaE");
			expect(diff).toBeGreaterThan(0);
		});
	});
});
