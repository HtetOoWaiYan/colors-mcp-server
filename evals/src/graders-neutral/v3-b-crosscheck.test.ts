/**
 * Independent check of every author-B v3 task: recompute the answer with colorjs.io (its own sRGB
 * linearization, Lab D65 and D50, Oklab/Oklch, HSL, interpolation, CIEDE2000, WCAG 2.1 and APCA
 * code) and grade it with the task's own registered grader. Inputs are restated here on purpose
 * instead of read from the task, so a typo on either side shows up; colors that the prompt derives
 * from a reference (simulated colors, stored mix results, generated swatches) are restated as the
 * prompt shows them and regenerated with colorjs.io where it can. Only the Machado matrices, the
 * CSS keyword table and the scheme-matching rule are shared with the reference, because colorjs.io
 * implements none of them. Each test records the largest deviation from the reference witness.
 */
import Color from "colorjs.io";
import { afterAll, describe, expect, it } from "vitest";
import { type Cvd, MACHADO_1 } from "../reference-neutral/b-cvd.js";
import { SCHEMES, schemeError } from "../reference-neutral/b-harmony.js";
import { CSS_NAMED } from "../reference-neutral/b-naming.js";
import { buildAllNeutral } from "../tasks/neutral/build-neutral.js";
import { buildAllNeutral2 } from "../tasks/neutral/build-neutral2.js";
import { neutral3A } from "../tasks/neutral/cats-neutral3-a.js";
import { neutral3B } from "../tasks/neutral/cats-neutral3-b.js";
import { gradeNeutral } from "./index.js";

type V3 = [number, number, number];
const tasks = neutral3B();
const taskOf = (id: string) => {
	const t = tasks.find((x) => x.id === id);
	if (!t) throw new Error(`no task ${id}`);
	return t;
};
const fails = (id: string, answer: unknown) =>
	gradeNeutral(taskOf(id).grader, answer)
		.filter((c) => !c.pass)
		.map((c) => c.name);
// biome-ignore lint/suspicious/noExplicitAny: witnesses are per-task JSON
const W = (id: string) => taskOf(id).witness as any;

const dev: Record<string, string> = {};
afterAll(() =>
	console.log(`colorjs.io max deviations from the v3 author-B reference witness:\n${Object.entries(dev).map(([k, v]) => `  ${k}: ${v}`).join("\n")}`),
);

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const hex = (c: Color): string =>
	`#${(c.to("srgb").coords as number[]).map((v) => Math.round(clamp(v) * 255).toString(16).padStart(2, "0")).join("")}`;
const rgb255 = (h: string) => (new Color(h).to("srgb").coords as V3).map((v) => v * 255) as V3;
const chan = (a: string, b: string) => {
	const x = rgb255(a);
	const y = rgb255(b);
	return Math.round(Math.max(...x.map((v, i) => Math.abs(v - (y[i] as number)))));
};
const maxChan = (a: string[], b: string[]) => Math.max(...a.map((x, i) => chan(x, b[i] as string)));
const maxNum = (a: number[], b: number[]) => Math.max(...a.map((x, i) => Math.abs(x - (b[i] as number))));
const labD65 = (c: Color | string) => new Color(c as never).to("lab-d65").coords as V3;
const de00 = (a: Color | string, b: Color | string) => new Color("lab", labD65(a)).deltaE(new Color("lab", labD65(b)), "2000");
const de00D50 = (a: Color | string, b: Color | string) => new Color(a as never).deltaE(new Color(b as never), "2000");
const r1 = (v: number) => Math.round(v * 10) / 10;
const n360 = (h: number) => ((h % 360) + 360) % 360;
const hueGap = (a: number, b: number) => Math.min(n360(a - b), 360 - n360(a - b));

function sim(h: string, k: Cvd): Color {
	const lin = new Color(h).to("srgb-linear").coords as V3;
	const out = MACHADO_1[k].map((row) => clamp(row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2])) as V3;
	return new Color("srgb-linear", out).to("srgb");
}
const KS: Cvd[] = ["protanopia", "deuteranopia", "tritanopia"];
const mix = (a: string, b: string, t: number, space: string, hue = "shorter") =>
	Color.mix(a, b, t, { space, hue } as never) as unknown as Color;

