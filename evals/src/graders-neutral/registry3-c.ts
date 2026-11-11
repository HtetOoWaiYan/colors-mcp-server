import type { Check } from "../tasks/types.js";
import { gradeAudit3, gradeRoles3, gradeScale3, gradeSearch3 } from "./v3-c-graders.js";

type GraderFn = (answer: unknown, params: never) => Check[];

/**
 * Neutral v3 grader kinds that v1 and v2 do not have (kind names start with `neutral-`). Author C's
 * v3 tasks reuse v1's kinds where they fit (the verdict-set audits); each kind below runs the earlier
 * grader's checks and adds the constraints v3 states (see v3-c-graders.ts).
 */
export const REGISTRY3_C: Record<string, GraderFn> = {
	"neutral-tonal-scale-v3": gradeScale3 as GraderFn,
	"neutral-role-tokens-v3": gradeRoles3 as GraderFn,
	"neutral-constraint-search-v3": gradeSearch3 as GraderFn,
	"neutral-palette-audit-v3": gradeAudit3 as GraderFn,
};
