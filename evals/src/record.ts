import { createHash } from "node:crypto";
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { AgentRun } from "./runner/agent-loop.js";
import type { Check } from "./tasks/types.js";

export type Outcome =
	| "pass"
	| "semantic_failure"
	| "format_failure"
	| "limit_exhausted"
	| "infra_failed";
export type Status = "running" | "done" | "infra_failed";

export interface CellRecord {
	id: string;
	key: string; // resume key: hash of everything that determines the result
	status: Status;
	model: string;
	condition: string;
	taskId: string;
	trial: number;
	split: "dev" | "heldout";
	category: number;
	attempts: number;
	outcome?: Outcome;
	checks?: Check[];
	checkScore?: number;
	strictOk?: boolean;
	strictPass?: boolean;
	run?: Omit<AgentRun, "transcript"> & { transcript?: AgentRun["transcript"] };
	sha?: string;
	finishedAt?: string;
	infraDetail?: string;
}

export const sha256 = (s: string): string =>
	createHash("sha256").update(s).digest("hex");

export interface KeyInputs {
	serverSha: string | null;
	taskHash: string;
	graderHash: string;
	systemPrompt: string;
	toolDefsHash: string | null;
	clientProfile: string;
	generation: unknown;
	model: string;
	lockHash: string | null;
}

export const resumeKey = (i: KeyInputs): string => sha256(JSON.stringify(i));

export class ResultStore {
	constructor(
		public readonly resultsDir: string,
		public readonly sealedDir: string,
		public readonly runId: string,
	) {}

	private dirFor(split: "dev" | "heldout"): string {
		return join(
			split === "heldout" ? this.sealedDir : this.resultsDir,
			this.runId,
			"cells",
		);
	}

	pathFor(
		c: Pick<CellRecord, "split" | "model" | "condition" | "taskId" | "trial">,
	): string {
		return join(
			this.dirFor(c.split),
			c.model,
			c.condition,
			`${c.taskId}.t${c.trial}.json`,
		);
	}

	read(
		c: Pick<CellRecord, "split" | "model" | "condition" | "taskId" | "trial">,
	): CellRecord | undefined {
		const p = this.pathFor(c);
		return existsSync(p)
			? (JSON.parse(readFileSync(p, "utf8")) as CellRecord)
			: undefined;
	}

	// Temp file then rename, so an interrupted run never leaves a half-written cell.
	write(cell: CellRecord): void {
		const p = this.pathFor(cell);
		mkdirSync(join(p, ".."), { recursive: true });
		const tmp = `${p}.tmp-${process.pid}`;
		writeFileSync(tmp, `${JSON.stringify(cell, null, "\t")}\n`);
		renameSync(tmp, p);
	}

	remove(
		c: Pick<CellRecord, "split" | "model" | "condition" | "taskId" | "trial">,
	): void {
		rmSync(this.pathFor(c), { force: true });
	}

	// An interrupted process leaves `running` cells; removing them makes them pending again.
	resetRunning(): number {
		let n = 0;
		for (const c of this.all(true)) {
			if (c.status === "running") {
				this.remove(c);
				n++;
			}
		}
		return n;
	}

	// Held-out cells stay sealed except for report aggregates.
	all(includeSealed: boolean): CellRecord[] {
		const out: CellRecord[] = [];
		const roots = [join(this.resultsDir, this.runId, "cells")];
		if (includeSealed) roots.push(join(this.sealedDir, this.runId, "cells"));
		for (const root of roots) walk(root, out);
		return out;
	}

	// Reuses an unchanged baseline such as `no-tools`; the matrix still re-checks each resume key.
	importCondition(from: ResultStore, condition: string): number {
		let n = 0;
		for (const c of from.all(true)) {
			if (c.condition !== condition || c.status !== "done") continue;
			this.write({ ...c });
			n++;
		}
		return n;
	}

	manifestPath(): string {
		return join(this.resultsDir, this.runId, "manifest.json");
	}
	writeManifest(m: unknown): void {
		mkdirSync(join(this.resultsDir, this.runId), { recursive: true });
		writeFileSync(this.manifestPath(), `${JSON.stringify(m, null, "\t")}\n`);
	}
}

function walk(dir: string, out: CellRecord[]): void {
	if (!existsSync(dir)) return;
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		const p = join(dir, e.name);
		if (e.isDirectory()) walk(p, out);
		else if (e.name.endsWith(".json") && !e.name.includes(".tmp-"))
			out.push(JSON.parse(readFileSync(p, "utf8")) as CellRecord);
	}
}

export interface HoldoutSpend {
	runId: string;
	suite: string;
	serverSha: string;
	profile: string;
	at: string;
}

/** A completed full matrix over a suite with a sealed split spends one held-out evaluation (sealed-set policy). */
export function spendHoldout(
	resultsDir: string,
	suiteHasHeldout: boolean,
	complete: boolean,
	entry: HoldoutSpend,
): boolean {
	if (!complete || !suiteHasHeldout) return false;
	mkdirSync(resultsDir, { recursive: true });
	appendFileSync(
		join(resultsDir, "holdout-log.jsonl"),
		`${JSON.stringify(entry)}\n`,
	);
	return true;
}
