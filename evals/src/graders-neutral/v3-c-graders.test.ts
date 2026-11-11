import { describe, expect, it } from "vitest";
import { SCALE_KEYS } from "../reference-neutral/c-scale.js";
import { pathHue } from "../reference-neutral/v3-c-scale.js";
import {
	type Audit3Params,
	gradeAudit3,
	gradeRoles3,
	gradeScale3,
	gradeSearch3,
	type Roles3Params,
	type Scale3Params,
	type Search3Params,
} from "./v3-c-graders.js";

const names = (cs: { name: string; pass: boolean }[]) => cs.filter((c) => !c.pass).map((c) => c.name);
const JUNK = [null, undefined, 42, "x", [], {}, [[]], { a: 1 }];

describe("hue path", () => {
	it("interpolates linearly by position and the short way round the circle", () => {
		const k: [number, number][] = [
			[0, 100],
			[5, 140],
			[10, 150],
		];
		expect(pathHue(k, 0)).toBeCloseTo(100, 9);
		expect(pathHue(k, 2.5)).toBeCloseTo(120, 9);
		expect(pathHue(k, 5)).toBeCloseTo(140, 9);
		expect(pathHue(k, 8)).toBeCloseTo(146, 9);
		// 350° -> 20° goes through 0°, not back through 180°.
		const wrap: [number, number][] = [
			[0, 350],
			[10, 20],
		];
		expect(pathHue(wrap, 5)).toBeCloseTo(5, 9);
		expect(pathHue(wrap, 2)).toBeCloseTo(356, 9);
	});
});

// A plain gray ramp: monotone in Oklch L, chroma ~0 (so hue rules do not apply), peak chroma anywhere.
const grays = ["#f5f5f5", "#e0e0e0", "#c8c8c8", "#b0b0b0", "#989898", "#808080", "#686868", "#545454", "#404040", "#2c2c2c", "#1a1a1a"];
const scale = Object.fromEntries(SCALE_KEYS.map((k, i) => [k, grays[i] as string]));
const base: Scale3Params = {
	keys: [...SCALE_KEYS],
	lightFloor: 0.9,
	darkCeiling: 0.3,
	stepRatio: [0.3, 3],
	hue: { seedHue: 0, tol: 20, minChroma: 0.02 },
};

describe("tonal scale v3 checks", () => {
	it("runs the earlier checks unchanged when nothing new is stated", () => {
		expect(names(gradeScale3({ scale }, base))).toEqual([]);
	});

	it("checks lightness anchors, the chroma peak and the hue path", () => {
		const p: Scale3Params = {
			...base,
			anchors: [
				{ step: "500", min: 0.55, max: 0.65 }, // #808080 is Oklch L ~0.60
				{ step: "50", min: 0.5, max: 0.6 },
			],
			huePath: { knots: [[0, 0], [10, 90]], tol: 5, minChroma: 0.03 },
		};
		expect(names(gradeScale3({ scale }, p))).toEqual(["lightness-50"]);
		// A chromatic orange at 300 breaks the path (target there is 27°, orange is ~55°) and is the peak.
		const s2 = { ...scale, "300": "#e08a2c" };
		const f = names(gradeScale3({ scale: s2 }, { ...p, anchors: [], peak: ["500"] }));
		expect(f).toContain("hue-follows-path");
		expect(f).toContain("chroma-peak-placed");
		expect(names(gradeScale3({ scale: s2 }, { ...base, peak: ["300", "400"] }))).not.toContain("chroma-peak-placed");
	});

	it("fails without throwing on junk answers and junk params", () => {
		const p: Scale3Params = { ...base, anchors: [{ step: "500", min: 0, max: 1 }], peak: ["500"], huePath: { knots: [[0, 0], [10, 0]], tol: 5, minChroma: 0.03 } };
		for (const j of JUNK) {
			expect(() => gradeScale3(j, p)).not.toThrow();
			expect(names(gradeScale3(j, p))).toContain("lightness-500");
		}
		expect(() => gradeScale3({ scale }, null as never)).not.toThrow();
	});
});

