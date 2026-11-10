/**
 * Author C's graders for categories 309-312. Every task here has many valid answers, so the graders
 * check constraints computed from the answer's own hex values, never an exact color. Each check is
 * wrapped in `chk`, so a missing or mistyped field fails that check and never throws.
 */
import { chk, isHexStr, isRecord, normHex } from "../graders/helpers.js";
import {
	contrast,
	deutanDE,
	hueDist,
	hueInBand,
	oklabOfHex,
	oklchOfHex,
	okDist,
} from "../reference-neutral/c-color.js";
import type { Check } from "../tasks/types.js";

const EPS = 1e-9;

function hexAt(obj: unknown, key: string): string {
	if (!isRecord(obj)) throw new Error("not an object");
	return normHex(obj[key]);
}

// =====================================================================================
// 309 tonal-scale
// =====================================================================================

export interface ScaleParams {
	keys: string[];
	lightFloor: number;
	darkCeiling: number;
	stepRatio: [number, number];
	hue: { seedHue: number; tol: number; minChroma: number };
	seed?: { hex: string; steps: string[]; tol: number };
	midChroma?: { steps: string[]; ratio: number; seedChroma: number };
	maxChroma?: number;
	tint?: { steps: string[]; minChroma: number; hueTol: number };
	contrast?: { fg: string; bg: string; min: number };
	css?: { prefix: string };
	derivation?: unknown;
}

/** Reads the 11 steps (throws unless the keys are exactly `keys` and every value is hex). */
function readScale(answer: unknown, keys: string[]): Record<string, string> {
	const s = isRecord(answer) ? answer.scale : undefined;
	if (!isRecord(s)) throw new Error("no scale");
	const got = Object.keys(s);
	if (got.length !== keys.length || !keys.every((k) => k in s)) throw new Error("wrong keys");
	return Object.fromEntries(keys.map((k) => [k, normHex(s[k])]));
}

function parseCss(text: unknown, prefix: string): Map<string, string> {
	if (typeof text !== "string") throw new Error("no css");
	const re = new RegExp(`--${prefix}-(\\d+)\\s*:\\s*(#[0-9a-fA-F]{3,6})\\b\\s*;?`, "g");
	const out = new Map<string, string>();
	for (const m of text.matchAll(re)) {
		const k = m[1] as string;
		if (out.has(k)) throw new Error(`duplicate ${k}`);
		out.set(k, normHex(m[2]));
	}
	return out;
}

export function gradeScale(answer: unknown, p: ScaleParams): Check[] {
	const keys = Array.isArray(p?.keys) ? p.keys : [];
	const scale = () => readScale(answer, keys);
	const lch = () => {
		const s = scale();
		return keys.map((k) => oklchOfHex(s[k] as string));
	};
	const checks: Check[] = [
		chk("eleven-keys-valid-hex", () => Object.keys(scale()).length === keys.length && keys.length === 11),
		chk("lightness-decreasing", () => {
			const c = lch();
			return c.every((x, i) => i === 0 || x.L < (c[i - 1]?.L as number) - EPS);
		}),
		chk("light-end-floor", () => (lch()[0]?.L as number) >= p.lightFloor - EPS),
		chk("dark-end-ceiling", () => (lch()[keys.length - 1]?.L as number) <= p.darkCeiling + EPS),
		chk("even-steps", () => {
			const c = lch();
			const d = c.slice(1).map((x, i) => (c[i]?.L as number) - x.L);
			const sorted = [...d].sort((a, b) => a - b);
			const n = sorted.length;
			const med = n % 2 ? (sorted[(n - 1) / 2] as number) : ((sorted[n / 2 - 1] as number) + (sorted[n / 2] as number)) / 2;
			return med > 0 && d.every((x) => x >= p.stepRatio[0] * med - EPS && x <= p.stepRatio[1] * med + EPS);
		}),
		chk("hue-consistent", () =>
			lch().every((x) => x.C < p.hue.minChroma || hueDist(x.H, p.hue.seedHue) <= p.hue.tol + EPS),
		),
		chk("steps-distinct", () => new Set(Object.values(scale())).size === keys.length),
	];
	if (p.seed) {
		const seed = p.seed;
		checks.push(
			chk("seed-placed", () => {
				const s = scale();
				const target = oklabOfHex(seed.hex);
				return seed.steps.some((k) => okDist(oklabOfHex(s[k] as string), target) <= seed.tol + EPS);
			}),
		);
	}
	if (p.midChroma) {
		const mc = p.midChroma;
		const seed = p.seed;
		checks.push(
			chk("mid-chroma-kept", () => {
				const s = scale();
				// The step holding the seed does not count, so the check measures the steps around it.
				const isSeed = (k: string) =>
					seed !== undefined && okDist(oklabOfHex(s[k] as string), oklabOfHex(seed.hex)) <= seed.tol + EPS;
				const others = mc.steps.filter((k) => !isSeed(k));
				return others.length > 0 && Math.max(...others.map((k) => oklchOfHex(s[k] as string).C)) >= mc.ratio * mc.seedChroma - EPS;
			}),
		);
	}
	if (p.maxChroma !== undefined) {
		const cap = p.maxChroma;
		checks.push(chk("neutral-chroma-cap", () => lch().every((x) => x.C <= cap + EPS)));
	}
	if (p.tint) {
		const t = p.tint;
		checks.push(
			chk("tinted-toward-seed", () => {
				const s = scale();
				return t.steps.every((k) => {
					const c = oklchOfHex(s[k] as string);
					return c.C >= t.minChroma - EPS && hueDist(c.H, p.hue.seedHue) <= t.hueTol + EPS;
				});
			}),
		);
	}
	if (p.contrast) {
		const cr = p.contrast;
		checks.push(
			chk(`contrast-${cr.fg}-on-${cr.bg}`, () => {
				const s = scale();
				return contrast(s[cr.fg] as string, s[cr.bg] as string) >= cr.min - EPS;
			}),
		);
	}
	if (p.css) {
		const prefix = p.css.prefix;
		checks.push(
			chk("css-matches-json", () => {
				const s = scale();
				const css = parseCss(isRecord(answer) ? answer.css : undefined, prefix);
				return css.size === keys.length && keys.every((k) => css.get(k) === s[k]);
			}),
		);
	}
	return checks;
}

