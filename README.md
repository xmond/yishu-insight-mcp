# Yishu Insight MCP Server

[![MCP](https://img.shields.io/badge/MCP-2025--03--26-blue)](https://modelcontextprotocol.io)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-success)](./package.json)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](./LICENSE)
[![Official Website](https://img.shields.io/badge/live-insightapp.life-gold)](https://insightapp.life)

**English** | [简体中文](./README.zh-CN.md) | [日本語](./README.ja.md)

**Deterministic I Ching and Zi Wei Dou Shu calculations for AI agents.**

`yishu-insight-mcp` connects your AI agent to [Yishu Insight](https://insightapp.life). Calculations are performed by code, with zero runtime dependencies and Node.js 18 or newer.

- **I Ching (Book of Changes):** 64 hexagrams, three-coin casting, Meihua Yishu (Plum Blossom Numerology) time-based casting, and explicit six-line input. Includes original, mutual, opposite, reversed, and changed hexagrams, classical texts, and moving-line readings. Runs locally and works offline.
- **Zi Wei Dou Shu (Purple Star Astrology):** 12 palaces, 14 main stars, 23 classical patterns, Si Hua (Four Transformations), compatibility, a 100-Year Life K-Line, classical text lookup, and famous charts. Uses the authoritative Rust engine at insightapp.life.
- **Explicit errors:** unavailable engines or invalid responses produce `isError`; the server does not fabricate a substitute chart.

## Official Web Platform & Live Tools (insightapp.life)

Explore the full platform in your browser, or connect an agent through the MCP endpoint.

| Official resource | Live link |
|---|---|
| **Official Website** | [insightapp.life](https://insightapp.life) |
| **Zi Wei Dou Shu Natal Chart Calculator** | [Create a natal chart](https://insightapp.life/ziwei/chart) |
| **100-Year Life K-Line Chart** | [Explore life cycles](https://insightapp.life/ziwei/life-kline) |
| **Zi Wei Synastry & Compatibility** | [Compare two charts](https://insightapp.life/ziwei/heming) |
| **Flying Star (Si Hua) & Annual Fortune** | [Explore transformations and annual fortune](https://insightapp.life/ziwei/feixing) |
| **Famous Historical & Celebrity Charts** | [Browse famous charts](https://insightapp.life/ziwei/famous) |
| **I Ching Online Divination (Coins & Plum Blossom)** | [Cast a hexagram](https://insightapp.life/zhouyi/divine) |
| **64 Hexagrams Complete Encyclopedia** | [Explore all 64 hexagrams](https://insightapp.life/zhouyi/lookup) |
| **Astrology & I Ching Articles / Guides** | [Read articles and guides](https://insightapp.life/blog) |
| **Agent Skill & Plugin Download** | [Download skills and plugins](https://insightapp.life/skill) |
| **Remote Streamable HTTP MCP Endpoint** | [Connect via MCP](https://insightapp.life/mcp) |
| **MCP Discovery Manifest** | [Read the discovery manifest](https://insightapp.life/.well-known/mcp.json) |
| **OpenAPI 3.1 Specification** | [Read the API specification](https://insightapp.life/openapi.yaml) |
| **MCP Registries** | [npm (`yishu-insight-mcp`)](https://www.npmjs.com/package/yishu-insight-mcp) · [Smithery.ai](https://smithery.ai/servers/lu-yuan-mails/yishu-insight) · [Glama.ai](https://glama.ai/mcp/servers/xmond/yishu-insight-mcp) |

## Quick Start

### Remote Streamable HTTP

Connect a client that supports remote Streamable HTTP to `https://insightapp.life/mcp`. No local installation is needed. For clients that accept URL-based `mcpServers` configuration:

```json
{
  "mcpServers": {
    "yishu-insight": { "url": "https://insightapp.life/mcp" }
  }
}
```

In clients with a setup form, select Streamable HTTP and enter the endpoint URL. Configuration fields vary by client.

The following request calls the **remote HTTP endpoint** directly. It uses calendar fields and `clock_hour`, rather than the local stdio wrapper's `solar_date` and `birth_time` fields:

```bash
curl -sS https://insightapp.life/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  --data '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "ziwei_chart",
      "arguments": {
        "year": 1990,
        "month": 5,
        "day": 15,
        "clock_hour": 14,
        "gender": "male"
      }
    }
  }'
```

Use `tools/list` on the endpoint you connect to for its current input schemas. The remote HTTP service and the local stdio wrapper expose different birth-input schemas.

### Local stdio via NPX

Install Node.js 18 or newer, then add this configuration to your MCP client:

```json
{
  "mcpServers": {
    "yishu-insight": {
      "command": "npx",
      "args": ["-y", "yishu-insight-mcp"]
    }
  }
}
```

| Client | Configuration location or command |
|---|---|
| Claude Desktop | `claude_desktop_config.json`, under `mcpServers` |
| Cursor | `~/.cursor/mcp.json` or `.cursor/mcp.json` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |
| Cline | MCP Servers configuration: `cline_mcp_settings.json` |
| Claude Code | `claude mcp add yishu-insight -- npx -y yishu-insight-mcp` |

Use `--remote-url <url>` or the `YISHU_INSIGHT_URL` environment variable to change the Zi Wei engine base URL (default: `https://insightapp.life`). This is the website base URL, not the `/mcp` endpoint. Run `--help` for usage or `--version` for the installed version.

After installation, `iching_*` tools work offline. Local `ziwei_*` tools still require network access to the remote engine.

## Local stdio Tool Reference

These seven tools use the schemas supplied by this npm package. Technical identifiers are unchanged; classical texts and engine responses may contain their original Chinese terminology. This English guide does not imply that the underlying dataset has been translated.

| Tool | Execution | Parameters and behavior |
|---|---|---|
| `iching_cast` | Local | `method`: `coins`, `time`, or `lines` (default: `coins`). For `lines`, supply six digits such as `"788878"`, bottom to top: 6 = old yin, 7 = young yang, 8 = young yin, 9 = old yang. Optional `changing` such as `"3,5"` sets moving lines for `coins` or `lines`; `at` sets the time for `time` as `"YYYY-MM-DD HH:MM"` (default: server time); `question` records your question. |
| `iching_lookup` | Local | Supply `number` (1-64), an original-language `name`, or original-language `upper` and `lower` trigram identifiers. Use `{"number":11}` for a language-independent lookup of Tai (Peace). |
| `ziwei_chart` | Remote engine | Birth fields below; optional `target_solar_year` (1900-2200) for annual transformations. Returns the natal chart, patterns, flying stars, and decade/annual cycles. |
| `ziwei_heming` | Remote engine | `person_a` and `person_b`, each containing birth fields; optional `relation_type` (default: `marriage`). Compares two charts. |
| `ziwei_life_kline` | Remote engine | Birth fields; optional `from_year` and `to_year` (1900-2200). Defaults to the birth year through 99 years later; the difference between end and start must be less than 120. |
| `ziwei_kb_query` | Remote engine | `gong` (palace) and either `star` or `stars` (an array); optional `branch` and `max_len`. Use original-language palace and star identifiers from chart results; romanized labels in this guide are explanatory, not API aliases. |
| `ziwei_famous` | Remote engine | No arguments for the full list, `category` to filter, or `slug` for one famous chart. |

### Birth Parameters

Always supply `gender` as `male` or `female`, plus one of these input forms:

| Input form | Fields |
|---|---|
| Solar calendar | `solar_date`: `YYYY-MM-DD`; `birth_time`: `HH:MM` in 24-hour time. The wrapper converts the date to the lunar calendar. |
| Lunar calendar | `lunar_year` (1900-2100), `lunar_month` (1-12), `lunar_day` (1-30), and `hour` (two-hour branch index, 0 = Zi through 11 = Hai). Optional `is_leap_month` must be a Boolean. |

Example `tools/call` parameters for the local stdio server:

```json
{
  "name": "ziwei_chart",
  "arguments": {
    "solar_date": "1990-06-15",
    "birth_time": "09:30",
    "gender": "female"
  }
}
```

An offline I Ching lookup:

```json
{ "name": "iching_lookup", "arguments": { "number": 11 } }
```

### Results, Prompts, and Resources

`iching_cast` returns `ben` (original), `hu` (mutual), `cuo` (opposite), `zong` (reversed), `bian` (changed; null when no line moves), `rule`, `moving_line_texts`, `ti_yong`, and `decision_guidance`.

`ziwei_chart` returns `{ source, request, result }`. The engine result contains the 12 palaces, Ming Gong (Life Palace), Shen Gong (Body Palace), five-element bureau, main stars, `patterns`, `feixing` (flying stars), Da Xian (decade cycles), and Liu Nian (annual cycles).

| Type | Identifier | Purpose |
|---|---|---|
| Prompt | `iching_divination_prompt` | Guide an I Ching reading |
| Prompt | `ziwei_chart_reading_prompt` | Guide a Zi Wei Dou Shu chart reading |
| Resource | `yishu://hexagrams/index` | Index of the 64 hexagrams |
| Resource | `yishu://guide/methodology` | Calculation and interpretation methodology |

## Development

Run these commands from the repository root:

```bash
npm test
npm pack --dry-run
docker build -t yishu-insight-mcp .
```

The test suite uses Node's test runner, launches the actual stdio server, and exercises remote behavior with a mock engine. The package has no runtime dependencies.

## License

[MIT](./LICENSE). Intended for cultural study and personal reflection; it is not medical, legal, or financial advice.
