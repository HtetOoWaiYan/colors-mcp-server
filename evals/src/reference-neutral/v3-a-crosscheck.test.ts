/**
 * Cross-check of every neutral-v3 author-A task against colorjs.io: for each task an answer is built
 * from colorjs.io computations (from the task's derivation.inputs, not from our reference), graded with
 * the task's own grader, and must pass every check. The largest numeric deviation from our witness is
 * logged per task. Where colorjs.io has no implementation of the stated method (CIE94 textiles, the
 * CIEDE2000 term breakdown, naive CMYK, BT.2020 narrow-range codes, McCamy CCT, the Oklch maximum-chroma
 * search), the formula is applied by hand to colorjs.io's coordinates and that is noted next to the builder.
 */
import Color from "colorjs.io";
import Rec2020Oetf from "colorjs.io/src/spaces/rec2020-oetf.js";
import { describe, expect, it } from "vitest";
import { gradeNeutral } from "../graders-neutral/index.js";
import { rgbToHex, type Vec3 } from "../reference/color.js";
import { neutral3A } from "../tasks/neutral/cats-neutral3-a.js";
import type { Task } from "../tasks/types.js";
import { CIE94_TEXTILES, deltaE94, deltaE2000Terms } from "./v3-a-color.js";

Color.Space.register(Rec2020Oetf);

// biome-ignore lint/suspicious/noExplicitAny: derivation inputs are free-form JSON
type Any = any;

const c = (hex: string) => new Color(hex);
const num = (v: unknown) => (v === null || Number.isNaN(Number(v)) ? 0 : Number(v));
const coords = (col: Color | string, space: string): number[] =>
	(typeof col === "string" ? c(col) : col).to(space).coords.map(num);
const hexOf = (col: Color): string => rgbToHex(col.to("srgb").coords.map(num) as unknown as Vec3);
const apca = (txt: string, bg: string) => c(bg).contrast(c(txt), "APCA");
const wcag = (a: string, b: string) => c(a).contrast(c(b), "WCAG21");
/** Informational switch: run the Lab-based tasks on colorjs.io's default D50 (Bradford-adapted) Lab instead. */
let LAB_SPACE = "lab-d65";
const labD65 = (hex: string) => coords(hex, LAB_SPACE) as unknown as Vec3;
// colorjs.io's deltaE functions convert to its D50 "lab"; passing D65 coordinates as "lab" runs its formula on D65 Lab.
const asLab = (v: Vec3) => new Color("lab", [...v]);
const de00 = (a: string, b: string) => asLab(labD65(a)).deltaE(asLab(labD65(b)), "2000");
const de76 = (a: string, b: string) => asLab(labD65(a)).deltaE(asLab(labD65(b)), "76");
const cmc = (std: string, bat: string, l: number, cc: number) =>
	asLab(labD65(std)).deltaE(asLab(labD65(bat)), { method: "CMC", l, c: cc } as never);
const gray = (v: number) => rgbToHex([v / 255, v / 255, v / 255]);
/** Rounding as the prompts ask; switched off to measure the unrounded deviation from our witness. */
let ROUND = true;
const r = (v: number, d: number) => (ROUND ? Math.round(v * 10 ** d) / 10 ** d : v);
const by = <T>(xs: T[], f: (x: T) => number) => [...xs].sort((a, b) => f(a) - f(b));
const inUnit = (v: number[]) => v.every((x) => x >= 0 && x <= 1);

