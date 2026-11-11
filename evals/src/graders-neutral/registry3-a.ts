import type { Check } from "../tasks/types.js";

type GraderFn = (answer: unknown, params: never) => Check[];

/** Neutral v3 grader kinds that v1 and v2 do not have (kind names start with `neutral-`). Empty when v3 only reuses earlier kinds. */
export const REGISTRY3_A: Record<string, GraderFn> = {};
