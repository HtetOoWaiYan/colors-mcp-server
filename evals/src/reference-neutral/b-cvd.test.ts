import Color from "colorjs.io";
import { describe, expect, it } from "vitest";
import { deltaE2000, hexToRgb, rgbToLab, simulateDeuteranopia } from "../reference/color.js";
import { CVDS, cvdDeltaE, MACHADO_1, simulate, simulateHex } from "./b-cvd.js";

const SAMPLE = ["#e11d48", "#16a34a", "#2563eb", "#f59e0b", "#7c3aed", "#0891b2", "#a3a3a3", "#ffffff", "#000000", "#ff0000", "#00ff00", "#0000ff"];

describe("Machado 2009 severity-1.0 matrices", () => {
	// Source: Machado, Oliveira & Fernandes 2009, supplementary table of simulation matrices (severity 1.0).
	// Every published row sums to 1 (to 6 decimals), so white and grays map to themselves.
	it("rows sum to 1, so neutrals are preserved", () => {
		for (const k of CVDS)
			for (const row of MACHADO_1[k]) expect(row[0] + row[1] + row[2]).toBeCloseTo(1, 5);
		for (const k of CVDS) {
			expect(simulateHex("#ffffff", k)).toBe("#ffffff");
			expect(simulateHex("#808080", k)).toBe("#808080");
			expect(simulateHex("#000000", k)).toBe("#000000");
		}
	});

	it("deuteranopia matches the shared reference implementation", () => {
		for (const h of SAMPLE) {
			const a = simulate(hexToRgb(h), "deuteranopia");
			const b = simulateDeuteranopia(hexToRgb(h));
			for (let i = 0; i < 3; i++) expect(a[i]).toBeCloseTo(b[i] as number, 12);
		}
	});

	it("pure primaries land where the published coefficients put them", () => {
		// linear red (1,0,0) under protanopia is the first matrix column, clamped.
		const sim = simulate([1, 0, 0], "protanopia");
		const col = [0.152286, 0.114503, 0];
		const enc = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
		for (let i = 0; i < 3; i++) expect(sim[i]).toBeCloseTo(enc(col[i] as number), 10);
	});
});

describe("cross-check of the CVD pipeline against colorjs.io linearization", () => {
	it("decode -> matrix -> clamp -> encode agrees to < 0.5/255 for every deficiency", () => {
		let worst = 0;
		for (const k of CVDS)
			for (const h of SAMPLE) {
				const lin = new Color(h).to("srgb-linear").coords as number[];
				const m = MACHADO_1[k];
				const sim = m.map((row) => Math.min(1, Math.max(0, row[0] * (lin[0] ?? 0) + row[1] * (lin[1] ?? 0) + row[2] * (lin[2] ?? 0))));
				const back = new Color("srgb-linear", sim as [number, number, number]).to("srgb").coords as number[];
				const mine = simulate(hexToRgb(h), k);
				for (let i = 0; i < 3; i++) worst = Math.max(worst, Math.abs((back[i] ?? 0) - mine[i]!) * 255);
			}
		expect(worst).toBeLessThan(0.5);
	});

	it("CIEDE2000 after simulation agrees with colorjs.io's CIEDE2000 on D65 Lab coordinates", () => {
		let worst = 0;
		for (const k of CVDS)
			for (let i = 0; i < SAMPLE.length; i++)
				for (let j = i + 1; j < SAMPLE.length; j++) {
					const a = SAMPLE[i] as string;
					const b = SAMPLE[j] as string;
					const sa = new Color("srgb", [...simulate(hexToRgb(a), k)] as [number, number, number]).to("lab-d65").coords as [number, number, number];
					const sb = new Color("srgb", [...simulate(hexToRgb(b), k)] as [number, number, number]).to("lab-d65").coords as [number, number, number];
					// Feed the D65 coordinates straight into colorjs's CIEDE2000 (which reads them as Lab).
					const theirs = new Color("lab", sa).deltaE(new Color("lab", sb), "2000");
					worst = Math.max(worst, Math.abs(theirs - cvdDeltaE(a, b, k)));
				}
		expect(worst).toBeLessThan(0.02);
	});

	it("CIEDE2000 matches Sharma, Wu & Dalal (2005) test pairs 1-3", () => {
		// Source: Sharma et al. 2005, Table 1, pairs 1, 2, 3.
		expect(deltaE2000([50, 2.6772, -79.7751], [50, 0, -82.7485])).toBeCloseTo(2.0425, 4);
		expect(deltaE2000([50, 3.1571, -77.2803], [50, 0, -82.7485])).toBeCloseTo(2.8615, 4);
		expect(deltaE2000([50, 2.8361, -74.02], [50, 0, -82.7485])).toBeCloseTo(3.4412, 4);
		expect(rgbToLab([1, 1, 1])[0]).toBeCloseTo(100, 4);
	});
});
