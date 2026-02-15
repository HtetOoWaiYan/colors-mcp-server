import { describe, expect, it } from "vitest";
import {
	handleAdjust,
	handleDifference,
	handleMix,
	handleScale,
} from "./manipulation.js";

describe("Manipulation Tools", () => {
	describe("handleAdjust", () => {
		it("should increase lightness", async () => {
			const result = await handleAdjust({
				color: "black",
				mode: "lightness",
				amount: 0.5,
				relative: false,
			});
			// black l=0, +0.5 -> l=0.5
			expect(result.structuredContent.raw.l).toBeCloseTo(0.5);
		});

		it("should adjust hue relatively", async () => {
			const result = await handleAdjust({
				color: "oklch(0.5 0.2 100)",
				mode: "hue",
				amount: 0.1, // +10%
				relative: true,
			});
			// 100 * 1.1 = 110
			expect(result.structuredContent.raw.h).toBeCloseTo(110);
		});
	});

	describe("handleMix", () => {
		it("should mix black and white", async () => {
			const result = await handleMix({
				color1: "black",
				color2: "white",
				ratio: 0.5,
				mode: "oklch",
			});
			// mid-gray roughly l=0.5 (depending on interpolation mode)
			expect(result.structuredContent.raw.l).toBeGreaterThan(0.4);
			expect(result.structuredContent.raw.l).toBeLessThan(0.6);
		});
	});

	describe("handleScale", () => {
		it("should generate a scale of 5 colors", async () => {
			const result = await handleScale({
				colors: ["black", "white"],
				steps: 5,
				mode: "oklch",
			});
			expect(result.structuredContent.output).toHaveLength(5);
			expect(result.structuredContent.output[0]).toBe("#000000");
			expect(result.structuredContent.output[4]).toBe("#ffffff");
		});
	});

	describe("handleDifference", () => {
		it("should calculate contrast ratio", async () => {
			const result = await handleDifference({
				color1: "black",
				color2: "white",
				metric: "contrast",
			});
			expect(result.structuredContent.value).toBe(21);
		});

		it("should calculate deltaE", async () => {
			const result = await handleDifference({
				color1: "red",
				color2: "red",
				metric: "deltaE",
			});
			expect(result.structuredContent.value).toBeCloseTo(0);
		});
	});
});
