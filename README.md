# Colors MCP Server

Exact color math, accessibility checks and ready-made palettes for AI agents.

[![npm](https://img.shields.io/npm/v/@htetoowaiyan/colors-mcp-server)](https://www.npmjs.com/package/@htetoowaiyan/colors-mcp-server)
[![license](https://img.shields.io/npm/l/@htetoowaiyan/colors-mcp-server)](LICENSE)
[![node](https://img.shields.io/node/v/@htetoowaiyan/colors-mcp-server)](package.json)

Small and mid-size models cannot compute contrast ratios, OKLCH conversions, gamut mapping or color-blind simulation in their heads. They guess, or they run out of output tokens while they try. This server does the math in one tool call and returns a verified answer.

It works for UI and web design, design systems, data visualization, print, video, photo and game work. It is pure computation: no network, no files, no side effects.

## What it does

An agent asks for an outcome and gets a finished result. Every result starts with the verdict.

```text
colors_check   {"foreground":"#777777","background":"#ffffff"}
→ FAIL: 4.48:1, needs 4.5:1 for WCAG AA normal text.
  Passing alternative text color: #767676

colors_fix     {"foreground":"#777777","background":"#ffffff"}
→ Use #767676 (was #777777). Contrast on #ffffff is 4.54:1, up from 4.48:1; target 4.5:1 met.

colors_palette {"kind":"categorical","count":4}
→ 4 categorical colors for #ffffff background, each at least 3:1 against it:
  #e556f3, #003905, #36aa3d, #460062
  Weakest pair difference (CIEDE2000; higher is better): normal 38.2, protanopia 36.5, deuteranopia 36.6, tritanopia 36.1.
```

Hosts that support MCP Apps also show the result visually.

| Contrast check | Light and dark theme |
| --- | --- |
| ![Contrast results with a failing and a passing pair](docs/assets/viewer-contrast.png) | ![Light and dark theme tokens for one brand color](docs/assets/viewer-theme.png) |

![Four chart colors as seen with each type of color blindness](docs/assets/viewer-vision.png)

## Install

Node 20 or newer.

```bash
npx -y @htetoowaiyan/colors-mcp-server
```

Claude Code:

```bash
claude mcp add colors -- npx -y @htetoowaiyan/colors-mcp-server
```

Claude Desktop, Cursor and most other clients (`mcpServers` in the client's config file):

```json
{
  "mcpServers": {
    "colors": { "command": "npx", "args": ["-y", "@htetoowaiyan/colors-mcp-server"] }
  }
}
```

VS Code (`.vscode/mcp.json`):

```json
{
  "servers": {
    "colors": { "command": "npx", "args": ["-y", "@htetoowaiyan/colors-mcp-server"] }
  }
}
```

Codex (`~/.codex/config.toml`):

```toml
[mcp_servers.colors]
command = "npx"
args = ["-y", "@htetoowaiyan/colors-mcp-server"]
```

## Tools

Eleven tools. The first four return finished answers. The other seven are exact helpers. Every tool also returns `structuredContent` with a declared `outputSchema`.

| Tool | Use it to |
| --- | --- |
| `colors_check` | Pass or fail WCAG 2 contrast for one or many pairs (AA or AAA, normal text, large text or UI parts). Reports APCA Lc and a nearby passing color for each failure. Handles translucent colors. |
| `colors_fix` | Get the closest color with the same hue that reaches a target ratio on a given background. |
| `colors_palette` | Build a finished palette. `ramp` is an 11-step tonal scale that contains the seed color. `theme` is light and dark tokens with every contrast rule checked. `categorical` is N distinct, color-blind-safe chart colors. |
| `colors_audit` | Scan CSS for text contrast, non-text contrast and near-duplicate tokens. Resolves `var(--x)`. |
| `colors_info` | Validate colors and describe them: formats, closest name, lightness, contrast on white and black. A bad input gets a suggestion. |
| `colors_convert` | Convert between hex, rgb, hsl, hwb, oklch, oklab, lab, lch and display-p3. A color outside sRGB loses chroma only, and the result says so. |
| `colors_compare` | Rank candidates by CIEDE2000 (D65 Lab) and say in plain words how close they are. |
| `colors_blend` | Build gradients and mixes in OKLCH (shorter hue arc, safe for grays), OKLab or sRGB. |
| `colors_adjust` | Change lightness, chroma or hue by an exact OKLCH amount (add, multiply or set). |
| `colors_harmony` | Build complementary, split-complementary, triadic, tetradic and analogous schemes by OKLCH hue rotation. |
| `colors_vision` | Simulate protanopia, deuteranopia, tritanopia and achromatopsia (Machado 2009). Measure whether a set of colors stays distinguishable. |

The design is built for small models. Each tool takes one list-shaped input, so there are no batch twins. The schemas are flat and forgiving: case, whitespace and a missing `#` are fine. Errors say how to fix the call (`Did you mean "tomato"?`). The server verifies every number before it returns it.

CMYK output is missing on purpose. An accurate RGB to CMYK conversion needs the press's ICC profile, and a formula would mislead. The print guide says what to do instead.

## Guidance for agents

- **Server instructions.** The server sends a short routing guide on connect, so a model calls the tools instead of guessing.
- **Guides.** `colors://guide/{topic}` gives a field guide for `accessibility`, `ui-design`, `dataviz`, `print`, `film-video`, `photo`, `games` or `social-brand`. `colors://guide` is the index.
- **Prompts.** `review-colors`, `brand-color-system` and `fix-accessibility`.
- **Agent Skill.** The `io.modelcontextprotocol/skills` extension serves `skill://color-expert/SKILL.md`, with the guides as references.
- **MCP App.** `ui://colors/viewer.html` renders results visually. It is one self-contained file with no network access.

## Does it help?

The `evals/` package measures this. It has 56 fixed tasks in 14 categories, for example contrast fixes, gradients, tonal ramps, light and dark themes, CSS audits and color-blind-safe chart colors. A grader built from hand-written color math scores each answer. 14 of the tasks are held out and sealed.

Pass rate on the 42 development tasks (2 trials per task, tool results sent as text only, no server instructions):

| Model | No tools | 1.x server | 2.x server |
| --- | --- | --- | --- |
| Haiku 5.5 | 38% | 79% | 96% |
| GPT-6 Luna | 48% | 61% | 100% |

Both models pass all 14 held-out tasks with the 2.x server. They pass 32% and 46% without tools.

Read these numbers with care. The tasks and the tools cover the same categories, so the scores show that the tools cover this suite. They do not show how much the tools help on color work outside it. The suite covers CSS, UI-token and chart-palette tasks only, and it tested two models. Print, film, photo and game work have guides but no tasks. The reports are in [`evals/results/reports/`](evals/results/reports), and the method is in [`evals/README.md`](evals/README.md).

## Protocol support

The server uses the stable v2 SDK (`@modelcontextprotocol/server`) and `serveStdio`, so one process speaks both protocol eras:

- **2026-07-28.** Stateless, with `server/discover`, `resultType`, cache hints on list results and resources, and a fixed tool order.
- **2025-11-25 and earlier.** The `initialize` handshake, for clients that have not upgraded.

## Migrating from 1.x

2.0.0 replaces the tool surface.

| 1.x | 2.x |
| --- | --- |
| `colors_contrast`, `colors_batch_contrast` | `colors_check` (`pairs` for many) |
| `colors_convert`, `colors_batch_convert` | `colors_convert` (`colors` is a list; output uses CSS space-separated syntax) |
| `colors_parse` | `colors_info` |
| `colors_adjust`, `colors_batch_adjust` | `colors_adjust` (`property`, `mode` and `amount`) |
| `colors_mix`, `colors_scale` | `colors_blend` |
| `colors_difference`, `colors_batch_difference` | `colors_compare` (CIEDE2000; 1.x used Euclidean Oklab) |

New in 2.x: `colors_fix`, `colors_palette`, `colors_audit`, `colors_harmony` and `colors_vision`. The color engine moved from culori to Color.js, plus hand-written math for CIEDE2000, gamut mapping and color-blind simulation. Published test vectors check that math.

## Development

```bash
npm install
npm test            # unit and integration tests (both protocol eras in memory) plus a real stdio process
npm run lint
npm run build:ui    # rebuild the viewer into src/ui/viewer.generated.ts (committed)
npm run build
npm run inspect     # open the MCP Inspector
```

To run the evals:

```bash
cd evals && npm ci
npm test
npm run cli -- preflight --server-ref working-tree --cases v2
npm run cli -- run --run-id v2 --server-ref working-tree
```

The evals call models through a local inference proxy. See [`evals/README.md`](evals/README.md) for the setup.

## License

MIT
