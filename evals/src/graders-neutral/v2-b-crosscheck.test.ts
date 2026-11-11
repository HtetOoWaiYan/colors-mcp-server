/**
 * Independent check of every author-B v2 task: recompute the answer with colorjs.io (its own
 * linearization, Lab D65 and D50, Oklab/Oklch, HSL, interpolation, CIEDE2000, WCAG 2.1 and APCA
 * code) and grade it with the task's own registered grader. Inputs are restated here on purpose
 * instead of read from the task, so a typo on either side shows up. Only the Machado matrices, the
 * CSS keyword table and the scheme-matching rule are shared with the reference, because colorjs.io
 * implements none of them. Each test also records the largest deviation from the reference witness.
 */
import Color from "colorjs.io";
import { afterAll, describe, expect, it } from "vitest";
import { type Cvd, MACHADO_1 } from "../reference-neutral/b-cvd.js";
import { SCHEMES, schemeError } from "../reference-neutral/b-harmony.js";
import { CSS_NAMED } from "../reference-neutral/b-naming.js";
import { neutralB } from "../tasks/neutral/cats-neutral-b.js";
import { neutral2B } from "../tasks/neutral/cats-neutral2-b.js";
import { gradeNeutral } from "./index.js";

type V3 = [number, number, number];
const tasks = neutral2B();
const taskOf = (id: string) => {
	const t = tasks.find((x) => x.id === id);
	if (!t) throw new Error(`no task ${id}`);
	return t;
};
const fails = (id: string, answer: unknown) =>
	gradeNeutral(taskOf(id).grader, answer)
		.filter((c) => !c.pass)
		.map((c) => c.name);
const W = (id: string) => taskOf(id).witness as Record<string, unknown>;

// Largest deviation of the colorjs.io answer from the reference witness, per task.
const dev: Record<string, string> = {};
const chan = (a: string, b: string) => {
	const x = new Color(a).to("srgb").coords as V3;
	const y = new Color(b).to("srgb").coords as V3;
	return Math.round(Math.max(...x.map((v, i) => Math.abs(v - (y[i] as number)))) * 255);
};
const maxChan = (a: string[], b: string[]) => Math.max(...a.map((x, i) => chan(x, b[i] as string)));
const maxNum = (a: number[], b: number[]) => Math.max(...a.map((x, i) => Math.abs(x - (b[i] as number))));
afterAll(() => console.log(`colorjs.io max deviations from the reference witness:\n${Object.entries(dev).map(([k, v]) => `  ${k}: ${v}`).join("\n")}`));

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const hex = (c: Color): string =>
	`#${(c.to("srgb").coords as number[]).map((v) => Math.round(clamp(v) * 255).toString(16).padStart(2, "0")).join("")}`;
const labD65 = (c: Color | string) => new Color(c as never).to("lab-d65").coords as V3;
const de00 = (a: Color | string, b: Color | string) => new Color("lab", labD65(a)).deltaE(new Color("lab", labD65(b)), "2000");
const de00D50 = (a: Color | string, b: Color | string) => new Color(a as never).deltaE(new Color(b as never), "2000");
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

function sim(h: string, k: Cvd): Color {
	const lin = new Color(h).to("srgb-linear").coords as V3;
	const out = MACHADO_1[k].map((row) => clamp(row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2])) as V3;
	return new Color("srgb-linear", out).to("srgb");
}
const KS: Cvd[] = ["protanopia", "deuteranopia", "tritanopia"];
const mix = (a: string, b: string, t: number, space: string, hue = "shorter") =>
	Color.mix(a, b, t, { space, hue } as never) as unknown as Color;

