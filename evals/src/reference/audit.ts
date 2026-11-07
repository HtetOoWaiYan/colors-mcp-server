import {
	contrastRatioRgb,
	deltaE2000,
	hexToRgb,
	type Rgb,
	rgbToHex,
	rgbToLab,
} from "./color.js";
import { parseCss } from "./css.js";

export interface Finding {
	rule: string;
	selector: string;
	detail?: string;
}

interface Block {
	selector: string;
	decls: Map<string, string>;
}

function parseBlocks(css: string): Block[] {
	const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
	const blocks: Block[] = [];
	for (const m of stripped.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
		const decls = new Map<string, string>();
		for (const d of (m[2] as string).split(";")) {
			const i = d.indexOf(":");
			if (i < 0) continue;
			decls.set(d.slice(0, i).trim().toLowerCase(), d.slice(i + 1).trim());
		}
		blocks.push({ selector: (m[1] as string).trim(), decls });
	}
	return blocks;
}

const toRgb = (v: string | undefined): Rgb | null => {
	if (v === undefined) return null;
	const p = parseCss(v);
	return p ? p.rgb : null;
};

/** The reference auditor for the documented CSS subset (see the suite spec, category 12). */
export function auditCss(css: string): Finding[] {
	const out: Finding[] = [];
	for (const b of parseBlocks(css)) {
		const fg = toRgb(b.decls.get("color"));
		const bg = toRgb(b.decls.get("background-color"));
		const border = toRgb(b.decls.get("border-color"));
		// contrast is computed from the rounded hex, like every other contrast check in the suite
		const ratio = (a: Rgb, c: Rgb) =>
			contrastRatioRgb(hexToRgb(rgbToHex(a)), hexToRgb(rgbToHex(c)));
		if (fg && bg && ratio(fg, bg) < 4.5)
			out.push({ rule: "text-contrast-aa", selector: b.selector });
		if (border && bg && ratio(border, bg) < 3)
			out.push({ rule: "nontext-contrast-3", selector: b.selector });
		if (b.selector === ":root") {
			const tokens: [string, Rgb][] = [];
			for (const [k, v] of b.decls) {
				if (!k.startsWith("--")) continue;
				const rgb = toRgb(v);
				if (rgb) tokens.push([k, rgb]);
			}
			for (let i = 0; i < tokens.length; i++) {
				for (let j = i + 1; j < tokens.length; j++) {
					const a = tokens[i] as [string, Rgb];
					const c = tokens[j] as [string, Rgb];
					if (deltaE2000(rgbToLab(a[1]), rgbToLab(c[1])) < 2) {
						out.push({
							rule: "near-duplicate-token",
							selector: ":root",
							detail: [a[0], c[0]].sort().join("|"),
						});
					}
				}
			}
		}
	}
	return out;
}