const builders: Record<string, (inp: Any) => unknown> = {
	"q301-1": ({ text, stops, floor }) => {
		const rows = stops.map(([id, bg]: string[]) => ({ id, lc: apca(text, bg as string) }));
		return {
			samples: rows.map((x: Any) => ({ id: x.id, lc: r(x.lc, 1) })),
			reaching: rows.filter((x: Any) => Math.abs(x.lc) >= floor).map((x: Any) => x.id),
			weakest: by(rows, (x: Any) => Math.abs(x.lc))[0].id,
		};
	},
	"q301-2": ({ rows }) => ({
		results: rows.map((row: Any) => {
			let best = -1;
			for (let v = 0; v < 256; v++) {
				const lc = apca(gray(v), row.bg);
				if (row.mode === "light" && lc >= row.target) best = v;
				if (row.mode === "dark" && lc <= -row.target && best < 0) best = v;
			}
			return { id: row.id, hex: gray(best), lc: r(apca(gray(best), row.bg), 1) };
		}),
	}),
	"q301-3": ({ lightText, lightBg, darkBg, cands }) => {
		const L0 = Math.abs(apca(lightText, lightBg));
		return {
			lightLc: r(apca(lightText, lightBg), 1),
			candidates: cands.map((h: string) => ({ hex: h, lc: r(apca(h, darkBg), 1) })),
			match: by(cands as string[], (h) => Math.abs(Math.abs(apca(h, darkBg)) - L0))[0],
		};
	},
	"q301-4": ({ pairs }) => {
		const rows = pairs.map(([id, t, b]: string[]) => ({ id, ratio: wcag(t as string, b as string), lc: apca(t as string, b as string) }));
		return {
			results: rows.map((x: Any) => ({ id: x.id, ratio: r(x.ratio, 2), lc: r(x.lc, 1) })),
			byWcag: by(rows, (x: Any) => -x.ratio).map((x: Any) => x.id),
			byApca: by(rows, (x: Any) => -Math.abs(x.lc)).map((x: Any) => x.id),
		};
	},
	"q301-5": ({ els }) => {
		const rows = els.map((e: Any) => {
			const lc = apca(e.color, e.parent);
			return { id: e.id, lc: r(lc, 1), passes: Math.abs(lc) >= e.min };
		});
		return { results: rows, failing: rows.filter((x: Any) => !x.passes).map((x: Any) => x.id) };
	},
	"q302-1": ({ pairs }) => ({
		results: pairs.map(([id, s, m]: string[]) => {
			// colorjs.io has no CIE94: the textile formula applied to colorjs.io's D65 Lab
			const dS = deltaE94(labD65(s as string), labD65(m as string), CIE94_TEXTILES);
			const dM = deltaE94(labD65(m as string), labD65(s as string), CIE94_TEXTILES);
			return { id, studioRef: r(dS, 2), millRef: r(dM, 2), de2000: r(de00(s as string, m as string), 2), smaller: dS < dM ? "studio" : "mill" };
		}),
	}),
	"q302-2": ({ batches, threshold }) => ({
		results: batches.map(([id, s, b]: string[]) => {
			const c21 = cmc(s as string, b as string, 2, 1);
			const c11 = cmc(s as string, b as string, 1, 1);
			return { id, cmc21: r(c21, 2), cmc11: r(c11, 2), pass21: c21 < threshold, pass11: c11 < threshold };
		}),
	}),
	"q302-3": ({ tokens, threshold }) => {
		const n = tokens.length;
		const parent = tokens.map((_: unknown, i: number) => i);
		const find = (i: number): number => (parent[i] === i ? i : find(parent[i]));
		for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (de00(tokens[i][1], tokens[j][1]) < threshold) parent[find(i)] = find(j);
		const root = tokens.map((_: unknown, i: number) => find(i));
		return {
			tokens: tokens.map(([name]: string[], i: number) => ({
				token: name,
				mergeWith: tokens.filter((_: unknown, j: number) => j !== i && root[j] === root[i]).map(([m]: string[]) => m),
			})),
			groupCount: new Set(root).size,
		};
	},
	"q302-4": ({ existing, cands }) => {
		const rows = cands.map((h: string) => {
			const near = by(existing as string[], (e) => de00(h, e))[0] as string;
			return { hex: h, nearest: near, minDeltaE: de00(h, near) };
		});
		return {
			candidates: rows.map((x: Any) => ({ ...x, minDeltaE: r(x.minDeltaE, 2) })),
			pick: by(rows, (x: Any) => -x.minDeltaE)[0].hex,
		};
	},
	"q302-5": ({ pairs }) => ({
		results: pairs.map(([id, ref, sam]: string[]) => {
			// colorjs.io gives only the CIEDE2000 total; the term breakdown is our formula on colorjs.io's D65 Lab
			const t = deltaE2000Terms(labD65(ref as string), labD65(sam as string));
			const mags = [Math.abs(t.tL), Math.abs(t.tC), Math.abs(t.tH)];
			return {
				id,
				deltaE: r(de00(ref as string, sam as string), 2),
				lightness: r(t.tL, 2),
				chroma: r(t.tC, 2),
				hue: r(t.tH, 2),
				dominant: ["lightness", "chroma", "hue"][mags.indexOf(Math.max(...mags))],
			};
		}),
	}),
	"q303-1": ({ colors }) => ({
		results: colors.map(({ id, p3 }: Any) => {
			const col = new Color("p3", p3);
			const lin = coords(col, "srgb-linear");
			const inside = inUnit(lin);
			return { id, linear: lin.map((v) => r(v, 4)), inSrgb: inside, hex: inside ? hexOf(col) : null };
		}),
	}),
	"q303-2": ({ tokens }) => ({
		results: tokens.map(({ id, lab }: Any) => {
			const col = new Color("lab-d65", lab);
			const ok = coords(col, "oklab");
			const lch = coords(col, "oklch");
			if ((lch[1] as number) < 0.02) lch[2] = 0; // achromatic: hue reported as 0, which the prompt allows
			return { id, oklab: ok.map((v) => r(v, 4)), oklch: [r(lch[0] as number, 4), r(lch[1] as number, 4), r(lch[2] as number, 2)] };
		}),
	}),
	"q303-3": ({ colors }) => ({
		colors: colors.map((hex: string) => {
			// biome-ignore lint/suspicious/noExplicitAny: colorjs.io registers xy/uv getters at runtime
			const col = c(hex) as any;
			const Y = coords(hex, "xyz-d65")[1] as number;
			return { hex, xyY: [...(col.xy as number[]), Y].map((v) => r(v, 4)), uv: (col.uv as number[]).map((v) => r(v, 4)) };
		}),
	}),
	"q303-4": ({ triples }) => ({
		results: triples.map(({ id, lin }: Any) => {
			const hex = hexOf(new Color("srgb-linear", lin.map((v: number) => Math.min(1, Math.max(0, v)))));
			const hsl = coords(hex, "hsl");
			const hwb = coords(hex, "hwb");
			return { id, hex, hsl: hsl.map((v) => r(v, 1)), hwb: hwb.map((v) => r(v, 1)) };
		}),
	}),
	"q303-5": ({ colors }) => ({
		colors: colors.map((hex: string) => {
			const [R, G, B] = coords(hex, "srgb") as [number, number, number];
			// colorjs.io has no CMYK: the naive formula on colorjs.io's sRGB coords
			const K = 1 - Math.max(R, G, B);
			const cmyk = [(1 - R - K) / (1 - K), (1 - G - K) / (1 - K), (1 - B - K) / (1 - K), K].map((v) => r(v * 100, 1));
			const e = coords(hex, "--rec2020-oetf");
			// narrow-range codes are not a colorjs.io feature: D = round((219·E' + 16)·4)
			return { hex, cmyk, rec2020: e.map((v) => r(v, 4)), codes: e.map((v) => Math.round((219 * v + 16) * 4)) };
		}),
	}),
	"q304-1": ({ colors, floor }) => {
		const ok = (h: string) => coords(h, "oklch");
		const wheel = (colors as string[]).filter((h) => (ok(h)[1] as number) >= floor);
		return {
			swatches: wheel.map((h) => ({ hex: h, hue: r(ok(h)[2] as number, 2) })),
			neutral: (colors as string[]).filter((h) => (ok(h)[1] as number) < floor),
			order: by(wheel, (h) => ok(h)[2] as number),
		};
	},
	"q304-2": ({ colors }) => {
		const lstar = (h: string) => labD65(h)[0];
		let mid = 0;
		for (let v = 0; v < 256; v++) if (Math.abs(lstar(gray(v)) - 50) < Math.abs(lstar(gray(mid)) - 50)) mid = v;
		return {
			results: colors.map((hex: string) => {
				const L = lstar(hex);
				const ok = coords(hex, "oklab")[0] as number;
				const hl = coords(hex, "hsl")[2] as number;
				return { hex, lStar: r(L, 2), oklabL: r(ok, 4), hslL: r(hl, 1), lightCie: L >= 50, lightOklab: ok >= 0.5, lightHsl: hl >= 50 };
			}),
			midGray: gray(mid),
		};
	},
	"q304-3": ({ pairs }) => {
		// colorjs.io's luminance is Y of its xyz-d65 (sRGB row 0.2126729 / 0.7151522 / 0.0721750)
		const Y = (h: string) => coords(h, "xyz-d65")[1] as number;
		const L = (h: string) => coords(h, "oklab")[0] as number;
		const rows = pairs.map(([id, a, b]: string[]) => ({
			id,
			luminance: [r(Y(a as string), 4), r(Y(b as string), 4)],
			oklabL: [r(L(a as string), 4), r(L(b as string), 4)],
			lighterByLuminance: Y(a as string) > Y(b as string) ? "first" : "second",
			lighterByOklab: L(a as string) > L(b as string) ? "first" : "second",
		}));
		return { results: rows, disagree: rows.filter((x: Any) => x.lighterByLuminance !== x.lighterByOklab).map((x: Any) => x.id) };
	},
	"q304-4": ({ tokens }) => {
		// McCamy's cubic by hand on colorjs.io's xy
		const rows = tokens.map(([id, hex]: string[]) => {
			// biome-ignore lint/suspicious/noExplicitAny: colorjs.io registers xy getters at runtime
			const [x, y] = (c(hex as string) as any).xy as [number, number];
			const n = (x - 0.332) / (0.1858 - y);
			return { id, x, y, cct: 449 * n ** 3 + 3525 * n ** 2 + 6823.3 * n + 5520.33 };
		});
		return {
			results: rows.map((x: Any) => ({ id: x.id, x: r(x.x, 4), y: r(x.y, 4), cct: ROUND ? Math.round(x.cct) : x.cct })),
			warmToCool: by(rows, (x: Any) => x.cct).map((x: Any) => x.id),
		};
	},
	"q304-5": ({ colors }) => {
		// the maximum-chroma search by hand (bisection), with colorjs.io doing every Oklch -> sRGB conversion
		const maxC = (L: number, h: number) => {
			let lo = 0;
			let hi = 0.5;
			for (let i = 0; i < 50; i++) {
				const mid = (lo + hi) / 2;
				if (inUnit(coords(new Color("oklch", [L, mid, h]), "srgb"))) lo = mid;
				else hi = mid;
			}
			return lo;
		};
		const rows = colors.map((hex: string) => {
			const [L, C, h] = coords(hex, "oklch") as [number, number, number];
			const m = maxC(L, h);
			return { hex, L: r(L, 4), C: r(C, 4), h: r(h, 2), maxC: r(m, 4), pct: r((100 * C) / m, 1) };
		});
		const s = by(rows, (x: Any) => x.pct);
		return { results: rows, mostHeadroom: (s[0] as Any).hex, leastHeadroom: (s[s.length - 1] as Any).hex };
	},
};