const roleSet = (o: Record<string, string>) => ({
	primary: "#2d6a8f",
	"on-primary": "#ffffff",
	"primary-container": "#cfe3f2",
	"on-primary-container": "#0b2638",
	secondary: "#5b6c9a",
	surface: "#fbfbfc",
	"on-surface": "#1c1d1f",
	"surface-variant": "#e9eaec",
	outline: "#74777c",
	error: "#b3261e",
	"on-error": "#ffffff",
	...o,
});
const rolesBase: Roles3Params = {
	themes: ["light", "dark"],
	roles: Object.keys(roleSet({})),
	pairs: [],
	containerMargin: -1,
	primary: { seedHue: 0, tol: 180, minChroma: 0 },
	secondary: { hue: 0, tol: 180, minChroma: 0 },
	surfaces: { roles: ["surface"], maxChroma: 1, lightMinL: 0, darkMaxL: 1 },
	error: { band: [0, 359.999], minChroma: 0 },
};

describe("role tokens v3 checks", () => {
	it("checks same-in-both-themes, given colors and kept-apart roles", () => {
		const p: Roles3Params = {
			...rolesBase,
			same: ["primary"],
			exact: [{ role: "error", theme: "dark", hex: "#b3261e", tol: 0.01 }],
			apart: [{ a: "error", b: "primary", min: 0.1 }],
		};
		const ok = { light: roleSet({}), dark: roleSet({}) };
		expect(names(gradeRoles3(ok, p))).toEqual([]);
		const bad = { light: roleSet({}), dark: roleSet({ primary: "#2d6a90", error: "#2e6a8f" }) };
		expect(names(gradeRoles3(bad, p))).toEqual(["primary-same-in-both-themes", "dark-error-is-given-color", "dark-error-apart-from-primary"]);
	});

	it("never throws", () => {
		const p: Roles3Params = { ...rolesBase, same: ["primary"], exact: [{ role: "error", theme: "dark", hex: "#b3261e", tol: 0.01 }], apart: [{ a: "error", b: "primary", min: 0.1 }] };
		for (const j of JUNK) expect(() => gradeRoles3(j, p)).not.toThrow();
		expect(() => gradeRoles3({}, null as never)).not.toThrow();
	});
});

describe("constraint search v3 shapes", () => {
	it("fix-multi: every floor, hue and the factor x optimum bound", () => {
		const p: Search3Params = {
			shape: "fix-multi",
			field: "c",
			original: "#4a7fd4",
			floors: [
				{ label: "white", hex: "#ffffff", min: 4.5 },
				{ label: "gray", hex: "#eeeeee", min: 4.5 },
			],
			hueTol: 6,
			optimum: 0.1,
			factor: 1.2,
		};
		// #2f63b8 is ~5.9:1 on white and ~5.0:1 on #eee, same hue family, ~0.10 Oklab away.
		expect(names(gradeSearch3({ c: "#2f63b8" }, p))).toEqual([]);
		expect(names(gradeSearch3({ c: "#4a7fd4" }, p))).toEqual(["contrast-vs-white", "contrast-vs-gray"]);
		expect(names(gradeSearch3({ c: "#0b2a66" }, p))).toEqual(["close-to-original"]);
		expect(names(gradeSearch3({ c: "#3b3bb0" }, p))).toContain("hue-kept");
	});

	it("chroma-floor: floors, a band across 0° and the chroma floor", () => {
		const p: Search3Params = {
			shape: "chroma-floor",
			field: "c",
			floors: [{ label: "white", hex: "#ffffff", min: 3 }],
			band: [350, 15],
			minChroma: 0.15,
		};
		expect(names(gradeSearch3({ c: "#d6006f" }, p))).toEqual([]); // hue ~1°
		expect(names(gradeSearch3({ c: "#d63a00" }, p))).toEqual(["hue-band"]); // hue ~35°
		expect(names(gradeSearch3({ c: "#a05a6a" }, p))).toEqual(["chroma-floor"]);
	});

	it("map-outside: the v1 map checks plus an exact out-of-gamut name set", () => {
		const p: Search3Params = {
			shape: "map-outside",
			targets: [
				{ field: "a", ref: "#00cb5f", dTol: 0.03, lTol: 0.02, hTol: 5 },
				{ field: "b", ref: "#6d60bb", dTol: 0.008, lTol: 0.008, hTol: 2 },
			],
			outsideField: "out",
			outside: ["a"],
		};
		expect(names(gradeSearch3({ a: "#00cb5f", b: "#6d60bb", out: ["A "] }, p))).toEqual([]);
		expect(names(gradeSearch3({ a: "#00cb5f", b: "#6d60bb", out: ["a", "b"] }, p))).toEqual(["outside-verdict-b"]);
		expect(names(gradeSearch3({ a: "#00cb5f", b: "#6d60bb", out: ["a", "zz"] }, p))).toEqual(["outside-only-known-names"]);
		expect(names(gradeSearch3({ a: "#00d530", b: "#6d60bb", out: ["a"] }, p))).toContain("a-close");
	});

	it("never throws", () => {
		const ps: Search3Params[] = [
			{ shape: "fix-multi", field: "c", original: "#4a7fd4", floors: [{ label: "w", hex: "#ffffff", min: 4.5 }], hueTol: 6, optimum: 0.1, factor: 1.2 },
			{ shape: "chroma-floor", field: "c", floors: [], band: [0, 10], minChroma: 0.1 },
			{ shape: "map-outside", targets: [{ field: "a", ref: "#000000", dTol: 1, lTol: 1, hTol: 1 }], outsideField: "o", outside: [] },
		];
		for (const p of ps) for (const j of JUNK) expect(() => gradeSearch3(j, p)).not.toThrow();
		expect(names(gradeSearch3({}, null as never))).toEqual(["valid-shape"]);
	});
});

