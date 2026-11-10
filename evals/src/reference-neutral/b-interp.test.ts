import Color from "colorjs.io";
import { describe, expect, it } from "vitest";
import { hexToRgb } from "../reference/color.js";
import { fixupHues, type HueRule, interpolateHex, sampleGradient, type Space, SPACES } from "./b-interp.js";
import { hslOfHex, hslToRgb, labOfHex, labToRgb, rgbToHsl } from "./b-spaces.js";

const PAIRS: [string, string][] = [
	["#e11d48", "#2563eb"],
	["#f59e0b", "#0ea5e9"],
	["#1e3a8a", "#fde047"],
	["#16a34a", "#c026d3"],
	["#d9480f", "#0b7285"],
	["#ff3b30", "#007aff"],
];
const CJS_SPACE: Record<Space, string> = {
	srgb: "srgb",
	"srgb-linear": "srgb-linear",
	oklab: "oklab",
	oklch: "oklch",
	lab: "lab-d65",
	hsl: "hsl",
};

function cjsMix(a: string, b: string, t: number, space: Space, hue: HueRule): number[] {
	const c = Color.mix(a, b, t, { space: CJS_SPACE[space], hue } as never) as unknown as Color;
	return c.to("srgb").coords as number[];
}

describe("published vectors", () => {
	it("CSS Color 4 hsl() examples", () => {
		// CSS Color 4, section 7: hsl(120deg 100% 25%) is rgb(0 127.5 0); hsl(0 100% 50%) is red.
		const g = hslToRgb([120, 1, 0.25]);
		expect(g[0]).toBeCloseTo(0, 12);
		expect(g[1] * 255).toBeCloseTo(127.5, 9);
		expect(hslToRgb([0, 1, 0.5])).toEqual([1, 0, 0]);
		const [h, s, l] = rgbToHsl(hexToRgb("#663399"));
		expect(h).toBeCloseTo(270, 9);
		expect(s).toBeCloseTo(0.5, 9);
		expect(l).toBeCloseTo(0.4, 9);
	});

	it("CSS Color 4 color-mix example: 50% red with blue in srgb is rgb(127.5 0 127.5)", () => {
		const m = interpolateHex("#ff0000", "#0000ff", 0.5, "srgb");
		expect(m[0] * 255).toBeCloseTo(127.5, 9);
		expect(m[2] * 255).toBeCloseTo(127.5, 9);
	});

	it("CSS Color 4 hue fix-up rules (section 12.4)", () => {
		expect(fixupHues(350, 10, "shorter")).toEqual([350, 370]);
		expect(fixupHues(10, 350, "shorter")).toEqual([370, 350]);
		expect(fixupHues(40, 200, "shorter")).toEqual([40, 200]);
		expect(fixupHues(40, 200, "longer")).toEqual([400, 200]);
		expect(fixupHues(200, 40, "longer")).toEqual([200, 400]);
		expect(fixupHues(300, 100, "longer")).toEqual([300, 100]);
		expect(fixupHues(300, 100, "increasing")).toEqual([300, 460]);
		expect(fixupHues(100, 300, "decreasing")).toEqual([460, 300]);
	});

	it("Lab D65 round trip", () => {
		for (const [a] of PAIRS) {
			const back = labToRgb(labOfHex(a));
			const rgb = hexToRgb(a);
			for (let i = 0; i < 3; i++) expect(back[i]).toBeCloseTo(rgb[i] as number, 9);
		}
	});
});

describe("cross-check against colorjs.io", () => {
	it("HSL coordinates agree", () => {
		for (const [a, b] of PAIRS)
			for (const h of [a, b]) {
				const [H, S, L] = new Color(h).to("hsl").coords as number[];
				const mine = hslOfHex(h);
				expect(Math.abs((H ?? 0) - mine[0])).toBeLessThan(1e-6);
				expect(Math.abs((S ?? 0) / 100 - mine[1])).toBeLessThan(1e-6);
				expect(Math.abs((L ?? 0) / 100 - mine[2])).toBeLessThan(1e-6);
			}
	});

	// The two D65 whites differ in the 5th decimal (0.95047/1.08883 vs the chromaticity-derived
	// 0.950456/1.089058), which moves a* and b* by about 0.01.
	it("CIELAB D65 agrees with colorjs.io lab-d65 to < 0.05", () => {
		for (const [a, b] of PAIRS)
			for (const h of [a, b]) {
				const theirs = new Color(h).to("lab-d65").coords as number[];
				const mine = labOfHex(h);
				for (let i = 0; i < 3; i++) expect(Math.abs((theirs[i] ?? 0) - mine[i]!)).toBeLessThan(0.05);
			}
	});

	it("mixes in every space and hue rule agree to < 0.5/255 per channel (unclamped)", () => {
		let worst = 0;
		for (const [a, b] of PAIRS)
			for (const space of SPACES)
				for (const hue of ["shorter", "longer", "increasing", "decreasing"] as HueRule[])
					for (const t of [0.1, 0.25, 0.5, 0.7, 0.9]) {
						const theirs = cjsMix(a, b, t, space, hue);
						const mine = interpolateHex(a, b, t, space, hue);
						for (let i = 0; i < 3; i++) worst = Math.max(worst, Math.abs((theirs[i] ?? 0) - mine[i]!) * 255);
					}
		expect(worst).toBeLessThan(0.5);
	});

	it("piecewise gradient sampling hits its stops exactly", () => {
		const g = [
			{ color: "#e11d48", pos: 0 },
			{ color: "#f59e0b", pos: 0.25 },
			{ color: "#0ea5e9", pos: 1 },
		];
		const at = sampleGradient(g, 0.25, "hsl");
		const want = hexToRgb("#f59e0b");
		for (let i = 0; i < 3; i++) expect(at[i]).toBeCloseTo(want[i] as number, 9);
	});
});
