import { describe, expect, it } from "vitest";
import { auditCss } from "./audit.js";
import { gradient, mixAt } from "./blend.js";
import { categorical } from "./categorical.js";
import {
	ColorError,
	gamutMap,
	hueDiff,
	inGamut,
	okDistance,
	oklchToRgb,
	parseColor,
	type Rgb,
	rgbToHex,
	rgbToOklab,
	rgbToOklch,
} from "./color.js";
import {
	apcaContrast,
	contrastRatio,
	effectiveForeground,
	requiredRatio,
} from "./contrast.js";
import { deltaE2000Lab, rgbToLab } from "./distance.js";
import { fixContrast } from "./fix.js";
import { harmony, SCHEMES } from "./harmony.js";
import { buildRamp } from "./ramp.js";
import { buildTheme, checkTheme } from "./theme.js";
import { minSeparation, simulate } from "./vision.js";

const hex = (h: string): Rgb => parseColor(h).rgb;

describe("parseColor", () => {
	it("accepts common forms, bare hex and odd casing", () => {
		expect(rgbToHex(hex("#F80"))).toBe("#ff8800");
		expect(rgbToHex(hex("3b82f6"))).toBe("#3b82f6");
		expect(rgbToHex(hex("  TOMATO "))).toBe("#ff6347");
		expect(rgbToHex(hex("rgb(12 34 56)"))).toBe("#0c2238");
		expect(rgbToHex(hex("hsl(210 50% 40%)"))).toBe("#336699");
		expect(parseColor("#00ff0080").alpha).toBeCloseTo(128 / 255, 3);
		expect(parseColor("rgb(255 0 0 / 50%)").alpha).toBeCloseTo(0.5, 9);
	});
	it("keeps wide-gamut values unclamped", () => {
		const p = parseColor("oklch(0.75 0.25 145)");
		expect(inGamut(p.rgb)).toBe(false);
		expect(p.space).toBe("oklch");
	});
	it("errors teach: suggests a name and lists accepted formats", () => {
		expect(() => parseColor("tomatoe")).toThrow(/Did you mean "tomato"/);
		expect(() => parseColor("#12345")).toThrow(ColorError);
		expect(() => parseColor("")).toThrow(/Provide one of/);
	});
});

describe("OKLab and gamut mapping", () => {
	it("matches Ottosson's published red", () => {
		const [l, a, b] = rgbToOklab([1, 0, 0]);
		expect(l).toBeCloseTo(0.6279554, 4);
		expect(a).toBeCloseTo(0.224863, 4);
		expect(b).toBeCloseTo(0.1258463, 4);
	});
	it("maps out-of-gamut colors by reducing chroma only, to the largest that fits", () => {
		const input = { l: 0.7, c: 0.4, h: 150 };
		expect(inGamut(oklchToRgb(input))).toBe(false);
		const m = gamutMap(input);
		expect(m.mapped).toBe(true);
		expect(m.oklch.l).toBe(0.7);
		expect(m.oklch.h).toBe(150);
		expect(inGamut(oklchToRgb({ ...m.oklch, c: m.oklch.c + 1e-5 }))).toBe(
			false,
		);
	});
});

describe("contrast", () => {
	it("matches WCAG vectors", () => {
		expect(contrastRatio([0, 0, 0], [1, 1, 1])).toBeCloseTo(21, 6);
		expect(contrastRatio(hex("#777777"), [1, 1, 1])).toBeCloseTo(4.478, 2);
		expect(contrastRatio(hex("#767676"), [1, 1, 1])).toBeGreaterThanOrEqual(
			4.5,
		);
	});
	it("composites translucent text before measuring", () => {
		const { fg, bg } = effectiveForeground(
			parseColor("rgba(0,0,0,0.55)"),
			parseColor("#fff"),
		);
		expect(contrastRatio(fg, bg)).toBeCloseTo(
			contrastRatio(hex("#737373"), [1, 1, 1]),
			1,
		);
	});
	it("knows the required ratios", () => {
		expect(requiredRatio("AA", "normal")).toBe(4.5);
		expect(requiredRatio("AA", "large")).toBe(3);
		expect(requiredRatio("AAA", "normal")).toBe(7);
		expect(requiredRatio("AAA", "large")).toBe(4.5);
		expect(requiredRatio("AA", "ui")).toBe(3);
	});
	it("returns APCA Lc with magnitude near 106 for black on white", () => {
		expect(Math.abs(apcaContrast([0, 0, 0], [1, 1, 1]))).toBeCloseTo(106, 0);
	});
});

