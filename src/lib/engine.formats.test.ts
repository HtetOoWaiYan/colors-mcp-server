import { describe, expect, it } from "vitest";
import { convertColor, parseColor } from "./engine.js";

describe("Engine Color Formats", () => {
	const validFormats = [
		// Hex
		{ input: "#f00", name: "Short Hex" },
		{ input: "#ff0000", name: "Full Hex" },
		{ input: "#f00f", name: "Short Hex with Alpha" },
		{ input: "#ff0000ff", name: "Full Hex with Alpha" },

		// RGB
		{ input: "rgb(255, 0, 0)", name: "RGB Integer Legacy" },
		{ input: "rgb(255 0 0)", name: "RGB Integer Modern" },
		{ input: "rgb(100%, 0%, 0%)", name: "RGB Percentage Legacy" },
		{ input: "rgba(255, 0, 0, 0.5)", name: "RGBA Legacy" },
		{ input: "rgb(255 0 0 / 0.5)", name: "RGB Modern with Alpha" },

		// HSL
		{ input: "hsl(0, 100%, 50%)", name: "HSL Legacy" },
		{ input: "hsl(0 100% 50%)", name: "HSL Modern" },
		{ input: "hsla(0, 100%, 50%, 0.5)", name: "HSLA Legacy" },
		{ input: "hsl(0 100% 50% / 0.5)", name: "HSL Modern with Alpha" },

		// Modern Spaces
		{ input: "oklch(0.6 0.2 30)", name: "OKLCH" },
		{ input: "oklab(0.6 0.2 0.1)", name: "OKLAB" },
		{ input: "lab(50 20 30)", name: "LAB" },
		{ input: "lch(50 30 20)", name: "LCH" },

		// Named
		{ input: "red", name: "Named Red" },
		{ input: "rebeccapurple", name: "Named Rebeccapurple" },
		{ input: "transparent", name: "Transparent" },
	];

	validFormats.forEach(({ input, name }) => {
		it(`should parse ${name}: "${input}"`, () => {
			const result = parseColor(input);
			expect(result).toBeDefined();
			// Basic sanity check: converting to hex should work (except for transparent/alpha heavy ones which might look weird in hex but shouldn't throw)
			if (input !== "transparent") {
				expect(convertColor(input, "hex")).toMatch(/^#[0-9a-f]{6,8}$/i);
			}
		});
	});

	it("should handle case insensitivity", () => {
		expect(parseColor("RED")).toBeDefined();
		expect(parseColor("RgB(255, 0, 0)")).toBeDefined();
		expect(parseColor("#FF0000")).toBeDefined();
	});

	it("should preserve alpha in conversion", () => {
		const result = convertColor("rgba(255, 0, 0, 0.5)", "rgb");
		// @ts-expect-error - we know it returns an object here
		expect(result.alpha).toBe(0.5);
	});

	it("should handle extra whitespace", () => {
		expect(parseColor("rgb(  255 ,  0,0  )")).toBeDefined();
		expect(parseColor("  #ff0000  ")).toBeDefined();
		expect(parseColor("\n rgb(255, 0, 0) \t")).toBeDefined();
	});
});
