// Remote-engine client for the Zi Wei Dou Shu tools. Fail-closed: any network,
// HTTP, or JSON failure throws RemoteError. Nothing is ever fabricated locally.
import { solarToLunar, hourToShichen } from "./lunar.mjs";

/** Network, HTTP or non-JSON failure: the engine could not be reached or answered with garbage. */
export class RemoteError extends Error {}
/** The engine answered 200 + JSON, but the body breaks the endpoint contract (null, {}, {"error":..}, missing fields). */
export class ContractError extends RemoteError {}
/** The engine is healthy and the query is valid, but nothing matches (e.g. no KB entry). */
export class NotFoundError extends Error {}
export class ArgError extends Error {}

const TIMEOUT_MS = 20000;

export function normalizeBaseUrl(raw) {
  let u;
  try {
    u = new URL(String(raw));
  } catch {
    throw new ArgError(`invalid remote URL: ${raw}`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new ArgError(`remote URL must be http(s): ${raw}`);
  return u.toString().replace(/\/+$/, "");
}

function int(v, name, lo, hi) {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  if (!Number.isInteger(n) || n < lo || n > hi) throw new ArgError(`${name} 必须是 ${lo}-${hi} 的整数`);
  return n;
}

/** Strict boolean: only true/false, or the key left out. null, "false" or 0 are rejected, never coerced. */
function optBool(v, name) {
  if (v === undefined) return false;
  if (typeof v !== "boolean") throw new ArgError(`${name} 必须是布尔值 true/false，收到 ${typeof v}: ${JSON.stringify(v)}`);
  return v;
}

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const nonEmptyArr = (v) => Array.isArray(v) && v.length > 0;
/** Every element must be an object: [null], [1] or [[...]] break the contract. */
const allObjs = (v) => Array.isArray(v) && v.every(isObj);
const MAX_KLINE_SPAN = 120; // same limit as the backend (ziwei::MAX_LIFE_KLINE_SPAN)

/** Contract checks per endpoint, matched to the backend serde structs (backend/src/ziwei/*.rs). */
const CONTRACT = {
  chart(d) {
    if (!isObj(d) || !nonEmptyArr(d.chart)) throw new ContractError("星盘响应缺少非空 chart 数组");
    if (!allObjs(d.chart)) throw new ContractError("星盘响应 chart 数组含非对象元素");
    if (!Number.isInteger(d.ming_gong_idx)) throw new ContractError("星盘响应缺少整数 ming_gong_idx");
  },
  heming(d) {
    if (!isObj(d) || !isObj(d.chart_a) || !isObj(d.chart_b) || !isObj(d.interactions)) {
      throw new ContractError("合盘响应缺少 chart_a / chart_b / interactions");
    }
    for (const k of ["chart_a", "chart_b"]) {
      if (!nonEmptyArr(d[k].chart) || !allObjs(d[k].chart)) throw new ContractError(`合盘响应 ${k}.chart 必须是非空对象数组`);
    }
  },
  lifeKline(d) {
    if (!isObj(d) || !nonEmptyArr(d.bars)) throw new ContractError("人生 K 线响应缺少非空 bars 数组");
    if (!allObjs(d.bars)) throw new ContractError("人生 K 线响应 bars 数组含非对象元素");
  },
  kbPalace(d) {
    if (!Array.isArray(d)) throw new ContractError("整宫知识库响应必须是数组");
    if (!allObjs(d)) throw new ContractError("整宫知识库响应含非对象元素");
  },
  kbQuery(d) {
    if (!isObj(d)) throw new ContractError("知识库响应必须是对象");
  },
  famousList(d) {
    if (!Array.isArray(d)) throw new ContractError("名人列表响应必须是数组");
    if (!allObjs(d)) throw new ContractError("名人列表响应含非对象元素");
  },
  famousOne(d) {
    if (!isObj(d) || typeof d.slug !== "string" || !d.slug) throw new ContractError("名人详情响应缺少 slug");
  },
};

/** Turn tool arguments (solar or lunar birth data) into the backend ChartRequest. */
export function toChartRequest(a, label = "") {
  const p = label ? `${label}.` : "";
  if (!a || typeof a !== "object") throw new ArgError(`${label || "参数"} 必须是对象`);
  if (a.gender !== "male" && a.gender !== "female") throw new ArgError(`${p}gender 必须是 "male" 或 "female"`);
  let req;
  if (a.solar_date) {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(a.solar_date).trim());
    if (!m) throw new ArgError(`${p}solar_date 格式应为 YYYY-MM-DD`);
    const t = /^(\d{1,2}):(\d{2})$/.exec(String(a.birth_time ?? "").trim());
    if (!t) throw new ArgError(`${p}birth_time 必填，格式 HH:MM (24 小时制)`);
    const hh = int(t[1], `${p}birth_time 小时`, 0, 23);
    const mm = int(t[2], `${p}birth_time 分钟`, 0, 59);
    let lun;
    try {
      lun = solarToLunar(Number(m[1]), Number(m[2]), Number(m[3]));
    } catch (e) {
      throw new ArgError(`${p}solar_date: ${e.message}`);
    }
    const shi = hourToShichen(hh, mm);
    req = {
      lunar_year: lun.year, lunar_month: lun.month, lunar_day: lun.day,
      hour: shi === 12 ? 0 : shi, // late zi is charted as the same day's zi, matching the website
      gender: a.gender, year_gan_idx: lun.ganIdx, year_zhi_idx: lun.zhiIdx,
    };
    optBool(a.is_leap_month, `${p}is_leap_month`); // validated even though solar input derives its own leap flag
    if (lun.isLeap) req.is_leap_month = true;
  } else if (a.lunar_year !== undefined) {
    const y = int(a.lunar_year, `${p}lunar_year`, 1900, 2100);
    req = {
      lunar_year: y,
      lunar_month: int(a.lunar_month, `${p}lunar_month`, 1, 12),
      lunar_day: int(a.lunar_day, `${p}lunar_day`, 1, 30),
      hour: int(a.hour, `${p}hour (时辰序号 0=子 … 11=亥)`, 0, 11),
      gender: a.gender,
      year_gan_idx: (((y - 4) % 10) + 10) % 10,
      year_zhi_idx: (((y - 4) % 12) + 12) % 12,
    };
    if (optBool(a.is_leap_month, `${p}is_leap_month`)) req.is_leap_month = true;
  } else {
    throw new ArgError(`${p}需要 solar_date+birth_time，或 lunar_year/lunar_month/lunar_day/hour`);
  }
  return req;
}

export class Remote {
  constructor(baseUrl, fetchImpl = globalThis.fetch) {
    this.base = normalizeBaseUrl(baseUrl);
    this.fetch = fetchImpl;
    if (typeof this.fetch !== "function") throw new Error("global fetch is unavailable; Node >= 18 is required");
  }

  /** `contract` validates the parsed body; `nullIs` lets a caller turn a JSON null into its own error first. */
  async call(method, path, body, contract, nullIs) {
    const url = this.base + path;
    let res;
    try {
      res = await this.fetch(url, {
        method,
        headers: { accept: "application/json", "user-agent": "yishu-insight-mcp", ...(body ? { "content-type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      throw new RemoteError(`无法连接 ${url}: ${e?.cause?.code || e?.name || ""} ${e?.message || e}`.trim());
    }
    const text = await res.text();
    // 422 = the engine rejected these arguments (bad date, year out of range): an argument error, not an outage.
    if (res.status === 422) throw new ArgError(`远端引擎拒绝了参数 (HTTP 422): ${text.slice(0, 300)}`);
    if (!res.ok) throw new RemoteError(`${method} ${url} 返回 HTTP ${res.status}: ${text.slice(0, 300)}`);
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new RemoteError(`${method} ${url} 返回了非 JSON 内容: ${text.slice(0, 200)}`);
    }
    if (data === null && nullIs) throw nullIs;
    const bad = (why) => new ContractError(`${method} ${url} 响应不符合契约: ${why}: ${text.slice(0, 200)}`);
    if (data === null || typeof data !== "object") throw bad("不是 JSON 对象或数组");
    if (isObj(data) && Object.keys(data).length === 0) throw bad("空对象 {}");
    if (isObj(data) && Object.hasOwn(data, "error")) throw bad("含 error 字段");
    try {
      contract(data);
    } catch (e) {
      throw bad(e.message);
    }
    return { url, data };
  }

  async chart(a) {
    const req = toChartRequest(a);
    if (a.target_solar_year !== undefined) req.target_solar_year = int(a.target_solar_year, "target_solar_year", 1900, 2200);
    const { url, data } = await this.call("POST", "/api/ziwei/chart", req, CONTRACT.chart);
    return { source: url, request: req, result: data };
  }

  async heming(a) {
    const body = {
      person_a: toChartRequest(a?.person_a, "person_a"),
      person_b: toChartRequest(a?.person_b, "person_b"),
      relation_type: a.relation_type ?? "marriage",
    };
    const { url, data } = await this.call("POST", "/api/ziwei/heming", body, CONTRACT.heming);
    return { source: url, request: body, result: data };
  }

  async lifeKline(a) {
    const req = toChartRequest(a);
    req.from_year = int(a.from_year ?? req.lunar_year, "from_year", 1900, 2200);
    req.to_year = int(a.to_year ?? req.from_year + 99, "to_year", req.from_year, Math.min(req.from_year + MAX_KLINE_SPAN - 1, 2200));
    const { url, data } = await this.call("POST", "/api/ziwei/life-kline", req, CONTRACT.lifeKline);
    return { source: url, request: req, result: data };
  }

  async kbQuery(a) {
    if (!a?.gong) throw new ArgError("gong (宫位，如 命宫) 必填");
    const common = {};
    if (a.branch) common.branch = String(a.branch);
    if (a.max_len !== undefined) common.max_len = int(a.max_len, "max_len", 1, 100000);
    if (Array.isArray(a.stars) && a.stars.length) {
      const body = { gong: String(a.gong), stars: a.stars.map(String), ...common };
      const { url, data } = await this.call("POST", "/api/ziwei/kb/palace", body, CONTRACT.kbPalace);
      return { source: url, request: body, result: data };
    }
    if (!a.star) throw new ArgError("需要 star (单星) 或 stars (整宫星曜数组)");
    const body = { star: String(a.star), gong: String(a.gong), ...common };
    const miss = new NotFoundError(`知识库中没有「${body.star}」在「${body.gong}」的条目`);
    const { url, data } = await this.call("POST", "/api/ziwei/kb/query", body, CONTRACT.kbQuery, miss);
    return { source: url, request: body, result: data };
  }

  async famous(a) {
    if (a?.slug) {
      const slug = String(a.slug);
      if (!/^[A-Za-z0-9_-]+$/.test(slug)) throw new ArgError("slug 只能含字母数字、下划线、连字符");
      const { url, data } = await this.call("GET", `/api/ziwei/famous/${slug}`, undefined, CONTRACT.famousOne);
      return { source: url, request: { slug }, result: data };
    }
    const q = a?.category ? `?category=${encodeURIComponent(String(a.category))}` : "";
    const { url, data } = await this.call("GET", `/api/ziwei/famous${q}`, undefined, CONTRACT.famousList);
    return { source: url, request: { category: a?.category ?? null }, result: data };
  }
}
