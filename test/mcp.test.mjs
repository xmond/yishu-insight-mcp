import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(ROOT, "bin", "yishu-insight-mcp.mjs");

const clients = new Set();
after(() => { for (const c of clients) c.kill(); });

/** Spawn the real binary; talk JSON-RPC over its stdio. */
function startClient(args = [], env = {}, { framed = false } = {}) {
  const child = spawn(process.execPath, [BIN, ...args], { env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "pipe"] });
  let buf = "";
  const waiters = new Map();
  const seen = new Map();
  const take = (msg) => {
    if (waiters.has(msg.id)) { waiters.get(msg.id)(msg); waiters.delete(msg.id); } else seen.set(msg.id, msg);
  };
  child.stdout.on("data", (d) => {
    buf += d.toString("utf8");
    for (;;) {
      if (/^\s*Content-Length/i.test(buf)) {
        const m = /Content-Length:\s*(\d+)\r\n\r\n/i.exec(buf);
        if (!m) return;
        const start = m.index + m[0].length;
        const body = Buffer.from(buf.slice(start)).subarray(0, Number(m[1]));
        if (body.length < Number(m[1])) return;
        buf = Buffer.from(buf.slice(start)).subarray(Number(m[1])).toString("utf8");
        take(JSON.parse(body.toString("utf8")));
      } else {
        const nl = buf.indexOf("\n");
        if (nl < 0) return;
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line) take(JSON.parse(line));
      }
    }
  });
  let nextId = 1;
  const write = (obj) => {
    const body = JSON.stringify(obj);
    child.stdin.write(framed ? `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}` : body + "\n");
  };
  const request = (method, params) => new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), 15000);
    const done = (m) => { clearTimeout(timer); resolve(m); };
    if (seen.has(id)) done(seen.get(id)); else waiters.set(id, done);
    write({ jsonrpc: "2.0", id, method, params });
  });
  const call = async (name, args) => (await request("tools/call", { name, arguments: args })).result;
  const payload = (r) => JSON.parse(r.content[0].text);
  const close = () => new Promise((resolve) => { child.once("exit", resolve); child.stdin.end(); });
  clients.add(child);
  return { child, write, request, call, payload, close };
}

let mock;
let mockUrl;
const hits = [];
let inject = null; // raw 200 body served for every API path while set
before(async () => {
  mock = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      hits.push({ method: req.method, url: req.url, body: body ? JSON.parse(body) : null });
      const send = (code, obj, raw) => { res.writeHead(code, { "content-type": "application/json" }); res.end(raw ?? JSON.stringify(obj)); };
      if (inject !== null) return send(200, null, inject);
      // Shapes mirror the Rust serde structs: ChartResult, HemingResult, LifeKlineResult.
      if (req.url === "/api/ziwei/chart") return send(200, { chart: [{ gong: "命宫" }], ming_gong_idx: 0, marker: "chart-ok", patterns: [] });
      if (req.url === "/api/ziwei/heming" && JSON.parse(body).relation_type === "rivals") {
        // The backend's serde try_from rejects bad arguments with 422 + a plain-text reason.
        return send(422, null, "Failed to deserialize the JSON body into the target type: `relation_type` must be marriage, business or family");
      }
      if (req.url === "/api/ziwei/heming") return send(200, { chart_a: { chart: [{ gong: "命宫" }] }, chart_b: { chart: [{ gong: "命宫" }] }, interactions: { mutual_gaze: [] }, relation_type: "marriage" });
      if (req.url === "/api/ziwei/life-kline") return send(200, { bars: [{ year: 2000 }], from_year: 2000, to_year: 2030 });
      if (req.url === "/api/ziwei/kb/query") {
        return send(200, body.includes("不存在") ? null : { star: "紫微", overview: "帝星" });
      }
      if (req.url === "/api/ziwei/kb/palace") return send(200, [{ star: "紫微" }, { star: "天府" }]);
      if (req.url === "/api/ziwei/famous") return send(200, [{ slug: "einstein" }]);
      if (req.url === "/api/ziwei/famous/einstein") return send(200, { slug: "einstein" });
      if (req.url === "/api/ziwei/famous/noslug") return send(200, { names: {} });
      if (req.url === "/api/ziwei/famous/missing") return send(404, null, "not found");
      if (req.url === "/api/ziwei/famous/garbage") return send(200, null, "<html>oops</html>");
      return send(404, null, "nope");
    });
  });
  await new Promise((r) => mock.listen(0, "127.0.0.1", r));
  mockUrl = `http://127.0.0.1:${mock.address().port}`;
});
after(() => new Promise((r) => mock.close(r)));

