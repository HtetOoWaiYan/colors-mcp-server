# Colors MCP Server

An MCP server that gives AI agents **exact color math, accessibility checks and ready-made palettes**. It is built for small and mid-size models: they cannot reliably compute contrast ratios, OKLCH conversions, gamut mapping or color-blind simulation in their heads, and this server does it for them in one call.

Works for UI and web design, design systems, data visualization, print, video, photo and game work. Pure computation: no network, no files, no side effects.

## Install

```bash
npx -y @htetoowaiyan/colors-mcp-server
```

Claude Desktop / most MCP clients:

```json
{
  "mcpServers": {
    "colors": { "command": "npx", "args": ["-y", "@htetoowaiyan/colors-mcp-server"] }
  }
}
```

Node 20 or newer.

## Tools

Eleven tools. The first four return finished answers (outcome tools); the rest are exact helpers. Every result starts with the verdict, and every tool also returns `structuredContent` with a declared `outputSchema`.

| Tool | Use it to |
| --- | --- |
| `colors_check` | Pass/fail WCAG 2 contrast for one or many pairs (AA/AAA, normal/large/UI), with APCA Lc and a nearby passing color for each failure. Handles translucent colors. |
| `colors_fix` | Get the closest color (same hue) that reaches a target ratio on a given background. |
| `colors_palette` | Build a finished palette: `ramp` (11-step tonal scale, seed is one step), `theme` (light + dark tokens with every contrast rule verified), `categorical` (N distinct, color-blind-safe chart colors). |
| `colors_audit` | Scan CSS for text contrast, non-text contrast and near-duplicate tokens, resolving `var(--x)`. |
| `colors_info` | Validate and describe colors: formats, closest name, lightness, contrast on white/black. Bad inputs get a suggestion. |
| `colors_convert` | hex, rgb, hsl, hwb, oklch, oklab, lab, lch, display-p3. Out-of-sRGB colors are gamut-mapped by lowering chroma only, and the result says so. |
| `colors_compare` | CIEDE2000 (D65 Lab) ranking: nearest candidate and plain-language reading. |
| `colors_blend` | Gradients and mixes in OKLCH (shorter hue arc, achromatic-safe) or OKLab/sRGB. |
| `colors_adjust` | Exact OKLCH edits: lightness, chroma or hue, by add / multiply / set. |
| `colors_harmony` | Complementary, split-complementary, triadic, tetradic and analogous schemes by OKLCH hue rotation. |
| `colors_vision` | Simulate protanopia, deuteranopia, tritanopia and achromatopsia (Machado 2009) and measure whether a set stays distinguishable. |

Design choices that matter for small models: one list-shaped input per tool (no `batch_` twins), flat forgiving schemas (case, whitespace and a missing `#` are fine), errors that say how to fix the call (`Did you mean "tomato"?`), and numbers that are always verified before they are returned.

CMYK output is intentionally missing: accurate RGB-to-CMYK needs the press's ICC profile, and a formula would mislead. The print guide says what to do instead.

## Beyond tools

- **Server instructions** (sent on connect): a short routing guide so a model uses the tools instead of guessing.
- **Resources**: `colors://guide/{topic}` for `accessibility`, `ui-design`, `dataviz`, `print`, `film-video`, `photo`, `games`, `social-brand` (template with completion, plus an index at `colors://guide`).
- **Prompts**: `review-colors`, `brand-color-system`, `fix-accessibility`.
- **Agent Skill** (the `io.modelcontextprotocol/skills` extension): `skill://color-expert/SKILL.md` with the guides as references.
- **MCP App**: `ui://colors/viewer.html` renders results visually (contrast samples, ramps, light/dark themes, gradients, color-blind simulations) in hosts that support MCP Apps. It is one self-contained file with no network access.

## Protocol support

Built on the stable v2 SDK (`@modelcontextprotocol/server`) and served with `serveStdio`, so a single process speaks both:

- **2026-07-28** (stateless, `server/discover`, `resultType`, `ttlMs`/`cacheScope` cache hints on list results and resources, deterministic tool order), and
- **2025-11-25 and earlier** (the `initialize` handshake), for clients that have not upgraded.

## Migrating from 1.x

2.0.0 replaces the tool surface. Old to new:

| 1.x | 2.x |
| --- | --- |
| `colors_contrast`, `colors_batch_contrast` | `colors_check` (`pairs` for many) |
| `colors_convert`, `colors_batch_convert` | `colors_convert` (`colors` is a list; output uses CSS space-separated syntax) |
| `colors_parse` | `colors_info` |
| `colors_adjust`, `colors_batch_adjust` | `colors_adjust` (`property` + `mode` + `amount`) |
| `colors_mix`, `colors_scale` | `colors_blend` |
| `colors_difference`, `colors_batch_difference` | `colors_compare` (CIEDE2000; 1.x used Euclidean Oklab) |

New in 2.x: `colors_fix`, `colors_palette`, `colors_audit`, `colors_harmony`, `colors_vision`. The color engine moved from culori to Color.js plus hand-written, test-vector-checked math for CIEDE2000, gamut mapping and color-blind simulation.

## Evals

`evals/` is a separate package (not published) that measures what the server is worth to small models: 56 deterministic tasks in 14 categories, graded by hand-written reference math, run with and without the server against Haiku 5.5 and GPT-6 Luna through a local inference proxy. The task suite is frozen and content-hashed; held-out tasks are sealed. See `docs/superpowers/specs/2026-11-06-eval-harness-design.md`.

```bash
cd evals && npm ci
npm test                                                  # grader, runner and suite tests
npm run cli -- preflight --server-ref working-tree --cases v2
npm run cli -- run --run-id v2 --server-ref working-tree
```

## Development

```bash
npm install
npm test            # unit + integration (in-memory, 2025 and 2026 protocol eras) + real stdio
npm run lint
npm run build:ui    # rebuilds the viewer into src/ui/viewer.generated.ts (committed)
npm run build
npm run inspect     # MCP Inspector
```

## License

MIT
