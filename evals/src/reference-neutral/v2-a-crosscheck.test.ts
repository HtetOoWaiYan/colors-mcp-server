/**
 * Cross-check of every neutral-v2 author-A task against colorjs.io: for each task an answer is built
 * from colorjs.io computations (from the task's derivation.inputs, not from our reference), graded with
 * the task's own grader, and must pass every check. The largest numeric deviation from our witness is
 * logged per task. Where colorjs.io has no implementation of the stated method (CIE94, naive CMYK,
 * BT.709 luma on encoded values, CIE LCh with a D65 white), the formula is applied by hand to
 * colorjs.io's coordinates and that is noted next to the builder.
 */
import Color from "colorjs.io";
import Rec2020Oetf from "colorjs.io/src/spaces/rec2020-oetf.js";
import { describe, expect, it } from "vitest";
import { gradeNeutral } from "../graders-neutral/index.js";
import { rgbToHex, type Vec3 } from "../reference/color.js";
import { neutral2A } from "../tasks/neutral/cats-neutral2-a.js";
import type { Task } from "../tasks/types.js";
import { deltaE94GraphicArts } from "./a-deltae.js";

Color.Space.register(Rec2020Oetf);

// biome-ignore lint/suspicious/noExplicitAny: derivation inputs are free-form JSON
type Any = any;

const c = (hex: string) => new Color(hex);
const coords = (hex: string, space: string): number[] =>
	c(hex)
		.to(space)
		.coords.map((v) => (v === null || Number.isNaN(Number(v)) ? 0 : Number(v)));
const hexOf = (col: Color): string => rgbToHex(col.to("srgb").coords.map(Number) as unknown as Vec3);
const apca = (txt: string, bg: string) => c(bg).contrast(c(txt), "APCA");
const wcag = (a: string, b: string) => c(a).contrast(c(b), "WCAG21");
/** Informational switch: run the Lab-based tasks on colorjs.io's default D50 (Bradford-adapted) Lab instead. */
let LAB_SPACE = "lab-d65";
const labD65 = (hex: string) => coords(hex, LAB_SPACE) as unknown as Vec3;
// colorjs.io's deltaE functions convert to its D50 "lab"; passing D65 coordinates as "lab" runs its formula on D65 Lab.
const de00 = (a: string, b: string) => new Color("lab", [...labD65(a)]).deltaE(new Color("lab", [...labD65(b)]), "2000");
const de76 = (a: string, b: string) => new Color("lab", [...labD65(a)]).deltaE(new Color("lab", [...labD65(b)]), "76");
// colorjs.io has no CIE94: our formula on colorjs.io's D65 Lab.
const de94 = (ref: string, s: string) => deltaE94GraphicArts(labD65(ref), labD65(s));
const polar = (v: number[]): number[] => {
	const h = (Math.atan2(v[2] as number, v[1] as number) * 180) / Math.PI;
	return [v[0] as number, Math.hypot(v[1] as number, v[2] as number), (h + 360) % 360];
};
/** Rounding as the prompts ask; switched off to measure the unrounded deviation from our witness. */
let ROUND = true;
const r = (v: number, d: number) => (ROUND ? Math.round(v * 10 ** d) / 10 ** d : v);
const by = <T>(xs: T[], f: (x: T) => number) => [...xs].sort((a, b) => f(a) - f(b));