describe("305 cvd-simulation v2, recomputed with colorjs.io", () => {
	it("p305-1", () => {
		const lines: [string, string][] = [
			["harbour", "#0086b3"],
			["airport", "#9b26b6"],
			["riverside", "#43b02a"],
			["university", "#ffb81c"],
			["circle", "#e05206"],
			["express", "#5d6770"],
		];
		const ans = lines.map(([id, h]) => ({ id, hex: hex(sim(h, "tritanopia")) }));
		expect(fails("p305-1", { lines: ans })).toEqual([]);
		const w = (W("p305-1").lines as { hex: string }[]).map((x) => x.hex);
		dev["p305-1"] = `${maxChan(ans.map((x) => x.hex), w)} / 255 per channel`;
	});
	it("p305-2", () => {
		const pal: [string, string][] = [
			["blue", "#4e79a7"],
			["orange", "#f28e2b"],
			["red", "#e15759"],
			["green", "#59a14f"],
			["brown", "#9c755f"],
			["purple", "#b07aa1"],
		];
		const pairs: [string, string][] = [];
		for (let i = 0; i < pal.length; i++)
			for (let j = i + 1; j < pal.length; j++)
				if (de00(sim(pal[i]![1], "protanopia"), sim(pal[j]![1], "protanopia")) < 10) pairs.push([pal[j]![0], pal[i]![0]]);
		expect(fails("p305-2", { confusablePairs: pairs })).toEqual([]);
		dev["p305-2"] = "same pair set";
	});
	it("p305-3", () => {
		const pairs: [string, string, string][] = [
			["confirm-vs-cancel", "#2f9e44", "#e03131"],
			["ripe-vs-unripe", "#fab005", "#82c91e"],
			["focus-vs-meeting", "#12b886", "#4c6ef5"],
		];
		const results = pairs.map(([id, a, b]) => {
			const d = KS.map((k) => de00(sim(a, k), sim(b, k)));
			return { id, protanopia: r1(d[0]!), deuteranopia: r1(d[1]!), tritanopia: r1(d[2]!), worst: KS[d.indexOf(Math.min(...d))] };
		});
		expect(fails("p305-3", { results })).toEqual([]);
		const w = W("p305-3").results as Record<string, number>[];
		dev["p305-3"] = `${maxNum(
			results.flatMap((r) => [r.protanopia, r.deuteranopia, r.tritanopia]),
			w.flatMap((r) => [r.protanopia as number, r.deuteranopia as number, r.tritanopia as number]),
		).toFixed(2)} ΔE00 (after one-decimal rounding)`;
	});
	it("p305-4", () => {
		const ref = sim("#2b8a3e", "protanopia");
		const cands = ["#ec5f13", "#c2255c", "#f08c00", "#7048e8", "#1098ad", "#868e96"];
		const ranking = [...cands].sort((x, y) => de00(ref, sim(y, "protanopia")) - de00(ref, sim(x, "protanopia")));
		expect(fails("p305-4", { ranking })).toEqual([]);
		dev["p305-4"] = "same ranking";
	});
	it("p305-5", () => {
		const water = "#74c0fc";
		const cands = ["#ff6b6b", "#ffd43b", "#e64980", "#40c057", "#fd7e14", "#7950f2", "#be4bdb"];
		const worst = cands.map((h) => Math.min(...KS.map((k) => de00(sim(water, k), sim(h, k)))));
		const bi = worst.indexOf(Math.max(...worst));
		const ans = { best: cands[bi], bestWorstCase: r1(worst[bi]!), weakest: cands[worst.indexOf(Math.min(...worst))] };
		expect(fails("p305-5", ans)).toEqual([]);
		dev["p305-5"] = `${Math.abs(ans.bestWorstCase - (W("p305-5").bestWorstCase as number)).toFixed(2)} ΔE00`;
	});
});

