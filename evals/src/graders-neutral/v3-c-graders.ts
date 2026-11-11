/**
 * Author C's v3 grader additions. Each kind runs the matching v1/v2 constraint grader where one exists
 * and adds named checks for constraints the v3 tasks state and earlier kinds cannot express:
 * - tonal scales: a stated hue path (hue drifting linearly along the steps), Oklch L bands for named
 *   steps, and "the chroma peak sits at one of these steps";
 * - role tokens: roles that must be identical in both themes, a role that must be a given color, and
 *   two roles that must stay a stated Oklab distance apart;
 * - constraint search: closest color under several contrast floors at once, highest chroma under
 *   several floors in a hue band, gamut mapping plus an exact "which inputs were outside sRGB" set;
 * - palette audit: a chart pick that must clear 3:1 on several backgrounds, and a light theme derived
 *   from a dark one.
 * Every check is wrapped in `chk`, so a missing or mistyped field fails that check and never throws.
 */
import { chk, isHexStr, isRecord, normHex } from "../graders/helpers.js";
import { contrast, deutanDE, hueDist, hueInBand, oklabOfHex, oklchOfHex, okDist } from "../reference-neutral/c-color.js";
import { pathHue } from "../reference-neutral/v3-c-scale.js";
import type { Check } from "../tasks/types.js";
import { gradeRoles, gradeSearch, type Pair, type RolesParams } from "./c-graders.js";
import { gradeScale2, type Scale2Params } from "./v2-c-graders.js";

const EPS = 1e-9;

function hexAt(obj: unknown, key: string): string {
	if (!isRecord(obj)) throw new Error("not an object");
	return normHex(obj[key]);
}

// =====================================================================================
// 309 tonal-scale
// =====================================================================================

export interface Scale3Params extends Scale2Params {
	/**
	 * Target hue per step: piecewise-linear in step position (50 = 0 ... 950 = 10) through the stated
	 * [position, hue] knots; every step with chroma >= minChroma must be within tol of its target.
	 */
	huePath?: { knots: [number, number][]; tol: number; minChroma: number };
	/** Oklch L band for a named step. */
	anchors?: { step: string; min: number; max: number }[];
	/** The highest-chroma step of the whole scale must be one of these. */
	peak?: string[];
}

function scaleHex(answer: unknown, key: string): string {
	const s = isRecord(answer) ? answer.scale : undefined;
	if (!isRecord(s)) throw new Error("no scale");
	return normHex(s[key]);
}

export function gradeScale3(answer: unknown, p: Scale3Params): Check[] {
	if (typeof p !== "object" || p === null) return [chk("valid-params", () => false)];
	const checks = gradeScale2(answer, p);
	const keys = Array.isArray(p.keys) ? p.keys : [];
	if (p.huePath) {
		const hp = p.huePath;
		checks.push(
			chk("hue-follows-path", () =>
				keys.length > 0 &&
				keys.every((k, i) => {
					const c = oklchOfHex(scaleHex(answer, k));
					return c.C < hp.minChroma || hueDist(c.H, pathHue(hp.knots, i)) <= hp.tol + EPS;
				}),
			),
		);
	}
	for (const a of p.anchors ?? [])
		checks.push(
			chk(`lightness-${a.step}`, () => {
				const L = oklchOfHex(scaleHex(answer, a.step)).L;
				return L >= a.min - EPS && L <= a.max + EPS;
			}),
		);
	if (p.peak) {
		const peak = p.peak;
		checks.push(
			chk("chroma-peak-placed", () => {
				const c = keys.map((k) => oklchOfHex(scaleHex(answer, k)).C);
				const top = Math.max(...c);
				return keys.length > 0 && keys.some((k, i) => peak.includes(k) && (c[i] as number) >= top - EPS);
			}),
		);
	}
	return checks;
}

// =====================================================================================
// 310 role-tokens
// =====================================================================================

