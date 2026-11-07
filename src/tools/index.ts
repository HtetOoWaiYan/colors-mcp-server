import { adjustTool } from "./adjust.js";
import { auditTool } from "./audit.js";
import { blendTool } from "./blend.js";
import { checkTool } from "./check.js";
import { compareTool } from "./compare.js";
import { convertTool } from "./convert.js";
import type { ToolDef } from "./define.js";
import { findTool } from "./find.js";
import { fixTool } from "./fix.js";
import { harmonyTool } from "./harmony.js";
import { infoTool } from "./info.js";
import { paletteTool } from "./palette.js";
import { scrimTool } from "./scrim.js";
import { visionTool } from "./vision.js";

/** Order here is the order in tools/list: the outcome tools first, then the helpers. */
export const TOOLS: ToolDef[] = [
	checkTool,
	fixTool,
	paletteTool,
	findTool,
	scrimTool,
	auditTool,
	infoTool,
	convertTool,
	compareTool,
	blendTool,
	adjustTool,
	harmonyTool,
	visionTool,
] as unknown as ToolDef[];
