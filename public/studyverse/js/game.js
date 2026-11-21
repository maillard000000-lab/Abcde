// 게임 시스템: 공부 기록 · 성장 · 스토리 진행 · 탐험/전투 · 학교 경영 · 퀘스트
import {
  SPELLS, ITEMS, OUTFITS, TRAITS, FACILITIES, FAC_MAX, facilityCost, SCHOOL_STAGES, REGIONS, MONSTERS, BOSSES,
  SIDE_QUESTS, LOOT, RARITY, STAFF_ROLES,
} from './content.js';
import { genItem, genSpell, genStudent, genStaff, itemDef, spellDef } from './gen.js';
import { chapter, story } from './story.js';
import { save } from './state.js';
import { clamp, dayKey, weekKey, daysBetween, rng, uid } from './util.js';

export let S = null; // 현재 상태
export function setState(s) { S = s; }

// ── 이벤트 버스 ──
const listeners = {};
export function on(ev, fn) { (listeners[ev] ||= []).push(fn); }
export function emit(ev, data) { (listeners[ev] || []).forEach((f) => f(data)); }
export const toast = (msg, kind = 'info') => emit('toast', { msg, kind });
export function commit() { save(S); emit('change'); }

// ───────────────────────── 보너스 · 능력치 ─────────────────────────
export function equippedItems() {
  return Object.values(S.player.equip).filter(Boolean).map((u) => S.items.find((i) => i.uid === u)).filter(Boolean);
}
export function bonuses() {
  const b = {};
  const add = (eff) => { for (const [k, v] of Object.entries(eff || {})) b[k] = (b[k] || 0) + v; };
  for (const it of equippedItems()) add(itemDef(S, it)?.effect);
  for (const t of S.player.traitSlots) add(TRAITS.find((x) => x.id === t)?.effect);
  for (const sid of S.player.fieldSlots) {
    const sp = sid && spellDef(S, sid);
    if (sp && sp.kind === 'field') {
      const lvm = 1 + 0.15 * ((S.spells[sid] || 1) - 1);
      if (sp.field === 'explore') add({ loot: sp.power * lvm, rare: sp.rarity === 'epic' ? 0.3 : 0 });
      if (sp.field === 'restore') add({ restore: sp.power * lvm });
      if (sp.field === 'move') add({ stamina: Math.round(sp.power * lvm) });
    }
  }
  if (b.all) for (const k of ['xp', 'light', 'loot', 'restore', 'research', 'dmg']) b[k] = (b[k] || 0) + b.all;
  // 교직원
  for (const st of S.school.staff) {
    const eff = st.unpaid ? 0.5 : 1;
    if (st.role === 'librarian') b.light = (b.light || 0) + 0.02 * st.skill * eff;
    if (st.role === 'trainer') b.dmg = (b.dmg || 0) + 0.02 * st.skill * eff;
    if (st.role === 'caretaker') b.buildCost = (b.buildCost || 0) + 0.01 * st.skill * eff;
    if (st.role === 'cook') b.staminaGain = (b.staminaGain || 0) + 0.03 * st.skill * eff;
  }
  b.buildCost = Math.min(0.4, b.buildCost || 0);
  return b;
}
export function stats() {
  const p = S.player, b = bonuses();
  const s = { ...p.base };
  for (const it of equippedItems()) for (const [k, v] of Object.entries(itemDef(S, it)?.stats || {})) s[k] = (s[k] || 0) + v;
  const tr = S.school.fac.training || 0;
  s.maxHp = Math.round((60 + s.vit * 8 + p.level * 4) * (1 + (b.hp || 0) + tr * 0.06));
  s.maxMp = Math.round((20 + s.wil * 3) * (1 + (b.mp || 0)));
  s.def = Math.round(s.wil * 0.5 + s.vit * 0.3);
  s.crit = 0.05 + s.foc * 0.004 + (b.crit || 0);
  s.dmgMul = 1 + (b.dmg || 0) + tr * 0.03;
  return s;
}
export const xpNeed = (lv) => 240 + 60 * (lv - 1);

export function addXp(n) {
  const p = S.player;
  p.xp += Math.round(n);
  let ups = 0;
  while (p.xp >= xpNeed(p.level) && p.level < 60) {
    p.xp -= xpNeed(p.level); p.level++; ups++;
    p.base.int++; p.base.wil++; p.base.foc++; p.base.vit++; p.base.ins++;
    p.statPts += 3;
  }
  if (ups) {
    const TIERS = [[1, '신입생'], [5, '견습 점화자'], [10, '정식 마법사'], [16, '빛의 탐구자'], [22, '정적을 걷는 자'], [28, '등불의 계승자']];
    if (TIERS.some(([, n]) => n === p.title)) p.title = TIERS.filter(([lv]) => p.level >= lv).pop()[1];
    emit('levelup', p.level);
    toast(`레벨 업! Lv.${p.level} — 능력치 포인트 +${ups * 3}`, 'level');
    learnLevelSpells();
    checkUnlocks();
  }
}
export function learnSpell(id, silent = false) {
  if (S.spells[id]) return false;
  S.spells[id] = 1;
  const sp = spellDef(S, id);
  if (!silent && sp) toast(`새 마법 습득: 「${sp.name}」`, 'spell');
  // 빈 슬롯에 자동 장착
  if (sp) {
    if (sp.kind === 'field') { const i = S.player.fieldSlots.indexOf(null); if (i >= 0) S.player.fieldSlots[i] = id; }
    else { const i = S.player.spellSlots.indexOf(null); if (i >= 0) S.player.spellSlots[i] = id; }
  }
  return true;
}
function learnLevelSpells() {
  for (const sp of SPELLS) if (sp.unlock.level && S.player.level >= sp.unlock.level) learnSpell(sp.id);
}
export function giveRes(r, mult = 1) {
  for (const [k, v] of Object.entries(r)) {
    if (k in S.res) {
      S.res[k] += v * mult;
      if (k === 'stamina') S.res.stamina = Math.min(maxStamina(), S.res.stamina);
    }
  }
}
export const maxStamina = () => 100 + (S.school.fac.dining || 0) * 10;
export function addItem(refOrDef, silent = false) {
  const it = typeof refOrDef === 'string' ? { uid: uid('it'), ref: refOrDef } : { uid: uid('it'), def: refOrDef };
  const def = itemDef(S, it);
  if (!def) return null;
  S.items.push(it);
  S.codex.items[def.id] = true;
  if (!silent) toast(`아이템 획득: 「${def.name}」 (${RARITY[def.rarity].name})`, 'item');
  return it;
}
export function hasItemRef(ref) { return S.items.some((i) => i.ref === ref); }

