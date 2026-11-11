// Removes infra_failed cells that a comparison needs, so the next scheduler pass re-runs them.
// Keeps infra_failed no-tools cells in non-base runs: those runs reuse the base run's no-tools cells.
import { readdirSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]);
let n = 0;
for (const run of readdirSync("results").filter((x) => /^(nb|nb2|n2)-/.test(x))) {
	for (const f of walk(join("results", run, "cells"))) {
		const c = JSON.parse(readFileSync(f, "utf8"));
		if (c.status !== "infra_failed") continue;
		if (c.condition === "no-tools" && !/^(nb|n2)-base-/.test(run)) continue;
		unlinkSync(f); n++;
	}
}
console.log(`cleared ${n} infra_failed cell(s)`);