const rowKey = (x: unknown): string | undefined =>
	x && typeof x === "object" && !Array.isArray(x)
		? (Object.values(x).find((v) => typeof v === "string") as string | undefined)
		: undefined;

/** Largest |difference| between numeric leaves of two same-shaped values; rows are matched by their first string field. */
function maxNumDiff(a: unknown, b: unknown): number {
	if (typeof a === "number" && typeof b === "number") return Math.abs(a - b);
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

describe("neutral v3 author A: answers built from colorjs.io pass every check", () => {
	const tasks: Task[] = neutral3A();
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
			for (const t of tasks.filter((x) => ["q302-1", "q302-2", "q302-3", "q302-4", "q302-5", "q304-2"].includes(x.id))) {
				const answer = (builders[t.id] as (inp: Any) => unknown)(t.grader.params.derivation.inputs);
				out[t.id] = gradeNeutral(t.grader, answer)
					.filter((ch) => !ch.pass)
					.map((ch) => ch.name);
			}
		} finally {
			LAB_SPACE = "lab-d65";
		}
		console.log("v3-a checks failed by a D50-Lab answer (the prompts name D65 without adaptation):", JSON.stringify(out));
	});
	it("logs the per-task maximum numeric deviation from the witness", () => {
		console.log(
			"v3-a max |unrounded colorjs.io value - witness| per task (includes the witness's own rounding to the precision each prompt asks for):",
			JSON.stringify(report, null, 1),
		);
	});
});