// ───────────────────────── 공부 타이머 ─────────────────────────
// 세션은 '실행 구간(segments)'의 목록으로 기록한다. 각 구간은 실제 시각(Date.now) 기준이므로
// 탭이 백그라운드에 있거나 화면이 꺼져 있어도 시간이 정확하다.
export function activeElapsed(sess = S.study.active, now = Date.now()) {
  if (!sess) return 0;
  let ms = 0;
  for (const seg of sess.segs) {
    const end = seg.to ?? now;
    if (end > seg.from) ms += end - seg.from; // 시계가 뒤로 간 구간은 0으로 처리
  }
  return ms;
}
export function startStudy({ label = '', mode = 'free' } = {}) {
  if (S.study.active) return;
  const now = Date.now();
  S.study.active = {
    id: uid('ss'), label: String(label).slice(0, 40), mode, startedAt: now, segs: [{ from: now, to: null }],
    pomo: mode === 'pomo' ? { phase: 'focus', phaseStart: now, cycles: 0 } : null,
  };
  commit();
}
export function isRunning() {
  const a = S.study.active;
  return Boolean(a && a.segs.length && a.segs[a.segs.length - 1].to == null);
}
export function pauseStudy(at = Date.now()) {
  const a = S.study.active;
  if (!a || !isRunning()) return;
  const seg = a.segs[a.segs.length - 1];
  seg.to = Math.max(seg.from, at);
  commit();
}
export function resumeStudy() {
  const a = S.study.active;
  if (!a || isRunning()) return;
  a.segs.push({ from: Date.now(), to: null });
  if (a.pomo) { a.pomo.phase = 'focus'; a.pomo.phaseStart = Date.now(); }
  commit();
}
export function cancelStudy() {
  S.study.active = null;
  commit();
}
/** 뽀모도로 진행: 집중 시간이 끝나면 자동 휴식(기록 정지), 휴식이 끝나면 자동 재개 */
export function pomoTick(now = Date.now()) {
  const a = S.study.active;
  if (!a || !a.pomo) return null;
  const { focus, rest } = S.study.pomodoro;
  if (a.pomo.phase === 'focus' && isRunning()) {
    const seg = a.segs[a.segs.length - 1];
    const inFocus = now - Math.max(seg.from, a.pomo.phaseStart);
    if (inFocus >= focus * 60000) {
      const endAt = Math.max(seg.from, a.pomo.phaseStart) + focus * 60000;
      seg.to = endAt;
      a.pomo.phase = 'rest'; a.pomo.phaseStart = endAt; a.pomo.cycles++;
      commit();
      return 'rest';
    }
  } else if (a.pomo.phase === 'rest' && now - a.pomo.phaseStart >= rest * 60000) {
    const at = a.pomo.phaseStart + rest * 60000;
    a.segs.push({ from: at, to: null });
    a.pomo.phase = 'focus'; a.pomo.phaseStart = at;
    commit();
    return 'focus';
  }
  return null;
}

/** 공부 종료 → 보상 확정. 같은 세션 ID로는 두 번 보상하지 않는다. */
export function finishStudy() {
  const a = S.study.active;
  if (!a) return null;
  const now = Date.now();
  if (isRunning()) a.segs[a.segs.length - 1].to = now;
  if (S.study.ledger[a.id] != null) { S.study.active = null; commit(); return null; }
  const capMs = S.settings.sessionCapMin * 60000;
  let ms = Math.min(activeElapsed(a, now), capMs);
  const capped = activeElapsed(a, now) > capMs;
  // 하루 최대 16시간 상한(비정상 기록 방지)
  const minutes = Math.floor(ms / 60000);
  ms = minutes * 60000;
  S.study.ledger[a.id] = minutes;
  S.study.active = null;
  if (minutes < 1) { commit(); toast('1분 미만의 공부는 기록되지 않았어요.', 'warn'); return { minutes: 0 }; }

  // 날짜별 분배 (자정을 넘긴 세션도 정확히 나눔)
  let remain = ms;
  for (const seg of a.segs) {
    let from = seg.from, to = Math.min(seg.to ?? now, now);
    while (from < to && remain > 0) {
      const d = new Date(from); d.setHours(24, 0, 0, 0);
      const cut = Math.min(to, d.getTime());
      const part = Math.min(cut - from, remain);
      const k = dayKey(from);
      S.study.days[k] = (S.study.days[k] || 0) + part / 60000;
      remain -= part; from = cut;
    }
  }
  const dayCapMin = 16 * 60;
  for (const k of Object.keys(S.study.days)) S.study.days[k] = Math.min(dayCapMin, S.study.days[k]);

  S.study.totalMs += ms;
  S.study.longest = Math.max(S.study.longest, minutes);
  const hour = new Date(a.startedAt).getHours();
  const isNight = hour >= 21 || hour < 5, isMorning = hour >= 5 && hour < 9;
  if (isNight) S.study.night++;
  if (isMorning) S.study.morning++;
  updateStreak();
  const reward = grantStudy(minutes, { night: isNight, morning: isMorning, deep: minutes >= 45 });
  S.study.sessions.push({ id: a.id, start: a.startedAt, end: now, min: minutes, label: a.label, xp: reward.xp });
  if (S.study.sessions.length > 400) S.study.sessions.splice(0, S.study.sessions.length - 400);
  const goalHit = checkGoal(dayKey(now), reward);
  checkUnlocks();
  commit();
  emit('studyDone', { minutes, reward, capped, goalHit });
  return { minutes, reward, capped };
}
/** 공부 분량에 따른 보상 계산 · 지급 (타이머와 사진 인증이 함께 쓴다) */
function grantStudy(minutes, { night = false, morning = false, deep = false } = {}) {
  const b = bonuses(), st = stats();
  const fac = S.school.fac;
  let xpMul = 1 + (b.xp || 0) + fac.classroom * 0.03 + st.foc * 0.002 + Math.min(0.14, S.study.streak * (b.streak || 0));
  if (deep) xpMul += b.deep || 0;
  if (night) xpMul += b.night || 0;
  const lightMul = 1 + (b.light || 0) + fac.library * 0.04 + (morning ? (b.morning || 0) : 0);
  const reward = {
    xp: Math.round(minutes * 10 * xpMul),
    light: Math.floor((minutes / 2) * lightMul),
    gold: minutes * 2, mana: minutes,
    stamina: Math.ceil(minutes / 2 * (1 + (b.staminaGain || 0))),
    research: Math.floor(minutes / 10 * (1 + (b.research || 0))),
  };
  giveRes({ light: reward.light, gold: reward.gold, mana: reward.mana, stamina: reward.stamina, research: reward.research });
  addXp(reward.xp);
  return reward;
}
function checkGoal(day, reward) {
  if (S.study.goals[day] || (S.study.days[day] || 0) < S.study.goalMin) return false;
  S.study.goals[day] = true;
  const m = 1 + (bonuses().goal || 0);
  giveRes({ light: 30, gold: 150, crystal: 2 }, m);
  reward.goal = true;
  toast(`일일 목표 달성! 지식의 빛 +${30 * m}, 골드 +${150 * m}, 수정 +${2 * m}`, 'level');
  return true;
}
/** 연속 공부일: 날짜별 기록에서 다시 계산한다 (지난 날짜를 사진으로 인증해도 정확) */
function updateStreak() {
  const has = (k) => (S.study.days[k] || 0) >= 1;
  const d = new Date(); d.setHours(12, 0, 0, 0);
  if (!has(dayKey(d.getTime()))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (has(dayKey(d.getTime()))) { n++; d.setDate(d.getDate() - 1); }
  S.study.streak = n;
  S.study.bestStreak = Math.max(S.study.bestStreak, n);
  S.study.lastDay = dayKey();
}

// ───────────────────────── 사진 인증 (다른 공부 앱의 스크린샷) ─────────────────────────
// 같은 날짜의 사진은 '그날 이미 기록된 시간(타이머 + 이전 사진)'을 넘는 만큼만 인정한다.
// → 같은 사진을 다시 올리거나, 타이머와 사진으로 같은 공부를 두 번 기록해도 보상이 중복되지 않는다.
export const PHOTO_MAX_AGE_DAYS = 7;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
/** 스크린샷의 월/일(+요일)을 실제 날짜로 확정한다. 연도는 오늘 이전의 가장 가까운 해. */
export function resolvePhotoDate({ month, day, weekday }, now = new Date()) {
  if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31)) return { error: '사진에서 날짜를 읽지 못했습니다. 날짜가 보이게 찍어 주세요.' };
  let found = null;
  for (const y of [now.getFullYear(), now.getFullYear() - 1]) {
    const d = new Date(y, month - 1, day, 12);
    if (d.getMonth() !== month - 1) continue;
    if (dayKey(d.getTime()) <= dayKey(now.getTime())) { found = d; break; }
  }
  if (!found) return { error: '미래 날짜의 기록은 인증할 수 없습니다.' };
  const key = dayKey(found.getTime());
  const age = daysBetween(key, dayKey(now.getTime()));
  if (weekday && WEEKDAYS.includes(weekday) && WEEKDAYS[found.getDay()] !== weekday) return { error: `날짜(${month}월 ${day}일)와 요일(${weekday})이 맞지 않습니다.` };
  if (age > PHOTO_MAX_AGE_DAYS) return { error: `${PHOTO_MAX_AGE_DAYS}일보다 오래된 기록은 인증할 수 없습니다.` };
  return { key, age };
}
/** 판독 결과 검토: 인정될 분량을 계산한다 (아직 지급하지 않음) */
export function reviewPhoto(read, hash) {
  if (!read || !read.is_study_timer) return { error: '공부 시간 기록 화면으로 보이지 않습니다.' };
  if (hash && S.study.photos?.some((p) => p.hash === hash)) return { error: '이미 인증에 사용한 사진입니다.' };
  const date = resolvePhotoDate(read.date || {});
  if (date.error) return date;
  const subjects = (read.subjects || []).filter((x) => x.seconds > 0);
  const sum = subjects.reduce((a, x) => a + x.seconds, 0);
  let total = read.total_seconds > 0 ? read.total_seconds : sum;
  if (!(total > 0)) return { error: '공부 시간을 읽지 못했습니다.' };
  const warn = [];
  if (sum > 0 && read.total_seconds > 0 && Math.abs(sum - read.total_seconds) > 120) {
    warn.push('총 시간과 과목별 합계가 달라 더 작은 값을 인정합니다.');
    total = Math.min(sum, read.total_seconds);
  }
  total = Math.min(total, 16 * 3600);
  const photoMin = Math.floor(total / 60);
  const already = Math.floor(S.study.days[date.key] || 0);
  const credit = Math.max(0, photoMin - already);
  return { date: date.key, age: date.age, totalSec: total, photoMin, already, credit, subjects, warn };
}
/** 검토 결과를 확정하고 보상을 지급한다 */
export function creditPhoto(rv, hash) {
  S.study.photos ||= [];
  if (hash && S.study.photos.some((p) => p.hash === hash)) return null;
  const rec = { hash, date: rv.date, totalSec: rv.totalSec, credited: rv.credit, at: Date.now(), subjects: rv.subjects.slice(0, 12).map((x) => ({ name: String(x.name).slice(0, 20), seconds: x.seconds })) };
  S.study.photos.push(rec);
  if (S.study.photos.length > 200) S.study.photos.splice(0, S.study.photos.length - 200);
  if (rv.credit < 1) { commit(); return { minutes: 0 }; }
  S.study.days[rv.date] = Math.min(16 * 60, (S.study.days[rv.date] || 0) + rv.credit);
  S.study.totalMs += rv.credit * 60000;
  S.study.longest = Math.max(S.study.longest, rv.credit);
  updateStreak();
  const reward = grantStudy(rv.credit, {});
  const label = '사진 인증 · ' + (rv.subjects.length ? rv.subjects.slice(0, 3).map((x) => x.name).join(', ') : '공부 앱');
  const id = uid('ph');
  S.study.ledger[id] = rv.credit;
  S.study.sessions.push({ id, start: new Date(rv.date + 'T12:00:00').getTime(), end: Date.now(), min: rv.credit, label, xp: reward.xp, photo: true });
  if (S.study.sessions.length > 400) S.study.sessions.splice(0, S.study.sessions.length - 400);
  const goalHit = checkGoal(rv.date, reward);
  checkUnlocks();
  commit();
  emit('studyDone', { minutes: rv.credit, reward, goalHit });
  return { minutes: rv.credit, reward };
}
export const totalMin = () => Math.floor(S.study.totalMs / 60000);
export const todayMin = () => Math.floor(S.study.days[dayKey()] || 0);

