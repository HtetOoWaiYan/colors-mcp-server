import {
	contrastRatio,
	deutanDeltaE,
	hexDeltaE2000,
	hexOkDistance,
	hueDiff,
	minPairwise,
	type Oklch,
	okDistance,
	rgbToOklab,
	rgbToOklch,
	type Vec3,
} from "../reference/color.js";
import { hueOk } from "../reference/fix.js";
import type { Check } from "../tasks/types.js";
import {
	chk,
	get,
	isHexStr,
	isNum,
	isRecord,
	normHex,
	rgbOf,
} from "./helpers.js";

const oklchOfHex = (hex: unknown): Oklch => rgbToOklch(rgbOf(hex));
const labOfHex = (hex: unknown): Vec3 => rgbToOklab(rgbOf(hex));

// ---- 3. contrast verdict ----
export interface VerdictItem {
	threshold: number;
	pass: boolean;
	ratio: number;
}
export function gradeVerdict(
	answer: unknown,
	params: { items: VerdictItem[] },
): Check[] {
	return params.items.flatMap((item, i) => [
		chk(
			`item${i}.verdict`,
			() => get(answer, "results", i, "pass") === item.pass,
		),
		chk(`item${i}.ratio`, () => {
			const r = get(answer, "results", i, "ratio");
			return isNum(r) && Math.abs(r - item.ratio) <= 0.05;
		}),
	]);
}

// ---- 4. contrast fix ----
export interface FixParams {
	fg: string;
	bg: string;
	target: number;
	dStar: number;
	hueConstrained: boolean;
}
export function gradeFix(answer: unknown, p: FixParams): Check[] {
	const hex = get(answer, "hex");
	return [
		chk("valid_hex", () => isHexStr(hex)),
		chk("contrast", () => contrastRatio(normHex(hex), p.bg) >= p.target),
		chk("hue", () => !p.hueConstrained || hueOk(p.fg, rgbOf(hex))),
		chk(
			"minimal_change",
			() => hexOkDistance(normHex(hex), p.fg) <= 2 * p.dStar + 0.01,
		),
	];
}

// ---- 5. adjust ----
export function gradeAdjust(
	answer: unknown,
	params: { items: { expectedHex: string }[] },
): Check[] {
	return params.items.map((item, i) =>
		chk(
			`item${i}`,
			() =>
				hexOkDistance(
					normHex(get(answer, "results", i, "hex")),
					item.expectedHex,
				) <= 0.02,
		),
	);
}

// ---- 6. gradient ----
export function gradeGradient(
	answer: unknown,
	p: { n: number; ref: Vec3[] },
): Check[] {
	const stops = get(answer, "stops");
	const arr = () => stops as unknown[];
	return [
		chk("count", () => Array.isArray(stops) && stops.length === p.n),
		chk("valid_hex", () => arr().length === p.n && arr().every(isHexStr)),
		chk("endpoints", () =>
			[0, p.n - 1].every(
				(k) => okDistance(labOfHex(arr()[k]), p.ref[k] as Vec3) <= 0.02,
			),
		),
		chk(
			"stops_match",
			() =>
				arr().length === p.n &&
				arr().every(
					(s, k) => okDistance(labOfHex(s), p.ref[k] as Vec3) <= 0.03,
				),
		),
	];
}

// ---- 7. nearest ----
export function gradeNearest(answer: unknown, p: { order: string[] }): Check[] {
	return [
		chk("nearest", () => normHex(get(answer, "nearest")) === p.order[0]),
		chk("order", () => {
			const o = get(answer, "order");
			return (
				Array.isArray(o) &&
				o.length === p.order.length &&
				o.every((v, i) => normHex(v) === p.order[i])
			);
		}),
	];
}

// ---- 8. palette ramp ----
export function gradeRamp(answer: unknown, p: { seed: string }): Check[] {
	const steps = get(answer, "steps");
	const arr = () => steps as unknown[];
	const lch = () => arr().map(oklchOfHex);
	const seed = oklchOfHex(p.seed);
	const seedLab = labOfHex(p.seed);
	return [
		chk("count", () => Array.isArray(steps) && steps.length === 11),
		chk("valid_hex", () => arr().length === 11 && arr().every(isHexStr)),
		chk("lightness_decreasing", () =>
			lch().every((c, i, a) => i === 0 || c.L < (a[i - 1] as Oklch).L),
		),
		chk(
			"lightness_range",
			() => (lch()[0] as Oklch).L >= 0.95 && (lch()[10] as Oklch).L <= 0.25,
		),
		chk("even_steps", () => {
			const c = lch();
			const d = c.slice(1).map((x, i) => (c[i] as Oklch).L - x.L);
			const med = [...d].sort((a, b) => a - b)[
				Math.floor(d.length / 2)
			] as number;
			return d.every((x) => x >= 0.5 * med && x <= 1.5 * med);
		}),
		chk("seed_present", () =>
			arr().some((s) => okDistance(labOfHex(s), seedLab) <= 0.05),
		),
		chk(
			"chroma_kept",
			() => Math.max(...lch().map((c) => c.C)) >= 0.8 * seed.C,
		),
		chk("hue_kept", () =>
			lch().every((c) => c.C < 0.02 || hueDiff(c.H, seed.H) <= 12),
		),
		chk("distinct", () => {
			const labs = arr().map(labOfHex);
			return labs.every((a, i) =>
				labs.every((b, j) => i >= j || okDistance(a, b) >= 0.02),
			);
		}),
	];
}