test("CLI --version exits 0 and matches package.json", () => {
  const out = execFileSync(process.execPath, [BIN, "--version"], { encoding: "utf8" });
  assert.equal(out.trim(), JSON.parse(execFileSync("cat", [path.join(ROOT, "package.json")])).version);
});

test("package.json has zero runtime dependencies and the required identity", () => {
  const pkg = JSON.parse(execFileSync("cat", [path.join(ROOT, "package.json")], { encoding: "utf8" }));
  assert.deepEqual(pkg.dependencies, {});
  assert.equal(pkg.name, "yishu-insight-mcp");
  assert.equal(pkg.mcpName, "io.github.xmond/yishu-insight");
  assert.equal(pkg.type, "module");
  assert.equal(pkg.bin["yishu-insight-mcp"], "./bin/yishu-insight-mcp.mjs");
});

test("CLI rejects unknown arguments and bad --remote-url with exit 2", () => {
  for (const args of [["--bogus"], ["--remote-url", "ftp://x"], ["--remote-url"]]) {
    assert.throws(() => execFileSync(process.execPath, [BIN, ...args], { stdio: "pipe" }), (e) => e.status === 2);
  }
});

test("initialize echoes the client's protocolVersion; initialized notification gets no reply; ping works", async () => {
  for (const v of ["2025-03-26", "2024-11-05"]) {
    const c = startClient();
    const r = await c.request("initialize", { protocolVersion: v, capabilities: {}, clientInfo: { name: "t", version: "0" } });
    assert.equal(r.result.protocolVersion, v);
    assert.equal(r.result.serverInfo.name, "yishu-insight-mcp");
    c.write({ jsonrpc: "2.0", method: "notifications/initialized" });
    const p = await c.request("ping");
    assert.deepEqual(p.result, {});
    assert.equal(p.id, 2, "the notification must not have consumed an id or produced a reply");
    await c.close();
  }
});

test("tools/list exposes the 7 tools, prompts/list and resources/list work", async () => {
  const c = startClient();
  const tools = (await c.request("tools/list")).result.tools.map((t) => t.name);
  assert.deepEqual(tools.sort(), ["iching_cast", "iching_lookup", "ziwei_chart", "ziwei_famous", "ziwei_heming", "ziwei_kb_query", "ziwei_life_kline"]);
  const prompts = (await c.request("prompts/list")).result.prompts.map((p) => p.name);
  assert.deepEqual(prompts.sort(), ["iching_divination_prompt", "ziwei_chart_reading_prompt"]);
  const got = await c.request("prompts/get", { name: "iching_divination_prompt", arguments: { question: "要不要换工作" } });
  assert.match(got.result.messages[0].content.text, /要不要换工作/);
  const missing = await c.request("prompts/get", { name: "iching_divination_prompt", arguments: {} });
  assert.equal(missing.error.code, -32602);
  const res = (await c.request("resources/list")).result.resources.map((r) => r.uri);
  assert.deepEqual(res.sort(), ["yishu://guide/methodology", "yishu://hexagrams/index"]);
  const idx = JSON.parse((await c.request("resources/read", { uri: "yishu://hexagrams/index" })).result.contents[0].text);
  assert.equal(idx.length, 64);
  const guide = (await c.request("resources/read", { uri: "yishu://guide/methodology" })).result.contents[0].text;
  assert.match(guide, /互卦/);
  assert.equal((await c.request("resources/read", { uri: "yishu://nope" })).error.code, -32002);
  await c.close();
});

test("protocol errors: unknown method, unknown tool, malformed JSON, Content-Length framing", async () => {
  const c = startClient();
  assert.equal((await c.request("no/such")).error.code, -32601);
  assert.equal((await c.request("tools/call", { name: "nope", arguments: {} })).error.code, -32602);
  await c.close();
  const f = startClient([], {}, { framed: true });
  const r = await f.request("tools/call", { name: "iching_lookup", arguments: { number: 1 } });
  assert.equal(f.payload(r.result).full_name, "乾为天");
  await f.close();
});

