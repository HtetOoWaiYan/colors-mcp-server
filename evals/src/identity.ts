import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256 } from "./record.js";
import type { ServerSpec } from "./runner/mcp-bridge.js";

const here = dirname(fileURLToPath(import.meta.url));
export const EVALS_ROOT = resolve(here, "..");
export const REPO_ROOT = resolve(EVALS_ROOT, "..");

// Grader and reference sources are part of run identity, so editing them invalidates resume keys.
export function graderHash(): string {
	const files: string[] = [];
	for (const dir of ["graders", "reference"]) {
		for (const f of readdirSync(join(here, dir)).sort()) {
			if (f.endsWith(".ts") && !f.endsWith(".test.ts"))
				files.push(join(here, dir, f));
		}
	}
	return sha256(
		files.map((f) => `${f}\n${readFileSync(f, "utf8")}`).join("\n"),
	);
}

const git = (args: string[], cwd = REPO_ROOT) =>
	execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

// Commits the working tree without touching HEAD, the index or any branch; the ref under
// `refs/evals/` keeps it from being garbage-collected, and its SHA identifies the server tested.
export function snapshotWorkingTree(): string {
	const tmp = mkdtempSync(join(tmpdir(), "eval-index-"));
	const env = { ...process.env, GIT_INDEX_FILE: join(tmp, "index") };
	const run = (args: string[]) =>
		execFileSync("git", args, { cwd: REPO_ROOT, env, encoding: "utf8" }).trim();
	try {
		run(["read-tree", "HEAD"]);
		// only what defines the server, so edits to the harness or docs do not change the server identity
		run([
			"add",
			"-A",
			"--",
			"src",
			"package.json",
			"package-lock.json",
			"tsconfig.json",
		]);
		const tree = run(["write-tree"]);
		const parent = run(["rev-parse", "HEAD"]);
		const commit = run([
			"commit-tree",
			tree,
			"-p",
			parent,
			"-m",
			`eval snapshot of working tree (tree ${tree.slice(0, 12)})`,
		]);
		run(["update-ref", `refs/evals/snapshot-${tree.slice(0, 12)}`, commit]);
		return commit;
	} finally {
		rmSync(tmp, { recursive: true, force: true });
	}
}

export interface ServerBuild {
	sha: string;
	spec: ServerSpec;
	lockHash: string;
	nodeVersion: string;
	dir: string;
	cleanup(): void;
}

// A fresh worktree keeps working-tree state out; `--ignore-scripts` stops the husky `prepare` hook
// from touching the repo; running from source via tsx leaves no build artifact to drift from the commit.
export function prepareServerBuild(ref: string): ServerBuild {
	const sha =
		ref === "working-tree"
			? snapshotWorkingTree()
			: git(["rev-parse", "--verify", `${ref}^{commit}`]);
	const dir = join(EVALS_ROOT, ".cache", "worktrees", sha.slice(0, 12));
	mkdirSync(dirname(dir), { recursive: true });
	if (!existsSync(dir)) {
		git(["worktree", "add", "--detach", dir, sha]);
	}
	if (git(["rev-parse", "HEAD"], dir) !== sha)
		throw new Error(`worktree ${dir} is not at ${sha}`);
	if (git(["status", "--porcelain"], dir) !== "")
		throw new Error(`worktree ${dir} is dirty; remove it and retry`);
	if (!existsSync(join(dir, "node_modules"))) {
		execFileSync("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], {
			cwd: dir,
			stdio: "ignore",
		});
	}
	const tsx = join(dir, "node_modules", ".bin", "tsx");
	return {
		sha,
		dir,
		spec: { command: tsx, args: ["src/index.ts"], cwd: dir },
		lockHash: sha256(readFileSync(join(dir, "package-lock.json"), "utf8")),
		nodeVersion: process.version,
		cleanup() {
			try {
				git(["worktree", "remove", "--force", dir]);
			} catch {
				/* best effort */
			}
		},
	};
}
