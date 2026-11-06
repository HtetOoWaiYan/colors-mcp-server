import { hexToRgb, isHex, type Rgb } from "./color.js";

/** The CSS named colors the suite uses. Names outside this table are treated as unsupported. */
export const NAMED: Record<string, string> = {
	black: "#000000",
	white: "#ffffff",
	red: "#ff0000",
	lime: "#00ff00",
	blue: "#0000ff",
	yellow: "#ffff00",
	navy: "#000080",
	teal: "#008080",
	gold: "#ffd700",
	tomato: "#ff6347",
	coral: "#ff7f50",
	salmon: "#fa8072",
	indigo: "#4b0082",
	crimson: "#dc143c",
	orchid: "#da70d6",
	chocolate: "#d2691e",
	skyblue: "#87ceeb",
	slategray: "#708090",
	darkslategray: "#2f4f4f",
	olive: "#808000",
	maroon: "#800000",
	gray: "#808080",
	silver: "#c0c0c0",
	orange: "#ffa500",
	green: "#008000",
	purple: "#800080",
	rebeccapurple: "#663399",
	lightgoldenrodyellow: "#fafad2",
	whitesmoke: "#f5f5f5",
	dodgerblue: "#1e90ff",
};

export interface ParsedCss {
	rgb: Rgb;
	alpha: number;
}

function hslToRgb(h: number, s: number, l: number): Rgb {
	const hh = (((h % 360) + 360) % 360) / 360;
	const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
	const p = 2 * l - q;
	const f = (t: number) => {
		let x = t;
		if (x < 0) x += 1;
		if (x > 1) x -= 1;
		if (x < 1 / 6) return p + (q - p) * 6 * x;
		if (x < 1 / 2) return q;
		if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
		return p;
	};
	return [f(hh + 1 / 3), f(hh), f(hh - 1 / 3)];
}

const NUM = "(-?\\d*\\.?\\d+)";
const RGB_RE = new RegExp(
	`^rgba?\\(\\s*${NUM}(%?)\\s*[,\\s]\\s*${NUM}(%?)\\s*[,\\s]\\s*${NUM}(%?)\\s*(?:[,/]\\s*${NUM}(%?)\\s*)?\\)$`,
	"i",
);
const HSL_RE = new RegExp(
	`^hsla?\\(\\s*${NUM}\\s*[,\\s]\\s*${NUM}%\\s*[,\\s]\\s*${NUM}%\\s*(?:[,/]\\s*${NUM}(%?)\\s*)?\\)$`,
	"i",
);

/**
 * Parses the documented subset: #rgb, #rrggbb, #rrggbbaa, rgb()/rgba(), hsl()/hsla() (comma or
 * space separated), and the names in NAMED (case-insensitive). Returns null for anything else.
 */
export function parseCss(input: string): ParsedCss | null {
	const s = input.trim();
	if (isHex(s)) return { rgb: hexToRgb(s), alpha: 1 };
	const h8 = /^#([0-9a-f]{8})$/i.exec(s);
	if (h8) {
		const hex = h8[1] as string;
		return {
			rgb: hexToRgb(`#${hex.slice(0, 6)}`),
			alpha: Number.parseInt(hex.slice(6), 16) / 255,
		};
	}
	const named = NAMED[s.toLowerCase()];
	if (named) return { rgb: hexToRgb(named), alpha: 1 };
	const m = RGB_RE.exec(s);
	if (m) {
		const ch = (v: string, pct: string) =>
			pct ? Number(v) / 100 : Number(v) / 255;
		const rgb: Rgb = [
			Math.min(1, Math.max(0, ch(m[1] as string, m[2] as string))),
			Math.min(1, Math.max(0, ch(m[3] as string, m[4] as string))),
			Math.min(1, Math.max(0, ch(m[5] as string, m[6] as string))),
		];
		let alpha = 1;
		if (m[7] !== undefined) alpha = m[8] ? Number(m[7]) / 100 : Number(m[7]);
		return { rgb, alpha: Math.min(1, Math.max(0, alpha)) };
	}
	const hm = HSL_RE.exec(s);
	if (hm) {
		const rgb = hslToRgb(
			Number(hm[1]),
			Number(hm[2]) / 100,
			Number(hm[3]) / 100,
		);
		let alpha = 1;
		if (hm[4] !== undefined)
			alpha = hm[5] ? Number(hm[4]) / 100 : Number(hm[4]);
		return { rgb, alpha: Math.min(1, Math.max(0, alpha)) };
	}
	return null;
}