test("iching_cast lines: 水雷屯 with exact 互/错/综 and no 变卦", async () => {
  const c = startClient();
  const r = await c.call("iching_cast", { method: "lines", lines: "788878", question: "测试" });
  const d = c.payload(r);
  assert.equal(d.ben.full_name, "水雷屯");
  assert.equal(d.hu.full_name, "山地剥");
  assert.equal(d.cuo.full_name, "火风鼎");
  assert.equal(d.zong.full_name, "山水蒙");
  assert.equal(d.bian, null);
  assert.equal(d.rule.label, "六爻皆不变");
  assert.equal(d.ti_yong, null);
  await c.close();
});

test("iching_cast lines: 火水未济 and 乾为天 (static) and all-moving 乾→坤 with 用九", async () => {
  const c = startClient();
  const w = c.payload(await c.call("iching_cast", { method: "lines", lines: "878787" }));
  assert.equal(w.ben.full_name, "火水未济");
  assert.equal(w.cuo.full_name, "水火既济");
  assert.equal(w.zong.full_name, "水火既济");
  const q = c.payload(await c.call("iching_cast", { method: "lines", lines: "777777" }));
  assert.equal(q.ben.full_name, "乾为天");
  assert.equal(q.cuo.full_name, "坤为地");
  assert.equal(q.hu.full_name, "乾为天");
  assert.equal(q.bian, null);
  const all = c.payload(await c.call("iching_cast", { method: "lines", lines: "999999" }));
  assert.equal(all.ben.full_name, "乾为天");
  assert.equal(all.bian.full_name, "坤为地");
  assert.equal(all.rule.label, "六爻全变");
  assert.equal(all.rule.picks[0].title, "用九");
  assert.equal(all.rule.picks[0].text, "见群龙无首，吉");
  await c.close();
});

test("iching_cast lines: moving line gives 变卦, 动爻爻辞 and 体用五行", async () => {
  const c = startClient();
  // 屯 with the 初 line moving (7 -> 9): 水雷屯 -> 水地比 (震 becomes 坤).
  const d = c.payload(await c.call("iching_cast", { method: "lines", lines: "988878" }));
  assert.equal(d.ben.full_name, "水雷屯");
  assert.deepEqual(d.moving_lines, [1]);
  assert.equal(d.bian.full_name, "水地比");
  assert.equal(d.moving_line_texts[0].label, "初九");
  assert.equal(d.rule.label, "一爻变");
  // Moving line is in the lower trigram 震(木): upper 坎(水) is 体, lower 震 is 用. 水生木 = 体生用.
  assert.deepEqual([d.ti_yong.ti.trigram, d.ti_yong.yong.trigram, d.ti_yong.relation], ["坎", "震", "体生用"]);
  await c.close();
});

test("iching_cast time (梅花): 2024-03-15 10:30 -> 风火家人 → 风山渐", async () => {
  const c = startClient();
  const d = c.payload(await c.call("iching_cast", { method: "time", at: "2024-03-15 10:30" }));
  assert.equal(d.ben.full_name, "风火家人");
  assert.deepEqual(d.moving_lines, [1]);
  assert.equal(d.bian.full_name, "风山渐");
  assert.equal(d.hu.full_name, "火水未济");
  assert.equal(d.cuo.full_name, "雷水解");
  assert.equal(d.zong.full_name, "火泽睽");
  assert.match(d.meta["农历"], /甲辰年2月6日 巳时/);
  assert.ok(d.ti_yong, "meihua reading carries 体用");
  await c.close();
});

test("iching_cast coins: structural invariants hold over many casts, changing is honored", async () => {
  const c = startClient();
  for (let i = 0; i < 25; i++) {
    const d = c.payload(await c.call("iching_cast", { method: "coins", changing: i % 2 ? "2,5" : undefined }));
    assert.equal(d.values.length, 6);
    assert.ok(d.values.every((v) => [6, 7, 8, 9].includes(v)));
    const moving = d.values.flatMap((v, k) => (v === 6 || v === 9 ? [k + 1] : []));
    assert.deepEqual(d.moving_lines, moving);
    // Cross-check derivations against the bit rule through lookup.
    const look = c.payload(await c.call("iching_lookup", { number: d.ben.number }));
    assert.equal(look.relations.cuo, d.cuo.full_name);
    assert.equal(look.relations.zong, d.zong.full_name);
    assert.equal(look.relations.hu, d.hu.full_name);
    assert.equal(d.bian === null, moving.length === 0);
    if (i % 2) assert.ok(moving.includes(2) && moving.includes(5));
  }
  await c.close();
});

