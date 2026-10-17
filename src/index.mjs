// yishu-insight-mcp: dependency-free MCP server (JSON-RPC 2.0 over stdio).
// I Ching tools run locally and deterministically. Zi Wei tools proxy to the
// authoritative engine at insightapp.life and fail closed when it is unreachable.
import { readFileSync } from "node:fs";
import * as iching from "./iching.mjs";
import { Remote, RemoteError, ContractError, NotFoundError, ArgError, normalizeBaseUrl } from "./remote.mjs";
import { PROMPTS, getPrompt, METHODOLOGY, RESOURCES } from "./content.mjs";

const PKG = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
export const VERSION = PKG.version;
const DEFAULT_URL = "https://insightapp.life";
const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const E = { PARSE: -32700, INVALID_REQUEST: -32600, METHOD: -32601, PARAMS: -32602, INTERNAL: -32603 };

const rpcError = (id, code, message) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
const validId = (id) => id === undefined || id === null || typeof id === "string" || (typeof id === "number" && Number.isFinite(id));
const isStructured = (v) => v !== null && typeof v === "object";

const birthProps = {
  solar_date: { type: "string", description: "公历出生日期 YYYY-MM-DD (与 birth_time 配合；也可改用 lunar_* 字段)" },
  birth_time: { type: "string", description: "出生时刻 HH:MM，24 小时制" },
  gender: { type: "string", enum: ["male", "female"], description: "性别" },
  lunar_year: { type: "integer", description: "农历年 (使用农历输入时)" },
  lunar_month: { type: "integer", description: "农历月 1-12" },
  lunar_day: { type: "integer", description: "农历日 1-30" },
  hour: { type: "integer", description: "时辰序号 0=子 … 11=亥 (使用农历输入时)" },
  is_leap_month: { type: "boolean", description: "该农历月是否闰月" },
};

export const TOOLS = [
  {
    name: "iching_cast",
    description: "周易起卦 (本地确定性计算，离线可用)。支持三枚铜钱 coins、梅花易数时间起卦 time、指定六爻 lines。返回本卦、互卦、错卦、综卦、变卦、取辞规则、动爻爻辞、体用五行与决策指引。",
    inputSchema: {
      type: "object",
      properties: {
        method: { type: "string", enum: ["coins", "time", "lines"], description: "起卦方式，默认 coins" },
        lines: { type: "string", description: "method=lines 时的六爻数字，初爻到上爻，每位 6/7/8/9，如 \"788878\"" },
        changing: { type: "string", description: "把指定爻位设为变爻，如 \"3,5\" (初爻=1)；coins/lines 可用" },
        at: { type: "string", description: "method=time 时的起卦时间 \"YYYY-MM-DD HH:MM\"，默认服务器当前时间" },
        question: { type: "string", description: "所问之事，写入结果便于留档" },
      },
    },
  },
  {
    name: "iching_lookup",
    description: "查询周易六十四卦 (本地数据)。按卦序 number(1-64)、卦名 name(乾 / 乾为天)、或 upper+lower 上下经卦组合，返回卦辞、彖传、大象与六爻爻辞。",
    inputSchema: {
      type: "object",
      properties: {
        number: { type: "integer", minimum: 1, maximum: 64, description: "卦序 1-64" },
        name: { type: "string", description: "卦名，如 泰、地天泰" },
        upper: { type: "string", enum: ["乾", "兑", "离", "震", "巽", "坎", "艮", "坤"], description: "上卦" },
        lower: { type: "string", enum: ["乾", "兑", "离", "震", "巽", "坎", "艮", "坤"], description: "下卦" },
      },
    },
  },
  {
    name: "ziwei_chart",
    description: "紫微斗数排盘 (远端权威 Rust 引擎)：十二宫、命宫身宫、五行局、十四主星、23 种经典格局 patterns、四化飞星 feixing、大限流年。网络不可达时返回 isError，绝不伪造星盘。",
    inputSchema: {
      type: "object",
      properties: { ...birthProps, target_solar_year: { type: "integer", minimum: 1900, maximum: 2200, description: "目标公历年，用于流年四化" } },
      required: ["gender"],
    },
  },
  {
    name: "ziwei_heming",
    description: "紫微斗数双人合盘 (远端引擎)：合婚或事业合作的宫位互动、互照与交叉四化。",
    inputSchema: {
      type: "object",
      properties: {
        person_a: { type: "object", properties: birthProps, required: ["gender"], description: "甲方出生信息" },
        person_b: { type: "object", properties: birthProps, required: ["gender"], description: "乙方出生信息" },
        relation_type: { type: "string", description: "关系类型，默认 marriage" },
      },
      required: ["person_a", "person_b"],
    },
  },
  {
    name: "ziwei_life_kline",
    description: "紫微斗数人生 K 线 (远端引擎)：大限与流年四化打分序列，默认出生年起一百年。",
    inputSchema: {
      type: "object",
      properties: {
        ...birthProps,
        from_year: { type: "integer", minimum: 1900, maximum: 2200, description: "起始年，默认出生年" },
        to_year: { type: "integer", minimum: 1900, maximum: 2200, description: "结束年，默认起始年+99；跨度须小于 120 年" },
      },
      required: ["gender"],
    },
  },
  {
    name: "ziwei_kb_query",
    description: "检索紫微斗数古籍知识库 (《骨髓赋》《紫微斗数全书》及星曜入宫条文)。传 star+gong 查单星，传 stars[]+gong 查整宫。",
    inputSchema: {
      type: "object",
      properties: {
        star: { type: "string", description: "星名，如 紫微" },
        stars: { type: "array", items: { type: "string" }, description: "整宫星曜列表" },
        gong: { type: "string", description: "宫位，如 命宫" },
        branch: { type: "string", description: "地支，如 子" },
        max_len: { type: "integer", description: "每段文本最大长度" },
      },
      required: ["gong"],
    },
  },
  {
    name: "ziwei_famous",
    description: "名人命盘实例 (远端引擎)。不传参数列出名单，传 slug 取单个命盘，category 可筛选。",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "名人 slug" },
        category: { type: "string", description: "分类筛选" },
      },
    },
  },
];