// ───────────────────────── 해금 검사 (특성 · 의상) ─────────────────────────
function condMet(u) {
  switch (u.type) {
    case 'default': return true;
    case 'level': return S.player.level >= u.n;
    case 'chapter': return S.story.done.includes(u.n);
    case 'minutes': return totalMin() >= u.n;
    case 'expeditions': return S.counters.expeditions >= u.n;
    case 'facility': return (S.school.fac[u.fac] || 0) >= u.lv;
    case 'items': return S.items.length >= u.n;
    case 'longsession': return S.study.longest >= u.n;
    case 'restoreTotal': return Object.values(S.regions).reduce((a, r) => a + r.restore, 0) >= u.n;
    case 'night': return S.study.night >= u.n;
    case 'morning': return S.study.morning >= u.n;
    case 'streak': return S.study.bestStreak >= u.n;
    case 'students': return S.school.students.length >= u.n;
    case 'buildTotal': return facTotal() >= u.n;
    case 'spells': return Object.keys(S.spells).length >= u.n;
    case 'bosses': return S.counters.bosses >= u.n;
    case 'goals': return Object.keys(S.study.goals).length >= u.n;
    case 'trait': return S.traits.includes(u.id);
    case 'season': return u.months.includes(new Date().getMonth() + 1);
    default: return false;
  }
}
export function traitSlotsMax() { return 1 + Math.floor(S.player.level / 8); }
export function checkUnlocks() {
  for (const t of TRAITS) {
    if (!S.traits.includes(t.id) && condMet(t.unlock)) {
      S.traits.push(t.id);
      toast(`특성 획득: 「${t.name}」 — ${t.desc}`, 'trait');
      if (S.player.traitSlots.length < traitSlotsMax()) S.player.traitSlots.push(t.id);
    }
  }
  for (const o of OUTFITS) {
    if (!S.outfits.includes(o.id) && condMet(o.unlock)) {
      S.outfits.push(o.id);
      if (o.unlock.type !== 'default') toast(`의상 해금: 「${o.name}」`, 'item');
    }
  }
}
export { condMet };