describe("305 cvd-simulation v3, recomputed with colorjs.io", () => {
	it("q305-1", () => {
		const wings: [string, string][] = [
			["east", "#c4513a"],
			["north", "#1f7a8c"],
			["west", "#e2b33c"],
			["south", "#6d4e9e"],
		];
		const ans = wings.map(([id, h]) => ({ id, protanopia: hex(sim(h, "protanopia")), deuteranopia: hex(sim(h, "deuteranopia")), tritanopia: hex(sim(h, "tritanopia")) }));
		expect(fails("q305-1", { wings: ans })).toEqual([]);
		const w = W("q305-1").wings as Record<string, string>[];
		dev["q305-1"] = `${Math.max(...KS.map((k) => maxChan(ans.map((x) => x[k] as string), w.map((x) => x[k] as string))))} / 255 per channel`;
	});
	it("q305-2 (D65 as stated; the D50-adapted reading also passes)", () => {
		const park = "#7a9e3b";
		const markers: [string, string][] = [
			["cafe", "#cb5a3c"],
			["toilets", "#dd9c41"],
			["parking", "#3e5c86"],
			["playground", "#9a6a55"],
			["first-aid", "#b26478"],
			["picnic", "#f3dca6"],
			["boat-hire", "#529a6c"],
			["info", "#8b7bbd"],
		];
		for (const dist of [de00, de00D50]) {
			const d = markers.map(([id, h]) => ({ id, d: dist(sim(park, "deuteranopia"), sim(h, "deuteranopia")) }));
			const ans = { lost: d.filter((x) => x.d < 16).map((x) => x.id), closest: [...d].sort((a, b) => a.d - b.d)[0]?.id };
			expect(fails("q305-2", ans)).toEqual([]);
		}
		dev["q305-2"] = "same lost set and closest marker (D65 and D50)";
	});
	it("q305-3 (the shown colors are what colorjs.io's linearization produces)", () => {
		const shots: [string, string, string][] = [
			["shot-1", "#e8743b", "#948534"],
			["shot-2", "#a83279", "#646976"],
			["shot-3", "#5f8f2a", "#61897b"],
			["shot-4", "#ff6f61", "#b8a85e"],
			["shot-5", "#d8572a", "#7c6e23"],
			["shot-6", "#8a5cc2", "#806f86"],
		];
		let worst = 0;
		const results = shots.map(([id, orig, shown]) => {
			const gaps = KS.map((k) => chan(hex(sim(orig, k)), shown));
			worst = Math.max(worst, Math.min(...gaps));
			return { id, deficiency: KS[gaps.indexOf(Math.min(...gaps))] };
		});
		expect(worst).toBeLessThanOrEqual(1);
		expect(fails("q305-3", { results })).toEqual([]);
		dev["q305-3"] = `same deficiencies; shown colors reproduced within ${worst} / 255`;
	});
	it("q305-4", () => {
		const colors = ["#5d5fcb", "#4bbde0", "#e93a8b", "#f9bd14", "#3b5b42", "#f5814f", "#7fb21c"];
		const shift = (h: string) => de00(h, sim(h, "tritanopia"));
		const ranking = [...colors].sort((a, b) => shift(b) - shift(a));
		const ans = { ranking, largestChange: r1(shift(ranking[0] as string)) };
		expect(fails("q305-4", ans)).toEqual([]);
		dev["q305-4"] = `same ranking; largest change ${Math.abs(ans.largestChange - W("q305-4").largestChange).toFixed(2)} ΔE00`;
	});
	it("q305-5", () => {
		const pairs: [string, string, string][] = [
			["otters-vs-herons", "#2b5f9e", "#b03a6e"],
			["lynx-vs-moths", "#71b340", "#61b2a7"],
			["bees-vs-foxes", "#e3c565", "#f2a541"],
			["crows-vs-hares", "#6e9f3a", "#d9734e"],
			["owls-vs-newts", "#3f7d5a", "#a4c2e8"],
		];
		const matchups = pairs.map(([id, a, b]) => {
			const d = KS.map((k) => de00(sim(a, k), sim(b, k)));
			return { id, safeUnder: KS.filter((_, i) => (d[i] as number) >= 20), weakest: KS[d.indexOf(Math.min(...d))] };
		});
		expect(fails("q305-5", { matchups })).toEqual([]);
		dev["q305-5"] = "same safe sets and weakest deficiencies";
	});
});

