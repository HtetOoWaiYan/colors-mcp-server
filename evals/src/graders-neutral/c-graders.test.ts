import { describe, expect, it } from "vitest";
import { hexOfOklch, oklchOfHex } from "../reference-neutral/c-color.js";
import { buildScale, cssLines, lightnessLadder, SCALE_KEYS } from "../reference-neutral/c-scale.js";
import { neutralC } from "../tasks/neutral/cats-neutral-c.js";
import { gradeNeutral } from "./index.js";

const tasks = neutralC();
const byId = (id: string) => {
	const t = tasks.find((x) => x.id === id);
	if (!t) throw new Error(id);
	return t;
};
const failed = (id: string, a: unknown) =>
	gradeNeutral(byId(id).grader, a)
		.filter((c) => !c.pass)
		.map((c) => c.name);
// biome-ignore lint/suspicious/noExplicitAny: test access to witness fields
const W = (id: string) => byId(id).witness as any;

describe("309 tonal-scale grader", () => {
	it("accepts uppercase and #rgb-expandable hex, and CSS wrapped in :root {}", () => {
		const w = W("n309-2");
		const upper = Object.fromEntries(Object.entries(w.scale as Record<string, string>).map(([k, v]) => [k, v.toUpperCase()]));
		expect(failed("n309-2", { scale: upper, css: `:root {\n${w.css}\n}` })).toEqual([]);
	});

	it("rejects a CSS block with a missing or duplicated step, and a scale with an extra key", () => {
		const w = W("n309-2");
		const lines = (w.css as string).split("\n");
		expect(failed("n309-2", { ...w, css: lines.slice(1).join("\n") })).toContain("css-matches-json");
		expect(failed("n309-2", { ...w, css: `${w.css}\n${lines[0]}` })).toContain("css-matches-json");
		expect(failed("n309-1", { scale: { ...W("n309-1").scale, "1000": "#000000" } })).toContain("eleven-keys-valid-hex");
	});

	it("the feasible region is wide: a differently built scale with the seed at 500 also passes n309-1", () => {
		const seed = "#3a5bd9";
		const s = oklchOfHex(seed);
		const alt = buildScale(seed, "500", lightnessLadder(0.97, 5, s.L, 0.28), [0.015, 0.035, 0.07, 0.11, 0.15, 0, 0.17, 0.15, 0.12, 0.09, 0.07]);
		expect(failed("n309-1", { scale: alt })).toEqual([]);
	});

	it("even-steps catches a lopsided ladder; hue-consistent catches a drifting dark end", () => {
		const w = W("n309-1").scale as Record<string, string>;
		const lop = { ...w, "100": hexOfOklch(0.955, 0.02, oklchOfHex(w["100"] as string).H) };
		expect(failed("n309-1", { scale: lop })).toContain("even-steps");
		const drift = Object.fromEntries(
			SCALE_KEYS.map((k, i) => {
				const c = oklchOfHex(w[k] as string);
				return [k, i >= 8 ? hexOfOklch(c.L, c.C, c.H + 30) : (w[k] as string)];
			}),
		);
		expect(failed("n309-1", { scale: drift })).toEqual(["hue-consistent"]);
	});

	it("mid-chroma-kept is live: each seeded task has a washed-out invalid that fails only that check", () => {
		for (const id of ["n309-1", "n309-2", "n309-3", "n309-4"]) {
			const only = byId(id).invalid.filter((a) => {
				const f = failed(id, a);
				return f.length === 1 && f[0] === "mid-chroma-kept";
			});
			expect(only.length, id).toBeGreaterThanOrEqual(1);
		}
	});

	it("mid-chroma-kept ignores the seed's own step", () => {
		const w = W("n309-1").scale as Record<string, string>;
		const h = oklchOfHex(w["600"] as string).H;
		// every middle step except the seed (600) at chroma 0.1: below the 0.1474 bar
		const flat = Object.fromEntries(
			SCALE_KEYS.map((k) => {
				const c = oklchOfHex(w[k] as string);
				return [k, ["300", "400", "500", "700"].includes(k) ? hexOfOklch(c.L, Math.min(c.C, 0.1), h) : (w[k] as string)];
			}),
		);
		expect(failed("n309-1", { scale: flat })).toEqual(["mid-chroma-kept"]);
	});

	it("cssLines writes one declaration per key", () => {
		expect(cssLines("x", W("n309-1").scale).split("\n")).toHaveLength(11);
	});
});

describe("310 role-tokens grader", () => {
	it("needs both themes when both are asked for", () => {
		const w = W("n310-1");
		const f = failed("n310-1", { light: w.light });
		expect(f.every((n) => n.startsWith("dark-"))).toBe(true);
		expect(f.length).toBeGreaterThan(5);
	});

	it("flags a light container that is darker than primary, and a chromatic surface", () => {
		const w = W("n310-1");
		const light = { ...w.light, "primary-container": "#4d3781", "on-primary-container": "#ffffff" };
		expect(failed("n310-1", { ...w, light })).toEqual(["light-container-lightness"]);
		const dark = { ...w.dark, surface: "#1c1430" };
		expect(failed("n310-1", { ...w, dark })).toContain("dark-surfaces-neutral");
	});

	it("n310-3 inverse surface must flip with the theme", () => {
		const w = W("n310-3");
		const light = { ...w.light, "inverse-surface": w.light.surface, "on-inverse-surface": w.light["on-surface"] };
		expect(failed("n310-3", { ...w, light })).toEqual(["light-inverse-surface-lightness"]);
	});

	it("dark-only task checks surface levels in order", () => {
		const w = W("n310-4");
		const dark = { ...w.dark, "surface-container": w.dark["surface-container-high"], "surface-container-high": w.dark["surface-container"] };
		expect(failed("n310-4", { dark })).toContain("dark-surface-levels");
	});
});

describe("311 constraint-search grader", () => {
	it("fix: a color past the distance bound fails only close-to-original", () => {
		expect(failed("n311-1", { link: "#93b4ff" })).toEqual(["close-to-original"]);
	});
	it("dual: a hue outside the band fails hue-band", () => {
		expect(failed("n311-3", { brand: "#3f9a1e" })).toContain("hue-band");
	});
});

describe("312 palette-audit grader", () => {
	it("set answers are case-insensitive and order-free; pair order inside a pair does not matter", () => {
		expect(failed("n312-1", { failing: [...W("n312-1").failing].reverse().map((s: string) => s.toUpperCase()) })).toEqual([]);
		const flipped = (W("n312-3").nearDuplicates as string[][]).map(([a, b]) => [b, a]);
		expect(failed("n312-3", { nearDuplicates: flipped })).toEqual([]);
	});

	it("unknown ids and malformed pairs fail", () => {
		expect(failed("n312-1", { failing: [...W("n312-1").failing, "nav-link"] })).toEqual(["no-unknown-entries"]);
		expect(failed("n312-3", { nearDuplicates: [["blue-500"]] }).length).toBeGreaterThan(0);
	});

	it("chart: duplicates and non-candidates fail", () => {
		const p = W("n312-2").picks as string[];
		expect(failed("n312-2", { picks: [p[0], p[0], p[1], p[2], p[3]] })).toContain("picks-distinct-from-candidates");
		expect(failed("n312-2", { picks: [...p.slice(0, 4), "#123456"] })).toContain("picks-distinct-from-candidates");
	});
});