describe("palette audit v3 shapes", () => {
	it("chart-multi: count, membership, 3:1 on every background, deutan separation", () => {
		const p: Audit3Params = {
			shape: "chart-multi",
			field: "s",
			candidates: ["#d1495e", "#1592a8", "#6a6fe0", "#36a9d2"],
			backgrounds: [
				{ label: "light", hex: "#fdfcfa" },
				{ label: "dark", hex: "#1e1c24" },
			],
			k: 2,
			minContrast: 3,
			threshold: 5,
		};
		expect(names(gradeAudit3({ s: ["#d1495e", "#1592a8"] }, p))).toEqual([]);
		expect(names(gradeAudit3({ s: ["#d1495e", "#36a9d2"] }, p))).toEqual(["contrast-on-light"]);
		expect(names(gradeAudit3({ s: ["#d1495e", "#d1495e"] }, p))).toEqual(["picks-distinct-from-candidates", "deutan-separation"]);
		expect(names(gradeAudit3({ s: ["#d1495e", "#123456"] }, p))).toContain("picks-distinct-from-candidates");
	});

	it("light-from-dark: pairs, hue identity of chromatic tokens, light surfaces", () => {
		const p: Audit3Params = {
			shape: "light-from-dark",
			field: "t",
			dark: { bg: "#121417", text: "#e6e4df", accent: "#5fc29a" },
			pairs: [["text", "bg", 4.5]],
			hueTol: 15,
			hueMinChroma: 0.04,
			lightMinChroma: 0.04,
			surfaces: ["bg"],
			surfaceMinL: 0.93,
		};
		expect(names(gradeAudit3({ t: { bg: "#f8f7f4", text: "#202124", accent: "#1d7a55" } }, p))).toEqual([]);
		expect(names(gradeAudit3({ t: { bg: "#121417", text: "#e6e4df", accent: "#5fc29a" } }, p))).toEqual(["surfaces-light"]);
		expect(names(gradeAudit3({ t: { bg: "#f8f7f4", text: "#202124", accent: "#7a1d55" } }, p))).toEqual(["hue-accent"]);
	});

	it("never throws", () => {
		const ps: Audit3Params[] = [
			{ shape: "chart-multi", field: "s", candidates: ["#123456"], backgrounds: [{ label: "x", hex: "#ffffff" }], k: 1, minContrast: 3, threshold: 1 },
			{ shape: "light-from-dark", field: "t", dark: { a: "#123456" }, pairs: [], hueTol: 1, hueMinChroma: 0, lightMinChroma: 0, surfaces: ["a"], surfaceMinL: 0.9 },
		];
		for (const p of ps) for (const j of JUNK) expect(() => gradeAudit3(j, p)).not.toThrow();
		expect(names(gradeAudit3({}, null as never))).toEqual(["valid-shape"]);
	});
});
