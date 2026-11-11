import type { Check } from "../tasks/types.js";
import { gradeScale2 } from "./v2-c-graders.js";

type GraderFn = (answer: unknown, params: never) => Check[];

/**
 * Neutral v2 grader kinds that v1 does not have (kind names start with `neutral-`). Author C's v2
 * tasks reuse v1's four kinds, except tonal scales with several stated contrast pairings.
 */
export const REGISTRY2_C: Record<string, GraderFn> = {
	"neutral-tonal-scale-pairs": gradeScale2 as GraderFn,
};
