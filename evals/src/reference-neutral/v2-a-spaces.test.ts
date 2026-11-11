import Color from "colorjs.io";
// rec2020-oetf is not registered by default; register it for the cross-check.
import Rec2020Oetf from "colorjs.io/src/spaces/rec2020-oetf.js";
import { describe, expect, it } from "vitest";
import { hexToRgb, type Rgb, type Vec3 } from "../reference/color.js";
import { mulberry32 } from "../tasks/build/common.js";
import { bt2020Oetf, srgbToCmykNaive, srgbToHwb, srgbToRec2020 } from "./a-spaces.js";
import {
	bt2020InverseOetf,
	cmykNaiveToSrgb,
	compositeHex,
	compositeRgb,
	hwbToSrgb,
	rec2020ToSrgb,
} from "./v2-a-spaces.js";

Color.Space.register(Rec2020Oetf);

const maxAbs = (a: readonly number[], b: readonly number[]) =>
	Math.max(...a.map((v, i) => Math.abs(v - (b[i] as number))));
const randHex = (rnd: () => number) =>
	`#${Math.floor(rnd() * 0x1000000)
		.toString(16)
		.padStart(6, "0")}`;

describe("published vectors", () => {
	it("HWB -> sRGB (CSS Color 4 examples and the w + b >= 1 rule)", () => {
		// CSS Color 4: rebeccapurple #663399 = hwb(270 20% 40%); hwb(0 0% 0%) is pure red.
		expect(maxAbs(hwbToSrgb([270, 0.2, 0.4]), hexToRgb("#663399"))).toBeLessThan(1e-9);
		expect(maxAbs(hwbToSrgb([0, 0, 0]), [1, 0, 0])).toBeLessThan(1e-12);
		// CSS Color 4: if w + b >= 1 the color is the gray w / (w + b).
		expect(maxAbs(hwbToSrgb([123, 0.6, 0.6]), [0.5, 0.5, 0.5])).toBeLessThan(1e-12);
	});
	it("BT.2020 inverse OETF (ITU-R BT.2020-2 Table 4) inverts the OETF and is continuous at 4.5·beta", () => {
		expect(bt2020InverseOetf(1)).toBeCloseTo(1, 12);
		expect(bt2020InverseOetf(0)).toBe(0);
		for (const l of [0, 0.001, 0.018053968510807, 0.02, 0.18, 0.5, 0.9, 1])
			expect(bt2020InverseOetf(bt2020Oetf(l))).toBeCloseTo(l, 10);
	});
	it("naive CMYK inverse", () => {
		expect(cmykNaiveToSrgb([0, 1, 1, 0])).toEqual([1, 0, 0]);
		expect(cmykNaiveToSrgb([0.6, 0.4, 0.4, 1])).toEqual([0, 0, 0]);
		expect(cmykNaiveToSrgb([0, 0, 0, 0])).toEqual([1, 1, 1]);
	});
	it("gamma-encoded source-over composite", () => {
		// 60% black over #fafafa: 0.4 x 250 = 100 = 0x64
		expect(compositeHex("#000000", 0.6, "#fafafa")).toBe("#646464");
		expect(compositeHex("#ffffff", 0, "#123456")).toBe("#123456");
	});
});

describe("round trips and colorjs.io cross-check", () => {
	it("forward then inverse returns the input (HWB, Rec.2020 encoded, naive CMYK)", () => {
		const rnd = mulberry32(3032);
		for (let i = 0; i < 500; i++) {
			const rgb = hexToRgb(randHex(rnd));
			expect(maxAbs(hwbToSrgb(srgbToHwb(rgb)), rgb)).toBeLessThan(1e-9);
			expect(maxAbs(rec2020ToSrgb(srgbToRec2020(rgb)), rgb)).toBeLessThan(1e-9);
			expect(maxAbs(cmykNaiveToSrgb(srgbToCmykNaive(rgb)), rgb)).toBeLessThan(1e-9);
		}
	});

	it("agrees with colorjs.io on HWB -> sRGB, BT.2020-encoded -> sRGB and sRGB-space mixing", () => {
		const rnd = mulberry32(3033);
		const dev = { hwb: 0, rec2020: 0, composite: 0 };
		for (let i = 0; i < 1500; i++) {
			const hwb: Vec3 = [rnd() * 360, rnd() * 0.6, rnd() * 0.6];
			const theirsHwb = new Color("hwb", [hwb[0], hwb[1] * 100, hwb[2] * 100]).to("srgb").coords.map(Number);
			dev.hwb = Math.max(dev.hwb, maxAbs(hwbToSrgb(hwb), theirsHwb));
			const enc: Vec3 = [rnd(), rnd(), rnd()];
			const theirsRec = new Color("--rec2020-oetf", [...enc]).to("srgb").coords.map(Number);
			dev.rec2020 = Math.max(dev.rec2020, maxAbs(rec2020ToSrgb(enc), theirsRec));
			const fg = randHex(rnd);
			const bg = randHex(rnd);
			const a = rnd();
			// colorjs.io: bg.mix(fg, a) in the gamma-encoded "srgb" space is source-over of fg at alpha a
			const theirsMix = new Color(bg).mix(new Color(fg), a, { space: "srgb" }).coords.map(Number);
			dev.composite = Math.max(dev.composite, maxAbs(compositeRgb(fg, a, bg) as Rgb, theirsMix));
		}
		console.log("v2-a-spaces max |dev| vs colorjs.io (channels 0..1):", JSON.stringify(dev));
		expect(dev.hwb).toBeLessThan(1e-9);
		expect(dev.rec2020).toBeLessThan(5e-4);
		expect(dev.composite).toBeLessThan(1e-9);
	});
});