const builders: Record<string, (inp: Any) => unknown> = {
	"p301-1": ({ pairs }) => ({
		results: pairs.map(([id, d, l]: string[]) => {
			const dol = apca(d as string, l as string);
			const lod = apca(l as string, d as string);
			return { id, darkOnLight: r(dol, 1), lightOnDark: r(lod, 1), stronger: Math.abs(dol) > Math.abs(lod) ? "dark-on-light" : "light-on-dark" };
		}),
	}),
	"p301-2": ({ pairs }) => ({
		results: pairs.map(([id, t, b]: string[]) => {
			const m = Math.abs(apca(t as string, b as string));
			const tier = m >= 75 ? "body" : m >= 60 ? "content" : m >= 45 ? "headline" : m >= 30 ? "spot" : "none";
			return { id, lc: r(apca(t as string, b as string), 1), tier };
		}),
	}),
	"p301-3": ({ text, surfaces }) => {
		const ranking = by(surfaces as string[], (s) => -Math.abs(apca(text, s)));
		return {
			results: surfaces.map((s: string) => ({ background: s, lc: r(apca(text, s), 1) })),
			best: ranking[0],
			ranking,
			headlineOk: Math.abs(apca(text, ranking[0] as string)) >= 45,
		};
	},
	"p301-4": ({ pairs }) => ({
		results: pairs.map(([id, t, b]: string[]) => {
			const ratio = wcag(t as string, b as string);
			const lc = apca(t as string, b as string);
			const w = ratio >= 7;
			const a = Math.abs(lc) >= 75;
			return { id, ratio: r(ratio, 2), lc: r(lc, 1), verdict: w && a ? "both" : w ? "wcag-only" : a ? "apca-only" : "neither" };
		}),
	}),
	"p301-5": ({ tokens }) => ({
		results: tokens.map((k: Any) => {
			const composite = hexOf(c(k.bg).mix(c(k.text), k.alpha, { space: "srgb" }));
			const lc = apca(composite, k.bg);
			return { id: k.id, composite, lc: r(lc, 1), passes: Math.abs(lc) >= k.min };
		}),
	}),
	"p302-1": ({ tints }) => {
		const pairs: { id: string; names: string[]; d: number }[] = [];
		for (let i = 0; i < tints.length; i++)
			for (let j = i + 1; j < tints.length; j++)
				pairs.push({ id: `${tints[i][0]}-${tints[j][0]}`, names: [tints[i][0], tints[j][0]], d: de00(tints[i][1], tints[j][1]) });
		const s = by(pairs, (p) => p.d);
		return {
			results: pairs.map((p) => ({ pair: p.id, deltaE: r(p.d, 2) })),
			mostSimilar: s[0]?.names,
			mostDifferent: s[s.length - 1]?.names,
		};
	},
	"p302-2": ({ items }) => ({
		results: items.map(([id, ref, p]: string[]) => {
			const d = de94(ref as string, p as string);
			return { id, deltaE: r(d, 2), band: d < 2 ? "accept" : d < 4 ? "review" : "reject" };
		}),
	}),
	"p302-3": ({ inks, logo }) => ({
		results: logo.map(([id, t]: string[]) => {
			const ink = by(inks as string[], (k) => de00(t as string, k))[0] as string;
			return { id, ink, deltaE: r(de00(t as string, ink), 2) };
		}),
	}),
	"p302-4": ({ target, cands }) => ({
		results: cands.map((h: string) => ({ hex: h, de76: r(de76(target, h), 2), de2000: r(de00(target, h), 2) })),
		orderCie76: by(cands as string[], (h) => de76(target, h)),
		orderCiede2000: by(cands as string[], (h) => de00(target, h)),
	}),
	"p302-5": ({ ramp }) => {
		const steps = ramp.slice(1).map(([n, h]: string[], i: number) => ({ step: `${ramp[i][0]}-${n}`, d: de00(ramp[i][1], h as string) }));
		const s = by(steps as { step: string; d: number }[], (x) => x.d);
		return {
			steps: steps.map((x: Any) => ({ step: x.step, deltaE: r(x.d, 2) })),
			smallest: s[0]?.step,
			largest: s[s.length - 1]?.step,
		};
	},
	"p303-1": ({ colors }) => ({
		colors: colors.map((hex: string) => {
			// colorjs.io's "lch" is D50; the task asks for LCh of D65 Lab, so polar of colorjs.io's lab-d65.
			const lch = polar(labD65(hex) as unknown as number[]);
			const ok = coords(hex, "oklch");
			// achromatic: hue reported as 0, which the prompt allows
			if ((lch[1] as number) < 0.5) lch[2] = 0;
			if ((ok[1] as number) < 0.02) ok[2] = 0;
			return { hex, lch: lch.map((v) => r(v, 2)), oklch: [r(ok[0] as number, 4), r(ok[1] as number, 4), r(ok[2] as number, 2)] };
		}),
	}),
	"p303-2": () => ({
		results: [
			{ id: "hsl", hex: hexOf(new Color("hsl(152 48% 36%)")) },
			{ id: "hwb", hex: hexOf(new Color("hwb(28 12% 9%)")) },
			{ id: "oklab", hex: hexOf(new Color("oklab", [0.62, -0.05, -0.1])) },
			{ id: "xyz", hex: hexOf(new Color("xyz-d65", [0.265, 0.214, 0.56])) },
			// colorjs.io has no CMYK: the naive formula by hand
			{ id: "cmyk", hex: rgbToHex([(1 - 0.08) * (1 - 0.22), (1 - 0.64) * (1 - 0.22), (1 - 0) * (1 - 0.22)]) },
			{ id: "rich-black", hex: rgbToHex([0, 0, 0]) },
			{ id: "rec2020", hex: hexOf(new Color("--rec2020-oetf", [0.62, 0.48, 0.31])) },
		],
	}),
	"p303-3": ({ colors }) => ({
		colors: colors.map((hex: string) => ({
			hex,
			linear: coords(hex, "srgb-linear").map((v) => r(v, 5)),
			xyz: coords(hex, "xyz-d65").map((v) => r(v, 5)),
			rec2020Linear: coords(hex, "rec2020-linear").map((v) => r(v, 5)),
		})),
	}),
	"p303-4": (inp) => ({
		results: Object.entries(inp as Record<string, string>).map(([id, css]) => {
			const col = new Color(css);
			const hsv = col.to("hsv").coords.map((v) => (v === null || Number.isNaN(Number(v)) ? 0 : Number(v)));
			const hwb = col.to("hwb").coords.map((v) => (v === null || Number.isNaN(Number(v)) ? 0 : Number(v)));
			if (hsv[1] === 0) hsv[0] = hwb[0] = 0; // gray: hue reported as 0, which the prompt allows
			return { id, hsv: hsv.map((v) => r(v, 1)), hwb: hwb.map((v) => r(v, 1)) };
		}),
	}),
	"p303-5": ({ colors }) => ({
		colors: colors.map((hex: string) => ({
			hex,
			p3: `color(display-p3 ${coords(hex, "p3")
				.map((v) => v.toFixed(4))
				.join(" ")})`,
			lab: labD65(hex).map((v) => r(v, 2)),
		})),
	}),
	"p304-1": ({ colors }) => ({
		results: colors.map((hex: string) => {
			const [L, C, h] = coords(hex, "oklch") as [number, number, number];
			return { hex, L: r(L, 4), C: r(C, 4), h: C < 0.02 ? 0 : r(h, 2) }; // near-neutral: hue reported as 0, which the prompt allows
		}),
	}),
	"p304-2": ({ colors }) => ({
		results: colors.map((hex: string) => {
			// colorjs.io's luminance is Y of its xyz-d65 (sRGB matrix row 0.2126729 / 0.7151522 / 0.0721750)
			const L = coords(hex, "xyz-d65")[1] as number;
			return { hex, luminance: r(L, 4), text: L > Math.sqrt(1.05 * 0.05) - 0.05 ? "black" : "white" };
		}),
	}),
	"p304-3": ({ ramp }) => {
		const Ls = ramp.map(([, h]: string[]) => coords(h as string, "oklab")[0] as number);
		return {
			swatches: ramp.map(([id]: string[], i: number) => ({ id, L: r(Ls[i], 4) })),
			notDarker: ramp
				.slice(1)
				.map(([id]: string[], i: number) => (Ls[i + 1] > Ls[i] ? `${ramp[i][0]}-${id}` : null))
				.filter(Boolean),
		};
	},
	"p304-4": ({ series }) => {
		// colorjs.io has no "luma on encoded values" gray: the BT.709 formula on colorjs.io's encoded sRGB coords
		const gray = (hex: string) => {
			const [R, G, B] = coords(hex, "srgb") as [number, number, number];
			const y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
			return rgbToHex([y, y, y]);
		};
		const lv = (hex: string) => Number.parseInt(gray(hex).slice(1, 3), 16);
		const pairs: [string, string, number][] = [];
		for (let i = 0; i < series.length; i++)
			for (let j = i + 1; j < series.length; j++) pairs.push([series[i], series[j], Math.abs(lv(series[i]) - lv(series[j]))]);
		const best = by(pairs, (p) => p[2])[0] as [string, string, number];
		return { results: series.map((h: string) => ({ hex: h, gray: gray(h) })), collision: [best[0], best[1]] };
	},
	"p304-5": ({ colors }) => {
		const C = (h: string) => coords(h, "oklch")[1] as number;
		const S = (h: string) => coords(h, "hsl")[1] as number;
		return {
			results: colors.map((h: string) => ({ hex: h, chroma: r(C(h), 4), hslSaturation: r(S(h), 1) })),
			byChroma: by(colors as string[], (h) => -C(h)),
			byHslSaturation: by(colors as string[], (h) => -S(h)),
		};
	},
};