// ───────────────────────── 스토리 진행 ─────────────────────────
export function curChapter() { return chapter(S.story.ch); }
export function storyStatus() {
  const c = curChapter();
  if (!c) return { phase: 'end' };
  if (S.story.phase === 'end') return { phase: 'end', c };
  if (S.story.phase === 'intro') return { phase: S.player.level >= c.level ? 'intro' : 'wait', c };
  const objs = c.objectives.map((o) => ({ ...o, ...objProgress(o) }));
  const ready = objs.every((o) => o.done);
  return { phase: ready ? 'ready' : 'active', c, objs };
}
function objProgress(o) {
  const st = S.story.start || { studyMs: 0, exps: {} };
  switch (o.type) {
    case 'study': { const v = Math.floor((S.study.totalMs - st.studyMs) / 60000); return { cur: v, max: o.min, done: v >= o.min }; }
    case 'talk': { const v = S.story.talk[S.story.ch]?.[o.npc] ? 1 : 0; return { cur: v, max: 1, done: v >= 1 }; }
    case 'expedition': { const v = S.regions[o.region].exps - (st.exps[o.region] || 0); return { cur: v, max: o.n, done: v >= o.n }; }
    case 'restore': { const v = Math.floor(S.regions[o.region].restore); return { cur: v, max: o.pct, done: v >= o.pct }; }
    case 'level': return { cur: S.player.level, max: o.n, done: S.player.level >= o.n };
    case 'build': return { cur: S.school.fac[o.fac] || 0, max: o.lv, done: (S.school.fac[o.fac] || 0) >= o.lv };
    case 'stage': return { cur: schoolStage().n, max: o.n, done: schoolStage().n >= o.n };
    case 'boss': return { cur: S.regions[o.region].boss ? 1 : 0, max: 1, done: S.regions[o.region].boss };
    case 'spells': return { cur: Object.keys(S.spells).length, max: o.n, done: Object.keys(S.spells).length >= o.n };
    case 'students': return { cur: S.school.students.length, max: o.n, done: S.school.students.length >= o.n };
    default: return { cur: 0, max: 1, done: false };
  }
}
/** 인트로 장면을 본 뒤 호출 → 목표 진행 시작 */
export function beginChapter() {
  const c = curChapter();
  S.story.phase = 'active';
  S.story.start = { studyMs: S.study.totalMs, exps: Object.fromEntries(Object.entries(S.regions).map(([k, v]) => [k, v.exps])) };
  if (c.objectives.length === 0) return completeChapter();
  commit();
}
/** 아웃트로를 본 뒤 호출 → 보상 지급, 다음 장으로 */
export function completeChapter(choiceFlag) {
  const c = curChapter();
  if (!c || S.story.done.includes(c.id)) return;
  if (choiceFlag) S.story.flags[choiceFlag] = true;
  S.story.done.push(c.id);
  const r = c.reward || {};
  if (r.xp) addXp(r.xp);
  giveRes({ light: r.light || 0, gold: r.gold || 0 });
  if (r.spell) learnSpell(r.spell);
  if (r.item) addItem(r.item);
  if (r.title) S.player.title = r.title;
  for (const reg of c.unlock?.regions || []) if (!S.unlockedRegions.includes(reg)) { S.unlockedRegions.push(reg); toast(`새 지역 개방: ${REGIONS.find((x) => x.id === reg)?.name}`, 'level'); }
  if (c.id === 0 && !hasItemRef('it_lantern')) { const it = addItem('it_lantern', true); S.player.equip.relic = it.uid; }
  checkUnlocks();
  const next = chapter(c.id + 1);
  if (next) { S.story.ch = next.id; S.story.phase = 'intro'; S.story.start = null; }
  else S.story.phase = 'end';
  commit();
  emit('chapterDone', c);
}
export function recordTalk(npc) {
  (S.story.talk[S.story.ch] ||= {})[npc] = true;
  S.codex.npcs[npc] = true;
  S.counters.talks = (S.counters.talks || 0) + 1;
}
export function npcLines(npc) {
  const t = story().npcTalk[npc] || [];
  let lines = null;
  for (const [from, l] of t) if (S.story.ch >= from || (S.story.phase === 'end')) lines = l;
  return lines;
}

// ───────────────────────── 지역 · 복원 ─────────────────────────
export const region = (id) => REGIONS.find((r) => r.id === id);
export function restoreCostPerPct(id) {
  return { forest: 3, greywick: 4, observatory: 5, desert: 7, canyon: 8, aurel: 10 }[id] || 10;
}
export function donateLight(id, pct) {
  const cost = restoreCostPerPct(id) * pct;
  const reg = S.regions[id];
  if (reg.restore >= 100) return toast('이미 완전히 복원된 지역입니다.', 'warn');
  if (S.res.light < cost) return toast('지식의 빛이 부족합니다.', 'warn');
  S.res.light -= cost;
  S.counters.donated = (S.counters.donated || 0) + cost;
  addRestore(id, pct);
  commit();
}
export function addRestore(id, pct) {
  const reg = S.regions[id];
  const before = reg.restore;
  reg.restore = Math.min(100, reg.restore + pct);
  for (const [th] of story().regionLore[id] || []) {
    if (before < th && reg.restore >= th) { S.codex.lore[`${id}:${th}`] = true; toast(`도감에 새 기록: ${region(id).name} (${th}%)`, 'lore'); }
  }
  if (before < 100 && reg.restore >= 100) toast(`${region(id).name}이(가) 완전히 복원되었습니다!`, 'level');
  checkUnlocks();
}
export function expeditionCost(id) {
  const b = bonuses();
  const tower = Math.min(3, S.school.fac.startower || 0);
  return Math.max(4, region(id).cost - (b.stamina || 0) - tower);
}
export function bossAvailable(id) {
  const reg = region(id);
  if (!reg?.boss || S.regions[id].boss) return false;
  const bd = BOSSES[reg.boss];
  if (bd.final) return S.story.ch === 10 && S.story.phase === 'active' && S.regions.aurel.boss;
  return S.unlockedRegions.includes(id) && S.regions[id].restore >= bd.minRestore;
}
export function vaultVisible() {
  return (S.story.ch === 10 && S.story.phase === 'active' && S.regions.aurel.boss) || S.regions.vault.boss;
}

// ───────────────────────── 탐험 · 전투 ─────────────────────────
export let EXP = null; // 진행 중인 탐험(저장하지 않음 — 새로고침 시 이미 지불한 탐험력은 돌려준다)
export function startExpedition(id, boss = false) {
  const reg = region(id);
  if (EXP) return null;
  const cost = boss ? 0 : expeditionCost(id);
  if (!boss && S.res.stamina < cost) { toast('탐험력이 부족합니다. 공부하면 탐험력이 회복됩니다.', 'warn'); return null; }
  S.res.stamina -= cost;
  const r = rng(uid('ex'));
  const encounters = boss ? [reg.boss] : [0, 1, 2].map(() => r.pick(reg.mobs));
  const st = stats();
  EXP = {
    id: uid('exp'), region: id, boss, cost, encounters, idx: 0, loot: { light: 0, gold: 0, wood: 0, stone: 0, crystal: 0, items: [], drops: {} },
    hp: st.maxHp, mp: st.maxMp, kills: [], questions: [], done: false, result: null,
  };
  S.pendingExp = { id: EXP.id, cost }; // 비정상 종료 시 환불용
  commit();
  newBattle();
  return EXP;
}
export function refundPendingExpedition() {
  if (S.pendingExp) {
    S.res.stamina = Math.min(maxStamina(), S.res.stamina + S.pendingExp.cost);
    S.pendingExp = null;
    save(S);
    return true;
  }
  return false;
}
function enemyFrom(key) {
  const d = MONSTERS[key] || BOSSES[key];
  const reg = region(EXP.region);
  const scale = d.big ? 1 : 1 + Math.max(0, S.player.level - (reg.lvl || 1)) * 0.05;
  return { key, name: d.name, maxHp: Math.round(d.hp * scale), hp: Math.round(d.hp * scale), atk: Math.round(d.atk * scale), def: Math.round(d.def * scale),
    shape: d.shape, c: d.c, big: !!d.big, q: d.q, dots: [], stun: 0, final: !!d.final, boss: !!d.big };
}
export function newBattle() {
  const key = EXP.encounters[EXP.idx];
  const st = stats();
  const b = bonuses();
  EXP.battle = {
    enemy: enemyFrom(key), shield: EXP.boss && b.bossShield ? b.bossShield : 0, buff: 0, lastTag: null, turn: 1, log: [], over: false, win: false,
    cds: {}, maxHp: st.maxHp, maxMp: st.maxMp, fx: null, midline: false,
  };
  S.codex.mobs[key] = S.codex.mobs[key] || 0;
  return EXP.battle;
}
const blog = (t) => { EXP.battle.log.push(t); if (EXP.battle.log.length > 6) EXP.battle.log.shift(); };

