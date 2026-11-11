/**
 * Author B, neutral suite v2: one grader capability v1's check engine (b-checks.ts) lacks. A task
 * that asks for "every pair of colors that ..." gets an answer shaped as a list of two-element id
 * lists, in any order and with either member first; a `pair` check asks whether one unordered pair
 * is (want = true) or is not (want = false) in that list. Every other expectation is delegated to
 * v1's `test`, so a v2 check list may mix both.
 */
import type { Check } from "../tasks/types.js";
import { chk } from "../graders/helpers.js";
import { type Expect, type PathSeg, resolve, test } from "./b-checks.js";

export type PairExpect = { k: "pair"; v: [string, string]; want: boolean };
export type Expect2 = Expect | PairExpect;

export interface CheckSpec2 {
	name: string;
	path: PathSeg[];
	e: Expect2;
}

export interface B2Params {
	checks: CheckSpec2[];
	derivation?: unknown;
}

const norm = (s: string): string => s.trim().toLowerCase().replace(/[\s_-]+/g, "");

/** Throws (so the check fails) unless `v` is a list of two-string lists. */
function pairList(v: unknown): [string, string][] {
	if (!Array.isArray(v)) throw new Error("not a list");
	return v.map((p) => {
		if (!Array.isArray(p) || p.length !== 2 || typeof p[0] !== "string" || typeof p[1] !== "string")
			throw new Error("not a pair");
		return [norm(p[0]), norm(p[1])];
	});
}

export function test2(v: unknown, e: Expect2): boolean {
	if (e.k !== "pair") return test(v, e);
	const a = norm(e.v[0]);
	const b = norm(e.v[1]);
	const has = pairList(v).some(([x, y]) => (x === a && y === b) || (x === b && y === a));
	return has === e.want;
}

export function gradeB2(answer: unknown, params: B2Params): Check[] {
	const specs = Array.isArray(params?.checks) ? params.checks : [];
	return specs.map((c) => chk(c.name, () => test2(resolve(answer, c.path), c.e)));
}