// =====================================================================================
// 310 role-tokens
// =====================================================================================

export type Pair = [string, string, number];

export interface RolesParams {
	themes: ("light" | "dark")[];
	roles: string[];
	/** [foreground role, background role, minimum WCAG 2 ratio], checked in every theme. */
	pairs: Pair[];
	containerMargin: number;
	primary: { seedHue: number; tol: number; minChroma: number };
	secondary: { hue: number; tol: number; minChroma: number };
	surfaces: { roles: string[]; maxChroma: number; lightMinL: number; darkMaxL: number };
	error: { band: [number, number]; minChroma: number };
	bands?: { role: string; band: [number, number]; minChroma: number }[];
	/** Surface roles that must step monotonically by at least minStep in Oklab L (darker in light, lighter in dark). */
	levels?: { roles: string[]; minStep: number };
	/** Oklab L bounds for a role in one theme (for example an inverse surface). */
	lightness?: { role: string; theme: "light" | "dark"; min?: number; max?: number }[];
	derivation?: unknown;
}

function readTheme(answer: unknown, theme: string, roles: string[]): Record<string, string> {
	const t = isRecord(answer) ? answer[theme] : undefined;
	if (!isRecord(t)) throw new Error("no theme");
	return Object.fromEntries(roles.map((r) => [r, hexAt(t, r)]));
}

