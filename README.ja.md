# 易数洞察 MCP サーバー

[![公式サイト](https://img.shields.io/badge/公式サイト-insightapp.life-gold)](https://insightapp.life)
[![MCP](https://img.shields.io/badge/MCP-2025--03--26-blue)](https://modelcontextprotocol.io)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-brightgreen)](https://nodejs.org)
[![依存パッケージなし](https://img.shields.io/badge/dependencies-0-success)](./package.json)
[![MIT ライセンス](https://img.shields.io/badge/license-MIT-yellow.svg)](./LICENSE)

[English](./README.md) | [简体中文](./README.zh-CN.md) | **日本語**

`yishu-insight-mcp` は、[易数洞察（Yishu Insight）](https://insightapp.life) の MCP サーバーです。易経と紫微斗数をコードで計算し、LLM に卦や命盤を推測させません。

- **易経（周易）**: 六十四卦、三枚のコインによる起卦、梅花易数の時間起卦、指定した六爻の計算に対応します。本卦・互卦・錯卦・綜卦・変卦、卦辞・爻辞、体用と判断の手がかりを返します。`iching_*` ツールはローカルで実行され、オフラインで利用できます。
- **紫微斗数**: 十二宮、十四主星、23種類の古典格局、四化飛星、二人の合盤、人生 K ライン、古典籍ナレッジベース、著名人の命盤を扱います。`ziwei_*` ツールは `insightapp.life` のエンジンに接続します。
- **失敗時の動作**: 紫微エンジンに接続できない場合は `isError` を返し、推定した命盤を返しません。実行時の依存パッケージはなく、Node.js 18 以上で動作します。

## 公式プラットフォーム

公式サイトで命盤、周易、資料、MCP 接続情報を確認できます。

| 内容 | URL |
|---|---|
| 公式トップ | <https://insightapp.life> |
| 紫微斗数・命盤 | <https://insightapp.life/ziwei/chart> |
| 100年人生 K ライン | <https://insightapp.life/ziwei/life-kline> |
| 紫微斗数・相性合盤 | <https://insightapp.life/ziwei/heming> |
| 四化飛星・流年運勢 | <https://insightapp.life/ziwei/feixing> |
| 著名人の命盤 | <https://insightapp.life/ziwei/famous> |
| 周易・占筮 | <https://insightapp.life/zhouyi/divine> |
| 周易・六十四卦完全事典 | <https://insightapp.life/zhouyi/lookup> |
| ブログ | <https://insightapp.life/blog> |
| スキル・プラグインのダウンロード | <https://insightapp.life/skill> |
| MCP エンドポイント | <https://insightapp.life/mcp> |
| MCP メタデータ | <https://insightapp.life/.well-known/mcp.json> |
| OpenAPI 3.1 仕様 | <https://insightapp.life/openapi.yaml> |

### 配布・カタログ

| 登録先 | URL |
|---|---|
| npm | <https://www.npmjs.com/package/yishu-insight-mcp> |
| Smithery | <https://smithery.ai/servers/lu-yuan-mails/yishu-insight> |
| Glama | <https://glama.ai/mcp/servers/xmond/yishu-insight-mcp> |

## 接続方法

### リモート Streamable HTTP（インストール不要）

エンドポイントは `https://insightapp.life/mcp` です。対応クライアントの MCP サーバー設定に次のエントリを追加します。

```json
{
  "mcpServers": {
    "yishu-insight": { "url": "https://insightapp.life/mcp" }
  }
}
```

Claude Desktop、Cursor、Windsurf、Cline など、リモート MCP URL を登録できるクライアントで利用できます。

#### リモート HTTP の呼び出し例

リモートエンドポイントの `tools/call` を JSON-RPC で呼び出す例です。`Accept` は JSON と `text/event-stream` の両方を指定します。

```bash
curl -N 'https://insightapp.life/mcp' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  --data-binary @- <<'JSON'
{
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
}
JSON
```

この直接接続例の `ziwei_chart` 引数は、リモート HTTP サーバーが公開する形式です。ローカル `npx` 版は `src/index.mjs` の stdio ラッパーを通じて、`solar_date` と `birth_time` または `lunar_*` フィールドを受け取ります。リモート HTTP のスキーマはローカル版と異なるため、接続先で `tools/list` を呼び出し、その応答を常に正しいスキーマとして扱ってください。

### ローカル stdio（npx）

Node.js 18 以上がある環境では、`npx` でパッケージを直接起動できます。

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

設定場所の例は次のとおりです。

| クライアント | 設定場所・コマンド |
|---|---|
| Claude Desktop | `claude_desktop_config.json` の `mcpServers` |
| Cursor | `~/.cursor/mcp.json` またはプロジェクト内の `.cursor/mcp.json` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |
| Cline | MCP Servers → Configure → `cline_mcp_settings.json` |
| Claude Code | `claude mcp add yishu-insight -- npx -y yishu-insight-mcp` |

ローカル版では `iching_*` ツールはネットワーク接続を必要としません。`ziwei_*` ツールは紫微エンジンを呼び出すため、エンジンへのネットワーク接続が必要です。

## CLI オプション

```text
Usage: yishu-insight-mcp [options]

--remote-url <url>  紫微エンジンのベース URL
                    （既定: 環境変数 YISHU_INSIGHT_URL、または https://insightapp.life）
--version, -v       バージョンを表示して終了
--help, -h          ヘルプを表示して終了
```

`--remote-url=<url>` の形式も使用できます。`--remote-url` を省略した場合は `YISHU_INSIGHT_URL`、それも未設定なら `https://insightapp.life` が使われます。

`--remote-url` と `YISHU_INSIGHT_URL` に指定するのは、`/api/ziwei/...` を持つ Web サイトのベース URL です。リモート MCP の `https://insightapp.life/mcp` を指定するものではありません。

## ツール

### ローカル stdio ラッパーのスキーマ

次の表は、`npx` で起動するローカル stdio ラッパー（`src/index.mjs`）のスキーマです。リモート HTTP のツール定義は別のスキーマを使うため、リモート接続では `tools/list` の応答を正としてください。

| ツール | 実行先 | パラメータ | 概要 |
|---|---|---|---|
| `iching_cast` | ローカル | `method`: `coins`、`time`、`lines`（既定 `coins`）。`lines` は初爻から上爻までの6個の `6/7/8/9`（6=老陰、7=少陽、8=少陰、9=老陽。例: `"788878"`）。`changing` は `coins`/`lines` で使う変爻の爻位（例: `"3,5"`）。`at` は `time` 用の `"YYYY-MM-DD HH:MM"`（省略時はサーバーの現在時刻）。`question` は質問文。 | 三枚のコイン、時間、指定六爻のいずれかで起卦します。 |
| `iching_lookup` | ローカル | `number`（1–64）、`name`（例: `泰`、`地天泰`）、または `upper` と `lower` の組み合わせ。番号指定（例: `{"number":11}`）を推奨します。上下卦を指定する場合は、API が定義する識別子 `乾`、`兑`、`离`、`震`、`巽`、`坎`、`艮`、`坤` を使用します。 | 六十四卦の本文と関連卦を検索します。 |
| `ziwei_chart` | リモート | `gender`（必須、`male` または `female`）。`solar_date` + `birth_time`、または `lunar_year`/`lunar_month`/`lunar_day`/`hour` の出生情報。任意で `is_leap_month`、`target_solar_year`。 | 紫微斗数の命盤を取得します。 |
| `ziwei_heming` | リモート | `person_a` と `person_b`（各オブジェクトに出生情報と `gender`）、任意の `relation_type`（既定 `marriage`）。 | 二人の合盤を取得します。 |
| `ziwei_life_kline` | リモート | 出生情報と `gender`。任意で `from_year`、`to_year`（既定は `from_year` から `+99`）。 | 大限・流年の人生 K ラインを取得します。 |
| `ziwei_kb_query` | リモート | `gong`（必須）。単一星の `star` または整宮用の1つ以上の `stars[]`。任意で `branch`、`max_len`。 | 紫微斗数の古典籍・星曜ナレッジベースを検索します。 |
| `ziwei_famous` | リモート | 引数なしで一覧、`slug` で個別命盤、`category` で分類を指定します。 | 著名人の命盤を取得します。 |

出生情報の補足:

- `solar_date` は `YYYY-MM-DD`、`birth_time` は24時間制の `HH:MM` です。太陽暦入力では両方を指定します。`solar_date` のローカル変換範囲は1900-01-31から2100-12-31です。
- 農暦入力では `lunar_year`（1900–2100）、`lunar_month`（1–12）、`lunar_day`（1–30）、`hour`（時辰番号 `0=子` ～ `11=亥`）を指定します。`gender` も必須です。
- `is_leap_month` は真偽値です。`target_solar_year` は1900–2200の整数です。
- `ziwei_life_kline` の `from_year` は出生時の農暦年（省略時）、`to_year` は `from_year+99`（省略時）です。年は1900–2200の範囲で、`to_year` は `from_year` 以上、期間は120年未満で指定します。
- `ziwei_kb_query` では `star` と `stars` のどちらかを指定します。`stars[]` を使う場合は整宮の星曜を1つ以上入れ、`max_len` は1–100000の整数です。
- `ziwei_famous.slug` に使用できる文字は英字、数字、アンダースコア、ハイフンです。

ローカル stdio サーバーの `tools/call` では、次のように出生情報を渡します。

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

オフラインで卦を番号検索する例です。

```json
{ "name": "iching_lookup", "arguments": { "number": 11 } }
```

## 出力

成功した MCP ツール呼び出しは、整形済み JSON を `content[0].text` に、同じペイロードを `structuredContent` に返します。入力エラー、未検出、リモートエラー、契約に合わない応答は `isError: true` になります。

`iching_cast` の主な出力フィールドは次のとおりです。

`method`、`meta`、`values`、`moving_lines`、`ben`（本卦）、`hu`（互卦）、`cuo`（錯卦）、`zong`（綜卦）、`bian`（変卦）、`moving_line_texts`、`rule`、`ti_yong`、`decision_guidance`、`sources`。変爻がない場合、`bian` と `ti_yong` は `null` です。卦オブジェクトには `number`、`name`、`full_name`、`upper`、`lower`、`symbol`、`judgment`、`daxiang`、`meaning`、`url` が含まれます。

`iching_lookup` は卦の基本情報に加え、`upper_nature`、`lower_nature`、`judgment_plain`、`judgment_core`、`tuan`、`daxiang`、`meaning`、六爻の `lines`、`extra_line`、関連する `hu`/`cuo`/`zong` を `relations` として返します。

紫微系のローカルラッパー出力は共通して `{ source, request, result }` の形です。`result` の内容は次のとおりです。

- `ziwei_chart`: 命盤の `chart` 配列、`ming_gong_idx`、命宮・身宮、五行局、主星、`patterns`、`feixing`、大限・流年など。
- `ziwei_heming`: `chart_a`、`chart_b`、`interactions`。
- `ziwei_life_kline`: 年ごとの値を持つ `bars` 配列。
- `ziwei_kb_query`: 単一星の検索ではオブジェクト、`stars[]` による整宮検索では配列。
- `ziwei_famous`: 一覧では配列、`slug` 指定では個別命盤オブジェクト。

リモートエンジンが利用できない場合、紫微系ツールはエラーを返して結果を推測しません。

## プロンプトとリソース

MCP の `prompts/list` では次のプロンプトを公開しています。

- `iching_divination_prompt`: 必須 `question`、任意 `method`（`coins`、`time`、`lines`。既定 `coins`）。`iching_cast` を呼び出してから解釈する手順を作成します。
- `ziwei_chart_reading_prompt`: 必須 `solar_date`、`birth_time`、`gender`、任意 `focus`。`ziwei_chart` と必要に応じて `ziwei_kb_query` を使って命盤を読む手順を作成します。

`resources/list` では次のリソースを公開しています。

- `yishu://hexagrams/index`: 六十四卦の番号、卦名、上下卦を含む JSON インデックス。
- `yishu://guide/methodology`: 起卦、関連卦、紫微斗数の計算方針を説明する Markdown。

## 開発とテスト

```bash
npm test
npm pack --dry-run
docker build -t yishu-insight-mcp .
```

`npm test` は `node --test test/mcp.test.mjs` を実行し、実際の stdio サーバーを起動して JSON-RPC、7ツール、プロンプト、リソース、リモートエラー処理を検証します。

## ライセンスと利用上の注意

本プロジェクトは MIT ライセンスです。卦や命盤の出力は文化的な学習・研究と自己内省のための参考情報です。医療・法律・金融に関する助言や判断の代替ではありません。
