/**
 * Independent check of every author-B task: recompute the answer with colorjs.io (its own
 * linearization, Lab D65, Oklab/Oklch, HSL, interpolation, CIEDE2000, WCAG 2.1 and APCA code) and
 * grade it with the task's own grader. Inputs are restated here on purpose instead of read from the
 * task, so a typo on either side shows up. Only the Machado matrices and the scheme-matching rule are
 * shared with the reference, because colorjs.io implements neither.
 */
import Color from "colorjs.io";
import { describe, expect, it } from "vitest";
import { MACHADO_1, type Cvd } from "../reference-neutral/b-cvd.js";
import { SCHEMES, schemeError } from "../reference-neutral/b-harmony.js";
import { CSS_NAMED } from "../reference-neutral/b-naming.js";
import { neutralB } from "../tasks/neutral/cats-neutral-b.js";
import { gradeB } from "./b-checks.js";

type V3 = [number, number, number];
const tasks = neutralB();
const fails = (id: string, answer: unknown) => {
	const t = tasks.find((x) => x.id === id);
	if (!t) throw new Error(`no task ${id}`);
	return gradeB(answer, t.grader.params)
		.filter((c) => !c.pass)
		.map((c) => c.name);
};

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const hex = (c: Color): string =>
	`#${(c.to("srgb").coords as number[]).map((v) => Math.round(clamp(v) * 255).toString(16).padStart(2, "0")).join("")}`;
const labD65 = (c: Color | string) => new Color(c as never).to("lab-d65").coords as V3;
const de00 = (a: Color | string, b: Color | string) => new Color("lab", labD65(a)).deltaE(new Color("lab", labD65(b)), "2000");

function sim(h: string, k: Cvd): Color {
	const lin = new Color(h).to("srgb-linear").coords as V3;
	const out = MACHADO_1[k].map((row) => clamp(row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2])) as V3;
	return new Color("srgb-linear", out).to("srgb");
}
const mix = (a: string, b: string, t: number, space: string, hue = "shorter") =>
	Color.mix(a, b, t, { space, hue } as never) as unknown as Color;

describe("305 cvd-simulation, recomputed with colorjs.io", () => {
	it("n305-1", () => {
		const pal: [string, string][] = [
			["brand-red", "#d62828"],
			["brand-orange", "#f77f00"],
			["sunflower", "#fcbf49"],
			["teal", "#2a9d8f"],
			["ink", "#264653"],
			["success", "#2b9348"],
		];
		expect(fails("n305-1", { results: pal.map(([id, h]) => ({ id, hex: hex(sim(h, "protanopia")) })) })).toEqual([]);
	});
	it("n305-2", () => {
		const pairs: [string, string, string][] = [
			["success-vs-error", "#2e7d32", "#c62828"],
			["pending-vs-success", "#fbc02d", "#8bc34a"],
			["link-vs-visited", "#1565c0", "#6a1b9a"],
			["info-vs-neutral", "#1e88e5", "#757575"],
			["draft-vs-error", "#8d6e63", "#e53935"],
			["new-vs-success", "#00897b", "#43a047"],
		];
		const results = pairs.map(([id, a, b]) => {
			const d = de00(sim(a, "deuteranopia"), sim(b, "deuteranopia"));
			return { id, deltaE: Math.round(d * 10) / 10, hardToTell: d < 12 };
		});
		expect(fails("n305-2", { results })).toEqual([]);
	});
	it("n305-3", () => {
		const pairs: [string, string, string][] = [
			["admin-vs-guest-areas", "#7570b3", "#e7298a"],
			["rail-vs-parkland", "#d73027", "#1a9850"],
			["forest-vs-water", "#33a02c", "#1f78b4"],
			["farmland-vs-meadow", "#e6ab02", "#66a61e"],
			["retail-vs-housing", "#fb9a99", "#fdbf6f"],
		];
		const ks: Cvd[] = ["protanopia", "deuteranopia", "tritanopia"];
		const results = pairs.map(([id, a, b]) => {
			const d = ks.map((k) => de00(sim(a, k), sim(b, k)));
			return { id, mostAlikeUnder: ks[d.indexOf(Math.min(...d))] };
		});
		expect(fails("n305-3", { results })).toEqual([]);
	});
	it("n305-4", () => {
		const ref = sim("#00a6ca", "tritanopia");
		const series = ["#3b82f6", "#84cc16", "#0ea5e9", "#6366f1", "#10b981"];
		const order = [...series].sort((x, y) => de00(ref, sim(x, "tritanopia")) - de00(ref, sim(y, "tritanopia")));
		expect(fails("n305-4", { order })).toEqual([]);
	});
	it("n305-5", () => {
		const scale: [string, string][] = [
			["strong-negative", "#d7191c"],
			["negative", "#fdae61"],
			["neutral", "#ffffbf"],
			["positive", "#a6d96a"],
			["strong-positive", "#1a9641"],
		];
		let best: [string, string] = ["", ""];
		let bd = Number.POSITIVE_INFINITY;
		for (let i = 0; i < scale.length; i++)
			for (let j = i + 1; j < scale.length; j++) {
				const d = de00(sim(scale[i]![1], "deuteranopia"), sim(scale[j]![1], "deuteranopia"));
				if (d < bd) {
					bd = d;
					best = [scale[i]![0], scale[j]![0]];
				}
			}
		const simulated = scale.map(([id, h]) => ({ id, hex: hex(sim(h, "deuteranopia")) }));
		expect(fails("n305-5", { simulated, mostConfusable: best })).toEqual([]);
	});
});

