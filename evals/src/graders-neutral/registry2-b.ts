import type { Check } from "../tasks/types.js";
import { gradeB2 } from "./v2-b-checks.js";

type GraderFn = (answer: unknown, params: never) => Check[];

/**
 * Neutral v2 grader kinds that v1 does not have (kind names start with `neutral-`). Author B's v2
 * tasks reuse v1's four kinds, except the one task whose answer is a set of unordered color pairs.
 */
export const REGISTRY2_B: Record<string, GraderFn> = {
	"neutral-cvd-pair-set": gradeB2,
};
