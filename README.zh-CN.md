# 易数洞察 MCP Server

[![MCP](https://img.shields.io/badge/MCP-2025--03--26-blue)](https://modelcontextprotocol.io)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![零依赖](https://img.shields.io/badge/dependencies-0-success)](./package.json)
[![MIT 许可](https://img.shields.io/badge/license-MIT-yellow.svg)](./LICENSE)
[![官方网站](https://img.shields.io/badge/live-insightapp.life-gold)](https://insightapp.life)

[English](./README.md) | **简体中文** | [日本語](./README.ja.md)

**为智能体提供由程序计算的周易与紫微斗数工具。**

`yishu-insight-mcp` 将智能体连接到[易数洞察](https://insightapp.life)。起卦与排盘由代码完成，无运行时第三方依赖，需要 Node.js 18 或更高版本。

- **周易：**六十四卦，三枚铜钱起卦、梅花易数时间起卦、指定六爻；提供本卦、互卦、错卦、综卦、变卦，以及经典原文和动爻取辞。本地运行，离线可用。
- **紫微斗数：**十二宫、十四主星、23 种经典格局、四化飞星、双人合盘、百岁人生 K 线、古籍检索和名人命盘，由 insightapp.life 的权威 Rust 引擎计算。
- **明确报错：**远程引擎不可达或响应不符合要求时返回 `isError`，不会伪造替代命盘。

## 官方网站与在线工具（insightapp.life）

通过浏览器体验完整平台，或使用 MCP 接口连接智能体。

| 官方资源 | 在线链接 |
|---|---|
| **官方网站** | [易数洞察](https://insightapp.life) |
| **紫微斗数本命盘计算器** | [立即排盘](https://insightapp.life/ziwei/chart) |
| **百岁人生 K 线图** | [查看人生周期](https://insightapp.life/ziwei/life-kline) |
| **紫微双人合盘与关系匹配** | [比较双方命盘](https://insightapp.life/ziwei/heming) |
| **四化飞星与流年运势** | [查看飞星与流年](https://insightapp.life/ziwei/feixing) |
| **历史人物与名人命盘** | [浏览名人命盘](https://insightapp.life/ziwei/famous) |
| **周易在线占卜（铜钱与梅花易数）** | [在线起卦](https://insightapp.life/zhouyi/divine) |
| **六十四卦完整百科** | [查询六十四卦](https://insightapp.life/zhouyi/lookup) |
| **紫微斗数与周易文章、指南** | [阅读文章与指南](https://insightapp.life/blog) |
| **智能体技能与插件下载** | [下载技能与插件](https://insightapp.life/skill) |
| **远程流式 HTTP MCP 接口** | [连接 MCP 服务](https://insightapp.life/mcp) |
| **MCP 服务发现清单** | [查看服务清单](https://insightapp.life/.well-known/mcp.json) |
| **OpenAPI 3.1 接口规范** | [查看接口规范](https://insightapp.life/openapi.yaml) |
| **MCP 注册平台** | [npm（`yishu-insight-mcp`）](https://www.npmjs.com/package/yishu-insight-mcp) · [Smithery.ai](https://smithery.ai/servers/lu-yuan-mails/yishu-insight) · [Glama.ai](https://glama.ai/mcp/servers/xmond/yishu-insight-mcp) |

## 快速接入

### 远程流式 HTTP 接入

在支持流式 HTTP 传输的客户端中连接 `https://insightapp.life/mcp`，无需本地安装。支持以网址配置 `mcpServers` 的客户端可使用：

```json
{
  "mcpServers": {
    "yishu-insight": { "url": "https://insightapp.life/mcp" }
  }
}
```

如果客户端提供配置表单，选择流式 HTTP 类型并填写上述接口地址。具体配置字段以客户端为准。

下面直接调用**远程 HTTP 接口**。远程接口使用日期字段和 `clock_hour`，与本地 stdio 包的 `solar_date`、`birth_time` 参数不同：

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

调用所连接服务的 `tools/list` 可查询最新参数结构。远程 HTTP 服务与本地 stdio 包的出生信息参数结构不同，请按各自接口填写。

### 通过 NPX 使用本地 stdio

安装 Node.js 18 或更高版本，将以下配置添加到 MCP 客户端：

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

| 客户端 | 配置位置或命令 |
|---|---|
| Claude Desktop | `claude_desktop_config.json` 中的 `mcpServers` |
| Cursor | `~/.cursor/mcp.json` 或 `.cursor/mcp.json` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |
| Cline | MCP 服务器配置：`cline_mcp_settings.json` |
| Claude Code | `claude mcp add yishu-insight -- npx -y yishu-insight-mcp` |

通过 `--remote-url <url>` 或环境变量 `YISHU_INSIGHT_URL` 修改紫微引擎的基础地址，默认是 `https://insightapp.life`。这里填写网站基础地址，不是 `/mcp` 接口地址。使用 `--help` 查看帮助，使用 `--version` 查看已安装版本。

安装完成后，`iching_*` 工具可离线使用；本地 `ziwei_*` 工具仍需联网访问远程引擎。

## 本地 stdio 工具说明

以下七个工具使用本 npm 包提供的参数结构。代码标识符保持原样，经典原文和引擎结果保留其原始术语。

| 工具 | 执行位置 | 参数与功能 |
|---|---|---|
| `iching_cast` | 本地 | `method` 为 `coins`、`time` 或 `lines`，默认 `coins`。指定六爻时传入 `lines`，例如 `"788878"`，从初爻到上爻依次填写：6 老阴、7 少阳、8 少阴、9 老阳。`coins`、`lines` 可用 `changing` 指定动爻，例如 `"3,5"`；`time` 可用 `at` 指定 `"YYYY-MM-DD HH:MM"`，默认服务器当前时间；`question` 记录所问之事。 |
| `iching_lookup` | 本地 | 传入 `number`（1—64）、`name`（如 `泰`、`地天泰`），或 `upper`、`lower`（如 `坤`、`乾`）。返回卦辞、彖传、大象与六爻爻辞。 |
| `ziwei_chart` | 远程引擎 | 使用下方出生信息参数；可选 `target_solar_year`（1900—2200）指定流年四化的目标公历年。返回命盘、格局、飞星及大限流年。 |
| `ziwei_heming` | 远程引擎 | `person_a`、`person_b` 分别填写出生信息；可选 `relation_type`，默认 `marriage`。用于双人合盘。 |
| `ziwei_life_kline` | 远程引擎 | 出生信息，以及可选 `from_year`、`to_year`（1900—2200）。默认从出生年到其后第 99 年；结束年与开始年的差必须小于 120。 |
| `ziwei_kb_query` | 远程引擎 | `gong`（宫位）加 `star`（单星）或 `stars`（星曜数组）；可选 `branch`（地支）、`max_len`（每段文本最大长度）。例如 `{"gong":"命宫","star":"紫微"}`。 |
| `ziwei_famous` | 远程引擎 | 不传参数时列出全部名人；`category` 按分类筛选，`slug` 查询单个命盘。 |

### 出生信息参数

必须填写 `gender`，取值为 `male`（男）或 `female`（女），并选择以下一种日期输入方式：

| 输入方式 | 字段 |
|---|---|
| 公历 | `solar_date`：`YYYY-MM-DD`；`birth_time`：24 小时制 `HH:MM`。本地包自动转换为农历。 |
| 农历 | `lunar_year`（1900—2100）、`lunar_month`（1—12）、`lunar_day`（1—30）、`hour`（时辰序号，0 为子时，依次到 11 为亥时）。可选 `is_leap_month` 必须是布尔值。 |

本地 stdio 服务的 `tools/call` 参数示例：

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

离线查询周易卦象：

```json
{ "name": "iching_lookup", "arguments": { "number": 11 } }
```

### 返回结果、提示词与资源

`iching_cast` 返回 `ben`（本卦）、`hu`（互卦）、`cuo`（错卦）、`zong`（综卦）、`bian`（变卦，无动爻时为 `null`）、`rule`（取辞规则）、`moving_line_texts`（动爻爻辞）、`ti_yong`（体用）和 `decision_guidance`（决策提示）。

`ziwei_chart` 返回 `{ source, request, result }`。引擎结果包含十二宫、命宫、身宫、五行局、主星、`patterns`（格局）、`feixing`（飞星）、大限与流年。

| 类型 | 标识符 | 用途 |
|---|---|---|
| 提示词 | `iching_divination_prompt` | 引导周易占卜解读 |
| 提示词 | `ziwei_chart_reading_prompt` | 引导紫微斗数命盘解读 |
| 资源 | `yishu://hexagrams/index` | 六十四卦索引 |
| 资源 | `yishu://guide/methodology` | 计算与解读方法说明 |

## 开发与验证

在仓库根目录执行：

```bash
npm test
npm pack --dry-run
docker build -t yishu-insight-mcp .
```

测试使用 Node 内置测试运行器，启动真实 stdio 服务，并通过模拟引擎验证远程调用行为。本包没有运行时第三方依赖。

## 许可与用途

采用 [MIT 许可](./LICENSE)。本工具用于文化学习与自我反思，不构成医疗、法律或投资建议。