describe("306 interpolation v3, recomputed with colorjs.io", () => {
	it("q306-1", () => {
		const classes = [0, 1, 2, 3, 4, 5].map((i) => hex(mix("#3b1c5a", "#f6d743", i / 5, "oklch", "shorter")));
		expect(fails("q306-1", { classes })).toEqual([]);
		dev["q306-1"] = `${maxChan(classes, W("q306-1").classes)} / 255`;
	});
	it("q306-2 (and the D50-Lab reading of the dusk mix also lands on the same P)", () => {
		const share = (a: string, b: string, r: string, space: string) => {
			const A = new Color(a).to(space).coords as V3;
			const B = new Color(b).to(space).coords as V3;
			const R = new Color(r).to(space).coords as V3;
			let num = 0;
			let den = 0;
			for (let i = 0; i < 3; i++) {
				const d = (A[i] as number) - (B[i] as number);
				num += ((R[i] as number) - (B[i] as number)) * d;
				den += d * d;
			}
			return (100 * num) / den;
		};
		const rows: [string, string, string, string, string][] = [
			["shade-berry", "#c8417a", "#000000", "oklab", "#571732"],
			["shade-amber", "#d6862b", "#000000", "srgb", "#603c13"],
			["blush", "#b0303f", "#f7e9d7", "srgb-linear", "#d09e95"],
			["dusk", "#20639b", "#ed553b", "lab-d65", "#b35f63"],
		];
		// The stored results are what colorjs.io's own mix produces at the witness percentage.
		const w = W("q306-2").mixes as { id: string; percentFirst: number }[];
		rows.forEach(([id, a, b, sp, r], i) => {
			const p = w[i]?.percentFirst as number;
			expect(chan(hex(mix(a, b, 1 - p / 100, sp)), r), id).toBeLessThanOrEqual(1);
		});
		const raw = rows.map(([id, a, b, sp, r]) => ({ id, p: share(a, b, r, sp) }));
		const mixes = raw.map((x) => ({ id: x.id, percentFirst: Math.round(x.p) }));
		expect(fails("q306-2", { mixes })).toEqual([]);
		const d50 = Math.round(share("#20639b", "#ed553b", "#b35f63", "lab"));
		expect(fails("q306-2", { mixes: mixes.map((m) => (m.id === "dusk" ? { ...m, percentFirst: d50 } : m)) })).toEqual([]);
		dev["q306-2"] = `${maxNum(raw.map((x) => x.p), w.map((x) => x.percentFirst)).toFixed(2)} percentage points before rounding; D50 dusk reading ${d50}`;
	});
	it("q306-3 (D65 as stated; the D50 Lab reading, which the prompt rules out, is recorded)", () => {
		const seg = (p: number, sp: string) => (p <= 0.4 ? mix("#2b2f9e", "#e86a33", p / 0.4, sp) : mix("#e86a33", "#fbf6e4", (p - 0.4) / 0.6, sp));
		const at = [10, 25, 55, 70, 90];
		const keys = at.map((a) => ({ at: a, hex: hex(seg(a / 100, "lab-d65")) }));
		const d50 = at.map((a) => ({ at: a, hex: hex(seg(a / 100, "lab")) }));
		expect(fails("q306-3", { keys })).toEqual([]);
		const w = (W("q306-3").keys as { hex: string }[]).map((x) => x.hex);
		dev["q306-3"] = `${maxChan(keys.map((k) => k.hex), w)} / 255; the excluded D50 Lab reading is off by up to ${maxChan(d50.map((k) => k.hex), w)} / 255 and fails ${fails("q306-3", { keys: d50 }).join(", ") || "nothing"}`;
	});
	it("q306-4", () => {
		const frames = [25, 50, 75].map((at) => {
			const m = mix("#3a8f6b", "#a05cc0", at / 100, "oklch", "longer");
			return { at, hex: hex(m), hue: n360(m.to("oklch").coords[2] as number) };
		});
		const h0 = new Color("#3a8f6b").to("oklch").coords[2] as number;
		const step = n360((frames[0]?.hue as number) - h0);
		const ans = { direction: step > 180 ? "decreasing" : "increasing", keyframes: frames };
		expect(fails("q306-4", ans)).toEqual([]);
		const w = W("q306-4").keyframes as { hex: string; hue: number }[];
		dev["q306-4"] = `${maxChan(frames.map((f) => f.hex), w.map((x) => x.hex))} / 255; hue ${Math.max(...frames.map((f, i) => hueGap(f.hue, w[i]?.hue as number))).toFixed(2)}°`;
	});
	it("q306-5", () => {
		const prog = (p: number) => p ** (Math.log(0.5) / Math.log(0.3));
		const samples = [15, 30, 60, 85].map((at) => ({ at, hex: hex(mix("#0b3954", "#ffd166", prog(at / 100), "oklab")) }));
		expect(fails("q306-5", { samples })).toEqual([]);
		dev["q306-5"] = `${maxChan(samples.map((s) => s.hex), (W("q306-5").samples as { hex: string }[]).map((s) => s.hex))} / 255`;
	});
});

