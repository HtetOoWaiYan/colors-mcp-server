import {
	completable,
	type McpServer,
	ResourceTemplate,
} from "@modelcontextprotocol/server";
import {
	memorySkillFiles,
	SkillsExtension,
} from "@modelcontextprotocol/server/ext/skills";
import { z } from "zod";
import { GUIDE_TOPICS, GUIDES, guideByTopic, INDEX_TEXT } from "./guides.js";

// Short on purpose: high leverage for clients that forward it, noise for those that do not.
export const INSTRUCTIONS = `Deterministic color tools. Take every number from a tool: contrast ratios, color-space conversions, gamut mapping, color differences, color-blind simulation.
- Is text readable? colors_check, then colors_fix for the closest passing color.
- Need a palette? colors_palette (kind ramp, theme, categorical or diverging). Review CSS? colors_audit.
- Need colors that meet stated rules (hue, chroma, contrast on given surfaces, gaps between several)? colors_find. Text over an image? colors_scrim.
- Edit colors in OKLCH with colors_adjust, blend with colors_blend, compare with colors_compare (CIEDE2000).
- Answer with hex (#rrggbb) unless asked otherwise, and quote the tool's numbers.
Guides by medium (accessibility, ui-design, dataviz, print, film-video, photo, games, social-brand): resource colors://guide/<topic>.`;

const HOUR = { ttlMs: 3_600_000, cacheScope: "public" } as const;

const SKILL_MD = `---
name: color-expert
description: Use when choosing, checking, fixing or generating colors for UI, web, charts, print, video, photo or games. Routes color math to the colors_* tools and gives medium-specific rules.
---
# Color expert

Every number comes from a tool.

| Need | Tool |
| --- | --- |
| Is this text/background readable? | colors_check |
| Make it pass, keeping the hue | colors_fix |
| Brand ramp, light/dark theme, chart colors, diverging scale | colors_palette |
| Colors that meet stated rules (hue, chroma, contrast, gaps) | colors_find |
| Overlay opacity for text over an image | colors_scrim |
| Review a stylesheet | colors_audit |
| What is this color? Is it valid? | colors_info |
| Convert formats, gamut-map | colors_convert |
| Closest color, ΔE | colors_compare |
| Gradient or mix | colors_blend |
| Lighter, darker, hue shift | colors_adjust |
| Complementary, triadic and so on | colors_harmony |
| Color-blind safety | colors_vision |

Medium guides are in references/: ${GUIDE_TOPICS.join(", ")}.
`;

/** Skill files, built once at module load: the catalog is shared, each connection attaches its own server. */
const skills = await SkillsExtension.load(
	memorySkillFiles({
		"color-expert/SKILL.md": SKILL_MD,
		...Object.fromEntries(
			GUIDES.map((g) => [`color-expert/references/${g.topic}.md`, g.body]),
		),
	}),
);

export function registerSteering(server: McpServer): void {
	server.registerResource(
		"color-guides-index",
		"colors://guide",
		{
			title: "Color guides: index",
			mimeType: "text/markdown",
			cacheHint: HOUR,
		},
		async (uri) => ({
			contents: [
				{ uri: uri.href, text: INDEX_TEXT, mimeType: "text/markdown" },
			],
		}),
	);

	server.registerResource(
		"color-guide",
		new ResourceTemplate("colors://guide/{topic}", {
			list: () => ({
				resources: GUIDES.map((g) => ({
					uri: `colors://guide/${g.topic}`,
					name: g.topic,
					title: g.title,
					description: g.summary,
					mimeType: "text/markdown",
				})),
			}),
			complete: {
				topic: (value: string) =>
					GUIDE_TOPICS.filter((t) => t.startsWith(value)),
			},
		}),
		{
			title: "Color guide",
			description: "Field guide for one medium or concern.",
			mimeType: "text/markdown",
			cacheHint: HOUR,
		},
		async (uri, variables) => {
			const topic = String(variables.topic);
			const guide = guideByTopic(topic);
			if (!guide)
				throw new Error(
					`Unknown guide "${topic}". Available: ${GUIDE_TOPICS.join(", ")}.`,
				);
			return {
				contents: [
					{ uri: uri.href, text: guide.body, mimeType: "text/markdown" },
				],
			};
		},
	);

	server.registerPrompt(
		"review-colors",
		{
			title: "Review colors in CSS",
			description:
				"Audit a stylesheet for contrast and duplicate-token problems and propose fixes.",
			argsSchema: z.object({ css: z.string().describe("The CSS to review") }),
		},
		({ css }) => ({
			messages: [
				{
					role: "user" as const,
					content: {
						type: "text" as const,
						text: `Review the colors in this CSS. Run colors_audit on it, fix each contrast finding with colors_fix, and report the findings and the exact replacement values.\n\n${css}`,
					},
				},
			],
		}),
	);

	server.registerPrompt(
		"brand-color-system",
		{
			title: "Build a brand color system",
			description:
				"Create a ramp, light/dark theme tokens and chart colors from one brand color.",
			argsSchema: z.object({
				brand: z.string().describe("Brand color, e.g. #2563eb"),
				use: completable(z.string(), (v: string) =>
					[
						"web app",
						"marketing site",
						"dashboard",
						"mobile app",
						"game UI",
					].filter((x) => x.startsWith(v)),
				).optional(),
			}),
		},
		({ brand, use }) => ({
			messages: [
				{
					role: "user" as const,
					content: {
						type: "text" as const,
						text: `Build a color system for ${use ?? "a product"} from the brand color ${brand}: call colors_palette with kind "ramp" and kind "theme" for the brand, and kind "categorical" for chart colors. Present the results as tokens and confirm the contrast rules passed.`,
					},
				},
			],
		}),
	);

	server.registerPrompt(
		"fix-accessibility",
		{
			title: "Fix inaccessible color pairs",
			description:
				"Check text/background pairs and replace failing text colors with the closest passing ones.",
			argsSchema: z.object({
				pairs: z
					.string()
					.describe('Pairs to check, e.g. "#777 on #fff, #aaa on #eee"'),
			}),
		},
		({ pairs }) => ({
			messages: [
				{
					role: "user" as const,
					content: {
						type: "text" as const,
						text: `Check these text/background pairs for WCAG AA with colors_check, and for each failure use colors_fix to give the closest passing text color: ${pairs}`,
					},
				},
			],
		}),
	);

	skills.attach(server);
}