// ---- 9. theme tokens ----
export interface ThemeParams {
	brand: string;
	tokens: string[];
	surfaces: string[];
	pairs: { text: string; surface: string; min: number }[];
}
export function gradeTheme(answer: unknown, p: ThemeParams): Check[] {
	const out: Check[] = [];
	for (const theme of ["light", "dark"] as const) {
		const tok = (name: string) => get(answer, theme, name);
		out.push(
			chk(`${theme}.tokens_valid`, () =>
				p.tokens.every((t) => isHexStr(tok(t))),
			),
		);
		for (const pair of p.pairs) {
			out.push(
				chk(
					`${theme}.${pair.text}/${pair.surface}>=${pair.min}`,
					() =>
						contrastRatio(
							normHex(tok(pair.text)),
							normHex(tok(pair.surface)),
						) >= pair.min,
				),
			);
		}
		out.push(
			chk(`${theme}.surface_levels`, () => {
				const L = p.surfaces.map((s) => oklchOfHex(tok(s)).L);
				return L.every((a, i) =>
					L.every((b, j) => i >= j || Math.abs(a - b) >= 0.02),
				);
			}),
		);
		out.push(
			chk(`${theme}.text_differs`, () =>
				p.pairs.every(
					(pr) => normHex(tok(pr.text)) !== normHex(tok(pr.surface)),
				),
			),
		);
	}
	out.push(
		chk(
			"light.primary_is_brand",
			() =>
				hexOkDistance(normHex(get(answer, "light", "primary")), p.brand) <=
				0.04,
		),
	);
	return out;
}

// ---- 10. harmony ----
export function gradeHarmony(
	answer: unknown,
	p: { base: string; offsets: number[] },
): Check[] {
	const colors = get(answer, "colors");
	const arr = () => colors as unknown[];
	const base = oklchOfHex(p.base);
	const lch = () => arr().map(oklchOfHex);
	return [
		chk(
			"count",
			() => Array.isArray(colors) && colors.length === p.offsets.length,
		),
		chk(
			"valid_hex",
			() => arr().length === p.offsets.length && arr().every(isHexStr),
		),
		chk("hue_offsets", () => {
			const hues = lch().map((c) => c.H);
			const want = p.offsets.map((o) => (base.H + o + 360) % 360);
			const used = new Set<number>();
			const assign = (k: number): boolean => {
				if (k === want.length) return true;
				for (let i = 0; i < hues.length; i++) {
					if (used.has(i) || hueDiff(hues[i] as number, want[k] as number) > 8)
						continue;
					used.add(i);
					if (assign(k + 1)) return true;
					used.delete(i);
				}
				return false;
			};
			return assign(0);
		}),
		chk("chroma", () => lch().every((c) => c.C >= 0.6 * base.C)),
		chk("lightness", () => lch().every((c) => Math.abs(c.L - base.L) <= 0.08)),
	];
}

// ---- 11. deuteranopia-safe set ----
export function gradeDeutan(
	answer: unknown,
	p: { background: string; n: number; threshold: number },
): Check[] {
	const colors = get(answer, "colors");
	const arr = () => (colors as unknown[]).map(normHex);
	return [
		chk("count", () => Array.isArray(colors) && colors.length === p.n),
		chk("valid_hex", () => Array.isArray(colors) && colors.every(isHexStr)),
		chk("distinct", () => new Set(arr()).size === p.n),
		chk(
			"deutan_separation",
			() => minPairwise(arr(), deutanDeltaE) >= p.threshold,
		),
		chk("normal_separation", () => minPairwise(arr(), hexDeltaE2000) >= 10),
		chk("background_contrast", () =>
			arr().every((c) => contrastRatio(c, p.background) >= 3),
		),
	];
}

// ---- 12. audit ----
export interface AuditFinding {
	rule: string;
	selector: string;
	detail?: string;
}
const key = (f: AuditFinding) =>
	JSON.stringify([f.rule, f.selector, f.detail ?? null]);
export function gradeAudit(
	answer: unknown,
	p: { expected: AuditFinding[] },
): Check[] {
	const raw = get(answer, "findings");
	const predicted = new Set<string>();
	let wellFormed = Array.isArray(raw);
	if (Array.isArray(raw)) {
		for (const f of raw) {
			if (
				isRecord(f) &&
				typeof f.rule === "string" &&
				typeof f.selector === "string"
			) {
				predicted.add(
					key({
						rule: f.rule,
						selector: f.selector,
						detail: typeof f.detail === "string" ? f.detail : undefined,
					}),
				);
			} else wellFormed = false;
		}
	}
	const expected = new Set(p.expected.map(key));
	return [
		chk(
			"recall",
			() => wellFormed && [...expected].every((k) => predicted.has(k)),
		),
		chk(
			"no_false_positives",
			() => wellFormed && [...predicted].every((k) => expected.has(k)),
		),
	];
}

// ---- 14. trap ----
export interface TrapParams {
	mode: "hex" | "string" | "bool" | "rgb";
	expected: unknown;
}
export function gradeTrap(answer: unknown, p: TrapParams): Check[] {
	const a = get(answer, "answer");
	return [
		chk("answer", () => {
			switch (p.mode) {
				case "hex":
					return normHex(a) === normHex(p.expected);
				case "string":
					return (
						typeof a === "string" &&
						a.trim().toLowerCase() === (p.expected as string).toLowerCase()
					);
				case "bool":
					return a === p.expected;
				case "rgb": {
					const e = p.expected as number[];
					return isRecord(a) && a.r === e[0] && a.g === e[1] && a.b === e[2];
				}
			}
		}),
	];
}
