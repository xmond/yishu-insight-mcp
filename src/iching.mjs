// Deterministic I Ching engine. Ported from skill/yishu-insight/scripts/iching.py
// plus 体用五行 for the Meihua reading. Everything derives from yin/yang bits.
import { randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import { solarToLunar, hourToShichen, TIAN_GAN, DI_ZHI } from "./lunar.mjs";

const SITE = "https://insightapp.life";
export const LINE_POS = ["初", "二", "三", "四", "五", "上"];
const XIANTIAN = ["", "乾", "兑", "离", "震", "巽", "坎", "艮", "坤"];
const TRIGRAM_BITS = {
  乾: [1, 1, 1], 兑: [1, 1, 0], 离: [1, 0, 1], 震: [1, 0, 0],
  巽: [0, 1, 1], 坎: [0, 1, 0], 艮: [0, 0, 1], 坤: [0, 0, 0],
};
const TRIGRAM_SYMBOL = { 乾: "☰", 兑: "☱", 离: "☲", 震: "☳", 巽: "☴", 坎: "☵", 艮: "☶", 坤: "☷" };
const TRIGRAM_ELEMENT = { 乾: "金", 兑: "金", 离: "火", 震: "木", 巽: "木", 坎: "水", 艮: "土", 坤: "土" };
const SHICHEN = "子丑寅卯辰巳午未申酉戌亥";
// 生: key generates value. 克: key overcomes value.
const GENERATES = { 木: "火", 火: "土", 土: "金", 金: "水", 水: "木" };
const OVERCOMES = { 木: "土", 土: "水", 水: "火", 火: "金", 金: "木" };

export class InputError extends Error {}

export class Book {
  constructor(data) {
    if (!Array.isArray(data) || data.length !== 64) {
      throw new Error(`hexagrams.json holds ${data?.length} entries, expected 64`);
    }
    this.data = data;
    this.byBits = new Map(data.map((h) => [h.bits.join(""), h]));
    this.byNumber = new Map(data.map((h) => [h.number, h]));
    if (this.byBits.size !== 64 || this.byNumber.size !== 64) throw new Error("hexagram table is not unique");
  }

  static load() {
    const url = new URL("../data/hexagrams.json", import.meta.url);
    return new Book(JSON.parse(readFileSync(url, "utf8")));
  }

  fromBits(bits) {
    return this.byBits.get(bits.join(""));
  }

  resolve(query) {
    const q = String(query).trim();
    if (/^\d+$/.test(q)) {
      const h = this.byNumber.get(Number(q));
      if (!h) throw new InputError(`卦序号必须在 1-64 之间: ${q}`);
      return h;
    }
    for (const key of ["full_name", "name"]) {
      const h = this.data.find((x) => x[key] === q);
      if (h) return h;
    }
    if (q.length > 1 && q.endsWith("卦")) return this.resolve(q.slice(0, -1));
    throw new InputError(`找不到卦: ${q} (可用全名如 地火明夷、简称如 明夷，或 1-64)`);
  }

  byTrigrams(upper, lower) {
    if (!TRIGRAM_BITS[upper] || !TRIGRAM_BITS[lower]) {
      throw new InputError(`upper/lower 必须是八经卦之一: ${Object.keys(TRIGRAM_BITS).join("")}`);
    }
    return this.fromBits([...TRIGRAM_BITS[lower], ...TRIGRAM_BITS[upper]]);
  }
}

export const innerHu = (b) => [b[1], b[2], b[3], b[2], b[3], b[4]];
export const cuo = (b) => b.map((x) => 1 - x);
export const zong = (b) => [...b].reverse();
export const changed = (b, moving) => b.map((x, i) => (moving.includes(i) ? 1 - x : x));

export function tossLine() {
  let s = 0;
  for (let i = 0; i < 3; i++) s += randomInt(2) ? 3 : 2;
  return s;
}

export function parseLines(spec) {
  const vals = Array.isArray(spec)
    ? spec.map(Number)
    : [...String(spec)].filter((c) => c.trim()).map(Number);
  if (vals.length !== 6 || vals.some((v) => ![6, 7, 8, 9].includes(v))) {
    throw new InputError("lines 需要六个数字 (从初爻到上爻)，每个取 6/7/8/9");
  }
  return vals;
}

export function parseChanging(spec) {
  const raw = Array.isArray(spec) ? spec : String(spec).replace(/，/g, ",").split(",");
  const idx = [...new Set(raw.filter((x) => String(x).trim() !== "").map(Number))].sort((a, b) => a - b);
  if (!idx.length || idx.some((i) => !Number.isInteger(i) || i < 1 || i > 6)) {
    throw new InputError("changing 取 1-6 的爻位 (初爻=1)");
  }
  return idx;
}

export function forceChanging(values, positions) {
  const out = [...values];
  for (const p of positions) out[p - 1] = { 7: 9, 8: 6 }[out[p - 1]] ?? out[p - 1];
  return out;
}

function readingRule(ben, moving, bian) {
  const n = moving.length;
  const lines = ben.lines;
  const pick = (i) => ({ title: `本卦${ben.name}·${lines[i].label}`, text: lines[i].text });
  if (n === 0) return { label: "六爻皆不变", how: "以本卦卦辞为断", picks: [{ title: "本卦卦辞", text: ben.judgment }] };
  if (n === 1) return { label: "一爻变", how: "以本卦变爻的爻辞为断", picks: [pick(moving[0])] };
  if (n === 2) {
    const hi = moving[moving.length - 1];
    return {
      label: "二爻变",
      how: "以本卦两个变爻爻辞断，以上一爻为主",
      picks: moving.map((i) => ({ ...pick(i), title: pick(i).title + (i === hi ? "（主）" : "") })),
    };
  }
  if (n === 3) {
    return {
      label: "三爻变",
      how: "以本卦卦辞为贞(体)、变卦卦辞为悔(用)，合参",
      picks: [{ title: "本卦卦辞", text: ben.judgment }, { title: "变卦卦辞", text: bian.judgment }],
    };
  }
  const still = [0, 1, 2, 3, 4, 5].filter((i) => !moving.includes(i));
  const bpick = (i, tag = "") => ({ title: `变卦${bian.name}${bian.lines[i].label}${tag}`, text: bian.lines[i].text });
  if (n === 4) {
    return {
      label: "四爻变",
      how: "以变卦中两个不变爻的爻辞断，以下一爻为主",
      picks: still.map((i) => bpick(i, i === still[0] ? "（主）" : "")),
    };
  }
  if (n === 5) return { label: "五爻变", how: "以变卦中唯一不变爻的爻辞为断", picks: [bpick(still[0])] };
  if (ben.extra_line) {
    return {
      label: "六爻全变",
      how: `乾坤二卦用「${ben.extra_line.label}」断`,
      picks: [{ title: ben.extra_line.label, text: ben.extra_line.text }],
    };
  }
  return { label: "六爻全变", how: "以变卦卦辞为断", picks: [{ title: "变卦卦辞", text: bian.judgment }] };
}

/** 体用五行: the trigram without the moving line is 体, the one with it is 用. */
export function tiYong(ben, movingIdx) {
  if (!movingIdx.length) return null;
  const main = movingIdx[movingIdx.length - 1];
  const inUpper = main >= 3;
  const ti = inUpper ? ben.lower : ben.upper;
  const yong = inUpper ? ben.upper : ben.lower;
  const te = TRIGRAM_ELEMENT[ti];
  const ye = TRIGRAM_ELEMENT[yong];
  let relation;
  let tendency;
  if (te === ye) { relation = "体用比和"; tendency = "吉：二者同气，事顺而助力足"; }
  else if (GENERATES[ye] === te) { relation = "用生体"; tendency = "吉：外来之势生扶自身，有所得益"; }
  else if (OVERCOMES[te] === ye) { relation = "体克用"; tendency = "小吉：自身能制事，须费力方成"; }
  else if (GENERATES[te] === ye) { relation = "体生用"; tendency = "耗泄：自身之力外泄，宜守成"; }
  else { relation = "用克体"; tendency = "凶：外势克制自身，宜谨慎避让"; }
  return {
    moving_line_used: main + 1,
    ti: { trigram: ti, element: te },
    yong: { trigram: yong, element: ye },
    relation,
    tendency,
    note: "体用生克为梅花易数断法；多个变爻时取最上一变爻定体用。",
  };
}

const slim = (h) =>
  h && {
    number: h.number, name: h.name, full_name: h.full_name,
    upper: h.upper, lower: h.lower, symbol: TRIGRAM_SYMBOL[h.upper] + TRIGRAM_SYMBOL[h.lower],
    judgment: h.judgment, daxiang: h.daxiang, meaning: h.meaning, url: articleUrl(h),
  };

const articleUrl = (h) => `${SITE}/blog/zh/${h.blog_slug}`;

export function buildReading(book, values, method, meta) {
  const bits = values.map((v) => (v === 7 || v === 9 ? 1 : 0));
  const moving = values.map((v, i) => (v === 6 || v === 9 ? i : -1)).filter((i) => i >= 0);
  const ben = book.fromBits(bits);
  const bian = moving.length ? book.fromBits(changed(bits, moving)) : null;
  const rule = readingRule(ben, moving, bian);
  return {
    method,
    meta,
    values,
    moving_lines: moving.map((m) => m + 1),
    ben: slim(ben),
    hu: slim(book.fromBits(innerHu(bits))),
    cuo: slim(book.fromBits(cuo(bits))),
    zong: slim(book.fromBits(zong(bits))),
    bian: slim(bian),
    moving_line_texts: moving.map((i) => ({
      label: ben.lines[i].label, text: ben.lines[i].text, xiang: ben.lines[i].xiang,
      plain: ben.lines[i].plain, insight: ben.lines[i].insight,
    })),
    rule,
    ti_yong: tiYong(ben, moving),
    decision_guidance: ben.meaning + (bian ? `；趋势转向「${bian.name}」：${bian.meaning}` : "；六爻皆静，以本卦为断"),
    sources: { lookup: `${SITE}/zhouyi/lookup`, divine: `${SITE}/zhouyi/divine` },
  };
}

function parseAt(text) {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(text).trim());
  if (!m) throw new InputError('at 格式应为 "YYYY-MM-DD HH:MM"');
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  if (h > 23 || mi > 59) throw new InputError("at 的时间超出范围");
  return { y, mo, d, h, mi };
}