describe("306 interpolation, recomputed with colorjs.io", () => {
	it("n306-1", () => {
		const s = [0, 0.25, 0.5, 0.75, 1].map((t) => hex(mix("#0b3c5d", "#f2c14e", t, "oklab")));
		expect(fails("n306-1", { stops: s })).toEqual([]);
	});
	it("n306-2 (and the D50-Lab reading of the tint also passes)", () => {
		const results = [
			{ id: "overlay", hex: hex(mix("#ff3b30", "#007aff", 0.7, "srgb-linear")) },
			{ id: "tint", hex: hex(mix("#7c3aed", "#ffffff", 0.8, "lab-d65")) },
			{ id: "blend", hex: hex(mix("#c026d3", "#f97316", 0.5, "oklch", "shorter")) },
		];
		expect(fails("n306-2", { results })).toEqual([]);
		const d50 = results.map((r) => (r.id === "tint" ? { ...r, hex: hex(mix("#7c3aed", "#ffffff", 0.8, "lab")) } : r));
		expect(fails("n306-2", { results: d50 })).toEqual([]);
	});
	it("n306-3", () => {
		const seg = (p: number) =>
			p <= 0.25 ? mix("#e11d48", "#f59e0b", p / 0.25, "hsl") : mix("#f59e0b", "#0ea5e9", (p - 0.25) / 0.75, "hsl");
		const samples = [10, 40, 75].map((at) => ({ at, hex: hex(seg(at / 100)) }));
		expect(fails("n306-3", { samples })).toEqual([]);
		// Rows are matched by their own position, not by array order.
		expect(fails("n306-3", { samples: [...samples].reverse() })).toEqual([]);
	});
	it("n306-4", () => {
		const s = [0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => hex(mix("#e8590c", "#0c8599", t, "oklch", "longer")));
		expect(fails("n306-4", { stops: s })).toEqual([]);
	});
	it("n306-5 (and the D50-Lab reading also passes)", () => {
		for (const space of ["lab-d65", "lab"]) {
			const frames = [0.2, 0.4, 0.6, 0.8].map((t) => ({ t, hex: hex(mix("#4c1d95", "#bbf7d0", t, space)) }));
			expect(fails("n306-5", { frames }), space).toEqual([]);
			expect(fails("n306-5", { frames: [...frames].reverse().map((f) => ({ ...f, t: f.t.toFixed(2) })) }), space).toEqual([]);
		}
	});
});

