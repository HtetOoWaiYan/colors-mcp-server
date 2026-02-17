# 🎨 Colors MCP Server

[![npm](https://img.shields.io/npm/v/@htetoowaiyan/colors-mcp-server)](https://www.npmjs.com/package/@htetoowaiyan/colors-mcp-server)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

A simple color utility [MCP](https://modelcontextprotocol.io/) server for frontend developers. Convert, mix, adjust, and analyze colors right from your AI agents.

This MCP server provides a streamlined set of color utilities designed for efficiency and precision. It focuses on delivering core color manipulation tools in a straightforward, lightweight package for modern development workflows.

## Tools

| Tool | Description |
|------|-------------|
| `colors_convert` | Convert a color to a different color space |
| `colors_batch_convert` | Convert multiple colors to a target color space at once |
| `colors_parse` | Parse and validate a color string |
| `colors_adjust` | Adjust color properties (lightness, chroma, hue) |
| `colors_batch_adjust` | Batch adjust multiple colors (lightness, chroma, hue) |
| `colors_mix` | Mix two colors with perceptual interpolation |
| `colors_scale` | Generate a perceptually uniform color scale |
| `colors_difference` | Calculate color difference (Delta E) between two colors |
| `colors_batch_difference` | Batch calculate color difference (Delta E) against a target color |
| `colors_contrast` | Check WCAG contrast ratio between foreground and background colors |
| `colors_batch_contrast` | Batch check WCAG contrast ratio for multiple foregrounds against a background |

## Setup

Add the server to your MCP client config (e.g. Claude Desktop, Cursor, etc.):

```json
{
  "mcpServers": {
    "colors": {
      "command": "npx",
      "args": ["-y", "@htetoowaiyan/colors-mcp-server"]
    }
  }
}
```

## Development

```bash
git clone https://github.com/HtetOoWaiYan/colors-mcp-server.git
cd colors-mcp-server
npm install
```

```bash
npm run dev          # Run with tsx (hot reload)
npm run build        # Build for production
npm test             # Run tests
npm run test:watch   # Run tests in watch mode
```

## Built With

- [Model Context Protocol SDK](https://github.com/modelcontextprotocol/typescript-sdk) — MCP server framework
- [Culori](https://culorijs.org/) — Color conversion and manipulation
- [Zod](https://zod.dev/) — Input validation
- [Vitest](https://vitest.dev/) — Testing
- [Biome](https://biomejs.dev/) — Linting & formatting

## License

[MIT](LICENSE)