const pad = (n) => String(n).padStart(2, "0");

export function meihuaNumbers(at) {
  const lun = solarToLunar(at.y, at.mo, at.d);
  const shi = hourToShichen(at.h, at.mi);
  const shiIdx = shi === 12 ? 0 : shi; // 23:00-24:00 counts as zi, same as the chart entry
  const yearN = lun.zhiIdx + 1;
  const hourN = shiIdx + 1;
  const upperSum = yearN + lun.month + lun.day;
  const total = upperSum + hourN;
  return {
    lun, shiIdx, yearN, hourN, upperSum, total,
    upper: XIANTIAN[upperSum % 8 || 8],
    lower: XIANTIAN[total % 8 || 8],
    moving: total % 6 || 6,
  };
}

export function castCoins(book, { changing, question } = {}) {
  let values = Array.from({ length: 6 }, tossLine);
  const meta = { 来源: "三枚铜钱掷六次 (node:crypto 系统熵源)" };
  if (changing !== undefined) {
    const pos = parseChanging(changing);
    values = forceChanging(values, pos);
    meta["指定变爻"] = pos.map((p) => `${LINE_POS[p - 1]}爻`).join("、");
  }
  if (question) meta["所问之事"] = question;
  meta["各爻数值(初→上)"] = values.join(" ") + "  (6老阴 7少阳 8少阴 9老阳)";
  return buildReading(book, values, "铜钱起卦", meta);
}