export interface Roles3Params extends RolesParams {
	/** Roles whose hex must be identical in every theme. */
	same?: string[];
	/** A role that must be a stated color (Oklab distance <= tol) in one theme. */
	exact?: { role: string; theme: "light" | "dark"; hex: string; tol: number }[];
	/** Two roles that must be at least `min` apart in Oklab distance, in every theme. */
	apart?: { a: string; b: string; min: number }[];
}

export function gradeRoles3(answer: unknown, p: Roles3Params): Check[] {
	if (typeof p !== "object" || p === null) return [chk("valid-params", () => false)];
	const checks = gradeRoles(answer, p);
	const themes = Array.isArray(p.themes) ? p.themes : [];
	const role = (th: string, r: string) => hexAt(isRecord(answer) ? answer[th] : undefined, r);
	for (const r of p.same ?? [])
		checks.push(chk(`${r}-same-in-both-themes`, () => themes.length > 1 && themes.every((t) => role(t, r) === role(themes[0] as string, r))));
	for (const e of p.exact ?? [])
		checks.push(chk(`${e.theme}-${e.role}-is-given-color`, () => okDist(oklabOfHex(role(e.theme, e.role)), oklabOfHex(e.hex)) <= e.tol + EPS));
	for (const th of themes)
		for (const a of p.apart ?? [])
			checks.push(chk(`${th}-${a.a}-apart-from-${a.b}`, () => okDist(oklabOfHex(role(th, a.a)), oklabOfHex(role(th, a.b))) >= a.min - EPS));
	return checks;
}

// =====================================================================================
// 311 constraint-search
// =====================================================================================

export interface Floor3 {
	label: string;
	hex: string;
	min: number;
}

export type Search3Params =
	| {
			/** Closest color to `original` that clears every contrast floor with hue kept. */
			shape: "fix-multi";
			field: string;
			original: string;
			floors: Floor3[];
			hueTol: number;
			/** Smallest Oklab distance over all opaque 8-bit colors meeting the floors and the hue rule (exhaustive). */
			optimum: number;
			factor: number;
			derivation?: unknown;
	  }
	| {
			/** Any color clearing every floor, with hue in band and chroma >= minChroma. */
			shape: "chroma-floor";
			field: string;
			floors: Floor3[];
			band: [number, number];
			minChroma: number;
			derivation?: unknown;
	  }
	| {
			/** Gamut-mapping targets (v1 "map" checks) plus the exact set of inputs that were outside sRGB. */
			shape: "map-outside";
			targets: { field: string; ref: string; dTol: number; lTol: number; hTol: number }[];
			outsideField: string;
			outside: string[];
			derivation?: unknown;
	  };

export function gradeSearch3(answer: unknown, p: Search3Params): Check[] {
	const hex = (f: string) => hexAt(answer, f);
	switch (p?.shape) {
		case "fix-multi": {
			const o = oklchOfHex(p.original);
			return [
				chk("valid-hex", () => isHexStr(hex(p.field))),
				...p.floors.map((f) => chk(`contrast-vs-${f.label}`, () => contrast(hex(p.field), f.hex) >= f.min - EPS)),
				chk("hue-kept", () => hueDist(oklchOfHex(hex(p.field)).H, o.H) <= p.hueTol + EPS),
				chk("close-to-original", () => okDist(oklabOfHex(hex(p.field)), oklabOfHex(p.original)) <= p.factor * p.optimum + EPS),
			];
		}
		case "chroma-floor":
			return [
				chk("valid-hex", () => isHexStr(hex(p.field))),
				...p.floors.map((f) => chk(`contrast-vs-${f.label}`, () => contrast(hex(p.field), f.hex) >= f.min - EPS)),
				chk("hue-band", () => hueInBand(oklchOfHex(hex(p.field)).H, p.band[0], p.band[1])),
				chk("chroma-floor", () => oklchOfHex(hex(p.field)).C >= p.minChroma - EPS),
			];
		case "map-outside": {
			const want = new Set(p.outside.map((s) => s.trim().toLowerCase()));
			const fields = p.targets.map((t) => t.field.toLowerCase());
			const got = () => {
				const v = isRecord(answer) ? answer[p.outsideField] : undefined;
				if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) throw new Error("no list");
				return new Set((v as string[]).map((s) => s.trim().toLowerCase()));
			};
			return [
				...gradeSearch(answer, { shape: "map", targets: p.targets }),
				...fields.map((f) => chk(`outside-verdict-${f}`, () => got().has(f) === want.has(f))),
				chk("outside-only-known-names", () => [...got()].every((f) => fields.includes(f))),
			];
		}
		default:
			return [chk("valid-shape", () => false)];
	}
}

