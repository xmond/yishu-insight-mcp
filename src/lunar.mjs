// Lunar/solar conversion 1900-2100. Table and algorithm ported 1:1 from
// skill/yishu-insight/scripts/lunar.py (itself ported from frontend lunar.ts).
// Out-of-range dates throw; nothing is silently clamped.

const LUNAR_INFO = [
  0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0,
  0x09ad0, 0x055d2, 0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540,
  0x0d6a0, 0x0ada2, 0x095b0, 0x14977, 0x04970, 0x0a4b0, 0x0b4b5, 0x06a50,
  0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970, 0x06566, 0x0d4a0,
  0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,
  0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2,
  0x0a950, 0x0b557, 0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573,
  0x052b0, 0x0a9a8, 0x0e950, 0x06aa0, 0x0aea6, 0x0ab50, 0x04b60, 0x0aae4,
  0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0, 0x096d0, 0x04dd5,
  0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6,
  0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46,
  0x0ab60, 0x09570, 0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58,
  0x05ac0, 0x0ab60, 0x096d5, 0x092e0, 0x0c960, 0x0d954, 0x0d4a0, 0x0da50,
  0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5, 0x0a950, 0x0b4a0,
  0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930,
  0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260,
  0x0ea65, 0x0d530, 0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0,
  0x1d0b6, 0x0d250, 0x0d520, 0x0dd45, 0x0b5a0, 0x056d0, 0x055b2, 0x049b0,
  0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0, 0x14b63, 0x09370,
  0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a6c4, 0x0aae0,
  0x092e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0,
  0x0a6d0, 0x055d4, 0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50,
  0x055a0, 0x0aba4, 0x0a5b0, 0x052b0, 0x0b273, 0x06930, 0x07337, 0x06aa0,
  0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160, 0x0e968, 0x0d520,
  0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a4d0, 0x0d150, 0x0f252,
  0x0d520
];

export const TIAN_GAN = "甲乙丙丁戊己庚辛壬癸";
export const DI_ZHI = "子丑寅卯辰巳午未申酉戌亥";
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

const leapMonth = (y) => LUNAR_INFO[y - 1900] & 0xf;
const leapDays = (y) => (leapMonth(y) ? (LUNAR_INFO[y - 1900] & 0x10000 ? 30 : 29) : 0);
const monthDays = (y, m) => (LUNAR_INFO[y - 1900] & (0x10000 >> m) ? 30 : 29);

function yearDays(y) {
  let total = 348;
  for (let bit = 0x8000; bit > 0x8; bit >>= 1) total += LUNAR_INFO[y - 1900] & bit ? 1 : 0;
  return total + leapDays(y);
}

function utcDay(y, m, d) {
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCFullYear(y);
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) {
    throw new RangeError(`invalid calendar date: ${y}-${m}-${d}`);
  }
  return Math.round(t.getTime() / 86400000);
}

export function solarToLunar(sy, sm, sd) {
  const target = utcDay(sy, sm, sd);
  const base = utcDay(1900, 1, 31);
  if (sy < MIN_YEAR || sy > MAX_YEAR || target < base) {
    throw new RangeError(`date out of supported range 1900-01-31..2100-12-31: ${sy}-${sm}-${sd}`);
  }
  let offset = target - base;
  let year = 1900;
  let temp = 0;
  while (year < 2101 && offset > 0) {
    temp = yearDays(year);
    offset -= temp;
    year += 1;
  }
  if (offset < 0) {
    offset += temp;
    year -= 1;
  }
  const leap = leapMonth(year);
  let isLeap = false;
  let month = 1;
  while (month < 13 && offset > 0) {
    if (leap > 0 && month === leap + 1 && !isLeap) {
      month -= 1;
      isLeap = true;
      temp = leapDays(year);
    } else {
      temp = monthDays(year, month);
    }
    offset -= temp;
    if (isLeap && month === leap + 1) isLeap = false;
    month += 1;
  }
  if (offset === 0 && leap > 0 && month === leap + 1) {
    if (isLeap) {
      isLeap = false;
    } else {
      isLeap = true;
      month -= 1;
    }
  }
  if (offset < 0) {
    month -= 1;
    offset += isLeap ? leapDays(year) : monthDays(year, month);
  }
  return {
    year,
    month,
    day: offset + 1,
    isLeap,
    ganIdx: (((year - 4) % 10) + 10) % 10,
    zhiIdx: (((year - 4) % 12) + 12) % 12,
  };
}

/** Clock time -> shichen index 0-12 (12 = late zi, 23:00-24:00). */
export function hourToShichen(hour, minute) {
  const t = hour * 60 + minute;
  if (t >= 23 * 60) return 12;
  if (t < 60) return 0;
  return Math.floor((t + 60) / 120);
}
