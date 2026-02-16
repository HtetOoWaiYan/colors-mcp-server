import { describe, expect, it } from "vitest";
import { checkContrast } from "./engine.js";

describe("checkContrast", () => {
	it("returns maximum contrast for black on white", () => {
		const result = checkContrast("#000000", "#ffffff");
		expect(result.ratio).toBe(21);
		expect(result.aa.regular).toBe(true);
		expect(result.aa.large).toBe(true);
		expect(result.aaa.regular).toBe(true);
		expect(result.aaa.large).toBe(true);
		expect(result.nonText).toBe(true);
	});

	it("returns minimum contrast for white on white", () => {
		const result = checkContrast("#ffffff", "#ffffff");
		expect(result.ratio).toBe(1);
		expect(result.aa.regular).toBe(false);
		expect(result.aa.large).toBe(false);
		expect(result.aaa.regular).toBe(false);
		expect(result.aaa.large).toBe(false);
		expect(result.nonText).toBe(false);
	});

	it("passes AA but fails AAA for a mid-contrast pair", () => {
		// #767676 on white has a ratio of ~4.54:1
		const result = checkContrast("#767676", "#ffffff");
		expect(result.ratio).toBeGreaterThanOrEqual(4.5);
		expect(result.ratio).toBeLessThan(7);
		expect(result.aa.regular).toBe(true);
		expect(result.aa.large).toBe(true);
		expect(result.aaa.regular).toBe(false);
		expect(result.aaa.large).toBe(true);
		expect(result.nonText).toBe(true);
	});

	it("fails AA regular but passes AA large for a low-contrast pair", () => {
		// #909090 on white has a ratio of ~3.19:1
		const result = checkContrast("#909090", "#ffffff");
		expect(result.ratio).toBeGreaterThanOrEqual(3);
		expect(result.ratio).toBeLessThan(4.5);
		expect(result.aa.regular).toBe(false);
		expect(result.aa.large).toBe(true);
		expect(result.aaa.regular).toBe(false);
		expect(result.aaa.large).toBe(false);
		expect(result.nonText).toBe(true);
	});

	it("handles named colors", () => {
		const result = checkContrast("black", "white");
		expect(result.ratio).toBe(21);
	});

	it("alpha-blends 50% transparent black on white (~4:1)", () => {
		const result = checkContrast("rgba(0,0,0,0.5)", "#ffffff");
		// 50% black on white ≈ #808080
		// Independently verified contrast: 3.9767:1
		expect(result.ratio).toBeGreaterThanOrEqual(3.9);
		expect(result.ratio).toBeLessThanOrEqual(4.2);
		expect(result.aa.regular).toBe(false); // < 4.5
		expect(result.aa.large).toBe(true); // >= 3
	});

	it("treats fully opaque foreground normally (alpha=1)", () => {
		const result = checkContrast("rgba(0,0,0,1)", "#ffffff");
		expect(result.ratio).toBe(21);
	});

	it("treats fully transparent foreground as same as background (alpha=0)", () => {
		const result = checkContrast("rgba(0,0,0,0)", "#ffffff");
		expect(result.ratio).toBe(1);
	});

	it("blends transparent background over default white base", () => {
		// 50% black background on white base = #808080
		// White foreground on #808080 background
		const result = checkContrast("#ffffff", "rgba(0,0,0,0.5)");
		expect(result.ratio).toBeGreaterThanOrEqual(3.9);
		expect(result.ratio).toBeLessThanOrEqual(4.2);
	});

	it("blends transparent background over custom base", () => {
		// 50% white background on black base = #808080 (Medium Gray)
		// Black foreground on #808080 background
		// Independently verified contrast: 5.2808:1
		const result = checkContrast("#000000", "rgba(255,255,255,0.5)", "#000000");
		expect(result.ratio).toBeGreaterThanOrEqual(5.2);
		expect(result.ratio).toBeLessThanOrEqual(5.4);
	});

	it("blends correctly when BOTH foreground and background have alpha", () => {
		// Base: Green (#00ff00)
		// BG: 50% Black (rgba(0,0,0,0.5)) over Green -> Dark Green (#008000)
		// FG: 50% White (rgba(255,255,255,0.5)) over Effective BG (#008000) -> Light Greenish Gray (~#80bf80)
		// Contrast #80bf80 vs #008000
		// Independently verified contrast: 2.3866:1

		const result = checkContrast(
			"rgba(255,255,255,0.5)",
			"rgba(0,0,0,0.5)",
			"#00ff00",
		);
		expect(result.ratio).toBeGreaterThan(2.3);
		expect(result.ratio).toBeLessThan(2.5);
	});
});
