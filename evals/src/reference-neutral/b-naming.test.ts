import Color from "colorjs.io";
import { describe, expect, it } from "vitest";
import { apcaLc, CSS_NAMED, namesFor, rankNamed, wcag } from "./b-naming.js";

describe("CSS named colors", () => {
	it("has the 148 CSS Color 4 keywords with the expected aliases", () => {
		expect(Object.keys(CSS_NAMED)).toHaveLength(148);
		expect(namesFor("#808080").sort()).toEqual(["gray", "grey"]);
		expect(namesFor("#00ffff").sort()).toEqual(["aqua", "cyan"]);
		expect(namesFor("#ff00ff").sort()).toEqual(["fuchsia", "magenta"]);
		expect(new Set(Object.values(CSS_NAMED)).size).toBe(139);
	});

	it("every value matches colorjs.io's parse of the keyword", () => {
		for (const [name, hex] of Object.entries(CSS_NAMED)) {
			const theirs = new Color(name).to("srgb").toString({ format: "hex", collapse: false });
			expect(theirs, name).toBe(hex);
		}
	});

	it("an exact named value ranks itself first at distance 0", () => {
		expect(rankNamed("#663399", "ciede2000")[0]?.names).toEqual(["rebeccapurple"]);
		expect(rankNamed("#663399", "srgb-euclid")[0]?.d).toBe(0);
	});
});

describe("WCAG 2 contrast", () => {
	// WCAG 2.x definition: black on white is 21:1; #767676 on white is the well-known 4.54:1.
	it("published values", () => {
		expect(wcag("#000000", "#ffffff")).toBeCloseTo(21, 9);
		expect(wcag("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
	});
	it("agrees with colorjs.io contrastWCAG21", () => {
		for (const [a, b] of [
			["#1f2937", "#f97316"],
			["#ffffff", "#0d9488"],
			["#000000", "#7c3aed"],
		] as const)
			expect(Math.abs(wcag(a, b) - new Color(a).contrast(b, "WCAG21"))).toBeLessThan(0.005);
	});
});

describe("APCA-W3 0.0.98G-4g", () => {
	// Source: the APCA-W3 0.0.98G-4g reference test values (text, background -> Lc).
	it("published test vectors", () => {
		expect(apcaLc("#888888", "#ffffff")).toBeCloseTo(63.056469930209424, 6);
		expect(apcaLc("#ffffff", "#888888")).toBeCloseTo(-68.54146436644962, 6);
		expect(apcaLc("#000000", "#aaaaaa")).toBeCloseTo(58.146262578561334, 6);
		expect(apcaLc("#aaaaaa", "#000000")).toBeCloseTo(-56.24113336839742, 6);
		expect(apcaLc("#112233", "#ddeeff")).toBeCloseTo(91.66830811481631, 6);
		expect(apcaLc("#ddeeff", "#112233")).toBeCloseTo(-93.06770049484275, 6);
	});

	it("agrees with colorjs.io contrastAPCA (background, foreground)", () => {
		let worst = 0;
		const colors = ["#0d9488", "#f97316", "#7c3aed", "#facc15", "#64748b", "#e11d48", "#000000", "#ffffff", "#2563eb"];
		for (const t of colors)
			for (const b of colors) {
				if (t === b) continue;
				const theirs = new Color(b).contrast(t, "APCA");
				worst = Math.max(worst, Math.abs(theirs - apcaLc(t, b)));
			}
		expect(worst).toBeLessThan(0.01);
	});
});