export function gradeRoles(answer: unknown, p: RolesParams): Check[] {
	const themes = Array.isArray(p?.themes) ? p.themes : [];
	const checks: Check[] = [];
	for (const th of themes) {
		const T = () => readTheme(answer, th, p.roles);
		const L = (r: string) => oklabOfHex(T()[r] as string)[0];
		const lch = (r: string) => oklchOfHex(T()[r] as string);
		checks.push(chk(`${th}-roles-present`, () => Object.keys(T()).length === p.roles.length));
		for (const [fg, bg, min] of p.pairs) {
			checks.push(chk(`${th}-contrast-${fg}-on-${bg}`, () => contrast(T()[fg] as string, T()[bg] as string) >= min - EPS));
		}
		checks.push(
			chk(`${th}-container-lightness`, () =>
				th === "light"
					? L("primary-container") - L("primary") >= p.containerMargin - EPS
					: L("primary") - L("primary-container") >= p.containerMargin - EPS,
			),
		);
		checks.push(
			chk(`${th}-primary-hue`, () => {
				const c = lch("primary");
				return c.C >= p.primary.minChroma - EPS && hueDist(c.H, p.primary.seedHue) <= p.primary.tol + EPS;
			}),
		);
		checks.push(
			chk(`${th}-secondary-hue`, () => {
				const c = lch("secondary");
				return c.C >= p.secondary.minChroma - EPS && hueDist(c.H, p.secondary.hue) <= p.secondary.tol + EPS;
			}),
		);
		checks.push(chk(`${th}-surfaces-neutral`, () => p.surfaces.roles.every((r) => lch(r).C <= p.surfaces.maxChroma + EPS)));
		checks.push(
			chk(`${th}-surface-lightness`, () =>
				th === "light" ? L("surface") >= p.surfaces.lightMinL - EPS : L("surface") <= p.surfaces.darkMaxL + EPS,
			),
		);
		checks.push(
			chk(`${th}-error-hue`, () => {
				const c = lch("error");
				return c.C >= p.error.minChroma - EPS && hueInBand(c.H, p.error.band[0], p.error.band[1]);
			}),
		);
		for (const b of p.bands ?? []) {
			checks.push(
				chk(`${th}-${b.role}-hue`, () => {
					const c = lch(b.role);
					return c.C >= b.minChroma - EPS && hueInBand(c.H, b.band[0], b.band[1]);
				}),
			);
		}
		for (const lr of (p.lightness ?? []).filter((x) => x.theme === th)) {
			checks.push(
				chk(`${th}-${lr.role}-lightness`, () => {
					const l = L(lr.role);
					return (lr.min === undefined || l >= lr.min - EPS) && (lr.max === undefined || l <= lr.max + EPS);
				}),
			);
		}
		if (p.levels) {
			const lv = p.levels;
			checks.push(
				chk(`${th}-surface-levels`, () => {
					const Ls = lv.roles.map(L);
					const sign = th === "light" ? -1 : 1;
					return Ls.every((x, i) => i === 0 || sign * (x - (Ls[i - 1] as number)) >= lv.minStep - EPS);
				}),
			);
		}
	}
	return checks;
}

// =====================================================================================
// 311 constraint-search
// =====================================================================================

export type SearchParams =
	| {
			shape: "fix";
			field: string;
			background: string;
			original: string;
			target: number;
			hueTol: number;
			/** Smallest Oklab distance to `original` over all opaque 8-bit colors meeting target and hue (exhaustive). */
			optimum: number;
			factor: number;
			slack: number;
			derivation?: unknown;
	  }
	| {
			shape: "dual";
			field: string;
			light: string;
			dark: string;
			min: number;
			band: [number, number];
			minChroma: number;
			derivation?: unknown;
	  }
	| {
			shape: "map";
			targets: { field: string; ref: string; dTol: number; lTol: number; hTol: number }[];
			derivation?: unknown;
	  };

export function gradeSearch(answer: unknown, p: SearchParams): Check[] {
	const hex = (f: string) => hexAt(answer, f);
	switch (p?.shape) {
		case "fix": {
			const o = oklchOfHex(p.original);
			return [
				chk("valid-hex", () => isHexStr(hex(p.field))),
				chk("contrast-target", () => contrast(hex(p.field), p.background) >= p.target - EPS),
				chk("hue-kept", () => hueDist(oklchOfHex(hex(p.field)).H, o.H) <= p.hueTol + EPS),
				chk(
					"close-to-original",
					() => okDist(oklabOfHex(hex(p.field)), oklabOfHex(p.original)) <= p.factor * p.optimum + p.slack + EPS,
				),
			];
		}
		case "dual":
			return [
				chk("valid-hex", () => isHexStr(hex(p.field))),
				chk("contrast-light-surface", () => contrast(hex(p.field), p.light) >= p.min - EPS),
				chk("contrast-dark-surface", () => contrast(hex(p.field), p.dark) >= p.min - EPS),
				chk("hue-band", () => hueInBand(oklchOfHex(hex(p.field)).H, p.band[0], p.band[1])),
				chk("chroma-floor", () => oklchOfHex(hex(p.field)).C >= p.minChroma - EPS),
			];
		case "map":
			return p.targets.flatMap((t) => {
				const ref = oklchOfHex(t.ref);
				return [
					chk(`${t.field}-close`, () => okDist(oklabOfHex(hex(t.field)), oklabOfHex(t.ref)) <= t.dTol + EPS),
					chk(`${t.field}-lightness`, () => Math.abs(oklchOfHex(hex(t.field)).L - ref.L) <= t.lTol + EPS),
					chk(`${t.field}-hue`, () => hueDist(oklchOfHex(hex(t.field)).H, ref.H) <= t.hTol + EPS),
				];
			});
		default:
			return [chk("valid-shape", () => false)];
	}
}

// =====================================================================================
// 312 palette-audit
// =====================================================================================

