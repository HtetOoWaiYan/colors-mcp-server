// Neutral suite v2: fresh tasks for the same twelve domains as v1, written blind to every server's tools, frozen before any server ran.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { manifestFor } from "../build-suite.js";
import type { Task } from "../types.js";
import { neutral2A } from "./cats-neutral2-a.js";
import { neutral2B } from "./cats-neutral2-b.js";
import { neutral2C } from "./cats-neutral2-c.js";

const here = dirname(fileURLToPath(import.meta.url));
export const SUITE_NEUTRAL2_PATH = join(here, "suite-neutral2.json");
export const MANIFEST_NEUTRAL2_PATH = join(here, "manifest-neutral2.json");
export const NEUTRAL2_SUITE_NAME = "neutral2";

export function buildAllNeutral2(): Task[] {
	return [...neutral2A(), ...neutral2B(), ...neutral2C()];
}

export const neutral2ManifestFor = (tasks: Task[], version: number) => ({
	suite: NEUTRAL2_SUITE_NAME,
	...manifestFor(tasks, version),
});

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const tasks = buildAllNeutral2();
	let version = 1;
	if (existsSync(MANIFEST_NEUTRAL2_PATH)) {
		const old = JSON.parse(readFileSync(MANIFEST_NEUTRAL2_PATH, "utf8"));
		if (neutral2ManifestFor(tasks, old.version).suiteHash !== old.suiteHash) {
			if (!process.argv.includes("--bump")) {
				console.error("Neutral v2 content changed. Suite versions are frozen; re-run with --bump to create a new version.");
				process.exit(1);
			}
			version = old.version + 1;
		} else version = old.version;
	}
	writeFileSync(SUITE_NEUTRAL2_PATH, `${JSON.stringify(tasks, null, "\t")}\n`);
	writeFileSync(MANIFEST_NEUTRAL2_PATH, `${JSON.stringify(neutral2ManifestFor(tasks, version), null, "\t")}\n`);
	console.log(`neutral v2 suite v${version}: ${tasks.length} tasks`);
}
