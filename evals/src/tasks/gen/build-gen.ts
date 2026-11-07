// Generalization suite: tasks written from a designer's brief, not from the tool list, and never tuned on.
// Frozen like v1: a differing manifest hash needs `--bump`.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { manifestFor } from "../build-suite.js";
import type { Task } from "../types.js";
import {
	cat101,
	cat102,
	cat103,
	cat104,
	cat105,
	cat106,
	cat107,
} from "./cats-gen.js";

const here = dirname(fileURLToPath(import.meta.url));
export const SUITE_GEN_PATH = join(here, "suite-gen.json");
export const MANIFEST_GEN_PATH = join(here, "manifest-gen.json");
export const GEN_SUITE_NAME = "generalization";

export function buildAllGen(): Task[] {
	return [
		...cat101(),
		...cat102(),
		...cat103(),
		...cat104(),
		...cat105(),
		...cat106(),
		...cat107(),
	];
}

export const genManifestFor = (tasks: Task[], version: number) => ({
	suite: GEN_SUITE_NAME,
	...manifestFor(tasks, version),
});

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const tasks = buildAllGen();
	let version = 1;
	if (existsSync(MANIFEST_GEN_PATH)) {
		const old = JSON.parse(readFileSync(MANIFEST_GEN_PATH, "utf8"));
		if (genManifestFor(tasks, old.version).suiteHash !== old.suiteHash) {
			if (!process.argv.includes("--bump")) {
				console.error(
					"Generalization suite content changed. Suite versions are frozen; re-run with --bump to create a new version.",
				);
				process.exit(1);
			}
			version = old.version + 1;
		} else version = old.version;
	}
	writeFileSync(SUITE_GEN_PATH, `${JSON.stringify(tasks, null, "\t")}\n`);
	writeFileSync(
		MANIFEST_GEN_PATH,
		`${JSON.stringify(genManifestFor(tasks, version), null, "\t")}\n`,
	);
	console.log(`generalization suite v${version}: ${tasks.length} tasks`);
}