const ok = (payload) => ({
  content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  structuredContent: payload,
});
const fail = (message) => ({ content: [{ type: "text", text: message }], isError: true });

export function createServer({ baseUrl = process.env.YISHU_INSIGHT_URL || DEFAULT_URL, fetchImpl, now } = {}) {
  const book = iching.Book.load();
  const remote = new Remote(baseUrl, fetchImpl);

  const handlers = {
    iching_cast(a) {
      const method = a.method ?? "coins";
      if (method === "coins") return iching.castCoins(book, a);
      if (method === "lines") {
        if (a.lines === undefined) throw new iching.InputError("method=lines 需要 lines 参数");
        return iching.castLines(book, a);
      }
      if (method === "time") return iching.castTime(book, { ...a, now });
      throw new iching.InputError(`未知 method: ${method} (coins | time | lines)`);
    },
    iching_lookup: (a) => iching.lookup(book, a),
    ziwei_chart: (a) => remote.chart(a),
    ziwei_heming: (a) => remote.heming(a),
    ziwei_life_kline: (a) => remote.lifeKline(a),
    ziwei_kb_query: (a) => remote.kbQuery(a),
    ziwei_famous: (a) => remote.famous(a),
  };

  async function callTool(name, args) {
    const fn = Object.hasOwn(handlers, name) ? handlers[name] : null;
    if (!fn) return { unknown: true };
    if (args !== undefined && (args === null || typeof args !== "object" || Array.isArray(args))) {
      return fail("arguments 必须是对象");
    }
    try {
      return ok(await fn(args ?? {}));
    } catch (e) {
      if (e instanceof iching.InputError || e instanceof ArgError || e instanceof RangeError) return fail(`参数错误: ${e.message}`);
      if (e instanceof NotFoundError) return fail(`未找到: ${e.message}`);
      if (e instanceof ContractError) return fail(`远端引擎响应异常 (${remote.base}): ${e.message}。未返回任何估算结果。`);
      if (e instanceof RemoteError) return fail(`远端引擎不可用 (${remote.base}): ${e.message}。未返回任何估算结果。`);
      return fail(`内部错误: ${e?.message || e}`);
    }
  }

  async function handleMessage(msg) {
    if (!msg || typeof msg !== "object" || Array.isArray(msg) || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
      return rpcError(validId(msg?.id) ? msg?.id : null, E.INVALID_REQUEST, "Invalid Request");
    }
    if (!validId(msg.id)) return rpcError(null, E.INVALID_REQUEST, "Invalid Request: id must be string, number or null");
    if (msg.params !== undefined && !isStructured(msg.params)) {
      return rpcError(msg.id, E.INVALID_REQUEST, "Invalid Request: params must be an object or array");
    }
    // JSON-RPC 2.0: only a message WITHOUT an "id" member is a notification.
    // An explicit "id": null is a request and gets a reply with id null.
    const isNotification = !Object.hasOwn(msg, "id");
    const reply = (result) => (isNotification ? null : { jsonrpc: "2.0", id: msg.id, result });
    const err = (code, m) => (isNotification ? null : rpcError(msg.id, code, m));
    const p = msg.params ?? {};
    switch (msg.method) {
      case "initialize": {
        const asked = p.protocolVersion;
        return reply({
          protocolVersion: SUPPORTED_PROTOCOLS.includes(asked) ? asked : SUPPORTED_PROTOCOLS[0],
          capabilities: { tools: { listChanged: false }, prompts: { listChanged: false }, resources: { listChanged: false, subscribe: false } },
          serverInfo: { name: "yishu-insight-mcp", title: "易数洞察 YISHU INSIGHT", version: VERSION },
          instructions: "周易工具 (iching_*) 本地确定性计算；紫微工具 (ziwei_*) 调用 insightapp.life 权威引擎，网络不可达时返回错误而非估算。",
        });
      }
      case "ping":
        return reply({});
      case "tools/list":
        return reply({ tools: TOOLS });
      case "tools/call": {
        if (typeof p.name !== "string") return err(E.PARAMS, "tools/call 需要 name");
        const r = await callTool(p.name, p.arguments);
        if (r.unknown) return err(E.PARAMS, `Unknown tool: ${p.name}`);
        return reply(r);
      }
      case "prompts/list":
        return reply({ prompts: PROMPTS });
      case "prompts/get":
        try {
          return reply(getPrompt(p.name, p.arguments));
        } catch (e) {
          return err(e.code ?? E.INTERNAL, e.message);
        }
      case "resources/list":
        return reply({ resources: RESOURCES });
      case "resources/templates/list":
        return reply({ resourceTemplates: [] });
      case "resources/read": {
        if (p.uri === "yishu://hexagrams/index") {
          const index = book.data.map((h) => ({ number: h.number, name: h.name, full_name: h.full_name, upper: h.upper, lower: h.lower }));
          return reply({ contents: [{ uri: p.uri, mimeType: "application/json", text: JSON.stringify(index, null, 2) }] });
        }
        if (p.uri === "yishu://guide/methodology") {
          return reply({ contents: [{ uri: p.uri, mimeType: "text/markdown", text: METHODOLOGY }] });
        }
        return err(-32002, `Resource not found: ${p.uri}`);
      }
      default:
        if (isNotification && msg.method.startsWith("notifications/")) return null;
        return err(E.METHOD, `Method not found: ${msg.method}`);
    }
  }

  return { handleMessage, remote };
}