/** 플레이어 행동. action: spell id | 'herb' | 'flee' */
export function playerAct(action) {
  const B = EXP?.battle;
  if (!B || B.over) return null;
  const st = stats(), b = bonuses();
  const E = B.enemy;
  const res = { kind: null, dmg: 0, heal: 0, crit: false, spell: null };
  if (action === 'flee') { endExpedition('fled'); return { kind: 'flee' }; }
  if (action === 'herb') {
    if (!(S.loot.loot_herb > 0)) return null;
    S.loot.loot_herb--;
    const hh = Math.round(B.maxHp * 0.35);
    EXP.hp = Math.min(B.maxHp, EXP.hp + hh);
    blog(`온실 약초를 먹었다. 체력 +${hh}`);
    res.kind = 'heal'; res.heal = hh;
  } else {
    const sp = spellDef(S, action);
    if (!sp || !S.spells[action] || sp.kind === 'field') return null;
    const lv = S.spells[action] || 1;
    const lvm = 1 + 0.15 * (lv - 1);
    const mp = sp.mp || 0;
    if (EXP.mp < mp) { blog('마나가 부족하다!'); return { kind: 'nomp' }; }
    EXP.mp -= mp;
    S.counters.castCount++;
    res.spell = sp; res.kind = sp.kind;
    let mult = 1;
    if (sp.combo && B.lastTag && (B.lastTag === sp.combo.after || B.guaranteeCombo)) mult += sp.combo.bonus * (1 + (b.combo || 0));
    if (B.buff) { mult += B.buff; B.buff = 0; }
    B.guaranteeCombo = false;
    const atkPow = (p) => p * lvm * (1 + st.int / 25) * st.dmgMul * mult;
    if (sp.kind === 'dmg' || sp.kind === 'drain') {
      const hits = sp.repeat || 1;
      for (let i = 0; i < hits; i++) {
        let d = atkPow(sp.power) * (0.92 + Math.random() * 0.16);
        const crit = Math.random() < st.crit + (sp.crit || 0);
        if (crit) { d *= 1.6; res.crit = true; }
        d = Math.max(1, Math.round(d - E.def));
        E.hp -= d; res.dmg += d;
      }
      if (sp.kind === 'drain') { const hh = Math.round(res.dmg * 0.5); EXP.hp = Math.min(B.maxHp, EXP.hp + hh); res.heal = hh; }
      blog(`「${sp.name}」! ${res.dmg} 피해${res.crit ? ' (치명타!)' : ''}${mult > 1.01 ? ' · 연계' : ''}${res.heal ? ` · 체력 +${res.heal}` : ''}`);
    } else if (sp.kind === 'dot') {
      const per = Math.max(1, Math.round(atkPow(sp.power) - E.def * 0.3));
      E.dots.push({ per, turns: sp.turns || 3, col: sp.col });
      blog(`「${sp.name}」! ${sp.turns || 3}턴 동안 매 턴 ${per} 피해`);
    } else if (sp.kind === 'heal') {
      const hh = Math.round(sp.power * lvm * (1 + st.wil / 30));
      EXP.hp = Math.min(B.maxHp, EXP.hp + hh); res.heal = hh;
      blog(`「${sp.name}」! 체력 +${hh}`);
    } else if (sp.kind === 'shield') {
      const sh = Math.round(sp.power * lvm * (1 + st.wil / 30));
      B.shield += sh;
      if (sp.heal) EXP.hp = Math.min(B.maxHp, EXP.hp + sp.heal);
      blog(`「${sp.name}」! 보호막 ${sh}`);
    } else if (sp.kind === 'buff') {
      B.buff += sp.power * lvm;
      if (sp.id === 'sp_unbinding') B.guaranteeCombo = true;
      blog(`「${sp.name}」! 다음 공격 +${Math.round(B.buff * 100)}%`);
    } else if (sp.kind === 'stun') {
      E.stun = 1;
      blog(`「${sp.name}」! ${E.name}의 시간이 멈췄다.`);
    }
    B.lastTag = sp.tags?.[0] || null;
  }
  // 마나 자연 회복
  EXP.mp = Math.min(B.maxMp, EXP.mp + 2 + Math.floor(st.wil / 10));
  if (E.hp <= 0) return winBattle(res);
  // 적의 턴
  let tick = 0;
  for (const d of E.dots) { E.hp -= d.per; tick += d.per; d.turns--; }
  E.dots = E.dots.filter((d) => d.turns > 0);
  if (tick) blog(`지속 피해 ${tick}`);
  if (E.hp <= 0) return winBattle(res);
  if (E.stun) { E.stun = 0; blog(`${E.name}은(는) 움직이지 못한다.`); res.enemy = { skip: true }; }
  else {
    let d = Math.round(E.atk * (0.85 + Math.random() * 0.3) * (E.final && E.hp < E.maxHp * 0.5 ? 1.2 : 1) - st.def * 0.6);
    d = Math.max(1, d);
    if (B.shield) { const ab = Math.min(B.shield, d); B.shield -= ab; d -= ab; }
    EXP.hp -= d;
    blog(`${E.name}의 공격! ${d} 피해`);
    res.enemy = { dmg: d };
  }
  if (E.final && !B.midline && E.hp < E.maxHp * 0.5) { B.midline = true; res.midline = true; }
  B.turn++;
  if (EXP.hp <= 0) { EXP.hp = 0; B.over = true; B.win = false; endExpedition('lost'); res.lost = true; }
  return res;
}
function winBattle(res) {
  const B = EXP.battle, E = B.enemy;
  E.hp = 0; B.over = true; B.win = true;
  S.counters.kills++; S.quests.kills++;
  S.codex.mobs[E.key] = (S.codex.mobs[E.key] || 0) + 1;
  EXP.kills.push(E.key);
  EXP.questions.push(E.q);
  const reg = region(EXP.region);
  const b = bonuses(), st = stats();
  const lootMul = 1 + (b.loot || 0) + st.ins * 0.004;
  const tier = (reg.lvl || 1);
  EXP.loot.gold += Math.round((8 + tier * 3) * lootMul * (E.big ? 6 : 1));
  EXP.loot.light += Math.round((2 + tier * 0.4) * lootMul * (E.big ? 8 : 1));
  for (const m of reg.mats || []) EXP.loot[m] += Math.round((1 + Math.random() * 2) * lootMul * (E.big ? 4 : 1));
  addXp(Math.round(E.maxHp / 4 + (E.big ? 300 + tier * 40 : 0)));
  // 아이템 드롭
  const dropChance = (E.big ? 1 : 0.18) * lootMul;
  if (Math.random() < dropChance) {
    const def = genItem(S, { level: Math.max(tier, S.player.level - 2), region: EXP.region, rareBonus: (b.rare || 0) * 0.3 + (S.school.fac.archive || 0) * 0.05 + (E.big ? 0.4 : 0) });
    if (def) EXP.loot.items.push(def);
  }
  if (Math.random() < 0.25 * lootMul) EXP.loot.drops.loot_book = (EXP.loot.drops.loot_book || 0) + 1;
  if (Math.random() < 0.2 * lootMul) EXP.loot.drops.loot_seed = (EXP.loot.drops.loot_seed || 0) + 1;
  if (Math.random() < 0.15 * lootMul) EXP.loot.drops.loot_herb = (EXP.loot.drops.loot_herb || 0) + 1;
  blog(`${E.name}을(를) 정화했다! 남은 물음: "${E.q}"`);
  res.win = true;
  if (EXP.boss) {
    S.regions[EXP.region].boss = true; S.counters.bosses++;
    toast(`수호자 「${E.name}」 정화!`, 'level');
    endExpedition('cleared');
  } else if (EXP.idx >= EXP.encounters.length - 1) endExpedition('cleared');
  return res;
}
export function nextEncounter() {
  if (!EXP || EXP.done) return;
  EXP.idx++;
  const st = stats();
  EXP.hp = Math.min(st.maxHp, EXP.hp + Math.round(st.maxHp * 0.25));
  newBattle();
}
function endExpedition(result) {
  if (EXP.done) return;
  EXP.done = true; EXP.result = result;
  const L = EXP.loot;
  const keep = result === 'lost' ? 0.5 : 1;
  const reg = S.regions[EXP.region];
  for (const k of ['gold', 'light', 'wood', 'stone', 'crystal']) { L[k] = Math.floor(L[k] * keep); S.res[k] += L[k]; }
  for (const [k, n] of Object.entries(L.drops)) { const v = Math.floor(n * (keep < 1 ? 0.5 : 1)); if (v) S.loot[k] = (S.loot[k] || 0) + v; L.drops[k] = v; }
  if (keep < 1) L.items = L.items.slice(0, Math.floor(L.items.length / 2));
  for (const def of L.items) addItem(def, true);
  let restored = 0;
  if (result === 'cleared' && !EXP.boss) {
    const b = bonuses();
    restored = +(5 * (1 + (b.restore || 0))).toFixed(1);
    reg.exps++;
    S.counters.expeditions++;
    addRestore(EXP.region, restored);
  } else if (result === 'cleared' && EXP.boss) {
    restored = 10; addRestore(EXP.region, restored);
  }
  L.restored = restored;
  S.counters.battles++;
  S.pendingExp = null;
  checkUnlocks();
  commit();
}
export function closeExpedition() { EXP = null; }

