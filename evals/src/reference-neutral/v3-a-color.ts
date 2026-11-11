/**
 * Author A, neutral suite v3: reference math the v1/v2 modules (a-*.ts, v2-a-spaces.ts) do not have.
 * Hand-written from the published definitions; Lab, XYZ, Oklab and APCA come from the earlier modules.
 *
 * - CIE94 with free parametric factors (CIE 116-1995): kL, K1, K2 (kC = kH = SL = 1); graphic arts is
 *   kL 1 / K1 0.045 / K2 0.015, textiles kL 2 / K1 0.048 / K2 0.014. SC and SH use the chroma of the FIRST
 *   (reference) color, so the formula is not symmetric.
 * - CMC l:c (Clarke, McDonald, Rigg 1984; BS 6923 / ISO 105-J03): SL, SC, SH, F, T from the reference color.
 * - CIEDE2000 (Sharma, Wu, Dalal 2005) with its weighted lightness, chroma and hue terms exposed:
 *   tL = ΔL'/(kL·SL), tC = ΔC'/(kC·SC), tH = ΔH'/(kH·SH), ΔE00 = √(tL² + tC² + tH² + RT·tC·tH). Δ = sample − reference
 *   (color 2 − color 1), as in Sharma's paper.
 * - CIE xyY and CIE 1976 UCS u'v' from XYZ (CIE 15:2018).
 * - McCamy (1992) correlated color temperature from xy: n = (x − 0.3320)/(0.1858 − y),
 *   CCT = 449n³ + 3525n² + 6823.3n + 5520.33.
 * - Oklch maximum sRGB chroma at fixed L and h (bisection on the gamut test, channels in [0, 1]).
 * - ITU-R BT.2020 narrow-range digital code values: D = round((219·E' + 16)·2^(n−8)) (BT.2020-2 Table 5).
 */
import { oklabToRgb, type Rgb, type Vec3 } from "../reference/color.js";
import { fromPolar, toPolar } from "./a-spaces.js";

const DEG = Math.PI / 180;
const hue360 = (h: number) => ((h % 360) + 360) % 360;

// ---------- CIE94 with parametric factors ----------

export interface Cie94Weights {
	kL: number;
	K1: number;
	K2: number;
}
export const CIE94_GRAPHIC_ARTS: Cie94Weights = { kL: 1, K1: 0.045, K2: 0.015 };
export const CIE94_TEXTILES: Cie94Weights = { kL: 2, K1: 0.048, K2: 0.014 };

export function deltaE94(ref: Vec3, sample: Vec3, w: Cie94Weights): number {
	const dL = ref[0] - sample[0];
	const C1 = Math.hypot(ref[1], ref[2]);
	const C2 = Math.hypot(sample[1], sample[2]);
	const dC = C1 - C2;
	const dH2 = Math.max(0, (ref[1] - sample[1]) ** 2 + (ref[2] - sample[2]) ** 2 - dC * dC);
	const SC = 1 + w.K1 * C1;
	const SH = 1 + w.K2 * C1;
	return Math.sqrt((dL / w.kL) ** 2 + (dC / SC) ** 2 + dH2 / SH ** 2);
}

// ---------- CMC l:c ----------

export function deltaECmc(ref: Vec3, sample: Vec3, l: number, c: number): number {
	const [L1, a1, b1] = ref;
	const [L2, a2, b2] = sample;
	const C1 = Math.hypot(a1, b1);
	const C2 = Math.hypot(a2, b2);
	const H1 = hue360(Math.atan2(b1, a1) / DEG);
	const dL = L1 - L2;
	const dC = C1 - C2;
	const dH2 = Math.max(0, (a1 - a2) ** 2 + (b1 - b2) ** 2 - dC * dC);
	const SL = L1 < 16 ? 0.511 : (0.040975 * L1) / (1 + 0.01765 * L1);
	const SC = (0.0638 * C1) / (1 + 0.0131 * C1) + 0.638;
	const T =
		H1 >= 164 && H1 <= 345 ? 0.56 + Math.abs(0.2 * Math.cos((H1 + 168) * DEG)) : 0.36 + Math.abs(0.4 * Math.cos((H1 + 35) * DEG));
	const F = Math.sqrt(C1 ** 4 / (C1 ** 4 + 1900));
	const SH = SC * (F * T + 1 - F);
	return Math.sqrt((dL / (l * SL)) ** 2 + (dC / (c * SC)) ** 2 + dH2 / SH ** 2);
}

// ---------- CIEDE2000 with its terms ----------

export interface De2000Terms {
	dE: number;
	/** ΔL'/(kL·SL), signed, sample minus reference */
	tL: number;
	/** ΔC'/(kC·SC), signed */
	tC: number;
	/** ΔH'/(kH·SH), signed */
	tH: number;
	RT: number;
}

