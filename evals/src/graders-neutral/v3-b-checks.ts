/**
 * Author B, neutral suite v3: one capability the v1/v2 check engines (b-checks.ts, v2-b-checks.ts)
 * lack. A task that asks for "every CSS keyword within some distance of a color" gets a list of
 * keyword names back, and several keywords share one value (gray/grey, aqua/cyan, fuchsia/magenta,
 * slategray/slategrey ...), so a plain string-set check would wrongly demand one particular alias.
 *
 * - `kwHas`: the list names at least one keyword whose CSS Color 4 value is `value` (any alias).
 * - `kwOnly`: every entry of the list is a CSS keyword whose value is one of `values` (an unknown
 *   word or a keyword outside the expected values fails).
 *
 * Every other expectation is delegated to v2's `test2` (and through it to v1's `test`), so one v3
 * check list may mix all kinds.
 */
import { CSS_NAMED } from "../reference-neutral/b-naming.js";
import type { Check } from "../tasks/types.js";
import { chk } from "../graders/helpers.js";
import { type PathSeg, resolve } from "./b-checks.js";
import { type Expect2, test2 } from "./v2-b-checks.js";

export type KeywordExpect = { k: "kwHas"; value: string } | { k: "kwOnly"; values: string[] };
export type Expect3 = Expect2 | KeywordExpect;

export interface CheckSpec3 {
	name: string;
	path: PathSeg[];
	e: Expect3;
}

export interface B3Params {
	checks: CheckSpec3[];
	derivation?: unknown;
}

/** "Light Sea Green", "light-sea-green" and "lightseagreen" are the same keyword. */
const normName = (s: string): string => s.trim().toLowerCase().replace(/[\s_-]+/g, "");

/** The CSS value of a keyword, or undefined for a word that is not a CSS named color. */
export function keywordValue(name: string): string | undefined {
	return CSS_NAMED[normName(name)];
}

/** Throws (so the check fails) unless `v` is a list of strings. */
function strList(v: unknown): string[] {
	if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) throw new Error("not a list of strings");
	return v;
}

export function test3(v: unknown, e: Expect3): boolean {
	switch (e.k) {
		case "kwHas":
			return strList(v).some((n) => keywordValue(n) === e.value.toLowerCase());
		case "kwOnly": {
			const allowed = new Set(e.values.map((x) => x.toLowerCase()));
			return strList(v).every((n) => {
				const val = keywordValue(n);
				return val !== undefined && allowed.has(val);
			});
		}
		default:
			return test2(v, e);
	}
}

export function gradeB3(answer: unknown, params: B3Params): Check[] {
	const specs = Array.isArray(params?.checks) ? params.checks : [];
	return specs.map((c) => chk(c.name, () => test3(resolve(answer, c.path), c.e)));
}