// ───────────────────────── 장비 · 마법 관리 ─────────────────────────
export function equip(uidv) {
  const it = S.items.find((i) => i.uid === uidv);
  const d = itemDef(S, it);
  if (!d) return;
  S.player.equip[d.slot] = uidv;
  commit();
}
export function unequip(slot) {
  if (slot === 'relic' && itemDef(S, S.items.find((i) => i.uid === S.player.equip.relic))?.bound) return toast('물음등은 떼어 놓을 수 없다. 그것은 네 불씨를 지키고 있다.', 'warn');
  S.player.equip[slot] = null; commit();
}
export function sellItem(uidv) {
  const it = S.items.find((i) => i.uid === uidv);
  const d = itemDef(S, it);
  if (!d || d.bound) return;
  if (Object.values(S.player.equip).includes(uidv)) return toast('장착 중인 아이템은 팔 수 없습니다.', 'warn');
  const price = Math.round(30 * RARITY[d.rarity].mult * (1 + (d.ilvl || 1) / 5));
  S.items = S.items.filter((i) => i !== it);
  S.res.gold += price;
  toast(`「${d.name}」 판매 +${price} 골드`);
  commit();
}
export function spellUpgradeCost(id) {
  const sp = spellDef(S, id); const lv = S.spells[id] || 1;
  const m = RARITY[sp.rarity].mult * (1 - Math.min(0.2, (S.school.fac.lab || 0) * 0.04));
  return { light: Math.round(15 * lv * m), research: Math.round(6 * lv * m), mana: Math.round(10 * lv * m) };
}
export function upgradeSpell(id) {
  const lv = S.spells[id];
  if (!lv || lv >= 5) return;
  const c = spellUpgradeCost(id);
  if (S.res.light < c.light || S.res.research < c.research || S.res.mana < c.mana) return toast('강화 재료가 부족합니다.', 'warn');
  S.res.light -= c.light; S.res.research -= c.research; S.res.mana -= c.mana;
  S.spells[id] = lv + 1;
  toast(`「${spellDef(S, id).name}」 강화 → ${lv + 1}단계`, 'spell');
  checkUnlocks();
  commit();
}
export function setSpellSlot(kind, idx, id) {
  const arr = kind === 'field' ? S.player.fieldSlots : S.player.spellSlots;
  const other = arr.indexOf(id);
  if (id && other >= 0) arr[other] = arr[idx];
  arr[idx] = id;
  commit();
}
export const researchCost = () => ({ research: 40 + S.genSpells.length * 15, mana: 40 + S.genSpells.length * 10 });
export function researchSpell(aiDef = null) {
  if (!S.school.fac.lab) return toast('연구실을 먼저 건설해야 합니다.', 'warn');
  const c = researchCost();
  if (S.res.research < c.research || S.res.mana < c.mana) return toast('연구 점수 또는 마나가 부족합니다.', 'warn');
  const def = aiDef || genSpell(S, { level: S.player.level + S.school.fac.lab * 2 });
  if (!def) return toast('새로운 아이디어가 떠오르지 않았다. 다시 시도해 보자.', 'warn');
  S.res.research -= c.research; S.res.mana -= c.mana;
  S.genSpells.push(def);
  learnSpell(def.id);
  commit();
  return def;
}
export const forgeCost = () => ({ gold: 200 + S.counters.forged * 20, wood: 6, stone: 6, crystal: 2, light: 20 });
export function forgeItem(slot, aiDef = null) {
  const lv = S.school.fac.lampworks || 0;
  if (!lv) return toast('등불 공방을 먼저 건설해야 합니다.', 'warn');
  const c = forgeCost();
  for (const [k, v] of Object.entries(c)) if (S.res[k] < v) return toast('제작 재료가 부족합니다.', 'warn');
  const def = aiDef || genItem(S, { level: S.player.level + lv, slot, rareBonus: lv * 0.08 + (bonuses().rare || 0) * 0.2 });
  if (!def) return toast('제작에 실패했다. 재료는 소모되지 않았다.', 'warn');
  for (const [k, v] of Object.entries(c)) S.res[k] -= v;
  S.counters.forged++;
  if (aiDef) S.counters.aiForged++;
  const it = addItem(def);
  checkUnlocks();
  commit();
  return it;
}
export function buyItem(id) {
  const d = ITEMS.find((x) => x.id === id);
  if (!d?.shop) return;
  if (S.res.gold < d.shop.gold) return toast('골드가 부족합니다.', 'warn');
  S.res.gold -= d.shop.gold;
  addItem(id); checkUnlocks(); commit();
}
export function craftItem(id) {
  const d = ITEMS.find((x) => x.id === id);
  if (!d?.craft) return;
  if (!(S.school.fac.lampworks >= 2)) return toast('등불 공방 2단계가 필요합니다.', 'warn');
  for (const [k, v] of Object.entries(d.craft)) if (S.res[k] < v) return toast('재료가 부족합니다.', 'warn');
  for (const [k, v] of Object.entries(d.craft)) S.res[k] -= v;
  addItem(id); commit();
}
export function useLoot(k) {
  const L = LOOT[k];
  if (!L?.use || !(S.loot[k] > 0)) return;
  S.loot[k]--;
  giveRes(L.use);
  toast(`${L.name} 사용`);
  commit();
}
export function allocStat(k) {
  if (S.player.statPts <= 0) return;
  S.player.statPts--; S.player.base[k]++;
  commit();
}
export function setTraitSlot(id, on) {
  const ts = S.player.traitSlots;
  if (on) { if (ts.length >= traitSlotsMax()) return toast(`특성은 최대 ${traitSlotsMax()}개까지 장착할 수 있습니다. (8레벨마다 +1)`, 'warn'); if (!ts.includes(id)) ts.push(id); }
  else S.player.traitSlots = ts.filter((t) => t !== id);
  commit();
}

