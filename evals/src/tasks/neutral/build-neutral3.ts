// Neutral suite v3: fresh tasks for the same twelve domains as v1, written blind to every server's tools, frozen before any server ran.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { manifestFor } from "../build-suite.js";
import type { Task } from "../types.js";
import { neutral3A } from "./cats-neutral3-a.js";
import { neutral3B } from "./cats-neutral3-b.js";
import { neutral3C } from "./cats-neutral3-c.js";

const here = dirname(fileURLToPath(import.meta.url));
export const SUITE_NEUTRAL3_PATH = join(here, "suite-neutral3.json");
export const MANIFEST_NEUTRAL3_PATH = join(here, "manifest-neutral3.json");
export const NEUTRAL3_SUITE_NAME = "neutral3";

export function buildAllNeutral3(): Task[] {
	return [...neutral3A(), ...neutral3B(), ...neutral3C()];
}

export const neutral3ManifestFor = (tasks: Task[], version: number) => ({
	suite: NEUTRAL3_SUITE_NAME,
	...manifestFor(tasks, version),
});

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const tasks = buildAllNeutral3();
	let version = 1;
	if (existsSync(MANIFEST_NEUTRAL3_PATH)) {
		const old = JSON.parse(readFileSync(MANIFEST_NEUTRAL3_PATH, "utf8"));
		if (neutral3ManifestFor(tasks, old.version).suiteHash !== old.suiteHash) {
			if (!process.argv.includes("--bump")) {
				console.error("Neutral v3 content changed. Suite versions are frozen; re-run with --bump to create a new version.");
				process.exit(1);
			}
			version = old.version + 1;
		} else version = old.version;
	}
	writeFileSync(SUITE_NEUTRAL3_PATH, `${JSON.stringify(tasks, null, "\t")}\n`);
	writeFileSync(MANIFEST_NEUTRAL3_PATH, `${JSON.stringify(neutral3ManifestFor(tasks, version), null, "\t")}\n`);
	console.log(`neutral v3 suite v${version}: ${tasks.length} tasks`);
}
