// Guides name the tool that gives the numbers; they never ask a model to do color math itself.
export interface Guide {
	topic: string;
	title: string;
	summary: string;
	body: string;
}

export const GUIDES: Guide[] = [
	{
		topic: "accessibility",
		title: "Accessible color (WCAG)",
		summary:
			"Contrast thresholds, what counts as large text, and how to fix failures.",
		body: `# Accessible color

Thresholds (WCAG 2.2, contrast ratio of relative luminance):
- Normal text: 4.5:1 (AA), 7:1 (AAA).
- Large text (24px, or 18.66px bold, and up): 3:1 (AA), 4.5:1 (AAA).
- UI components and graphics that carry meaning (borders of inputs, icons, chart marks, focus rings): 3:1 against adjacent colors.
- Disabled controls and pure decoration are exempt. Logos are exempt.

Rules of thumb:
- Never rely on color alone to carry meaning (errors, links in body text, chart series): add an icon, text, underline or pattern.
- Measure the color as painted: translucent text must be composited over its real background first. colors_check does this.
- Placeholder text, helper text and disabled-looking labels still need 4.5:1 if they convey information.
- Text over images or gradients: test the worst spot, or add a scrim (a 40-60% dark overlay) behind the text.
- Dark mode needs its own check; passing in light mode says nothing about dark.
- APCA (Lc values) is the proposed WCAG 3 model and is more accurate for dark mode and thin fonts, but WCAG 2 ratios are still what audits and law use. colors_check reports both.

Workflow: colors_check for the verdict, colors_fix to get the closest passing color (it keeps the hue), colors_audit to scan a stylesheet.`,
	},
	{
		topic: "ui-design",
		title: "UI and web color systems",
		summary:
			"Tokens, neutrals, semantic colors, interaction states and dark mode.",
		body: `# UI and web color systems

Structure:
- One brand color, a tinted neutral scale, and four semantic colors (success, warning, danger, info). Build each as a tonal ramp (colors_palette kind "ramp").
- Name tokens by role, not by value: background, surface, surface-raised, text, text-muted, border, primary, on-primary (colors_palette kind "theme" returns exactly these for light and dark, with contrast verified).
- Roughly 60% neutral, 30% secondary surfaces, 10% accent: saturated color is a signal, so spend it sparingly.

Details that separate good from average:
- Tint neutrals slightly toward the brand hue (chroma 0.005 to 0.015 in OKLCH) instead of pure gray.
- Do ramps and adjustments in OKLCH, not HSL: equal lightness steps look equal, and hue stays put. colors_adjust works in OKLCH.
- Hover/active states: shift OKLCH lightness by about 0.04 to 0.06; do not lower opacity on text.
- Pure #000 on pure #fff is harsh; text around OKLCH L 0.2 on near-white reads better and still clears 7:1.
- Dark mode is not inversion: keep surfaces dark but not black (L 0.15 to 0.25), raise elevation by getting lighter, lower the chroma of large colored areas, and lighten the brand color until it holds 3:1 on the dark background.
- Status colors need a non-color cue (icon or label) and 4.5:1 when used as text.
- Check every text/background pair you ship with colors_check; scan CSS with colors_audit.`,
	},
	{
		topic: "dataviz",
		title: "Data visualization color",
		summary:
			"Categorical, sequential and diverging palettes; color-blind safety.",
		body: `# Data visualization color

Pick the palette type from the data:
- Categorical (unordered groups): up to 6 to 8 clearly different hues. colors_palette kind "categorical" builds a set that stays distinguishable for color-blind viewers.
- Sequential (low to high): one hue (or a gentle two-hue path) with steadily changing lightness. Use a ramp from colors_palette kind "ramp", dark = more.
- Diverging (below/above a midpoint): two hues meeting at a light neutral. Build each half as a ramp and join them at the neutral.

Rules:
- Avoid rainbow/jet scales: their lightness is not monotonic, so they invent boundaries in the data.
- Roughly 8% of men have red-green color blindness: never encode with red versus green alone. Test sets with colors_vision.
- Each mark needs at least 3:1 against the background; thin lines and small points need more separation than big areas.
- Label directly instead of relying on a legend where possible; add shape or pattern as a second channel.
- Overlapping translucent marks change color where they overlap; prefer outlines or small multiples.
- On dark backgrounds, lighten and slightly desaturate series colors so they do not glare.
- Highlight one thing: gray everything else, color the story.`,
	},
	{
		topic: "print",
		title: "Print and CMYK",
		summary: "Why screen colors shift in print and what to do about it.",
		body: `# Print

- Screens add light (RGB); ink subtracts it (CMYK). Many saturated screen colors (vivid blues, greens, oranges, electric cyan) are outside the CMYK gamut and print duller.
- Accurate RGB to CMYK conversion needs an ICC profile for the press and paper (for example FOGRA39/FOGRA51 in Europe, GRACoL or SWOP in the US). Naive formulas (K = 1 - max(R,G,B)) are only a rough preview, so this server does not output CMYK. Tell the user to convert in their design app with the printer's profile.
- Work in a wide RGB space and soft-proof against the target profile before approving; check out-of-gamut warnings.
- Total ink limit is typically 240 to 300%; a rich black (for example C60 M40 Y40 K100) is for large areas, while small text should be K-only to avoid misregistration.
- For brand-critical colors use spot inks (Pantone) or ask the printer for a Lab target; match by measured values, not by the screen.
- Paper changes color: uncoated stock lowers contrast and saturation, so push contrast a little.
- Keep 4.5:1-style legibility rules for text, but allow for dot gain on small type.

What this server can do for print work: check that colors are within sRGB (colors_convert reports gamut mapping), compare candidates with colors_compare (CIEDE2000 is the standard for print tolerances), and build ramps and harmonies you then soft-proof.`,
	},
	{
		topic: "film-video",
		title: "Film, video and grading",
		summary: "Color spaces, transfer curves and the traps that wreck a grade.",
		body: `# Film and video

- Know the working space: Rec.709 (HD, with BT.1886 gamma 2.4 display), Display P3 (cinema and modern phones), Rec.2020/PQ/HLG (HDR). sRGB's curve differs slightly from gamma 2.4 in the darks.
- Never grade log footage (S-Log3, LogC, V-Log) without the right conversion LUT or a color-managed pipeline (ACES, DaVinci Wide Gamut, OCIO). A grade made on the wrong transform will not translate.
- Range: video is often limited range (16 to 235 in 8-bit); full-range footage tagged as limited looks washed out, and the reverse crushes blacks.
- Skin tones sit along a line on the vectorscope (roughly the 11 o'clock "skin line"); keep them near it unless the look is deliberately stylized.
- White balance: tungsten about 3200 K, daylight about 5600 K, overcast about 6500 K. Mixed lighting is solved per area, not with one global slider.
- Teal-and-orange works because skin sits opposite the shadows; push it lightly, or the faces turn orange.
- Legalize broadcast: keep saturated highlights under 100% and chroma within the legal range for the delivery spec.
- Check delivery on a calibrated display in the target space; phones and TVs add their own processing.

What this server can do: convert between sRGB and Display P3 (colors_convert to "p3"), compute contrast for titles and lower thirds over footage (colors_check), and build harmonious color-script swatches (colors_harmony, colors_palette). It does not do scene-linear or ACES math.`,
	},
	{
		topic: "photo",
		title: "Photography and photo editing",
		summary:
			"Working spaces, white balance, saturation and exporting correctly.",
		body: `# Photo editing

- Edit in a wide space (Adobe RGB or ProPhoto in 16-bit) and convert to sRGB when exporting for web; embed the profile. Untagged files are treated as sRGB by browsers.
- Soft-proof for print and watch out-of-gamut warnings before exporting.
- White balance first (a neutral gray patch or the eyedropper on something truly neutral), then exposure, then contrast, then color. Fix the cast before you stylize.
- Raising saturation clips color channels in bright, saturated areas (skies, flowers); prefer a vibrance-style adjustment or lower chroma in the highlights.
- Do hue and saturation moves perceptually (OKLCH): HSL saturation changes brightness, which is why quick boosts look garish. colors_adjust changes only the property you name.
- Skin tones: keep them believable; check hue stays in a narrow band and avoid shifting them with global hue changes.
- A monitor that is not calibrated misleads every decision; view at a moderate brightness and a neutral surround.
- To sample a color from a photo, use the editing app's eyedropper on a small average, then pass the hex here; this server does not read image files.`,
	},
	{
		topic: "games",
		title: "Game art and game UI",
		summary: "Readability, team colors, palettes and linear lighting.",
		body: `# Games

- Value first: a scene should read in grayscale. Check that important elements differ in lightness, not just hue.
- Gameplay colors (teams, enemies, pickups, health) must stay distinguishable for color-blind players: test with colors_vision, build sets with colors_palette kind "categorical", and add shape or icon redundancy.
- Keep a limited, cohesive palette per scene. For painted or pixel art, hue-shift ramps (shadows drift toward cooler/more saturated, highlights toward warmer) look richer than only changing lightness; colors_palette gives a constant-hue base to start from.
- UI over moving scenery: add an outline, shadow or backing plate; do not count on a fixed background for contrast. Check text/plate pairs with colors_check.
- Lighting math happens in linear light; color textures are stored in sRGB and decoded by the GPU. Average and blend in linear light, after decoding sRGB.
- HDR and tone mapping change how saturated colors clip; keep UI in a reference white and check in both SDR and HDR if you ship both.
- Reserve the most saturated colors for the most important signals; if everything is vivid, nothing is.`,
	},
	{
		topic: "social-brand",
		title: "Social media and branding",
		summary:
			"Brand color choice, overlays on photos, and small-thumbnail legibility.",
		body: `# Social media and branding

- Pick one dominant brand color, one or two supporting colors and a neutral set; test the logo and text on every background it will meet (colors_check).
- Text on photos or gradients needs a scrim (dark or light overlay, 40 to 60%) or a solid plate; verify the worst region of the image.
- Thumbnails are tiny: use high contrast, few colors, and big shapes. Check the design at 10% size.
- Feeds are light or dark depending on the user: supply both a light and a dark variant of any colored asset (colors_palette kind "theme" does the tokens).
- Platform UI changes the context: keep brand colors away from near-duplicates of the platform's own accent colors.
- Color associations vary by culture and context; treat them as hypotheses to test, not rules.
- Consistency beats novelty: reuse the same ramp steps for the same roles across posts.`,
	},
];

export const GUIDE_TOPICS = GUIDES.map((g) => g.topic);

export const guideByTopic = (topic: string): Guide | undefined =>
	GUIDES.find((g) => g.topic === topic);

export const INDEX_TEXT = `# Color guides

${GUIDES.map((g) => `- ${g.topic}: ${g.summary}`).join("\n")}

Read a guide at colors://guide/<topic>. Take every number (contrast, conversion, gamut, ΔE, color-blind simulation) from the colors_* tools.`;