// ───────────────────────── 학교 경영 ─────────────────────────
export const facTotal = () => Object.values(S.school.fac).reduce((a, b) => a + b, 0);
export function schoolStage() {
  const t = facTotal();
  let st = SCHOOL_STAGES[0];
  for (const s of SCHOOL_STAGES) if (t >= s.need && (!s.ending || S.story.done.includes(10))) st = s;
  return st;
}
export const capacity = () => 4 + (S.school.fac.dorm || 0) * 4;
export function education() {
  let e = 20 + (S.school.fac.classroom || 0) * 6 + (S.school.fac.library || 0) * 2;
  for (const st of S.school.staff) if (st.role === 'teacher') e += st.skill * 4 * (st.unpaid ? 0.5 : 1);
  return Math.round(e);
}
export function satisfaction() {
  const f = S.school.fac;
  let s = 40 + (f.garden || 0) * 6 + (f.dining || 0) * 5 + (f.dorm || 0) * 2 + (f.hall || 0) * 2 + (bonuses().satisfaction || 0);
  for (const st of S.school.staff) if (st.role === 'caretaker' || st.role === 'cook') s += st.skill * 2 * (st.unpaid ? 0.5 : 1);
  const over = S.school.students.length - capacity();
  if (over > 0) s -= over * 8;
  return clamp(Math.round(s), 0, 100);
}
export function production() { // 시간당
  const f = S.school.fac, b = bonuses();
  let research = (f.library || 0) * 1 + (f.lab || 0) * 2, mana = 0.5 + (f.greenhouse || 0) * 3, wood = 0.5 + (f.garden || 0) * 1,
    stone = 0.5 + (f.archive || 0) * 1, crystal = 0.05 + (f.startower || 0) * 0.5;
  for (const st of S.school.staff) {
    const e = st.unpaid ? 0.5 : 1;
    if (st.role === 'researcher') research += st.skill * 1.5 * e;
    if (st.role === 'gardener') { wood += st.skill * 0.5 * e; mana += st.skill * e; }
  }
  research *= 1 + (b.research || 0);
  const sat = satisfaction();
  const tuition = S.school.students.reduce((a, s) => a + 4 + s.year, 0) * (0.4 + sat / 100) * (1 + (b.tuition || 0));
  const salary = S.school.staff.reduce((a, s) => a + s.salary, 0);
  const rep = 0.2 + (f.hall || 0) * 2 + S.school.students.length * 0.1;
  return { research, mana, wood, stone, crystal, tuition, salary, rep, stamina: 2 };
}
/** 실제 경과 시간만큼 학교를 운영한다 (최대 48시간 소급). 하락 패널티는 없다. */
export function schoolTick(now = Date.now()) {
  const sc = S.school;
  let dtH = (now - sc.lastTick) / 3600000;
  if (dtH <= 0) { sc.lastTick = now; return; }
  dtH = Math.min(dtH, 48);
  sc.lastTick = now;
  const p = production();
  S.res.research += p.research * dtH; S.res.mana += p.mana * dtH; S.res.wood += p.wood * dtH;
  S.res.stone += p.stone * dtH; S.res.crystal += p.crystal * dtH;
  S.res.gold += p.tuition * dtH;
  S.res.stamina = Math.min(maxStamina(), S.res.stamina + p.stamina * dtH);
  sc.rep += p.rep * dtH;
  // 급여: 부족하면 그 시간 동안 교직원 효율 절반 (해고나 손실은 없음)
  const pay = p.salary * dtH;
  const unpaid = S.res.gold < pay;
  S.res.gold = Math.max(0, S.res.gold - pay);
  for (const st of sc.staff) st.unpaid = unpaid;
  // 학생 성장 · 졸업
  const edu = education();
  for (const s of [...sc.students]) {
    s.xp += dtH * edu / 20 * (0.6 + s.aptitude * 0.15);
    while (s.xp >= 100) {
      s.xp -= 100; s.year++;
      if (s.year > 4) {
        sc.students = sc.students.filter((x) => x !== s);
        sc.graduates++;
        sc.rep += 5 + s.aptitude * 2;
        S.res.gold += 50 * s.aptitude;
        schoolLog(`${s.name} 졸업! 명성 +${5 + s.aptitude * 2}, 감사 선물 ${50 * s.aptitude} 골드`);
        break;
      }
    }
  }
  // 입학 지원자
  sc.appClock += dtH * (0.25 + sc.rep / 400) * (0.5 + satisfaction() / 100);
  while (sc.appClock >= 1) {
    sc.appClock -= 1;
    if (sc.applicants.length < 4) sc.applicants.push(genStudent(uid('ap')));
  }
  // 교직원 후보 (하루 1회 갱신)
  const today = dayKey(now);
  if (sc.candRefresh !== today) {
    sc.candRefresh = today;
    sc.candidates = [0, 1, 2].map((i) => genStaff(`${today}:${i}:${S.id}`, sc.rep));
  }
}
function schoolLog(t) {
  S.school.log.unshift({ t: Date.now(), text: t });
  if (S.school.log.length > 30) S.school.log.length = 30;
}
export function buildCost(fid) {
  const lv = (S.school.fac[fid] || 0) + 1;
  const c = facilityCost(fid, lv);
  const disc = 1 - (bonuses().buildCost || 0);
  for (const k of Object.keys(c)) c[k] = Math.round(c[k] * disc);
  return c;
}
export function build(fid) {
  const lv = S.school.fac[fid] || 0;
  if (lv >= FAC_MAX) return;
  const c = buildCost(fid);
  for (const [k, v] of Object.entries(c)) if (S.res[k] < v) return toast(`재료가 부족합니다 (${k === 'gold' ? '골드' : k === 'wood' ? '목재' : k === 'stone' ? '석재' : k === 'crystal' ? '수정' : '지식의 빛'})`, 'warn');
  for (const [k, v] of Object.entries(c)) S.res[k] -= v;
  const before = schoolStage().n;
  S.school.fac[fid] = lv + 1;
  S.counters.builds = (S.counters.builds || 0) + 1;
  const name = FACILITIES.find((f) => f.id === fid).name;
  toast(lv === 0 ? `${name} 건설 완료!` : `${name} ${lv + 1}단계로 확장!`, 'level');
  schoolLog(lv === 0 ? `${name} 건설` : `${name} ${lv + 1}단계 확장`);
  const after = schoolStage();
  if (after.n > before) toast(`학당 발전 단계 상승: 「${after.name}」`, 'level');
  checkUnlocks();
  commit();
  emit('build', fid);
}
export function admit(id) {
  const sc = S.school;
  const a = sc.applicants.find((x) => x.id === id);
  if (!a) return;
  if (sc.students.length >= capacity()) return toast('기숙사 정원이 가득 찼습니다. 기숙사를 확장하세요.', 'warn');
  sc.applicants = sc.applicants.filter((x) => x !== a);
  sc.students.push(a);
  schoolLog(`${a.name} 입학 (${a.personality}, ${a.talent})`);
  checkUnlocks(); commit();
}
export function reject(id) { S.school.applicants = S.school.applicants.filter((x) => x.id !== id); commit(); }
export const staffCap = () => 1 + Math.floor(facTotal() / 5);
export function hire(id) {
  const sc = S.school;
  const c = sc.candidates.find((x) => x.id === id);
  if (!c) return;
  if (sc.staff.length >= staffCap()) return toast(`교직원은 최대 ${staffCap()}명까지 채용할 수 있습니다. (시설 레벨 합계 5마다 +1)`, 'warn');
  if (S.res.gold < c.hireCost) return toast('채용 비용(골드)이 부족합니다.', 'warn');
  S.res.gold -= c.hireCost;
  sc.candidates = sc.candidates.filter((x) => x !== c);
  sc.staff.push(c);
  schoolLog(`${STAFF_ROLES[c.role].name} ${c.name} 채용`);
  commit();
}
export function dismiss(id) {
  const st = S.school.staff.find((x) => x.id === id);
  if (!st) return;
  S.school.staff = S.school.staff.filter((x) => x !== st);
  schoolLog(`${st.name} 퇴직`);
  commit();
}

