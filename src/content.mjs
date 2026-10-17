// Prompts and resources exposed over MCP.
export const PROMPTS = [
  {
    name: "iching_divination_prompt",
    description: "Guide the model through a full I Ching reading: cast with iching_cast, then interpret.",
    arguments: [
      { name: "question", description: "The question being asked", required: true },
      { name: "method", description: "coins | time | lines (default coins)", required: false },
    ],
  },
  {
    name: "ziwei_chart_reading_prompt",
    description: "Guide the model through a Zi Wei Dou Shu reading from the authoritative chart engine.",
    arguments: [
      { name: "solar_date", description: "Birth date YYYY-MM-DD", required: true },
      { name: "birth_time", description: "Birth time HH:MM", required: true },
      { name: "gender", description: "male | female", required: true },
      { name: "focus", description: "Topic: career, marriage, wealth, health ...", required: false },
    ],
  },
];

const need = (args, k) => {
  const v = args?.[k];
  if (v === undefined || v === null || String(v).trim() === "") {
    const e = new Error(`missing required prompt argument: ${k}`);
    e.code = -32602;
    throw e;
  }
  return String(v);
};

export function getPrompt(name, args = {}) {
  if (name === "iching_divination_prompt") {
    const q = need(args, "question");
    const method = args.method || "coins";
    return {
      description: PROMPTS[0].description,
      messages: [{
        role: "user",
        content: { type: "text", text:
`请为下面的问题做一次周易占断。
所问之事：${q}

步骤：
1. 调用工具 iching_cast（method="${method}"，question 填入所问之事）。不要自己编造卦象。
2. 依据返回的本卦、互卦、错卦、综卦、变卦，以及 rule（朱熹取辞规则）所选的卦辞/爻辞作为主要依据。
3. 若有 ti_yong，说明体用五行生克对吉凶倾向的含义。
4. 最后给出可执行的决策建议，并说明占卜只作参考，重大决定需结合现实判断。` },
      }],
    };
  }
  if (name === "ziwei_chart_reading_prompt") {
    const solar = need(args, "solar_date");
    const time = need(args, "birth_time");
    const gender = need(args, "gender");
    const focus = args.focus ? `重点关注：${args.focus}\n` : "";
    return {
      description: PROMPTS[1].description,
      messages: [{
        role: "user",
        content: { type: "text", text:
`请为下面的出生信息解读紫微斗数命盘。
出生：${solar} ${time}，性别 ${gender}
${focus}
步骤：
1. 调用工具 ziwei_chart 获取权威排盘。若工具返回错误，如实告知用户并停止，不要凭空排盘。
2. 依次解读命宫、身宫、五行局、主星与四化，并引用返回的 patterns（格局）。
3. 需要古籍依据时，调用 ziwei_kb_query 检索星曜入宫条文。
4. 给出分领域的建议，并说明命理只作参考。` },
      }],
    };
  }
  const e = new Error(`unknown prompt: ${name}`);
  e.code = -32602;
  throw e;
}

export const METHODOLOGY = `# 易数洞察 方法说明 / Methodology

## 周易 (I Ching) — 本地确定性计算
- 卦象全部由六爻阴阳位运算得出，无随机解读、无模型推测。
- 爻值：6 老阴(变)、7 少阳、8 少阴、9 老阳(变)。
- 本卦 = 六爻所成之卦；变卦 = 变爻阴阳互换；
  互卦 = 取 2-3-4 爻为下卦、3-4-5 爻为上卦；
  错卦 = 六爻阴阳全反；综卦 = 六爻上下颠倒。
- 取辞规则依朱熹《易学启蒙》：按变爻数决定以本卦或变卦的卦辞、爻辞为断。
- 铜钱起卦：三枚铜钱掷六次（系统加密级随机源）。
- 梅花易数：上卦=(年支序+农历月+农历日) mod 8；下卦=(上和+时支序) mod 8；动爻=(下和) mod 6。
- 体用：动爻所在之卦为用，另一卦为体，按五行生克断吉凶倾向。
- 卦辞爻辞数据来自 data/hexagrams.json（随包分发，离线可用）。

## 紫微斗数 (Zi Wei Dou Shu) — 远端权威引擎
- 排盘由 insightapp.life 的 Rust 引擎完成（十二宫、命身宫、五行局、十四主星、23 种格局、四化飞星、大限流年）。
- 本包不在本地伪造星盘；网络不可达时工具返回 isError，而不是估算结果。

## 免责声明
命理与占卜仅供文化研究与自我反思参考，不构成医疗、法律、投资建议。
Divination output is for cultural and reflective purposes only; it is not medical, legal or financial advice.

官网 / Website: https://insightapp.life
`;

export const RESOURCES = [
  { uri: "yishu://hexagrams/index", name: "hexagrams-index", description: "Index of all 64 hexagrams (number, name, trigrams).", mimeType: "application/json" },
  { uri: "yishu://guide/methodology", name: "methodology", description: "How casting, derived hexagrams and Zi Wei charts are computed.", mimeType: "text/markdown" },
];