export type AuditParams =
	| {
			shape: "set";
			field: string;
			/** How an answer entry becomes a key: a string id, an unordered pair of names, or an object's fields. */
			item: { k: "id" } | { k: "pair" } | { k: "fields"; fields: string[] };
			universe: string[];
			expected: string[];
			/** "per-item": one check per universe key; "per-expected": one per expected key plus one false-positive check. */
			mode: "per-item" | "per-expected";
			derivation?: unknown;
	  }
	| {
			shape: "chart";
			field: string;
			candidates: string[];
			background: string;
			k: number;
			minContrast: number;
			threshold: number;
			derivation?: unknown;
	  }
	| {
			shape: "dark";
			field: string;
			light: Record<string, string>;
			pairs: Pair[];
			hueTol: number;
			hueMinChroma: number;
			darkMinChroma: number;
			surfaces: string[];
			surfaceMaxL: number;
			derivation?: unknown;
	  };

const norm = (s: string) => s.trim().toLowerCase();

export function itemKey(v: unknown, item: Extract<AuditParams, { shape: "set" }>["item"]): string {
	switch (item.k) {
		case "id":
			if (typeof v !== "string") throw new Error("not a string");
			return norm(v);
		case "pair": {
			if (!Array.isArray(v) || v.length !== 2 || !v.every((x) => typeof x === "string")) throw new Error("not a pair");
			return (v as string[]).map(norm).sort().join("|");
		}
		case "fields":
			if (!isRecord(v)) throw new Error("not an object");
			return item.fields
				.map((f) => {
					const x = v[f];
					if (typeof x !== "string") throw new Error("field");
					return norm(x);
				})
				.join("|");
	}
}

function readKeys(answer: unknown, p: Extract<AuditParams, { shape: "set" }>): Set<string> {
	const arr = isRecord(answer) ? answer[p.field] : undefined;
	if (!Array.isArray(arr)) throw new Error("no list");
	return new Set(arr.map((v) => itemKey(v, p.item)));
}

export function gradeAudit(answer: unknown, p: AuditParams): Check[] {
	switch (p?.shape) {
		case "set": {
			const exp = new Set(p.expected.map(norm));
			const uni = new Set(p.universe.map(norm));
			const out: Check[] = [];
			if (p.mode === "per-item") {
				for (const u of uni) out.push(chk(`verdict-${u}`, () => readKeys(answer, p).has(u) === exp.has(u)));
			} else {
				for (const e of exp) out.push(chk(`found-${e}`, () => readKeys(answer, p).has(e)));
				out.push(chk("no-false-positives", () => [...readKeys(answer, p)].every((k) => exp.has(k))));
			}
			out.push(chk("no-unknown-entries", () => [...readKeys(answer, p)].every((k) => uni.has(k))));
			return out;
		}
		case "chart": {
			const cand = new Set(p.candidates.map((h) => normHex(h)));
			const picks = (): string[] => {
				const arr = isRecord(answer) ? answer[p.field] : undefined;
				if (!Array.isArray(arr)) throw new Error("no picks");
				return arr.map((h) => normHex(h));
			};
			return [
				chk("pick-count", () => picks().length === p.k),
				chk("picks-distinct-from-candidates", () => {
					const ps = picks();
					return new Set(ps).size === ps.length && ps.every((h) => cand.has(h));
				}),
				chk("contrast-against-background", () => {
					const ps = picks();
					return ps.length > 0 && ps.every((h) => contrast(h, p.background) >= p.minContrast - EPS);
				}),
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
		case "dark": {
			const names = Object.keys(p.light ?? {});
			const T = () => {
				const t = isRecord(answer) ? answer[p.field] : undefined;
				if (!isRecord(t)) throw new Error("no tokens");
				return Object.fromEntries(names.map((n) => [n, hexAt(t, n)]));
			};
			const out: Check[] = [chk("tokens-present", () => Object.keys(T()).length === names.length)];
			for (const [fg, bg, min] of p.pairs)
				out.push(chk(`contrast-${fg}-on-${bg}`, () => contrast(T()[fg] as string, T()[bg] as string) >= min - EPS));
			for (const n of names) {
				const lc = oklchOfHex(p.light[n] as string);
				if (lc.C < p.hueMinChroma) continue;
				out.push(
					chk(`hue-${n}`, () => {
						const c = oklchOfHex(T()[n] as string);
						return c.C >= p.darkMinChroma - EPS && hueDist(c.H, lc.H) <= p.hueTol + EPS;
					}),
				);
			}
			out.push(chk("surfaces-dark", () => p.surfaces.every((s) => oklabOfHex(T()[s] as string)[0] <= p.surfaceMaxL + EPS)));
			return out;
		}
		default:
			return [chk("valid-shape", () => false)];
	}
}
