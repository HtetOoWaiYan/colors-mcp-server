import { okDistance, type Rgb, rgbToOklab, srgbToLinear } from "./color.js";

type Vec3 = [number, number, number];

const D65: Vec3 = [0.95047, 1, 1.08883];

// D65 is sRGB's own white, so no chromatic adaptation is needed.
export function rgbToLab(rgb: Rgb): Vec3 {
	const r = srgbToLinear(rgb[0]);
	const g = srgbToLinear(rgb[1]);
	const b = srgbToLinear(rgb[2]);
	const x = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b;
	const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
	const z = 0.0193339 * r + 0.119192 * g + 0.9503041 * b;
	const f = (t: number) =>
		t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116;
	const fx = f(x / D65[0]);
	const fy = f(y / D65[1]);
	const fz = f(z / D65[2]);
	return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** CIEDE2000 (Sharma et al. 2005) with kL = kC = kH = 1. */
export function deltaE2000Lab(lab1: Vec3, lab2: Vec3): number {
	const [L1, a1, b1] = lab1;
	const [L2, a2, b2] = lab2;
	const C1 = Math.hypot(a1, b1);
	const C2 = Math.hypot(a2, b2);
	const Cbar = (C1 + C2) / 2;
	const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)));
	const a1p = (1 + G) * a1;
	const a2p = (1 + G) * a2;
	const C1p = Math.hypot(a1p, b1);
	const C2p = Math.hypot(a2p, b2);
	const hp = (b: number, ap: number) => {
		if (b === 0 && ap === 0) return 0;
		const h = deg(Math.atan2(b, ap));
		return h < 0 ? h + 360 : h;
	};
	const h1p = hp(b1, a1p);
	const h2p = hp(b2, a2p);
	const dLp = L2 - L1;
	const dCp = C2p - C1p;
	let dhp = 0;
	if (C1p * C2p !== 0) {
		dhp = h2p - h1p;
		if (dhp > 180) dhp -= 360;
		else if (dhp < -180) dhp += 360;
	}
	const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp / 2));
	const Lbarp = (L1 + L2) / 2;
	const Cbarp = (C1p + C2p) / 2;
	let hbarp = h1p + h2p;
	if (C1p * C2p !== 0) {
		if (Math.abs(h1p - h2p) <= 180) hbarp = (h1p + h2p) / 2;
		else if (h1p + h2p < 360) hbarp = (h1p + h2p + 360) / 2;
		else hbarp = (h1p + h2p - 360) / 2;
	}
	const T =
		1 -
		0.17 * Math.cos(rad(hbarp - 30)) +
		0.24 * Math.cos(rad(2 * hbarp)) +
		0.32 * Math.cos(rad(3 * hbarp + 6)) -
		0.2 * Math.cos(rad(4 * hbarp - 63));
	const dTheta = 30 * Math.exp(-(((hbarp - 275) / 25) ** 2));
	const Rc = 2 * Math.sqrt(Cbarp ** 7 / (Cbarp ** 7 + 25 ** 7));
	const Sl =
		1 + (0.015 * (Lbarp - 50) ** 2) / Math.sqrt(20 + (Lbarp - 50) ** 2);
	const Sc = 1 + 0.045 * Cbarp;
	const Sh = 1 + 0.015 * Cbarp * T;
	const Rt = -Math.sin(rad(2 * dTheta)) * Rc;
	return Math.sqrt(
		(dLp / Sl) ** 2 +
			(dCp / Sc) ** 2 +
			(dHp / Sh) ** 2 +
			Rt * (dCp / Sc) * (dHp / Sh),
	);
}

export const deltaE2000 = (a: Rgb, b: Rgb): number =>
	deltaE2000Lab(rgbToLab(a), rgbToLab(b));

export const deltaEOk = (a: Rgb, b: Rgb): number =>
	okDistance(rgbToOklab(a), rgbToOklab(b));

export function describeDeltaE(d: number): string {
	if (d < 1) return "not noticeable";
	if (d < 2) return "barely noticeable";
	if (d < 5) return "noticeable";
	if (d < 10) return "clearly different";
	return "very different";
}
