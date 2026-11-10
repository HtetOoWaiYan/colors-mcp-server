import Color from "colorjs.io";
import { describe, expect, it } from "vitest";
import { hexToRgb } from "../reference/color.js";
import { hslRotateHex, oklchRotate, SCHEME_OFFSETS, SCHEMES, schemeError } from "./b-harmony.js";
import { hueDist, oklchOfHex } from "./b-spaces.js";

const BASES = ["#2a9d8f", "#e76f51", "#3a86ff", "#8338ec", "#fb5607", "#06a77d", "#c9184a"];

describe("published vectors (CSS hsl() wheel)", () => {
	// CSS Color 4 named colors: red, lime, blue, aqua sit at HSL hues 0, 120, 240, 180.
	it("rotating red gives the named primaries and its complement", () => {
		expect(hslRotateHex("#ff0000", 180)).toBe("#00ffff");
		expect(hslRotateHex("#ff0000", 120)).toBe("#00ff00");
		expect(hslRotateHex("#ff0000", 240)).toBe("#0000ff");
		expect(hslRotateHex("#663399", 180)).toBe("#669933");
	});
});

describe("scheme identification", () => {
	it("an exact scheme scores 0 for itself, and any member may be the base", () => {
		for (const s of SCHEMES) {
			const hues = SCHEME_OFFSETS[s].map((o) => (37 + o) % 360);
			expect(schemeError(hues, s)).toBeCloseTo(0, 9);
			expect(schemeError([...hues].reverse(), s)).toBeCloseTo(0, 9);
		}
	});
	it("different schemes of the same size are at least 30 degrees apart", () => {
		for (const s of SCHEMES)
			for (const t of SCHEMES) {
				if (s === t) continue;
				const hues = SCHEME_OFFSETS[s].map((o) => (37 + o) % 360);
				expect(schemeError(hues, t)).toBeGreaterThanOrEqual(30);
			}
	});
});

describe("cross-check against colorjs.io", () => {
	it("HSL rotation agrees to the 8-bit hex", () => {
		for (const b of BASES)
			for (const d of [30, 120, 150, 180, 210, 240, 330]) {
				const c = new Color(b).to("hsl");
				c.coords[0] = ((c.coords[0] as number) + d) % 360;
				const hex = c.to("srgb").toString({ format: "hex", collapse: false });
				const mine = hexToRgb(hslRotateHex(b, d));
				const theirs = hexToRgb(hex);
				for (let i = 0; i < 3; i++) expect(Math.abs(mine[i]! - theirs[i]!) * 255).toBeLessThanOrEqual(1 + 1e-9);
			}
	});

	it("Oklch rotation agrees with colorjs.io wherever the rotated color stays in sRGB", () => {
		let worstCh = 0;
		let n = 0;
		for (const b of BASES)
			for (const d of [30, 60, 90, 120, 150, 180, 210, 240, 270, 330]) {
				const r = oklchRotate(b, d);
				if (r.reduced) continue;
				n++;
				const c = new Color(b).to("oklch");
				c.coords[2] = ((c.coords[2] as number) + d) % 360;
				const theirs = c.to("srgb").coords as number[];
				const mine = hexToRgb(r.hex);
				for (let i = 0; i < 3; i++) worstCh = Math.max(worstCh, Math.abs(mine[i]! - theirs[i]!) * 255);
			}
		expect(n).toBeGreaterThan(10);
		expect(worstCh).toBeLessThanOrEqual(0.5 + 1e-6);
	});

	// Out of gamut, colorjs.io's "oklch.c" method finishes with a just-noticeable-difference clip that
	// lets L and H drift, so it lands up to ~20/255 per channel from a pure constant-L,H chroma
	// reduction. The harmony tasks therefore only use rotations that stay inside sRGB.
	it("documents that chroma-reduction variants disagree out of gamut", () => {
		const r = oklchRotate("#8338ec", 210);
		expect(r.reduced).toBe(true);
		const c = new Color("#8338ec").to("oklch");
		c.coords[2] = ((c.coords[2] as number) + 210) % 360;
		const theirs = c.toGamut({ space: "srgb", method: "oklch.c" } as never).to("srgb").coords as number[];
		const mine = hexToRgb(r.hex);
		const worst = Math.max(...[0, 1, 2].map((i) => Math.abs(mine[i]! - (theirs[i] ?? 0)) * 255));
		expect(worst).toBeGreaterThan(5);
		const want = (oklchOfHex("#8338ec")[2] + 210) % 360;
		expect(hueDist(oklchOfHex(r.hex)[2], want)).toBeLessThan(1);
	});
});