test("iching_cast rejects bad input as isError, not a crash", async () => {
  const c = startClient();
  for (const args of [{ method: "lines" }, { method: "lines", lines: "78887" }, { method: "lines", lines: "788870" }, { method: "time", at: "yesterday" }, { method: "magic" }, { method: "lines", lines: "788878", changing: "9" }, { method: "time", at: "1850-01-01 00:00" }]) {
    const r = await c.call("iching_cast", args);
    assert.equal(r.isError, true, JSON.stringify(args));
  }
  await c.close();
});

test("iching_lookup by number 1, 11, 64, by name 泰, by trigrams 坤+乾", async () => {
  const c = startClient();
  const one = c.payload(await c.call("iching_lookup", { number: 1 }));
  assert.equal(one.full_name, "乾为天");
  assert.equal(one.lines.length, 6);
  assert.equal(one.extra_line.label, "用九");
  const eleven = c.payload(await c.call("iching_lookup", { number: 11 }));
  assert.equal(eleven.full_name, "地天泰");
  assert.equal(eleven.judgment, "小往大来，吉，亨。");
  assert.equal(eleven.lines[0].label, "初九");
  const last = c.payload(await c.call("iching_lookup", { number: 64 }));
  assert.equal(last.full_name, "火水未济");
  assert.equal(last.upper, "离");
  assert.equal(last.lower, "坎");
  const tai = c.payload(await c.call("iching_lookup", { name: "泰" }));
  assert.equal(tai.number, 11);
  const long = c.payload(await c.call("iching_lookup", { name: "地天泰" }));
  assert.equal(long.number, 11);
  const kq = c.payload(await c.call("iching_lookup", { upper: "坤", lower: "乾" }));
  assert.equal(kq.number, 11);
  const qk = c.payload(await c.call("iching_lookup", { upper: "乾", lower: "坤" }));
  assert.equal(qk.full_name, "天地否");
  for (const bad of [{}, { number: 65 }, { name: "不存在" }, { upper: "乾" }, { upper: "x", lower: "y" }]) {
    assert.equal((await c.call("iching_lookup", bad)).isError, true, JSON.stringify(bad));
  }
  await c.close();
});

test("all 64 hexagrams: lookup by trigram pair round-trips to the same number", async () => {
  const c = startClient();
  for (let n = 1; n <= 64; n++) {
    const h = c.payload(await c.call("iching_lookup", { number: n }));
    const back = c.payload(await c.call("iching_lookup", { upper: h.upper, lower: h.lower }));
    assert.equal(back.number, n);
  }
  await c.close();
});

test("ziwei_chart hits the remote /api/ziwei/chart with converted lunar data", async () => {
  hits.length = 0;
  const c = startClient(["--remote-url", mockUrl]);
  const r = await c.call("ziwei_chart", { solar_date: "2024-02-10", birth_time: "09:00", gender: "male" });
  assert.notEqual(r.isError, true);
  assert.equal(c.payload(r).result.marker, "chart-ok");
  const h = hits.at(-1);
  assert.equal(h.method, "POST");
  assert.equal(h.url, "/api/ziwei/chart");
  assert.deepEqual(h.body, { lunar_year: 2024, lunar_month: 1, lunar_day: 1, hour: 5, gender: "male", year_gan_idx: 0, year_zhi_idx: 4 });
  // leap month + late zi (23:30 charts as zi=0) + target year
  await c.call("ziwei_chart", { solar_date: "2023-03-22", birth_time: "23:30", gender: "female", target_solar_year: 2026 });
  assert.deepEqual(hits.at(-1).body, { lunar_year: 2023, lunar_month: 2, lunar_day: 1, hour: 0, gender: "female", year_gan_idx: 9, year_zhi_idx: 3, is_leap_month: true, target_solar_year: 2026 });
  // lunar input path
  await c.call("ziwei_chart", { lunar_year: 1990, lunar_month: 5, lunar_day: 23, hour: 4, gender: "female" });
  assert.deepEqual(hits.at(-1).body, { lunar_year: 1990, lunar_month: 5, lunar_day: 23, hour: 4, gender: "female", year_gan_idx: 6, year_zhi_idx: 6 });
  await c.close();
});

