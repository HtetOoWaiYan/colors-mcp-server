// Neutral suite: twelve capability domains, tasks written blind to every server's tools, frozen before any server ran.
// Frozen like the others: a differing manifest hash needs `--bump`.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { manifestFor } from "../build-suite.js";
import type { Task } from "../types.js";
import { neutralA } from "./cats-neutral-a.js";
import { neutralB } from "./cats-neutral-b.js";
import { neutralC } from "./cats-neutral-c.js";

const here = dirname(fileURLToPath(import.meta.url));
export const SUITE_NEUTRAL_PATH = join(here, "suite-neutral.json");
export const MANIFEST_NEUTRAL_PATH = join(here, "manifest-neutral.json");
export const NEUTRAL_SUITE_NAME = "neutral";

export function buildAllNeutral(): Task[] {
	return [...neutralA(), ...neutralB(), ...neutralC()];
}

export const neutralManifestFor = (tasks: Task[], version: number) => ({
	suite: NEUTRAL_SUITE_NAME,
	...manifestFor(tasks, version),
});

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const tasks = buildAllNeutral();
	let version = 1;
	if (existsSync(MANIFEST_NEUTRAL_PATH)) {
		const old = JSON.parse(readFileSync(MANIFEST_NEUTRAL_PATH, "utf8"));
		if (neutralManifestFor(tasks, old.version).suiteHash !== old.suiteHash) {
			if (!process.argv.includes("--bump")) {
				console.error(
					"Neutral suite content changed. Suite versions are frozen; re-run with --bump to create a new version.",
				);
				process.exit(1);
			}
			version = old.version + 1;
		} else version = old.version;
	}
	writeFileSync(SUITE_NEUTRAL_PATH, `${JSON.stringify(tasks, null, "\t")}\n`);
	writeFileSync(
		MANIFEST_NEUTRAL_PATH,
		`${JSON.stringify(neutralManifestFor(tasks, version), null, "\t")}\n`,
	);
	console.log(`neutral suite v${version}: ${tasks.length} tasks`);
}
