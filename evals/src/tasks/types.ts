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
	// Generalization suite: categories 101+ so they never collide with v1's numbering.
	101: "constrained-pick",
	102: "scrim",
	103: "dual-surface",
	104: "composite-mix",
	105: "grayscale-safe",
	106: "diverging-scale",
	107: "video-ycbcr",
	// Fresh suite: categories 201+; same kinds as 101-107 with new parameters, plus one new kind.
	201: "constrained-pick",
	202: "scrim",
	203: "dual-surface",
	204: "composite-mix",
	205: "grayscale-safe",
	206: "diverging-scale",
	207: "video-ycbcr",
	208: "gradient-text",
	// Neutral suite: categories 301+; one category per capability domain advertised across the servers compared.
	301: "apca-contrast",
	302: "delta-e",
	303: "space-conversion",
	304: "color-properties",
	305: "cvd-simulation",
	306: "interpolation",
	307: "harmony",
	308: "naming-and-text-color",
	309: "tonal-scale",
	310: "role-tokens",
	311: "constraint-search",
	312: "palette-audit",
};
