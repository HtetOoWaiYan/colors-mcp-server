import Color from "colorjs.io";
import { describe, expect, it } from "vitest";
import { type Rgb, rgbToHex, rgbToP3 } from "./color.js";
import { NAMED, parseCss } from "./css.js";

describe("parseCss", () => {
	it("parses the supported forms", () => {
		expect(rgbToHex(parseCss("#F80")?.rgb as Rgb)).toBe("#ff8800");
		expect(rgbToHex(parseCss("rgb(12, 34, 56)")?.rgb as Rgb)).toBe("#0c2238");
		expect(rgbToHex(parseCss("rgb(12 34 56 / 50%)")?.rgb as Rgb)).toBe(
			"#0c2238",
		);
		expect(parseCss("rgb(12 34 56 / 50%)")?.alpha).toBeCloseTo(0.5, 9);
		expect(rgbToHex(parseCss("rgb(0%, 100%, 20%)")?.rgb as Rgb)).toBe(
			"#00ff33",
		);
		expect(rgbToHex(parseCss("TOMATO")?.rgb as Rgb)).toBe("#ff6347");
		expect(parseCss("#00ff0080")?.alpha).toBeCloseTo(128 / 255, 6);
	});
	it("rejects unsupported or malformed input", () => {
		for (const bad of [
			"#12345",
			"#ggg",
			"rgb(10, 20)",
			"bluish",
			"hsl(120, 50%, 50%",
			"color(display-p3 1 0 0)",
			"rgba(1,2,3,4,5)",
			"",
		]) {
			expect(parseCss(bad), bad).toBeNull();
		}
	});
	it("agrees with colorjs on hsl and named colors", () => {
		for (const s of [
			"hsl(210, 50%, 40%)",
			"hsl(0, 0%, 100%)",
			"hsl(360, 100%, 50%)",
			"hsl(120, 100%, 25%)",
		]) {
			const mine = rgbToHex(parseCss(s)?.rgb as Rgb);
			const ref = new Color(s)
				.to("srgb")
				.toString({ format: "hex", collapse: false });
			expect(mine, s).toBe(ref.toLowerCase());
		}
		for (const [name, hex] of Object.entries(NAMED)) {
			expect(
				new Color(name)
					.to("srgb")
					.toString({ format: "hex", collapse: false })
					.toLowerCase(),
				name,
			).toBe(hex);
		}
	});
});

describe("Display P3", () => {
	it("matches colorjs", () => {
		for (const hex of ["#ff8000", "#1e90ff", "#336699", "#ff0000"]) {
			const rgb = parseCss(hex)?.rgb as Rgb;
			const mine = rgbToP3(rgb);
			const ref = new Color("srgb", [...rgb]).to("p3").coords as number[];
			for (let i = 0; i < 3; i++)
				expect(Math.abs((ref[i] as number) - (mine[i] as number))).toBeLessThan(
					1e-3,
				);
		}
	});
});