describe("306 interpolation v2, recomputed with colorjs.io", () => {
	it("p306-1", () => {
		const s = [0, 0.25, 0.5, 0.75, 1].map((t) => hex(mix("#ffd60a", "#3a0ca3", t, "srgb-linear")));
		expect(fails("p306-1", { swatches: s })).toEqual([]);
		dev["p306-1"] = `${maxChan(s, W("p306-1").swatches as string[])} / 255`;
	});
	it("p306-2", () => {
		const tokens = [
			{ id: "pressed", hex: hex(mix("#1971c2", "#000000", 0.25, "oklab")) },
			{ id: "accent", hex: hex(mix("#2f9e44", "#f03e3e", 0.6, "oklch", "increasing")) },
			{ id: "hover-warm", hex: hex(mix("#e64980", "#fab005", 0.65, "hsl", "shorter")) },
		];
		expect(fails("p306-2", { tokens })).toEqual([]);
		dev["p306-2"] = `${maxChan(tokens.map((t) => t.hex), (W("p306-2").tokens as { hex: string }[]).map((t) => t.hex))} / 255`;
	});
	it("p306-3", () => {
		const seg = (p: number) =>
			p <= 0.7 ? mix("#14213d", "#e76f51", p / 0.7, "oklab") : mix("#e76f51", "#fefae0", (p - 0.7) / 0.3, "oklab");
		const samples = [20, 50, 80, 90].map((at) => ({ at, hex: hex(seg(at / 100)) }));
		expect(fails("p306-3", { samples })).toEqual([]);
		expect(fails("p306-3", { samples: [...samples].reverse() })).toEqual([]);
		dev["p306-3"] = `${maxChan(samples.map((s) => s.hex), (W("p306-3").samples as { hex: string }[]).map((s) => s.hex))} / 255`;
	});
	it("p306-4", () => {
		const ts = [0, 0.25, 0.5, 0.75, 1];
		const longer = ts.map((t) => hex(mix("#c92a2a", "#1c7ed6", t, "hsl", "longer")));
		const shorter = ts.map((t) => hex(mix("#c92a2a", "#1c7ed6", t, "hsl", "shorter")));
		expect(fails("p306-4", { longer, shorter })).toEqual([]);
		dev["p306-4"] = `${Math.max(maxChan(longer, W("p306-4").longer as string[]), maxChan(shorter, W("p306-4").shorter as string[]))} / 255`;
	});
	it("p306-5 (and the D50-Lab reading of the lab midpoint also passes)", () => {
		const a = "#0f4c5c";
		const b = "#fb8b24";
		const ans = {
			srgb: hex(mix(a, b, 0.5, "srgb")),
			linear: hex(mix(a, b, 0.5, "srgb-linear")),
			lab: hex(mix(a, b, 0.5, "lab-d65")),
			oklab: hex(mix(a, b, 0.5, "oklab")),
			oklch: hex(mix(a, b, 0.5, "oklch", "shorter")),
		};
		expect(fails("p306-5", ans)).toEqual([]);
		const d50 = { ...ans, lab: hex(mix(a, b, 0.5, "lab")) };
		expect(fails("p306-5", d50)).toEqual([]);
		const w = W("p306-5") as Record<string, string>;
		dev["p306-5"] = `${maxChan(Object.values(ans), Object.keys(ans).map((k) => w[k] as string))} / 255; D50-Lab midpoint ${chan(d50.lab, w.lab as string)} / 255`;
	});
});