// ───────────────────────── 퀘스트 ─────────────────────────
function counterOf(type) {
  switch (type) {
    case 'study': return totalMin();
    case 'expedition': return S.counters.expeditions;
    case 'kills': return S.counters.kills;
    case 'donate': return S.counters.donated || 0;
    case 'talk': return S.counters.talks || 0;
    case 'build': return S.counters.builds || 0;
    case 'cast': return S.counters.castCount;
    default: return 0;
  }
}
const QDESC = { study: (n) => `공부 ${n}분`, expedition: (n) => `탐험 ${n}회 완료`, kills: (n) => `굳은 물음 ${n}체 정화`, donate: (n) => `지식의 빛 ${n} 봉헌`, talk: (n) => `학당 인물과 ${n}번 대화`, build: () => '시설 1회 건설/확장', cast: (n) => `전투에서 마법 ${n}회 사용` };
export function ensureQuests() {
  const today = dayKey(), wk = weekKey();
  if (!S.quests.daily || S.quests.daily.date !== today) {
    const r = rng(`${S.id}:${today}`);
    const pool = ['study', 'study', 'kills', 'cast', 'donate', 'talk'];
    if (S.unlockedRegions.length > 1) pool.push('expedition', 'expedition');
    if (facTotal() < 60) pool.push('build');
    const picks = [];
    while (picks.length < 3) { const t = r.pick(pool); if (!picks.includes(t)) picks.push(t); }
    const nOf = { study: r.pick([30, 45, 60]), expedition: r.int(1, 2), kills: r.int(4, 8), donate: r.pick([15, 20, 30]), talk: 2, build: 1, cast: r.int(5, 10) };
    S.quests.daily = { date: today, list: picks.map((t) => ({ type: t, n: nOf[t], base: counterOf(t), claimed: false })) };
  }
  if (!S.quests.weekly || S.quests.weekly.week !== wk) {
    S.quests.weekly = { week: wk, list: [{ type: 'study', n: 300, base: counterOf('study'), claimed: false }, { type: 'expedition', n: 5, base: counterOf('expedition'), claimed: false }] };
  }
}
export function questView(q) {
  const cur = Math.max(0, counterOf(q.type) - q.base);
  return { text: QDESC[q.type](q.n), cur: Math.min(cur, q.n), n: q.n, done: cur >= q.n, claimed: q.claimed };
}
export function claimQuest(kind, i) {
  const q = (kind === 'daily' ? S.quests.daily : S.quests.weekly).list[i];
  if (!q || q.claimed || !questView(q).done) return;
  q.claimed = true;
  const lv = S.player.level;
  const r = kind === 'daily' ? { gold: 80 + lv * 10, light: 10 + lv, crystal: 1 } : { gold: 400 + lv * 40, light: 60 + lv * 4, crystal: 5 };
  giveRes(r);
  addXp(kind === 'daily' ? 60 + lv * 10 : 300 + lv * 40);
  toast(`퀘스트 보상: 골드 +${r.gold}, 빛 +${r.light}, 수정 +${r.crystal}`, 'level');
  commit();
}
export function sideQuestState(q) {
  if (S.quests.side[q.id] === 'done') return { state: 'done' };
  if (S.story.ch < q.from) return { state: 'locked' };
  const checks = [];
  if (q.need) for (const [k, v] of Object.entries(q.need)) checks.push({ t: `${k === 'wood' ? '목재' : '석재'} ${Math.floor(S.res[k])}/${v}`, ok: S.res[k] >= v });
  if (q.needKills) { const v = S.quests.kills - (S.quests.side[q.id + ':k'] ?? S.quests.kills); checks.push({ t: `정화 ${Math.max(0, v)}/${q.needKills}`, ok: v >= q.needKills }); }
  if (q.needItem) { const v = S.loot[q.needItem.id] || 0; checks.push({ t: `낡은 책 ${v}/${q.needItem.n}`, ok: v >= q.needItem.n }); }
  if (q.needLevel) checks.push({ t: `레벨 ${S.player.level}/${q.needLevel}`, ok: S.player.level >= q.needLevel });
  if (q.needFac) for (const [k, v] of Object.entries(q.needFac)) checks.push({ t: `${FACILITIES.find((f) => f.id === k).name} ${S.school.fac[k]}/${v}`, ok: S.school.fac[k] >= v });
  if (q.needStudents) checks.push({ t: `재학생 ${S.school.students.length}/${q.needStudents}`, ok: S.school.students.length >= q.needStudents });
  if (q.needRestore) for (const [k, v] of Object.entries(q.needRestore)) checks.push({ t: `${region(k).name} ${Math.floor(S.regions[k].restore)}/${v}%`, ok: S.regions[k].restore >= v });
  return { state: S.quests.side[q.id] === 'active' ? 'active' : 'available', checks, ok: checks.every((c) => c.ok) };
}
export function acceptSide(id) {
  S.quests.side[id] = 'active';
  S.quests.side[id + ':k'] = S.quests.kills;
  commit();
}
export function completeSide(id) {
  const q = SIDE_QUESTS.find((x) => x.id === id);
  const st = sideQuestState(q);
  if (st.state !== 'active' || !st.ok) return null;
  if (q.need) for (const [k, v] of Object.entries(q.need)) S.res[k] -= v;
  if (q.needItem) S.loot[q.needItem.id] -= q.needItem.n;
  S.quests.side[id] = 'done';
  const r = q.reward;
  if (r.xp) addXp(r.xp);
  giveRes({ gold: r.gold || 0, light: r.light || 0, research: r.research || 0 });
  if (r.item) addItem(r.item);
  if (r.outfit && !S.outfits.includes(r.outfit)) { S.outfits.push(r.outfit); toast(`의상 획득: 「${OUTFITS.find((o) => o.id === r.outfit).name}」`, 'item'); }
  checkUnlocks();
  commit();
  return q;
}

/** 첫 시작 · 불러오기 이후 공통 초기화 */
export function bootstrap() {
  if (!S.items.length) { const it = addItem('it_twig', true); S.player.equip.staff = it.uid; }
  learnLevelSpells();
  ensureQuests();
  schoolTick();
  checkUnlocks();
}
