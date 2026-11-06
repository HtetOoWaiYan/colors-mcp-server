import { compositeOver, parseColor, type Rgb } from "./color.js";
import { contrastRatio } from "./contrast.js";
import { deltaE2000 } from "./distance.js";
import { fixContrast } from "./fix.js";

export interface Finding {
	rule: "text-contrast-aa" | "nontext-contrast-3" | "near-duplicate-token";
	selector: string;
	/** For near-duplicate-token: the two property names, sorted and joined with "|". */
	detail?: string;
	message: string;
	suggestion?: string;
}

interface Block {
	selector: string;
	decls: Map<string, string>;
}

function parseBlocks(css: string): Block[] {
	const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
	const blocks: Block[] = [];
	for (const m of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
		const decls = new Map<string, string>();
		for (const d of (m[2] as string).split(";")) {
			const i = d.indexOf(":");
			if (i < 0) continue;
			decls.set(d.slice(0, i).trim().toLowerCase(), d.slice(i + 1).trim());
		}
		blocks.push({
			selector: (m[1] as string).trim().replace(/\s+/g, " "),
			decls,
		});
	}
	return blocks;
}

export function auditCss(css: string): {
	findings: Finding[];
	checked: number;
} {
	const blocks = parseBlocks(css);
	const vars = new Map<string, string>();
	for (const b of blocks) {
		if (b.selector === ":root")
			for (const [k, v] of b.decls) if (k.startsWith("--")) vars.set(k, v);
	}
	const resolve = (v: string | undefined, depth = 0): Rgb | null => {
		if (v === undefined || depth > 5) return null;
		const m = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/.exec(v.trim());
		if (m)
			return resolve(
				vars.get(m[1] as string) ?? (m[2] as string | undefined),
				depth + 1,
			);
		try {
			const p = parseColor(v);
			return compositeOver(p.rgb, p.alpha, [1, 1, 1]);
		} catch {
			return null;
		}
	};
	const findings: Finding[] = [];
	let checked = 0;
	for (const b of blocks) {
		const fg = resolve(b.decls.get("color"));
		const bg = resolve(
			b.decls.get("background-color") ?? b.decls.get("background"),
		);
		const border = resolve(b.decls.get("border-color"));
		if (fg && bg) {
			checked++;
			const ratio = contrastRatio(fg, bg);
			if (ratio < 4.5) {
				const fix = fixContrast(fg, bg, 4.5);
				findings.push({
					rule: "text-contrast-aa",
					selector: b.selector,
					message: `${ratio.toFixed(2)}:1, needs 4.5:1`,
					suggestion: fix
						? `use color ${hex(fix.rgb)} (${fix.ratio.toFixed(2)}:1)`
						: undefined,
				});
			}
		}
		if (border && bg) {
			checked++;
			const ratio = contrastRatio(border, bg);
			if (ratio < 3) {
				findings.push({
					rule: "nontext-contrast-3",
					selector: b.selector,
					message: `border ${ratio.toFixed(2)}:1 against its background, needs 3:1`,
				});
			}
		}
		if (b.selector === ":root") {
			const tokens: [string, Rgb][] = [];
			for (const [k, v] of b.decls) {
				if (!k.startsWith("--")) continue;
				const rgb = resolve(v);
				if (rgb) tokens.push([k, rgb]);
			}
			for (let i = 0; i < tokens.length; i++) {
				for (let j = i + 1; j < tokens.length; j++) {
					const a = tokens[i] as [string, Rgb];
					const c = tokens[j] as [string, Rgb];
					const d = deltaE2000(a[1], c[1]);
					if (d < 2) {
						findings.push({
							rule: "near-duplicate-token",
							selector: ":root",
							detail: [a[0], c[0]].sort().join("|"),
							message: `${a[0]} and ${c[0]} differ by only ΔE ${d.toFixed(2)}`,
						});
					}
				}
			}
		}
	}
	return { findings, checked };
}

const hex = (rgb: Rgb): string =>
	`#${rgb
		.map((v) =>
			Math.round(Math.min(1, Math.max(0, v)) * 255)
				.toString(16)
				.padStart(2, "0"),
		)
		.join("")}`;