describe("307 harmony v2, recomputed with colorjs.io", () => {
	const hslRot = (h: string, d: number) => {
		const c = new Color(h).to("hsl");
		c.coords[0] = ((((c.coords[0] as number) + d) % 360) + 360) % 360;
		return hex(c);
	};
	const okRot = (h: string, d: number) => {
		const c = new Color(h).to("oklch");
		c.coords[2] = ((((c.coords[2] as number) + d) % 360) + 360) % 360;
		return hex(c);
	};
	it("p307-1", () => {
		const square = [90, 180, 270].map((d) => okRot("#b17c4c", d));
		expect(fails("p307-1", { square })).toEqual([]);
		dev["p307-1"] = `${maxChan(square, W("p307-1").square as string[])} / 255`;
	});
	it("p307-2", () => {
		const bases: [string, string][] = [
			["harbor-blue", "#1e6091"],
			["violet", "#9d4edd"],
			["wine", "#7a1f3d"],
			["apricot", "#f4a259"],
		];
		const accents = bases.map(([id, h]) => ({ id, hex: hslRot(h, 180) }));
		expect(fails("p307-2", { accents })).toEqual([]);
		dev["p307-2"] = `${maxChan(accents.map((x) => x.hex), (W("p307-2").accents as { hex: string }[]).map((x) => x.hex))} / 255`;
	});
	it("p307-3", () => {
		const t = taskOf("p307-3");
		const sets = [...t.prompt.matchAll(/- (set-[a-g]): ([#0-9a-f, ]+)\n/g)].map((m) => ({
			id: m[1] as string,
			hexes: (m[2] as string).split(", ").map((s) => s.trim()),
		}));
		expect(sets).toHaveLength(7);
		const results = sets.map((s) => {
			const hues = s.hexes.map((h) => new Color(h).to("oklch").coords[2] as number);
			const fits = SCHEMES.filter((sc) => schemeError(hues, sc) <= 5);
			return { id: s.id, scheme: fits.length === 1 ? fits[0] : "none" };
		});
		expect(fails("p307-3", { results })).toEqual([]);
		dev["p307-3"] = "same labels";
	});
	it("p307-4", () => {
		const ans = { hslWheel: [120, 240].map((d) => hslRot("#3f7cac", d)), oklchWheel: [120, 240].map((d) => okRot("#3f7cac", d)) };
		expect(fails("p307-4", ans)).toEqual([]);
		const w = W("p307-4");
		dev["p307-4"] = `${Math.max(maxChan(ans.hslWheel, w.hslWheel as string[]), maxChan(ans.oklchWheel, w.oklchWheel as string[]))} / 255`;
	});
	it("p307-5", () => {
		const steps = [0.35, 0.5, 0.65, 0.8].map((l) => {
			const c = new Color("#905b93").to("oklch");
			c.coords[0] = l;
			return hex(c);
		});
		const ans = { steps, analogous: [-30, 30].map((d) => okRot("#905b93", d)) };
		expect(fails("p307-5", ans)).toEqual([]);
		const w = W("p307-5");
		dev["p307-5"] = `${Math.max(maxChan(ans.steps, w.steps as string[]), maxChan(ans.analogous, w.analogous as string[]))} / 255`;
	});
});

describe("308 naming-and-text-color v2, recomputed with colorjs.io", () => {
	const names = Object.keys(CSS_NAMED);
	const nearest = (h: string, dist: (a: Color, b: Color) => number) => {
		const c = new Color(h);
		let best = names[0] as string;
		let bd = Number.POSITIVE_INFINITY;
		for (const n of names) {
			const d = dist(c, new Color(n));
			if (d < bd) {
				bd = d;
				best = n;
			}
		}
		return { name: best, d: bd };
	};
	it("p308-1 (D65 as stated, and the D50-adapted reading also passes)", () => {
		const inputs = ["#5a7d9a", "#d3d0cb", "#647080", "#e020e6", "#c0392b"];
		const d65 = inputs.map((h) => {
			const n = nearest(h, (a, b) => de00(a, b));
			return { id: h, name: n.name, deltaE: r2(n.d) };
		});
		const d50 = inputs.map((h) => {
			const n = nearest(h, (a, b) => de00D50(a, b));
			return { id: h, name: n.name, deltaE: r2(n.d) };
		});
		expect(fails("p308-1", { names: d65 })).toEqual([]);
		expect(fails("p308-1", { names: d50 })).toEqual([]);
		const w = (W("p308-1").names as { deltaE: number }[]).map((x) => x.deltaE);
		dev["p308-1"] = `D65 ${maxNum(d65.map((x) => x.deltaE), w).toFixed(3)} ΔE00; D50-adapted ${maxNum(d50.map((x) => x.deltaE), w).toFixed(3)} ΔE00`;
	});
	it("p308-2", () => {
		const ns = ["rebeccapurple", "lightslategrey", "darkgoldenrod", "mediumvioletred", "gray", "purple", "peachpuff", "olivedrab"];
		expect(fails("p308-2", Object.fromEntries(ns.map((n) => [n, hex(new Color(n))])))).toEqual([]);
		dev["p308-2"] = "exact (CSS keyword values identical)";
	});
	it("p308-3", () => {
		const bars = ["#f76707", "#1098ad", "#c2255c", "#fab005", "#5c940d"].map((bg) => {
			const b = new Color(bg);
			const lb = b.contrast("#000000", "APCA");
			const lw = b.contrast("#ffffff", "APCA");
			const apca = Math.abs(lb) > Math.abs(lw) ? "black" : "white";
			return {
				id: bg,
				wcag: b.contrast("#000000", "WCAG21") > b.contrast("#ffffff", "WCAG21") ? "black" : "white",
				apca,
				lc: r1(apca === "black" ? lb : lw),
			};
		});
		expect(fails("p308-3", { bars })).toEqual([]);
		dev["p308-3"] = `${maxNum(bars.map((b) => b.lc), (W("p308-3").bars as { lc: number }[]).map((b) => b.lc)).toFixed(2)} Lc`;
	});
	it("p308-4", () => {
		const pairs: [string, string, string][] = [
			["sidebar-caption", "#6c6f7d", "#f6f4ef"],
			["primary-button", "#ffffff", "#3d7dd8"],
			["night-mode-meta", "#a7a9be", "#232946"],
			["success-toast", "#ffffff", "#2cb67d"],
			["footer-legal", "#8d99ae", "#2b2d42"],
			["tag-on-blush", "#9a8c98", "#f2e9e4"],
			["warning-link", "#c2410c", "#fff7ed"],
			["tooltip-text", "#e3e0d8", "#5a5a66"],
		];
		const rs = pairs.map(([id, t, b]) => ({ id, lc: Math.abs(new Color(b).contrast(t, "APCA")) })).filter((x) => x.lc < 60);
		rs.sort((a, b) => a.lc - b.lc);
		const worst = rs[0] as { id: string; lc: number };
		const ans = { belowBar: rs.map((x) => x.id), weakest: { id: worst.id, absLc: r1(worst.lc) } };
		expect(fails("p308-4", ans)).toEqual([]);
		dev["p308-4"] = `${Math.abs(ans.weakest.absLc - ((W("p308-4").weakest as { absLc: number }).absLc)).toFixed(2)} Lc`;
	});
	it("p308-5", () => {
		const euclid = (a: Color, b: Color) => {
			const x = a.to("srgb").coords as V3;
			const y = b.to("srgb").coords as V3;
			return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
		};
		const labels = ["#6495ed", "#00ff00", "#ff00ff", "#edae49", "#30638e", "#f2e8cf"].map((h) => {
			const n = nearest(h, euclid);
			return { id: h.toUpperCase(), name: n.name, exact: n.d < 1e-9 };
		});
		expect(fails("p308-5", { labels })).toEqual([]);
		dev["p308-5"] = "same names and exact flags";
	});
});

describe("v2 freshness against v1", () => {
	const hexesIn = (s: string) => [...s.matchAll(/#[0-9a-f]{6}\b/gi)].map((m) => m[0].toLowerCase());
	it("no hex shown in a v1 author-B prompt or witness is an input of a v2 prompt (black and white aside)", () => {
		const v1Hex = new Set(neutralB().flatMap((t) => [...hexesIn(t.prompt), ...hexesIn(JSON.stringify(t.witness))]));
		const v2Hex = new Set(tasks.flatMap((t) => hexesIn(t.prompt)));
		const reused = [...v2Hex].filter((h) => v1Hex.has(h) && h !== "#000000" && h !== "#ffffff");
		expect(reused).toEqual([]);
	});
	it("no v2 prompt repeats a sentence of a v1 author-B prompt", () => {
		const sentences = (s: string) => s.split(/(?<=[.:?!])\s+|\n+/).map((x) => x.trim()).filter((x) => x.length > 40);
		const v1 = new Set(neutralB().flatMap((t) => sentences(t.prompt)));
		const shared = tasks.flatMap((t) => sentences(t.prompt).filter((x) => v1.has(x) && !x.startsWith("Reply with JSON only") && !x.includes("#rrggbb")).map((x) => `${t.id}: ${x}`));
		expect(shared).toEqual([]);
	});
});
