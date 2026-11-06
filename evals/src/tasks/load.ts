import { readFileSync } from "node:fs";
import { MANIFEST_PATH, manifestFor, SUITE_PATH } from "./build-suite.js";
import type { Task } from "./types.js";

export interface Manifest {
	version: number;
	suiteHash: string;
	taskCount: number;
	tasks: Record<string, string>;
}

export function loadSuite(): { tasks: Task[]; manifest: Manifest } {
	const tasks = JSON.parse(readFileSync(SUITE_PATH, "utf8")) as Task[];
	const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as Manifest;
	const actual = manifestFor(tasks, manifest.version);
	if (actual.suiteHash !== manifest.suiteHash) {
		throw new Error(
			"suite.json does not match manifest.json (the frozen suite was modified)",
		);
	}
	return { tasks, manifest };
}