export function castLines(book, { lines, changing, question }) {
  let values = parseLines(lines);
  const meta = { 来源: `用户指定六爻 ${values.join("")}` };
  if (changing !== undefined) {
    const pos = parseChanging(changing);
    values = forceChanging(values, pos);
    meta["指定变爻"] = pos.map((p) => `${LINE_POS[p - 1]}爻`).join("、");
  }
  if (question) meta["所问之事"] = question;
  meta["各爻数值(初→上)"] = values.join(" ") + "  (6老阴 7少阳 8少阴 9老阳)";
  return buildReading(book, values, "指定六爻", meta);
}

export function castTime(book, { at, question, now = () => new Date() } = {}) {
  let when;
  let note;
  if (at) {
    when = parseAt(at);
    note = "（调用方指定时间）";
  } else {
    const d = now();
    when = { y: d.getFullYear(), mo: d.getMonth() + 1, d: d.getDate(), h: d.getHours(), mi: d.getMinutes() };
    note = "（服务器本机时钟，未做真太阳时修正）";
  }
  const n = meihuaNumbers(when);
  const bits = [...TRIGRAM_BITS[n.lower], ...TRIGRAM_BITS[n.upper]];
  const values = bits.map((b, i) => (i === n.moving - 1 ? (b ? 9 : 6) : b ? 7 : 8));
  const meta = {
    起卦时间: `${when.y}-${pad(when.mo)}-${pad(when.d)} ${pad(when.h)}:${pad(when.mi)}${note}`,
    农历: `${TIAN_GAN[n.lun.ganIdx]}${DI_ZHI[n.lun.zhiIdx]}年${n.lun.isLeap ? "闰" : ""}${n.lun.month}月${n.lun.day}日 ${SHICHEN[n.shiIdx]}时`,
    算式: `上卦=(年支${n.yearN}+月${n.lun.month}+日${n.lun.day})=${n.upperSum} mod 8 → ${n.upper}${TRIGRAM_SYMBOL[n.upper]}；下卦=(上和${n.upperSum}+时支${n.hourN})=${n.total} mod 8 → ${n.lower}${TRIGRAM_SYMBOL[n.lower]}；动爻=${n.total} mod 6 → 第${n.moving}爻`,
  };
  if (question) meta["所问之事"] = question;
  return buildReading(book, values, "梅花易数·时间起卦", meta);
}