// =====================================================================================
// 312 palette-audit
// =====================================================================================

export type Audit3Params =
	| {
			/** Choose k candidates, each >= minContrast on every background; min pairwise deutan ΔE00 >= threshold. */
			shape: "chart-multi";
			field: string;
			candidates: string[];
			backgrounds: { label: string; hex: string }[];
			k: number;
			minContrast: number;
			threshold: number;
			derivation?: unknown;
	  }
	| {
			/** A light-theme value for every token of a dark theme. */
			shape: "light-from-dark";
			field: string;
			dark: Record<string, string>;
			pairs: Pair[];
			hueTol: number;
			hueMinChroma: number;
			lightMinChroma: number;
			surfaces: string[];
			surfaceMinL: number;
			derivation?: unknown;
	  };

export function gradeAudit3(answer: unknown, p: Audit3Params): Check[] {
	switch (p?.shape) {
		case "chart-multi": {
			const cand = new Set(p.candidates.map((h) => normHex(h)));
			const picks = (): string[] => {
				const a = isRecord(answer) ? answer[p.field] : undefined;
				if (!Array.isArray(a)) throw new Error("no picks");
				return a.map((h) => normHex(h));
			};
			return [
				chk("pick-count", () => picks().length === p.k),
				chk("picks-distinct-from-candidates", () => {
					const ps = picks();
					return new Set(ps).size === ps.length && ps.every((h) => cand.has(h));
				}),
				...p.backgrounds.map((b) =>
					chk(`contrast-on-${b.label}`, () => {
						const ps = picks();
						return ps.length > 0 && ps.every((h) => contrast(h, b.hex) >= p.minContrast - EPS);
					}),
				),
				chk("deutan-separation", () => {
					const ps = picks();
					if (ps.length !== p.k || new Set(ps).size !== ps.length) return false;
					let min = Number.POSITIVE_INFINITY;
					for (let i = 0; i < ps.length; i++)
						for (let j = i + 1; j < ps.length; j++) min = Math.min(min, deutanDE(ps[i] as string, ps[j] as string));
					return min >= p.threshold - EPS;
				}),
			];
		}
		case "light-from-dark": {
			const names = Object.keys(p.dark ?? {});
			const T = () => {
				const t = isRecord(answer) ? answer[p.field] : undefined;
				if (!isRecord(t)) throw new Error("no tokens");
				return Object.fromEntries(names.map((n) => [n, hexAt(t, n)]));
			};
			const out: Check[] = [chk("tokens-present", () => names.length > 0 && Object.keys(T()).length === names.length)];
			for (const [fg, bg, min] of p.pairs)
				out.push(chk(`contrast-${fg}-on-${bg}`, () => contrast(T()[fg] as string, T()[bg] as string) >= min - EPS));
			for (const n of names) {
				const dc = oklchOfHex(p.dark[n] as string);
				if (dc.C < p.hueMinChroma) continue;
				out.push(
					chk(`hue-${n}`, () => {
						const c = oklchOfHex(T()[n] as string);
						return c.C >= p.lightMinChroma - EPS && hueDist(c.H, dc.H) <= p.hueTol + EPS;
					}),
				);
			}
			out.push(chk("surfaces-light", () => p.surfaces.every((s) => oklabOfHex(T()[s] as string)[0] >= p.surfaceMinL - EPS)));
			return out;
		}
		default:
			return [chk("valid-shape", () => false)];
	}
}