// ---- stdio transport: newline-delimited JSON, plus Content-Length framing ----
export function runStdio(server, { input = process.stdin, output = process.stdout } = {}) {
  let buf = Buffer.alloc(0);
  const pending = new Set();
  let framedReply = false;

  const send = (obj, framed) => {
    const body = JSON.stringify(obj);
    output.write(framed ? `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}` : body + "\n");
  };

  async function dispatch(text, framed) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return send(rpcError(null, E.PARSE, "Parse error"), framed);
    }
    const batch = Array.isArray(parsed);
    if (batch && parsed.length === 0) return send(rpcError(null, E.INVALID_REQUEST, "Invalid Request"), framed);
    const out = (await Promise.all((batch ? parsed : [parsed]).map((m) => server.handleMessage(m)))).filter(Boolean);
    if (!out.length) return;
    send(batch ? out : out[0], framed);
  }

  function track(text, framed) {
    const p = dispatch(text, framed).catch((e) => {
      process.stderr.write(`yishu-insight-mcp: dispatch error: ${e?.stack || e}\n`);
    }).finally(() => pending.delete(p));
    pending.add(p);
  }

  function drain() {
    for (;;) {
      let start = 0;
      while (start < buf.length && (buf[start] === 0x0a || buf[start] === 0x0d || buf[start] === 0x20)) start++;
      buf = buf.subarray(start);
      if (!buf.length) return;
      if (buf.subarray(0, 14).toString("latin1").toLowerCase() === "content-length") {
        const sep = buf.indexOf("\r\n\r\n");
        const sepLf = buf.indexOf("\n\n");
        const hdrEnd = sep >= 0 ? sep : sepLf;
        if (hdrEnd < 0) return;
        const sepLen = sep >= 0 ? 4 : 2;
        const m = /content-length:\s*(\d+)/i.exec(buf.subarray(0, hdrEnd).toString("latin1"));
        if (!m) {
          send(rpcError(null, E.PARSE, "Bad Content-Length header"), true);
          buf = buf.subarray(hdrEnd + sepLen);
          continue;
        }
        const len = Number(m[1]);
        if (buf.length < hdrEnd + sepLen + len) return;
        const body = buf.subarray(hdrEnd + sepLen, hdrEnd + sepLen + len).toString("utf8");
        buf = buf.subarray(hdrEnd + sepLen + len);
        framedReply = true;
        track(body, true);
      } else {
        const nl = buf.indexOf(0x0a);
        if (nl < 0) return;
        const line = buf.subarray(0, nl).toString("utf8").trim();
        buf = buf.subarray(nl + 1);
        if (line) track(line, framedReply);
      }
    }
  }

  return new Promise((resolve) => {
    input.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      drain();
    });
    input.on("end", async () => {
      if (buf.length) {
        const tail = buf.toString("utf8").trim();
        buf = Buffer.alloc(0);
        if (tail) track(tail, framedReply);
      }
      while (pending.size) await Promise.allSettled([...pending]);
      resolve();
    });
  });
}