export function deltaE2000Terms(ref: Vec3, sample: Vec3, kL = 1, kC = 1, kH = 1): De2000Terms {
	const [L1, a1, b1] = ref;
	const [L2, a2, b2] = sample;
	const Cab = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
	const G = 0.5 * (1 - Math.sqrt(Cab ** 7 / (Cab ** 7 + 25 ** 7)));
	const ap1 = (1 + G) * a1;
	const ap2 = (1 + G) * a2;
	const Cp1 = Math.hypot(ap1, b1);
	const Cp2 = Math.hypot(ap2, b2);
	const hp = (b: number, ap: number) => (b === 0 && ap === 0 ? 0 : hue360(Math.atan2(b, ap) / DEG));
	const hp1 = hp(b1, ap1);
	const hp2 = hp(b2, ap2);
	const dLp = L2 - L1;
	const dCp = Cp2 - Cp1;
	let dhp = 0;
	if (Cp1 * Cp2 !== 0) {
		dhp = hp2 - hp1;
		if (dhp > 180) dhp -= 360;
		else if (dhp < -180) dhp += 360;
	}
	const dHp = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin((dhp / 2) * DEG);
	const Lbp = (L1 + L2) / 2;
	const Cbp = (Cp1 + Cp2) / 2;
	let hbp = hp1 + hp2;
	if (Cp1 * Cp2 !== 0) {
		if (Math.abs(hp1 - hp2) <= 180) hbp = (hp1 + hp2) / 2;
		else hbp = hp1 + hp2 < 360 ? (hp1 + hp2 + 360) / 2 : (hp1 + hp2 - 360) / 2;
	}
	const T =
		1 -
		0.17 * Math.cos((hbp - 30) * DEG) +
		0.24 * Math.cos(2 * hbp * DEG) +
		0.32 * Math.cos((3 * hbp + 6) * DEG) -
		0.2 * Math.cos((4 * hbp - 63) * DEG);
	const dTheta = 30 * Math.exp(-(((hbp - 275) / 25) ** 2));
	const RC = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
	const SL = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2);
	const SC = 1 + 0.045 * Cbp;
	const SH = 1 + 0.015 * Cbp * T;
	const RT = -Math.sin(2 * dTheta * DEG) * RC;
	const tL = dLp / (kL * SL);
	const tC = dCp / (kC * SC);
	const tH = dHp / (kH * SH);
	return { dE: Math.sqrt(tL * tL + tC * tC + tH * tH + RT * tC * tH), tL, tC, tH, RT };
}

// ---------- chromaticity ----------

/** CIE xyY from XYZ; for X + Y + Z = 0 (black) the chromaticity is undefined and the given white's is returned. */
export function xyzToXyY(xyz: Vec3, whiteXy: [number, number] = [0.3127, 0.329]): Vec3 {
	const s = xyz[0] + xyz[1] + xyz[2];
	if (s === 0) return [whiteXy[0], whiteXy[1], 0];
	return [xyz[0] / s, xyz[1] / s, xyz[1]];
}

/** CIE 1976 UCS u', v' from XYZ: u' = 4X/(X + 15Y + 3Z), v' = 9Y/(X + 15Y + 3Z). */
export function xyzToUvPrime(xyz: Vec3): [number, number] {
	const d = xyz[0] + 15 * xyz[1] + 3 * xyz[2];
	return [(4 * xyz[0]) / d, (9 * xyz[1]) / d];
}

/** McCamy 1992 CCT approximation (kelvin) from CIE 1931 xy. */
export function mccamyCct(x: number, y: number): number {
	const n = (x - 0.332) / (0.1858 - y);
	return 449 * n ** 3 + 3525 * n ** 2 + 6823.3 * n + 5520.33;
}

// ---------- Oklch gamut headroom ----------

/** True when every channel lies in [0, 1] (no tolerance beyond `eps`). */
export const inUnitCube = (rgb: Rgb, eps = 0): boolean => rgb.every((v) => v >= -eps && v <= 1 + eps);

/** Largest Oklch chroma at lightness L and hue h (degrees) that is still inside sRGB, by bisection. */
export function maxSrgbChroma(L: number, h: number): number {
	if (L <= 0 || L >= 1) return 0;
	let lo = 0;
	let hi = 0.5;
	for (let i = 0; i < 60; i++) {
		const mid = (lo + hi) / 2;
		if (inUnitCube(oklabToRgb(fromPolar([L, mid, h])))) lo = mid;
		else hi = mid;
	}
	return lo;
}

/** Oklch [L, C, h] of an Oklab triple (hue in degrees 0-360). */
export const oklabToOklchV = (lab: Vec3): Vec3 => toPolar(lab);

// ---------- BT.2020 digital codes ----------

/** Narrow-range ("video range") code value for a non-linear signal E' in [0, 1] at the given bit depth. */
export const bt2020NarrowCode = (ePrime: number, bits = 10): number => Math.round((219 * ePrime + 16) * 2 ** (bits - 8));
