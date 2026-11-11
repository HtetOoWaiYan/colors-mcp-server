import type { Check } from "../tasks/types.js";

type GraderFn = (answer: unknown, params: never) => Check[];

/** Neutral v2 grader kinds that v1 does not have (kind names start with `neutral-`). Empty when v2 only reuses v1 kinds. */
export const REGISTRY2_A: Record<string, GraderFn> = {};