test("ziwei_chart validates input before any network call", async () => {
  hits.length = 0;
  const c = startClient(["--remote-url", mockUrl]);
  for (const args of [{ gender: "male" }, { solar_date: "2024-02-10", gender: "male" }, { solar_date: "2024-13-40", birth_time: "09:00", gender: "male" }, { solar_date: "1800-01-01", birth_time: "09:00", gender: "male" }, { solar_date: "2024-02-10", birth_time: "09:00", gender: "x" }]) {
    const r = await c.call("ziwei_chart", args);
    assert.equal(r.isError, true, JSON.stringify(args));
  }
  assert.equal(hits.length, 0);
  await c.close();
});

test("ziwei_heming, ziwei_life_kline, ziwei_kb_query, ziwei_famous make the real HTTP calls", async () => {
  hits.length = 0;
  const c = startClient([], { YISHU_INSIGHT_URL: mockUrl }); // env path, no flag
  const a = { solar_date: "2024-02-10", birth_time: "09:00", gender: "male" };
  const b = { lunar_year: 1990, lunar_month: 5, lunar_day: 23, hour: 4, gender: "female" };
  const hm = await c.call("ziwei_heming", { person_a: a, person_b: b, relation_type: "career" });
  assert.notEqual(hm.isError, true);
  assert.equal(hits.at(-1).url, "/api/ziwei/heming");
  assert.equal(hits.at(-1).body.relation_type, "career");
  assert.equal(hits.at(-1).body.person_b.lunar_year, 1990);
  assert.equal((await c.call("ziwei_heming", { person_a: a })).isError, true);

  const kl = await c.call("ziwei_life_kline", { ...b, from_year: 2000, to_year: 2030 });
  assert.notEqual(kl.isError, true);
  assert.equal(hits.at(-1).url, "/api/ziwei/life-kline");
  assert.equal(hits.at(-1).body.from_year, 2000);
  assert.equal(hits.at(-1).body.to_year, 2030);

  const one = c.payload(await c.call("ziwei_kb_query", { star: "紫微", gong: "命宫", max_len: 200 }));
  assert.equal(hits.at(-1).url, "/api/ziwei/kb/query");
  assert.deepEqual(hits.at(-1).body, { star: "紫微", gong: "命宫", max_len: 200 });
  assert.equal(one.result.overview, "帝星");
  const pal = c.payload(await c.call("ziwei_kb_query", { stars: ["紫微", "天府"], gong: "命宫" }));
  assert.equal(hits.at(-1).url, "/api/ziwei/kb/palace");
  assert.equal(pal.result.length, 2);
  const none = await c.call("ziwei_kb_query", { star: "不存在", gong: "命宫" });
  assert.equal(none.isError, true, "a null KB answer must be an error, not an empty success");
  assert.match(none.content[0].text, /未找到/);
  assert.doesNotMatch(none.content[0].text, /远端引擎不可用/, "a KB miss is not an outage");
  assert.equal((await c.call("ziwei_kb_query", { gong: "命宫" })).isError, true);

  const list = c.payload(await c.call("ziwei_famous", {}));
  assert.equal(hits.at(-1).method, "GET");
  assert.equal(hits.at(-1).url, "/api/ziwei/famous");
  assert.equal(list.result[0].slug, "einstein");
  await c.call("ziwei_famous", { category: "scientist" });
  assert.equal(hits.at(-1).url, "/api/ziwei/famous?category=scientist");
  const e = c.payload(await c.call("ziwei_famous", { slug: "einstein" }));
  assert.equal(hits.at(-1).url, "/api/ziwei/famous/einstein");
  assert.equal(e.result.slug, "einstein");
  assert.equal((await c.call("ziwei_famous", { slug: "../etc" })).isError, true);
  await c.close();
});

