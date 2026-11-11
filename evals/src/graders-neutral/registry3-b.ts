import type { Check } from "../tasks/types.js";
import { gradeB3 } from "./v3-b-checks.js";

type GraderFn = (answer: unknown, params: never) => Check[];

/**
 * Neutral v3 grader kinds that v1 and v2 do not have (kind names start with `neutral-`). Author B's
 * v3 tasks reuse v1's four kinds, except the two naming tasks whose answers are alias-sensitive
 * keyword lists or unordered pairs (see v3-b-checks.ts).
 */
export const REGISTRY3_B: Record<string, GraderFn> = {
	"neutral-keyword-checks": gradeB3,
};