describe("307 harmony, recomputed with colorjs.io", () => {
	const hslRot = (h: string, d: number) => {
		const c = new Color(h).to("hsl");
		c.coords[0] = (((c.coords[0] as number) + d) % 360 + 360) % 360;
		return hex(c);
	};
	const okRot = (h: string, d: number) => {
		const c = new Color(h).to("oklch");
		c.coords[2] = (((c.coords[2] as number) + d) % 360 + 360) % 360;
		return hex(c);
	};
	it("n307-1", () => expect(fails("n307-1", { triadic: [hslRot("#2a9d8f", 120), hslRot("#2a9d8f", 240)] })).toEqual([]));
	it("n307-2", () =>
		expect(fails("n307-2", { splitComplementary: [okRot("#15803d", 150), okRot("#15803d", 210)] })).toEqual([]));
	it("n307-3", () => {
		const t = tasks.find((x) => x.id === "n307-3");
		const sets = [...(t?.prompt.matchAll(/- (set-[a-e]): ([#0-9a-f, ]+)\n/g) ?? [])].map((m) => ({
			id: m[1] as string,
			hexes: (m[2] as string).split(", ").map((s) => s.trim()),
		}));
		expect(sets).toHaveLength(5);
		const results = sets.map((s) => {
			const hues = s.hexes.map((h) => new Color(h).to("hsl").coords[0] as number);
			const errs = SCHEMES.map((sc) => schemeError(hues, sc));
			return { id: s.id, scheme: SCHEMES[errs.indexOf(Math.min(...errs))] };
		});
		expect(fails("n307-3", { results })).toEqual([]);
	});
	it("n307-4", () =>
		expect(fails("n307-4", { hslWheel: hslRot("#0f766e", 60), oklchWheel: okRot("#0f766e", 60) })).toEqual([]));
	it("n307-5", () => {
		const mono = [20, 35, 50, 65, 80].map((l) => {
			const c = new Color("#c05621").to("hsl");
			c.coords[2] = l;
			return hex(c);
		});
		expect(fails("n307-5", { monochromatic: mono, analogous: [hslRot("#c05621", -30), hslRot("#c05621", 30)] })).toEqual([]);
	});
});

describe("308 naming-and-text-color, recomputed with colorjs.io", () => {
	const names = Object.keys(CSS_NAMED);
	const nearest = (h: string, dist: (a: Color, b: Color) => number) => {
		const c = new Color(h);
		return names.reduce((best, n) => (dist(c, new Color(n)) < dist(c, new Color(best)) ? n : best));
	};
	it("n308-1", () => {
		const euclid = (a: Color, b: Color) => {
			const x = a.to("srgb").coords as V3;
			const y = b.to("srgb").coords as V3;
			return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
		};
		const results = ["#e03024", "#edac08", "#99acc3", "#cc5500"].map((h) => ({
			id: h,
			euclidean: nearest(h, euclid),
			ciede2000: nearest(h, (a, b) => de00(a, b)),
		}));
		expect(fails("n308-1", { results })).toEqual([]);
		// Shorthand / upper-case hex ids resolve to the same row.
		expect(fails("n308-1", { results: results.map((r) => ({ ...r, id: r.id === "#cc5500" ? "#C50" : r.id.toUpperCase() })) })).toEqual([]);
	});
	it("n308-2", () => {
		const ns = ["rebeccapurple", "darkslategrey", "lightgoldenrodyellow", "papayawhip", "darkorchid", "green", "maroon"];
		expect(fails("n308-2", Object.fromEntries(ns.map((n) => [n, hex(new Color(n))])))).toEqual([]);
	});
	it("n308-3", () => {
		const results = ["#f97316", "#8b5cf6", "#06b6d4", "#7c3aed", "#16a34a"].map((bg) => {
			const b = new Color(bg);
			return {
				id: bg,
				wcag: b.contrast("#000000", "WCAG21") > b.contrast("#ffffff", "WCAG21") ? "black" : "white",
				apca: Math.abs(b.contrast("#000000", "APCA")) > Math.abs(b.contrast("#ffffff", "APCA")) ? "black" : "white",
			};
		});
		expect(fails("n308-3", { results })).toEqual([]);
	});
	it("n308-4", () => {
		const pairs: [string, string, string][] = [
			["card-caption", "#64748b", "#e2e8f0"],
			["search-placeholder", "#9ca3af", "#ffffff"],
			["teal-button-label", "#ffffff", "#14b8a6"],
			["error-message", "#ef4444", "#fef2f2"],
			["warning-chip-label", "#ffffff", "#f59e0b"],
			["body-copy", "#475569", "#ffffff"],
			["link-on-cream", "#a16207", "#fefce8"],
			["badge-text", "#b45309", "#fffbeb"],
		];
		const rs = pairs.map(([id, t, b]) => ({ id, r: new Color(t).contrast(b, "WCAG21") })).filter((x) => x.r < 4.5);
		rs.sort((a, b) => a.r - b.r);
		const worst = rs[0] as { id: string; r: number };
		expect(fails("n308-4", { failing: rs.map((x) => x.id), worst: { id: worst.id, ratio: Math.round(worst.r * 100) / 100 } })).toEqual([]);
	});
	it("n308-5", () => {
		const results = ["teal", "slategray", "royalblue", "seagreen", "crimson", "chocolate"].map((n) => {
			const r = new Color(n).contrast("#ffffff", "WCAG21");
			return { id: n, hex: hex(new Color(n)), ratio: Math.round(r * 100) / 100, passesAA: r >= 4.5 };
		});
		expect(fails("n308-5", { results })).toEqual([]);
	});
});