test("fail-closed: HTTP 404, non-JSON body, and unreachable host all give isError with no chart", async () => {
  const c = startClient(["--remote-url", mockUrl]);
  const nf = await c.call("ziwei_famous", { slug: "missing" });
  assert.equal(nf.isError, true);
  assert.match(nf.content[0].text, /HTTP 404/);
  const junk = await c.call("ziwei_famous", { slug: "garbage" });
  assert.equal(junk.isError, true);
  assert.match(junk.content[0].text, /非 JSON/);
  await c.close();

  // Reserve a port, release it, then point at it: connection refused.
  const probe = createServer();
  await new Promise((r) => probe.listen(0, "127.0.0.1", r));
  const deadPort = probe.address().port;
  await new Promise((r) => probe.close(r));
  const dead = startClient(["--remote-url", `http://127.0.0.1:${deadPort}`]);
  const r = await dead.call("ziwei_chart", { solar_date: "2024-02-10", birth_time: "09:00", gender: "male" });
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /远端引擎不可用/);
  assert.match(r.content[0].text, /未返回任何估算结果/);
  assert.equal(r.structuredContent, undefined);
  // iching tools still work with the engine down.
  assert.notEqual((await dead.call("iching_lookup", { number: 1 })).isError, true);
  await dead.close();
});

const GOOD_BIRTH = { solar_date: "2024-02-10", birth_time: "09:00", gender: "male" };
const REMOTE_CALLS = [
  ["ziwei_chart", GOOD_BIRTH],
  ["ziwei_heming", { person_a: GOOD_BIRTH, person_b: GOOD_BIRTH }],
  ["ziwei_life_kline", GOOD_BIRTH],
  ["ziwei_kb_query", { star: "紫微", gong: "命宫" }],
  ["ziwei_kb_query", { stars: ["紫微"], gong: "命宫" }],
  ["ziwei_famous", {}],
  ["ziwei_famous", { slug: "einstein" }],
];

test("fail-closed: remote null, {}, {error}, scalars and contract-breaking bodies are isError on every endpoint", async () => {
  const c = startClient(["--remote-url", mockUrl]);
  try {
    for (const raw of ["null", "{}", '{"error":"engine failed"}', '"ok"', "42", "true"]) {
      inject = raw;
      for (const [tool, args] of REMOTE_CALLS) {
        const r = await c.call(tool, args);
        // kb/query turns a bare null into a (still isError) not-found; list/palace endpoints accept [] but never null.
        assert.equal(r.isError, true, `${tool} ${JSON.stringify(args)} must reject remote body ${raw}`);
        assert.equal(r.structuredContent, undefined, `${tool} must not return a result for ${raw}`);
      }
    }
    // Well-formed JSON of the wrong shape.
    inject = JSON.stringify({ ming_gong: "子", palaces: [] });
    assert.equal((await c.call("ziwei_chart", GOOD_BIRTH)).isError, true, "chart without non-empty chart[] / ming_gong_idx");
    inject = JSON.stringify({ chart: [], ming_gong_idx: 0 });
    assert.equal((await c.call("ziwei_chart", GOOD_BIRTH)).isError, true, "empty chart[]");
    inject = JSON.stringify({ interactions: {} });
    assert.equal((await c.call("ziwei_heming", { person_a: GOOD_BIRTH, person_b: GOOD_BIRTH })).isError, true);
    inject = JSON.stringify({ bars: [] });
    assert.equal((await c.call("ziwei_life_kline", GOOD_BIRTH)).isError, true);
    inject = JSON.stringify({ not: "a list" });
    assert.equal((await c.call("ziwei_famous", {})).isError, true, "famous list must be an array");
    assert.equal((await c.call("ziwei_kb_query", { stars: ["紫微"], gong: "命宫" })).isError, true, "palace must be an array");
    inject = JSON.stringify({ names: {} });
    assert.equal((await c.call("ziwei_famous", { slug: "noslug" })).isError, true, "famous detail without slug");
    // Arrays whose elements are null or not objects break the contract too.
    for (const [raw, tool, args] of [
      ['{"chart":[null],"ming_gong_idx":0}', "ziwei_chart", GOOD_BIRTH],
      ['{"chart":[{"gong":"命宫"},null],"ming_gong_idx":0}', "ziwei_chart", GOOD_BIRTH],
      ['{"bars":[null]}', "ziwei_life_kline", GOOD_BIRTH],
      ['{"bars":[1]}', "ziwei_life_kline", GOOD_BIRTH],
      ['{"chart_a":{"chart":[null]},"chart_b":{"chart":[{}]},"interactions":{}}', "ziwei_heming", { person_a: GOOD_BIRTH, person_b: GOOD_BIRTH }],
      ['{"chart_a":{"chart":[]},"chart_b":{"chart":[{}]},"interactions":{}}', "ziwei_heming", { person_a: GOOD_BIRTH, person_b: GOOD_BIRTH }],
      ["[null]", "ziwei_famous", {}],
      ["[null]", "ziwei_kb_query", { stars: ["紫微"], gong: "命宫" }],
    ]) {
      inject = raw;
      const r = await c.call(tool, args);
      assert.equal(r.isError, true, `${tool} must reject ${raw}`);
      assert.match(r.content[0].text, /响应异常/, `${tool} ${raw}`);
    }
    // Empty lists are a valid answer (no famous entries / no KB hits), not a contract break.
    inject = "[]";
    assert.notEqual((await c.call("ziwei_famous", {})).isError, true, "[] famous list is valid");
    inject = JSON.stringify({ ming_gong: "子" });
    const err = await c.call("ziwei_chart", GOOD_BIRTH);
    assert.match(err.content[0].text, /响应异常/);
    assert.doesNotMatch(err.content[0].text, /不可用/, "a contract break is distinct from an outage");
    inject = null;
    assert.notEqual((await c.call("ziwei_chart", GOOD_BIRTH)).isError, true, "the happy path still passes");
  } finally {
    inject = null;
    await c.close();
  }
});