const HELP = `yishu-insight-mcp ${VERSION}
MCP server for 易数洞察 (https://insightapp.life) over stdio.

Usage: yishu-insight-mcp [options]

Options:
  --remote-url <url>  Zi Wei engine base URL
                      (default: $YISHU_INSIGHT_URL or ${DEFAULT_URL})
  --version, -v       Print version and exit
  --help, -h          Print this help and exit

Tools: iching_cast, iching_lookup (local, offline);
       ziwei_chart, ziwei_heming, ziwei_life_kline, ziwei_kb_query, ziwei_famous (remote engine).
Remote MCP (no install): ${DEFAULT_URL}/mcp
`;

export function parseArgs(argv) {
  const out = { remoteUrl: undefined, help: false, version: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--version" || a === "-v") out.version = true;
    else if (a === "--remote-url") {
      if (i + 1 >= argv.length) throw new ArgError("--remote-url requires a value");
      out.remoteUrl = argv[++i];
    } else if (a.startsWith("--remote-url=")) out.remoteUrl = a.slice("--remote-url=".length);
    else throw new ArgError(`unknown argument: ${a}`);
  }
  return out;
}

export async function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
    if (args.remoteUrl !== undefined) normalizeBaseUrl(args.remoteUrl);
    else normalizeBaseUrl(process.env.YISHU_INSIGHT_URL || DEFAULT_URL);
  } catch (e) {
    process.stderr.write(`yishu-insight-mcp: ${e.message}\n\n${HELP}`);
    process.exit(2);
  }
  if (args.help) return void process.stdout.write(HELP);
  if (args.version) return void process.stdout.write(`${VERSION}\n`);
  const server = createServer({ baseUrl: args.remoteUrl ?? (process.env.YISHU_INSIGHT_URL || DEFAULT_URL) });
  process.stderr.write(`yishu-insight-mcp ${VERSION} ready (stdio, engine ${server.remote.base})\n`);
  await runStdio(server);
}
