export type Split = "dev" | "heldout";

export interface Check {
	name: string;
	pass: boolean;
}

export interface GraderSpec {
	kind: string;
	// biome-ignore lint/suspicious/noExplicitAny: params are per-grader JSON, validated by the grader tests
	params: any;
}

export interface Task {
	id: string;
	category: number;
	categoryName: string;
	split: Split;
	prompt: string;
	schema: Record<string, unknown>;
	grader: GraderSpec;
	witness: unknown;
	invalid: unknown[];
	/** Informational only: whether a tool is expected to help. */
	toolUseful: boolean;
}

export const CATEGORY_NAMES: Record<number, string> = {
	1: "convert",
	2: "parse",
	3: "contrast-verdict",
	4: "contrast-fix",
	5: "adjust",
	6: "gradient",
	7: "nearest",
	8: "ramp",
	9: "theme-tokens",
	10: "harmony",
	11: "deutan-set",
	12: "audit",
	13: "end-to-end",
	14: "trap",
};