test("strict booleans: is_leap_month \"false\" / 0 / \"true\" / null are rejected before any network call", async () => {
  hits.length = 0;
  const c = startClient(["--remote-url", mockUrl]);
  const lunar = { lunar_year: 1990, lunar_month: 5, lunar_day: 23, hour: 4, gender: "female" };
  for (const bad of ["false", "true", 0, 1, "", {}, [], null]) {
    for (const [tool, args] of [
      ["ziwei_chart", { ...lunar, is_leap_month: bad }],
      ["ziwei_life_kline", { ...lunar, is_leap_month: bad }],
      ["ziwei_chart", { ...GOOD_BIRTH, is_leap_month: bad }],
      ["ziwei_heming", { person_a: { ...lunar, is_leap_month: bad }, person_b: lunar }],
    ]) {
      const r = await c.call(tool, args);
      assert.equal(r.isError, true, `${tool} is_leap_month=${JSON.stringify(bad)}`);
      assert.match(r.content[0].text, /is_leap_month 必须是布尔值/);
    }
  }
  assert.equal(hits.length, 0, "no request may reach the engine");
  await c.call("ziwei_chart", { ...lunar, is_leap_month: false });
  assert.equal("is_leap_month" in hits.at(-1).body, false, "false must not be sent as true");
  await c.call("ziwei_chart", { ...lunar, is_leap_month: true });
  assert.equal(hits.at(-1).body.is_leap_month, true);
  await c.close();
});

test("JSON-RPC: an explicit \"id\": null is a request and gets a reply; only a missing id is a notification", async () => {
  const c = startClient();
  const lines = [];
  c.child.stdout.on("data", (d) => lines.push(...d.toString("utf8").split("\n").filter(Boolean)));
  const settle = () => new Promise((r) => setTimeout(r, 250));
  c.child.stdin.write('{"jsonrpc":"2.0","id":null,"method":"ping"}\n');
  await settle();
  assert.deepEqual(lines.map((l) => JSON.parse(l)), [{ jsonrpc: "2.0", id: null, result: {} }]);
  lines.length = 0;
  c.child.stdin.write('{"jsonrpc":"2.0","id":null,"method":"no/such"}\n');
  await settle();
  const e = lines.map((l) => JSON.parse(l));
  assert.equal(e.length, 1, JSON.stringify(e));
  assert.equal(e[0].id, null);
  assert.equal(e[0].error.code, -32601);
  lines.length = 0;
  // A notifications/* method sent WITH an id is a request: it must not be swallowed.
  c.child.stdin.write('{"jsonrpc":"2.0","id":5,"method":"notifications/initialized"}\n');
  c.child.stdin.write('{"jsonrpc":"2.0","method":"ping"}\n');
  await settle();
  const n = lines.map((l) => JSON.parse(l));
  assert.equal(n.length, 1, `only the id:5 request replies, got ${JSON.stringify(n)}`);
  assert.equal(n[0].id, 5);
  assert.equal(n[0].error.code, -32601);
  await c.close();
});