export function lookup(book, { number, name, query, upper, lower }) {
  let h;
  if (number !== undefined && number !== null) h = book.resolve(String(number));
  else if (name || query) h = book.resolve(name || query);
  else if (upper || lower) {
    if (!upper || !lower) throw new InputError("按上下卦查询需要同时提供 upper 与 lower");
    h = book.byTrigrams(upper, lower);
  } else throw new InputError("需要 number、name 或 upper+lower 之一");
  const bits = h.bits;
  return {
    number: h.number, name: h.name, full_name: h.full_name,
    upper: h.upper, lower: h.lower, symbol: TRIGRAM_SYMBOL[h.upper] + TRIGRAM_SYMBOL[h.lower],
    upper_nature: h.upper_nature, lower_nature: h.lower_nature,
    judgment: h.judgment, judgment_plain: h.judgment_plain, judgment_core: h.judgment_core,
    tuan: h.tuan, daxiang: h.daxiang, meaning: h.meaning,
    lines: h.lines.map((l) => ({ label: l.label, text: l.text, xiang: l.xiang, plain: l.plain, insight: l.insight })),
    extra_line: h.extra_line ?? null,
    relations: {
      hu: book.fromBits(innerHu(bits)).full_name,
      cuo: book.fromBits(cuo(bits)).full_name,
      zong: book.fromBits(zong(bits)).full_name,
    },
    url: articleUrl(h),
  };
}
