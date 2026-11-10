/**
 * Author B's grader engine for categories 305-308. A task's params carry a list of named checks;
 * each check reads one value from the answer by a path and tests it against a JSON expectation.
 * Some expectations are computed from the answer itself (a hex's HSL or Oklch coordinate), so any
 * correctly rounded hex passes rather than only the reference's own rounding.
 */
import { hexToRgb } from "../reference/color.js";
import { hslOfHex, hueDist, oklchOfHex } from "../reference-neutral/b-spaces.js";
import type { Check } from "../tasks/types.js";
import { chk, isHexStr, isNum, normHex } from "../graders/helpers.js";

/**
 * A path step: object key, array index, or "the array element whose field `by` equals `eq`".
 * String keys match case-insensitively, hex keys after normalization (#c50 = #CC5500), number keys
 * numerically (0.4 = 0.40 = "0.4").
 */
export type PathSeg = string | number | { by: string; eq: string | number };

export type Expect =
	/** Boolean or number exactly; string compared trimmed and case-insensitively. */
	| { k: "eq"; v: string | number | boolean }
	/** A string equal (trimmed, case-insensitive, spaces/hyphens ignored) to one of the accepted values. */
	| { k: "oneOf"; v: string[] }
	/** A hex color within `tol` 8-bit steps of `v` on every channel. */
	| { k: "hex"; v: string; tol: number }
	| { k: "num"; v: number; tol: number }
	/** An array of strings that does (want = true) or does not contain `v` (case-insensitive). */
	| { k: "has"; v: string; want: boolean }
	/** An array of strings equal to `v` in order (case-insensitive). */
	| { k: "seq"; v: string[] }
	/** An array of strings equal to `v` as a set: same members, any order, no extras (case-insensitive). */
	| { k: "set"; v: string[] }
	/** A hex whose coordinate in `space` is within tol of v. HSL: [H deg, S %, L %]; Oklch: [L, C, H deg]. Hues are circular. */
	| { k: "coord"; space: "hsl" | "oklch"; i: 0 | 1 | 2; v: number; tol: number };

export interface CheckSpec {
	name: string;
	path: PathSeg[];
	e: Expect;
}

export interface BParams {
	checks: CheckSpec[];
	derivation?: unknown;
}

const normStr = (s: string): string => s.trim().toLowerCase();
const normName = (s: string): string => normStr(s).replace(/[\s_-]+/g, "");
/** Hex strings normalize to lowercase #rrggbb; other strings to trimmed lowercase. */
const normKey = (s: string): string => (isHexStr(s) ? normHex(s) : normStr(s));

function keyMatches(v: unknown, want: string | number): boolean {
	if (typeof want === "number") {
		const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : Number.NaN;
		return Number.isFinite(n) && Math.abs(n - want) < 1e-9;
	}
	return typeof v === "string" && normKey(v) === normKey(want);
}

export function resolve(answer: unknown, path: readonly PathSeg[]): unknown {
	let cur: unknown = answer;
	for (const seg of path) {
		if (cur === null || cur === undefined) return undefined;
		if (typeof seg === "object") {
			if (!Array.isArray(cur)) return undefined;
			cur = cur.find(
				(el) => typeof el === "object" && el !== null && keyMatches((el as Record<string, unknown>)[seg.by], seg.eq),
			);
		} else {
			if (typeof cur !== "object") return undefined;
			cur = (cur as Record<string | number, unknown>)[seg];
		}
	}
	return cur;
}

const strArray = (v: unknown): string[] => {
	if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) throw new Error("not a string array");
	return v.map(normKey);
};

export function test(v: unknown, e: Expect): boolean {
	switch (e.k) {
		case "eq":
			if (typeof e.v === "string") return typeof v === "string" && normKey(v) === normKey(e.v);
			return v === e.v;
		case "oneOf":
			return typeof v === "string" && e.v.some((x) => normName(x) === normName(v));
		case "hex": {
			if (!isHexStr(v)) return false;
			const a = hexToRgb(v);
			const b = hexToRgb(e.v);
			return [0, 1, 2].every((i) => Math.abs((a[i] as number) - (b[i] as number)) * 255 <= e.tol + 1e-9);
		}
		case "num":
			return isNum(v) && Math.abs(v - e.v) <= e.tol + 1e-9;
		case "has":
			return strArray(v).includes(normKey(e.v)) === e.want;
		case "seq": {
			const a = strArray(v);
			return a.length === e.v.length && a.every((x, i) => x === normKey(e.v[i] as string));
		}
		case "set": {
			const a = new Set(strArray(v));
			const b = new Set(e.v.map(normKey));
			return a.size === b.size && [...b].every((x) => a.has(x));
		}
		case "coord": {
			if (!isHexStr(v)) return false;
			const c = e.space === "hsl" ? hslOfHex(v) : oklchOfHex(v);
			const val = e.space === "hsl" && e.i > 0 ? (c[e.i] as number) * 100 : (c[e.i] as number);
			const isHue = (e.space === "hsl" && e.i === 0) || (e.space === "oklch" && e.i === 2);
			return (isHue ? hueDist(val, e.v) : Math.abs(val - e.v)) <= e.tol + 1e-9;
		}
	}
}

export function gradeB(answer: unknown, params: BParams): Check[] {
	const specs = Array.isArray(params?.checks) ? params.checks : [];
	return specs.map((c) => chk(c.name, () => test(resolve(answer, c.path), c.e)));
}