test("a backend 422 is reported as an argument error, not as an outage", async () => {
  const c = startClient(["--remote-url", mockUrl]);
  const r = await c.call("ziwei_heming", { person_a: GOOD_BIRTH, person_b: GOOD_BIRTH, relation_type: "rivals" });
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /参数错误/);
  assert.match(r.content[0].text, /HTTP 422/);
  assert.doesNotMatch(r.content[0].text, /不可用/);
  hits.length = 0;
  const k = await c.call("ziwei_life_kline", { ...GOOD_BIRTH, from_year: 2000, to_year: 2120 });
  assert.equal(k.isError, true, "a 121-year span is rejected locally, like the backend");
  assert.equal(hits.length, 0, "no request may reach the engine");
  await c.close();
});

test("JSON-RPC validation: bad id, bad params and bad JSON give standard errors; process survives; notifications stay silent", async () => {
  const c = startClient();
  const lines = [];
  c.child.stdout.on("data", (d) => lines.push(...d.toString("utf8").split("\n").filter(Boolean)));
  const raw = (text) => c.child.stdin.write(text);
  const settle = () => new Promise((r) => setTimeout(r, 250));
  const parsed = () => lines.map((l) => JSON.parse(l));

  raw('{"jsonrpc":"2.0","id":{},"method":"ping"}\n');
  raw('{"jsonrpc":"2.0","id":[1],"method":"ping"}\n');
  raw('{"jsonrpc":"2.0","id":true,"method":"ping"}\n');
  raw('{"jsonrpc":"2.0","id":7,"method":"tools/call","params":123}\n');
  raw('{"jsonrpc":"2.0","id":8,"method":"tools/list","params":"x"}\n');
  raw('{"jsonrpc":"2.0","id":9,"method":"tools/list","params":null}\n');
  raw("{bad json\n");
  await settle();
  const out = parsed();
  assert.equal(out.length, 7, JSON.stringify(out));
  // Replies may interleave (parse errors are synchronous), so match by id, not position.
  const nullIds = out.filter((o) => o.id === null).map((o) => o.error.code).sort();
  assert.deepEqual(nullIds, [-32700, -32600, -32600, -32600].sort());
  for (const id of [7, 8, 9]) assert.equal(out.find((o) => o.id === id).error.code, -32600, `id ${id}`);

  // Valid forms are still accepted: string id, numeric id, array params, omitted params.
  lines.length = 0;
  raw('{"jsonrpc":"2.0","id":"abc","method":"ping"}\n');
  raw('{"jsonrpc":"2.0","id":0,"method":"ping","params":[]}\n');
  await settle();
  assert.deepEqual(parsed().map((o) => o.id).sort(), [0, "abc"]);

  // Notifications never produce stdout, with or without params.
  lines.length = 0;
  raw('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
  raw('{"jsonrpc":"2.0","method":"notifications/cancelled","params":{"requestId":1}}\n');
  await settle();
  assert.equal(lines.length, 0, `notifications must stay silent, got: ${lines}`);

  assert.equal(c.child.exitCode, null, "server must still be alive");
  assert.deepEqual((await c.request("ping")).result, {});
  await c.close();
});

test("rpcError is defined exactly once in src/index.mjs", () => {
  const src = execFileSync("cat", [path.join(ROOT, "src", "index.mjs")], { encoding: "utf8" });
  assert.equal((src.match(/const rpcError\s*=/g) || []).length, 1);
});

test("npm pack --dry-run ships exactly the intended files", () => {
  const out = execFileSync("npm", ["pack", "--dry-run", "--json"], { cwd: ROOT, encoding: "utf8" });
  const files = JSON.parse(out)[0].files.map((f) => f.path);
  for (const required of ["bin/yishu-insight-mcp.mjs", "src/index.mjs", "src/iching.mjs", "src/lunar.mjs", "src/remote.mjs", "src/content.mjs", "data/hexagrams.json", "README.md", "LICENSE", "smithery.yaml", "glama.json", "server.json", "package.json"]) {
    assert.ok(files.includes(required), `missing from tarball: ${required}`);
  }
  assert.ok(!files.some((f) => f.startsWith("test/")), "tests must not be published");
});