describe("307 harmony v3, recomputed with colorjs.io", () => {
	const hslRot = (h: string, d: number) => {
		const c = new Color(h).to("hsl");
		c.coords[0] = n360((c.coords[0] as number) + d);
		return hex(c);
	};
	const okRot = (h: string, d: number) => {
		const c = new Color(h).to("oklch");
		c.coords[2] = n360((c.coords[2] as number) + d);
		return hex(c);
	};
	const okHue = (h: string) => new Color(h).to("oklch").coords[2] as number;
	const hslHue = (h: string) => new Color(h).to("hsl").coords[0] as number;
	it("q307-1", () => {
		const ans = { spice: [60, 180, 240].map((d) => hslRot("#d98a2b", d)), seaSalt: [150, 210].map((d) => hslRot("#2a7fb8", d)) };
		expect(fails("q307-1", ans)).toEqual([]);
		const w = W("q307-1");
		dev["q307-1"] = `${Math.max(maxChan(ans.spice, w.spice), maxChan(ans.seaSalt, w.seaSalt))} / 255`;
	});
	it("q307-2 (and the swatches are where colorjs.io's Oklch puts the construction)", () => {
		const base = "#c15f4d";
		const sw: [string, string, number, number, number][] = [
			["leaf", "#93aa4f", 0.7, 0.12, 89],
			["lagoon", "#0a7e9c", 0.55, 0.1, 190.5],
			["iris", "#7d479c", 0.5, 0.14, 279.5],
		];
		expect(chan(hex(new Color("oklch", [0.6, 0.13, 32])), base)).toBeLessThanOrEqual(1);
		for (const [, h, L, C, t] of sw) expect(chan(hex(new Color("oklch", [L, C, 32 + t])), h)).toBeLessThanOrEqual(1);
		const offsets = sw.map(([id, h]) => ({ id, offset: r1(n360(okHue(h) - okHue(base))) }));
		const offScheme = offsets.filter((o, i) => Math.abs(o.offset - 90 * (i + 1)) > 5).map((o) => o.id);
		expect(fails("q307-2", { offsets, offScheme })).toEqual([]);
		dev["q307-2"] = `${maxNum(offsets.map((o) => o.offset), (W("q307-2").offsets as { offset: number }[]).map((o) => o.offset)).toFixed(2)}°`;
	});
	it("q307-3", () => {
		const decks: [string, string[]][] = [
			["deck-a", ["#30a687", "#d9a926", "#b254d4"]],
			["deck-b", ["#b4689f", "#288f5e", "#6aa4da", "#be8441"]],
			["deck-c", ["#33cc66", "#28bda4", "#62cb4d"]],
			["deck-d", ["#bb9133", "#5d83d4"]],
			["deck-e", ["#838f2e", "#7896dd", "#9e5fa0"]],
		];
		const read = (hues: number[]) => {
			const fits = SCHEMES.filter((s) => schemeError(hues, s) <= 5);
			return fits.length === 1 ? (fits[0] as string) : "none";
		};
		const ans = decks.map(([id, hs]) => ({ id, hsl: read(hs.map(hslHue)), oklch: read(hs.map(okHue)) }));
		expect(fails("q307-3", { decks: ans })).toEqual([]);
		dev["q307-3"] = "same readings on both wheels";
	});
	it("q307-4", () => {
		const base = "#4e8f3a";
		const ok = okRot(base, 210);
		const hs = hslRot(base, 210);
		const ans = { oklch: { hex: ok, hue: n360(okHue(base) + 210) }, hsl: { hex: hs, hue: n360(hslHue(base) + 210) } };
		expect(fails("q307-4", ans)).toEqual([]);
		const w = W("q307-4");
		dev["q307-4"] = `${Math.max(chan(ok, w.oklch.hex), chan(hs, w.hsl.hex))} / 255; hue values ${Math.max(Math.abs(ans.oklch.hue - w.oklch.hue), Math.abs(ans.hsl.hue - w.hsl.hue)).toFixed(2)}°`;
	});
	it("q307-5", () => {
		// A solver's view: take the given swatches' shared coordinates (mean) and the one free scheme position.
		const complete = (given: string[], space: "oklch" | "hsl", offs: number[]) => {
			const cs = given.map((h) => new Color(h).to(space).coords as V3);
			const hi = space === "oklch" ? 2 : 0;
			const hues = cs.map((c) => c[hi]);
			for (const b of hues) {
				const expected = offs.map((o) => n360(b + o));
				const unfilled = expected.filter((e) => !hues.some((h) => hueGap(h, e) <= 5));
				if (unfilled.length === 1) {
					const mean = (i: number) => cs.reduce((s, c) => s + (c[i] as number), 0) / cs.length;
					const coords = space === "oklch" ? [mean(0), mean(1), unfilled[0]] : [unfilled[0], mean(1), mean(2)];
					return hex(new Color(space, coords as V3));
				}
			}
			throw new Error("no completion");
		};
		const ans = {
			terrazzo: complete(["#939d51", "#9a89cc", "#cc7c76"], "oklch", [0, 90, 180, 270]),
			majolica: complete(["#6ec841", "#9b41c8", "#c89b41"], "hsl", [0, 60, 180, 240]),
		};
		expect(fails("q307-5", ans)).toEqual([]);
		const w = W("q307-5");
		dev["q307-5"] = `${Math.max(chan(ans.terrazzo, w.terrazzo), chan(ans.majolica, w.majolica))} / 255`;
	});
});