describe("CIEDE2000 (Sharma 2005 vectors)", () => {
	const cases: [[number, number, number], [number, number, number], number][] =
		[
			[[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
			[[50, 2.5, 0], [73, 25, -18], 27.1492],
			[[50, 2.5, 0], [56, -27, -3], 31.903],
			[[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
			[[2.0776, 0.0795, -1.135], [0.9033, -0.0636, -0.5514], 0.9082],
		];
	for (const [a, b, e] of cases) {
		it(`${a.join(",")} vs ${b.join(",")}`, () =>
			expect(deltaE2000Lab(a, b)).toBeCloseTo(e, 3));
	}
	it("D65 Lab of white is 100,0,0", () => {
		const [l, a, b] = rgbToLab([1, 1, 1]);
		expect(l).toBeCloseTo(100, 2);
		expect(Math.abs(a) + Math.abs(b)).toBeLessThan(0.01);
	});
});

describe("color vision deficiency", () => {
	it("leaves neutrals alone", () => {
		for (const t of [
			"protanopia",
			"deuteranopia",
			"tritanopia",
			"achromatopsia",
		] as const) {
			const s = simulate([0.5, 0.5, 0.5], t);
			for (let i = 0; i < 3; i++) expect(s[i]).toBeCloseTo(0.5, 2);
		}
	});
	it("makes red and green nearly indistinguishable under deuteranopia", () => {
		const normal = minSeparation([hex("#d62728"), hex("#2ca02c")], null).min;
		const deut = minSeparation(
			[hex("#d62728"), hex("#2ca02c")],
			"deuteranopia",
		).min;
		expect(deut).toBeLessThan(normal / 2);
	});
});

describe("fixContrast (checked against exhaustive 8-bit search from the eval suite)", () => {
	// d* from enumerating all 16.7M sRGB colors (evals/src/reference/fix.ts)
	const cases: [string, string, number, number, boolean][] = [
		["#7a9bd1", "#ffffff", 4.5, 0.1159326, true],
		["#f2a65a", "#ffffff", 4.5, 0.2063516, true],
		["#4b5563", "#111827", 4.5, 0.152752, false],
		["#e11d48", "#fef2f2", 7, 0.1241746, true],
	];
	for (const [fg, bg, target, dStar, constrained] of cases) {
		it(`${fg} on ${bg} >= ${target}`, () => {
			const r = fixContrast(hex(fg), hex(bg), target);
			expect(r).not.toBeNull();
			if (!r) return;
			expect(r.ratio).toBeGreaterThanOrEqual(target);
			expect(r.distance).toBeLessThanOrEqual(dStar * 1.1 + 0.002);
			if (constrained)
				expect(
					hueDiff(rgbToOklch(hex(fg)).h, rgbToOklch(r.rgb).h),
				).toBeLessThanOrEqual(15);
		});
	}
	it("keeps a neutral gray neutral and finds the classic #767676", () => {
		const r = fixContrast(hex("#777777"), hex("#ffffff"), 4.5);
		expect(r && rgbToHex(r.rgb)).toBe("#767676");
	});
	it("leaves a passing color unchanged", () => {
		const r = fixContrast(hex("#000000"), hex("#ffffff"), 4.5);
		expect(r?.changed).toBe(false);
	});
	it("returns null when the target is unreachable", () => {
		expect(fixContrast(hex("#808080"), hex("#7f7f7f"), 21)).toBeNull();
	});
});

describe("gradient", () => {
	it("includes both endpoints exactly", () => {
		const a = hex("#2563eb");
		const b = hex("#f97316");
		const g = gradient([a, b], 5);
		expect(g).toHaveLength(5);
		expect(rgbToHex(g[0] as Rgb)).toBe("#2563eb");
		expect(rgbToHex(g[4] as Rgb)).toBe("#f97316");
	});
	it("OKLCH keeps the midpoint vivid where sRGB goes muddy", () => {
		const a = hex("#2563eb");
		const b = hex("#f97316");
		const ok = rgbToOklch(mixAt(a, b, 0.5, "oklch")).c;
		const srgb = rgbToOklch(mixAt(a, b, 0.5, "srgb")).c;
		expect(ok).toBeGreaterThan(srgb);
	});
	it("handles an achromatic endpoint without hue noise", () => {
		const g = gradient([hex("#ffffff"), hex("#2563eb")], 5);
		const hues = g.slice(1).map((c) => rgbToOklch(c).h);
		for (const h of hues)
			expect(hueDiff(h, rgbToOklch(hex("#2563eb")).h)).toBeLessThan(2);
	});
	it("spreads steps across several stops, passing through each inner stop", () => {
		const g = gradient([hex("#ff0000"), hex("#00ff00"), hex("#0000ff")], 5);
		expect([g[0], g[2], g[4]].map((c) => rgbToHex(c as Rgb))).toEqual([
			"#ff0000",
			"#00ff00",
			"#0000ff",
		]);
	});
});

describe("buildRamp", () => {
	for (const seed of ["#2563eb", "#16a34a", "#e11d48", "#9333ea", "#facc15"]) {
		it(`is anchored, monotone and keeps hue for ${seed}`, () => {
			const { steps, seedIndex } = buildRamp(hex(seed));
			expect(steps).toHaveLength(11);
			expect(rgbToHex(steps[seedIndex] as Rgb)).toBe(seed);
			const ls = steps.map((s) => rgbToOklch(s).l);
			for (let i = 1; i < ls.length; i++)
				expect(ls[i] as number).toBeLessThan(ls[i - 1] as number);
			expect(ls[0]).toBeGreaterThanOrEqual(0.95);
			expect(ls[10]).toBeLessThanOrEqual(0.25);
			const h = rgbToOklch(hex(seed)).h;
			for (const s of steps) {
				const o = rgbToOklch(s);
				if (o.c >= 0.02) expect(hueDiff(o.h, h)).toBeLessThanOrEqual(12);
			}
		});
	}
});

describe("harmony", () => {
	it("rotates hue by the scheme offsets", () => {
		const base = hex("#cc7455");
		const bh = rgbToOklch(base).h;
		for (const [name, offsets] of Object.entries(SCHEMES)) {
			const cols = harmony(base, name as keyof typeof SCHEMES);
			expect(cols).toHaveLength(offsets.length);
			for (const c of cols) {
				expect(
					hueDiff(rgbToOklch(c.rgb).h, (bh + c.offset + 720) % 360),
				).toBeLessThan(8);
			}
		}
	});
});

describe("buildTheme guarantees every contrast rule in both themes", () => {
	for (const brand of [
		"#2563eb",
		"#0d9488",
		"#9333ea",
		"#be185d",
		"#facc15",
		"#1e3a8a",
		"#ffffff",
		"#000000",
	]) {
		it(brand, () => {
			const t = buildTheme(hex(brand));
			const failed = checkTheme(t).filter((r) => !r.pass);
			expect(
				failed.map((f) => `${f.theme}:${f.text}/${f.on}=${f.ratio.toFixed(2)}`),
			).toEqual([]);
			const L = (
				k: "background" | "surface" | "surface-raised",
				th: "light" | "dark",
			) => rgbToOklch(t[th][k]).l;
			for (const th of ["light", "dark"] as const) {
				expect(
					Math.abs(L("background", th) - L("surface", th)),
				).toBeGreaterThanOrEqual(0.02);
				expect(
					Math.abs(L("surface", th) - L("surface-raised", th)),
				).toBeGreaterThanOrEqual(0.02);
			}
		});
	}
	it("keeps a good brand color untouched in the light theme", () => {
		const t = buildTheme(hex("#2563eb"));
		expect(
			okDistance(rgbToOklab(t.light.primary), rgbToOklab(hex("#2563eb"))),
		).toBeLessThan(0.001);
		expect(t.primaryAdjusted.light).toBe(false);
	});
});

describe("categorical", () => {
	for (const [background, n, minDeutan] of [
		["#ffffff", 4, 20],
		["#111827", 6, 0],
	] as const) {
		it(`builds ${n} deuteranopia-aware colors on ${background} that clear contrast and separation`, () => {
			const bg = hex(background);
			const r = categorical(n, {
				background: bg,
				cvd: ["deuteranopia"],
				minContrast: 3,
				minNormalSeparation: 10,
			});
			expect(r).not.toBeNull();
			if (!r) return;
			expect(new Set(r.colors.map((c) => rgbToHex(c))).size).toBe(n);
			for (const c of r.colors)
				expect(contrastRatio(c, bg)).toBeGreaterThanOrEqual(3);
			expect(minSeparation(r.colors, null).min).toBeGreaterThanOrEqual(10);
			expect(minSeparation(r.colors, "deuteranopia").min).toBeGreaterThan(
				minDeutan,
			);
		});
	}
});

describe("auditCss (same expectations as the eval suite)", () => {
	const ids = (css: string) =>
		auditCss(css).findings.map((f) => [f.rule, f.selector, f.detail ?? null]);
	it("flags the seeded defects", () => {
		expect(
			ids(`:root { --brand: #2563eb; --brand-hover: #2a65ec; --ink: #111827; }
.btn { color: #ffffff; background-color: #5b9bd5; border-color: #5b9bd5; }
.card { color: #374151; background-color: #f9fafb; border-color: #9ca3af; }
.note { color: #9ca3af; background-color: #ffffff; }`),
		).toEqual([
			["near-duplicate-token", ":root", "--brand|--brand-hover"],
			["text-contrast-aa", ".btn", null],
			["nontext-contrast-3", ".btn", null],
			["nontext-contrast-3", ".card", null],
			["text-contrast-aa", ".note", null],
		]);
	});
	it("returns nothing for a clean stylesheet", () => {
		expect(
			ids(`:root { --bg: #ffffff; --fg: #111827; --accent: #1d4ed8; --warn: #b45309; }
body { color: #111827; background-color: #ffffff; }
.panel { color: #0f172a; background-color: #f1f5f9; border-color: #64748b; }
.btn { color: #ffffff; background-color: #1d4ed8; border-color: #bfdbfe; }`),
		).toEqual([]);
	});
	it("resolves var() and suggests a fix", () => {
		const r = auditCss(
			`:root { --fg: #9ca3af; --bg: #ffffff; } p { color: var(--fg); background: var(--bg); }`,
		);
		const f = r.findings.find((x) => x.selector === "p");
		expect(f?.rule).toBe("text-contrast-aa");
		expect(f?.suggestion).toMatch(/#[0-9a-f]{6}/);
	});
	it("looks inside @media blocks", () => {
		expect(
			ids(
				"@media (min-width: 1px) { a { color: #ccc; background-color: #fff; } }",
			),
		).toEqual([["text-contrast-aa", "a", null]]);
	});
});
