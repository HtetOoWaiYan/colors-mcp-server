/**
 * Author A grader engine (categories 301-304). Every expected value and tolerance lives in the task's
 * params, computed at build time by src/reference-neutral/a-*.ts, so the grader stays a pure lookup:
 * find the answer's row by key, compare each named field, one named Check per comparison.
 * A missing or mistyped field fails its check (via `chk`) and never throws.
 */
import { chk, isNum, isRecord, normHex, rgbOf } from "../graders/helpers.js";
import { isHex } from "../reference/color.js";
import type { Check } from "../tasks/types.js";

export type Expect =
	/** |answer - v| <= tol */
	| { k: "num"; v: number; tol: number }
	/** circular difference in degrees <= tol */
	| { k: "hue"; v: number; tol: number }
	/** numeric array of the same length; component i within tol[i]; tol null skips it; indices in `hue` are circular */
	| { k: "vec"; v: number[]; tol: (number | null)[]; hue?: number[] }
	/** CSS `color(<space> r g b)` string with that space name and channels within tol (null skips) */
	| { k: "css"; space: string; v: number[]; tol: (number | null)[] }
	/** equal after normalization (hex to #rrggbb, other strings trimmed and lowercased) */
	| { k: "eq"; v: string | number | boolean }
	/** hex color, each 8-bit channel within tol */
	| { k: "hex"; v: string; tol: number }
	/** list equal element by element after normalization */
	| { k: "seq"; v: string[] }
	/** same elements in any order after normalization, no duplicates */
	| { k: "set"; v: string[] };

export interface CheckSpec {
	name: string;
	/** path inside the row (row checks) or inside the answer (top checks) */
	path: (string | number)[];
	e: Expect;
}

export interface TableParams {
	/** answer field holding the row array (default "results") */
	list?: string;
	/** row key field (default "id") */
	key?: string;
	rows?: { key: string; checks: CheckSpec[] }[];
	top?: CheckSpec[];
	/** free-form provenance (thresholds, margins, how the expected values were derived) */
	derivation?: unknown;
}

const norm = (v: unknown): string | number | boolean => {
	if (typeof v === "string") return isHex(v) ? normHex(v) : v.trim().toLowerCase();
	if (typeof v === "number" || typeof v === "boolean") return v;
	throw new Error("unsupported value");
};

const at = (obj: unknown, path: (string | number)[]): unknown => {
	let cur = obj;
	for (const p of path) {
		if (cur === null || typeof cur !== "object") return undefined;
		cur = (cur as Record<string | number, unknown>)[p];
	}
	return cur;
};

const hueDiff = (a: number, b: number) => Math.abs(((((a - b) % 360) + 540) % 360) - 180);

function vecOk(got: unknown, v: number[], tol: (number | null)[], hue: number[] = []): boolean {
	if (!Array.isArray(got) || got.length !== v.length) return false;
	return v.every((want, i) => {
		const t = tol[i];
		if (t === null || t === undefined) return true;
		const g = got[i];
		if (!isNum(g)) return false;
		return hue.includes(i) ? hueDiff(g, want) <= t : Math.abs(g - want) <= t;
	});
}

const CSS_RE = /^color\(\s*([a-z0-9-]+)\s+([^\s)]+)\s+([^\s)]+)\s+([^\s)/]+)\s*\)$/i;

export function matches(got: unknown, e: Expect): boolean {
	switch (e.k) {
		case "num":
			return isNum(got) && Math.abs(got - e.v) <= e.tol;
		case "hue":
			return isNum(got) && hueDiff(got, e.v) <= e.tol;
		case "vec":
			return vecOk(got, e.v, e.tol, e.hue);
		case "css": {
			if (typeof got !== "string") return false;
			const m = CSS_RE.exec(got.trim());
			if (!m || (m[1] as string).toLowerCase() !== e.space) return false;
			const nums = [m[2], m[3], m[4]].map((s) => (s && /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s) ? Number(s) : Number.NaN));
			return vecOk(nums, e.v, e.tol);
		}
		case "eq":
			return norm(got) === norm(e.v);
		case "hex": {
			const a = rgbOf(got);
			const b = rgbOf(e.v);
			return a.every((x, i) => Math.abs(Math.round(x * 255) - Math.round((b[i] as number) * 255)) <= e.tol);
		}
		case "seq":
			return Array.isArray(got) && got.length === e.v.length && got.every((g, i) => norm(g) === norm(e.v[i]));
		case "set": {
			if (!Array.isArray(got) || got.length !== e.v.length) return false;
			const g = new Set(got.map(norm));
			return g.size === e.v.length && e.v.every((x) => g.has(norm(x)));
		}
	}
}

export function gradeTable(answer: unknown, params: TableParams): Check[] {
	const checks: Check[] = [];
	const list = params.list ?? "results";
	const key = params.key ?? "id";
	const rows = isRecord(answer) && Array.isArray(answer[list]) ? (answer[list] as unknown[]) : [];
	for (const row of params.rows ?? []) {
		const found = rows.find((r) => {
			try {
				return isRecord(r) && norm(r[key]) === norm(row.key);
			} catch {
				return false;
			}
		});
		for (const c of row.checks) checks.push(chk(c.name, () => found !== undefined && matches(at(found, c.path), c.e)));
	}
	for (const c of params.top ?? []) checks.push(chk(c.name, () => matches(at(answer, c.path), c.e)));
	return checks;
}