describe("308 naming-and-text-color v3, recomputed with colorjs.io", () => {
	const names = Object.keys(CSS_NAMED);
	it("q308-1 (D65 as stated; the D50-adapted reading also passes)", () => {
		const chips = ["#de86d7", "#ff766b", "#722d92"];
		const answer = (dist: (a: string, b: string) => number) => ({
			chips: chips.map((h) => {
				const d = names.map((n) => ({ n, d: dist(h, CSS_NAMED[n] as string) })).sort((a, b) => a.d - b.d);
				return { id: h, within: d.filter((x) => x.d < 8).map((x) => x.n), closest: d[0]?.n };
			}),
		});
		expect(fails("q308-1", answer(de00))).toEqual([]);
		expect(fails("q308-1", answer(de00D50))).toEqual([]);
		dev["q308-1"] = "same keyword sets and closest keywords (D65 and D50)";
	});
	it("q308-2", () => {
		const ns = ["lightseagreen", "rebeccapurple", "darkkhaki", "steelblue", "dimgrey", "palevioletred", "lightsteelblue"];
		const keywords = ns.map((n) => {
			const c = new Color(n);
			return { id: n, hex: hex(c), luminance: Math.round(c.luminance * 1000) / 1000 };
		});
		const darkToLight = [...ns].sort((a, b) => new Color(a).luminance - new Color(b).luminance);
		expect(fails("q308-2", { keywords, darkToLight })).toEqual([]);
		dev["q308-2"] = `exact hex; luminance ${maxNum(keywords.map((k) => k.luminance), (W("q308-2").keywords as { luminance: number }[]).map((k) => k.luminance)).toFixed(4)}`;
	});
	it("q308-3", () => {
		const ramp = ["#a6ecf4", "#8dd2da", "#7abec6", "#5b9fa7", "#4e939a", "#286f76", "#115d65"];
		ramp.forEach((h, i) => expect(chan(hex(new Color("oklch", [[0.9, 0.82, 0.76, 0.66, 0.62, 0.5, 0.44][i] as number, 0.07, 205])), h)).toBeLessThanOrEqual(1));
		const pick = (rule: "WCAG21" | "APCA") =>
			ramp.map((bg) => {
				const b = new Color(bg);
				return Math.abs(b.contrast("#000000", rule)) > Math.abs(b.contrast("#ffffff", rule)) ? "black" : "white";
			});
		const block = (labels: string[]) => ({ labels, firstWhiteStep: labels.indexOf("white") + 1 });
		expect(fails("q308-3", { wcag: block(pick("WCAG21")), apca: block(pick("APCA")) })).toEqual([]);
		dev["q308-3"] = "same picks and flip steps";
	});
	it("q308-4", () => {
		const pairs: [string, string, string][] = [
			["toggle-track", "#97a3b0", "#f3f5f7"],
			["divider-dark", "#454b57", "#1a1d23"],
			["icon-dark", "#7f8899", "#1a1d23"],
			["badge-outline", "#e48a45", "#fff7ef"],
			["focus-ring", "#3d7be0", "#ffffff"],
			["check-mark", "#2e9a5a", "#ffffff"],
			["chip-border", "#a08cd0", "#faf8ff"],
			["slider-thumb", "#5a68bd", "#e8eaf6"],
		];
		const rs = pairs.map(([id, f, b]) => ({ id, r: new Color(f).contrast(b, "WCAG21") })).filter((x) => x.r < 3);
		const failing = rs.sort((a, b) => a.r - b.r).map((x) => x.id);
		expect(fails("q308-4", { failing })).toEqual([]);
		dev["q308-4"] = "same failing parts and order";
	});
	it("q308-5", () => {
		const palette: [string, string][] = [
			["sky", "#5a8bbd"],
			["harbor", "#4f7fae"],
			["brick", "#c86464"],
			["clay", "#d2706a"],
			["mustard", "#e2b04a"],
			["ochre", "#c2a35a"],
			["fern", "#3c7a4b"],
		];
		const euclid = (a: string, b: string) => {
			const x = rgb255(a);
			const y = rgb255(b);
			return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
		};
		const labels = palette.map(([id, h]) => ({
			id,
			keyword: [...names].sort((a, b) => euclid(h, CSS_NAMED[a] as string) - euclid(h, CSS_NAMED[b] as string))[0] as string,
		}));
		const collisions: [string, string][] = [];
		for (let i = 0; i < labels.length; i++)
			for (let j = i + 1; j < labels.length; j++)
				if (CSS_NAMED[labels[i]?.keyword as string] === CSS_NAMED[labels[j]?.keyword as string])
					collisions.push([labels[j]?.id as string, labels[i]?.id as string]);
		expect(fails("q308-5", { labels, collisions })).toEqual([]);
		dev["q308-5"] = "same keywords and collisions";
	});
});

describe("v3 author-B freshness", () => {
	const hexesIn = (s: string) => [...s.matchAll(/#[0-9a-f]{6}\b/gi)].map((m) => m[0].toLowerCase());
	it("no hex in a v3 author-B prompt appears in any v1, v2 or v3 author-A prompt or witness (black and white aside)", () => {
		const older = [...buildAllNeutral(), ...buildAllNeutral2(), ...neutral3A()];
		const seen = new Set(older.flatMap((t) => [...hexesIn(t.prompt), ...hexesIn(JSON.stringify(t.witness))]));
		const mine = new Set(tasks.flatMap((t) => hexesIn(t.prompt)));
		expect([...mine].filter((h) => seen.has(h) && h !== "#000000" && h !== "#ffffff")).toEqual([]);
	});
	it("ids, categories and split", () => {
		expect(tasks.map((t) => t.id)).toEqual([305, 306, 307, 308].flatMap((c) => [1, 2, 3, 4, 5].map((n) => `q${c}-${n}`)));
		expect(tasks.every((t) => t.split === "dev")).toBe(true);
	});
});