const rowKey = (x: unknown): string | undefined =>
	x && typeof x === "object" && !Array.isArray(x)
		? (Object.values(x).find((v) => typeof v === "string") as string | undefined)
		: undefined;

/**
 * Largest |difference| between numeric leaves of two same-shaped values. Rows (arrays of objects) are
 * matched by their first string field; css color() strings are compared by their three channel numbers.
 */
function maxNumDiff(a: unknown, b: unknown): number {
	if (typeof a === "number" && typeof b === "number") return Math.abs(a - b);
	if (typeof a === "string" && typeof b === "string" && a.startsWith("color(")) {
		const nums = (s: string) => s.replace(/^color\(\s*[a-z0-9-]+/i, "").match(/[-\d.]+/g)?.map(Number) ?? [];
		return maxNumDiff(nums(a), nums(b));
	}
	if (Array.isArray(a) && Array.isArray(b))
		return Math.max(
			0,
			...a.map((x, i) => {
				const k = rowKey(x);
				return maxNumDiff(x, k === undefined ? b[i] : b.find((y) => rowKey(y) === k));
			}),
		);
	if (a && b && typeof a === "object" && typeof b === "object")
		return Math.max(0, ...Object.keys(a).map((k) => maxNumDiff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])));
	return 0;
}

describe("neutral v2 author A: answers built from colorjs.io pass every check", () => {
	const tasks: Task[] = neutral2A();
	const report: Record<string, number> = {};
	it.each(tasks.map((t) => [t.id, t] as const))("%s", (id, t) => {
		const build = builders[id];
		expect(build, id).toBeDefined();
		const answer = (build as (inp: Any) => unknown)(t.grader.params.derivation.inputs);
		const failed = gradeNeutral(t.grader, answer)
			.filter((ch) => !ch.pass)
			.map((ch) => ch.name);
		ROUND = false;
		report[id] = maxNumDiff((build as (inp: Any) => unknown)(t.grader.params.derivation.inputs), t.witness);
		ROUND = true;
		expect(failed, `${id} failed checks with a colorjs.io-built answer`).toEqual([]);
	});
	it("informational: which checks a D50-Lab (Bradford-adapted) implementation would fail", () => {
		const out: Record<string, string[]> = {};
		LAB_SPACE = "lab";
		try {
			for (const t of tasks.filter((x) => ["p302-1", "p302-2", "p302-3", "p302-4", "p302-5", "p303-1", "p303-5"].includes(x.id))) {
				const answer = (builders[t.id] as (inp: Any) => unknown)(t.grader.params.derivation.inputs);
				out[t.id] = gradeNeutral(t.grader, answer)
					.filter((ch) => !ch.pass)
					.map((ch) => ch.name);
			}
		} finally {
			LAB_SPACE = "lab-d65";
		}
		console.log("v2-a checks failed by a D50-Lab answer (the prompts name D65 without adaptation):", JSON.stringify(out));
	});
	it("logs the per-task maximum numeric deviation from the witness", () => {
		console.log("v2-a max |unrounded colorjs.io value - witness| per task (includes the witness's own rounding to the precision each prompt asks for):", JSON.stringify(report, null, 1));
	});
});
