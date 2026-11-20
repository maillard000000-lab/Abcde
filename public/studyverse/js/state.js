// 게임 상태 · 저장 · 탭 잠금
import { hashStr, uid, dayKey } from './util.js';

const KEY = 'studyverse.save.v1';
const BAK = 'studyverse.save.bak';
const LOCK = 'studyverse.lock';
export const SAVE_VERSION = 3;

export function newState(name = '견습생') {
  const now = Date.now();
  return {
    v: SAVE_VERSION, rev: 0, createdAt: now, id: uid('save'),
    player: {
      name, level: 1, xp: 0, statPts: 0, title: '신입생',
      base: { int: 5, wil: 5, foc: 5, vit: 5, ins: 5 },
      outfit: 'of_uniform',
      equip: { staff: null, weapon: null, tome: null, ring: null, neck: null, charm: null, tool: null, relic: null },
      spellSlots: [null, null, null, null], fieldSlots: [null, null],
      traitSlots: [],
    },
    res: { gold: 200, mana: 30, light: 10, wood: 20, stone: 15, crystal: 0, research: 0, stamina: 40 },
    spells: {}, // id -> 강화 레벨
    genSpells: [], // 생성된 마법 정의
    items: [], // {uid, ref|def}
    outfits: ['of_uniform', 'of_uniform_summer'],
    traits: [],
    loot: {},
    study: {
      totalMs: 0, sessions: [], ledger: {}, days: {}, active: null, goalMin: 60,
      streak: 0, bestStreak: 0, lastDay: null, goals: {}, night: 0, morning: 0, longest: 0, pomodoro: { focus: 25, rest: 5 },
    },
    story: { ch: 0, phase: 'intro', start: null, flags: {}, done: [], talk: {} },
    regions: { forest: { restore: 0, exps: 0, boss: false }, greywick: { restore: 0, exps: 0, boss: false }, observatory: { restore: 0, exps: 0, boss: false },
      desert: { restore: 0, exps: 0, boss: false }, canyon: { restore: 0, exps: 0, boss: false }, aurel: { restore: 0, exps: 0, boss: false }, vault: { restore: 0, exps: 0, boss: false } },
    unlockedRegions: ['school'],
    school: {
      fac: { classroom: 1, library: 1, dorm: 1, lab: 0, training: 0, garden: 0, dining: 0, hall: 0, archive: 0, lampworks: 0, startower: 0, greenhouse: 0 },
      students: [], applicants: [], staff: [], candidates: [], rep: 0, lastTick: now, appClock: 0, log: [], graduates: 0,
      candRefresh: 0,
    },
    quests: { side: {}, daily: null, weekly: null, kills: 0 },
    codex: { mobs: {}, items: {}, lore: {}, npcs: {} },
    counters: { expeditions: 0, kills: 0, bosses: 0, battles: 0, castCount: 0, forged: 0, aiForged: 0 },
    settings: { sound: true, autoBattle: false, sessionCapMin: 240, awayConfirmMin: 10, ai: false, reduceMotion: false },
    seq: 1,
    lastSeen: now,
  };
}

function checksum(str) { return hashStr(str).toString(36); }

export function serialize(state) {
  const body = JSON.stringify(state);
  return JSON.stringify({ c: checksum(body), body });
}
function parseSave(raw) {
  if (!raw) return null;
  try {
    const wrap = JSON.parse(raw);
    if (!wrap.body || checksum(wrap.body) !== wrap.c) return null;
    return JSON.parse(wrap.body);
  } catch { return null; }
}

/** 저장 데이터를 불러온다. 손상되면 백업으로 복구한다. */
export function load() {
  let s = null, recovered = false;
  try {
    s = parseSave(localStorage.getItem(KEY));
    if (!s) {
      const b = parseSave(localStorage.getItem(BAK));
      if (b) { s = b; recovered = Boolean(localStorage.getItem(KEY)); }
    }
  } catch { /* 저장소 접근 불가 */ }
  if (!s) return { state: null, recovered: false };
  return { state: migrate(s), recovered };
}

export function migrate(s) {
  const d = newState(s.player?.name);
  // 누락된 필드를 기본값으로 채운다 (깊은 병합, 배열은 그대로)
  const fill = (target, def) => {
    for (const k of Object.keys(def)) {
      if (target[k] === undefined) target[k] = def[k];
      else if (def[k] && typeof def[k] === 'object' && !Array.isArray(def[k]) && target[k] && typeof target[k] === 'object') fill(target[k], def[k]);
    }
  };
  fill(s, d);
  s.v = SAVE_VERSION;
  return s;
}

let writeBlocked = false;
export function setWriteBlocked(v) { writeBlocked = v; }
let lastGood = null;
/** 저장. 이전 저장본을 백업으로 보관한다. */
export function save(state) {
  if (writeBlocked) return false;
  state.rev = (state.rev || 0) + 1;
  state.lastSeen = Date.now();
  const data = serialize(state);
  try {
    if (lastGood) localStorage.setItem(BAK, lastGood);
    localStorage.setItem(KEY, data);
    lastGood = data;
    return true;
  } catch (e) {
    console.warn('save failed', e);
    return false;
  }
}
export function wipe() {
  try { localStorage.removeItem(KEY); localStorage.removeItem(BAK); } catch { /* */ }
}
export function exportSave(state) {
  return serialize(state);
}
export function importSave(text) {
  const s = parseSave(text.trim());
  if (!s || !s.player || !s.study) throw new Error('저장 파일이 손상되었거나 형식이 올바르지 않습니다.');
  return migrate(s);
}

// ── 탭 잠금: 같은 저장을 두 탭에서 동시에 쓰면 보상이 중복되거나 기록이 덮어써질 수 있다 ──
const TAB = uid('tab');
export function tabId() { return TAB; }
function readLock() {
  try { return JSON.parse(localStorage.getItem(LOCK) || 'null'); } catch { return null; }
}
export function lockIsFree() {
  const l = readLock();
  return !l || l.tab === TAB || Date.now() - l.t > 8000;
}
export function takeLock() {
  try { localStorage.setItem(LOCK, JSON.stringify({ tab: TAB, t: Date.now() })); } catch { /* */ }
}
export function holdsLock() {
  const l = readLock();
  return !l || l.tab === TAB;
}
export function releaseLock() {
  const l = readLock();
  if (l && l.tab === TAB) try { localStorage.removeItem(LOCK); } catch { /* */ }
}
export { dayKey };
