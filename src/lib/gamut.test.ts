import { describe, expect, it } from "vitest";
import { parseColor } from "./engine.js";
import { isInGamut } from "./gamut.js";

describe("gamut", () => {
	describe("isInGamut", () => {
		it("should return true for sRGB colors", () => {
			expect(isInGamut(parseColor("#ff0000"))).toBe(true);
			expect(isInGamut(parseColor("rgb(255, 255, 255)"))).toBe(true);
			expect(isInGamut(parseColor("black"))).toBe(true);
		});

		it("should return false for out-of-gamut oklch colors", () => {
			// Very high chroma OKLCH color that is outside sRGB
			const outOfGamut = parseColor("oklch(0.6 0.4 29)");
			expect(isInGamut(outOfGamut)).toBe(false);
		});

		it("should return true for in-gamut oklch colors", () => {
			const inGamut = parseColor("oklch(0.6 0.1 20)");
			expect(isInGamut(inGamut)).toBe(true);
		});
	});
});
