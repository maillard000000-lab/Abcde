// 절차적 콘텐츠 생성기 — 장비, 마법, 학생, 교직원.
// 모든 생성물은 고유 ID를 받고, 동일한 서명(이름+능력치)이 이미 있으면 다시 만들지 않는다.
import { FORGE, RARITY, RARITY_KEYS, NAME_POOL, STAFF_ROLES, ITEMS, SPELLS } from './content.js';
import { rng, uid, clamp } from './util.js';

const STAT_KEYS = ['int', 'wil', 'foc', 'vit', 'ins'];

export function rollRarity(r, bonus = 0) {
  const x = r() * (1 - Math.min(0.6, bonus));
  if (x < 0.015) return 'legend';
  if (x < 0.07) return 'epic';
  if (x < 0.2) return 'rare';
  if (x < 0.48) return 'fine';
  return 'common';
}

/** 아이템 생성. level: 아이템 레벨(능력치 규모), region: 재료 출처 */
export function genItem(state, { level = 1, region = null, rarity = null, slot = null, seed = null, rareBonus = 0 } = {}) {
  const r = rng(seed ?? uid('seed'));
  for (let attempt = 0; attempt < 6; attempt++) {
    const bases = slot ? FORGE.bases.filter((b) => b.slot === slot) : FORGE.bases;
    const base = r.pick(bases.length ? bases : FORGE.bases);
    const mats = region ? FORGE.materials.filter((m) => m.region === region) : FORGE.materials;
    const mat = r.pick(mats.length ? mats : FORGE.materials);
    const rar = rarity || rollRarity(r, rareBonus);
    const rm = RARITY[rar].mult;
    const budget = Math.max(2, Math.round((3 + level * 0.9) * rm));
    const stats = {};
    let left = budget;
    const primary = r.pick(base.stat);
    stats[primary] = Math.ceil(left * 0.55); left -= stats[primary];
    while (left > 0) {
      const k = r.chance(0.5) ? r.pick(base.stat) : r.pick(STAT_KEYS);
      const add = Math.min(left, 1 + r.int(0, Math.ceil(left / 3)));
      stats[k] = (stats[k] || 0) + add; left -= add;
    }
    let name = `${mat.word} ${r.pick(base.nouns)}`;
    let effect = null, effText = '';
    if (RARITY[rar].order >= 1) {
      const p = r.pick(FORGE.prefixes);
      name = `${p.word} ${name}`;
      stats[p.stat] = (stats[p.stat] || 0) + Math.round(p.w * (1 + level / 8));
    }
    if (RARITY[rar].order >= 2) {
      const s = r.pick(FORGE.suffixes);
      name = `${s.word}의 ${name}`;
      effect = {};
      for (const [k, v] of Object.entries(s.effect)) effect[k] = k === 'stamina' ? v : +(v * (1 + (RARITY[rar].order - 2) * 0.5)).toFixed(3);
      effText = s.text;
    }
    const sig = name + JSON.stringify(stats);
    if (state.items.some((it) => it.def && it.def.sig === sig)) continue; // 중복 방지
    const def = {
      id: uid('gi'), gen: true, sig, slot: base.slot, name, rarity: rar, stats, effect,
      look: { kind: base.kind, col: mat.col, gem: r.pick(['#ffe08a', '#9fd8ff', '#ff8f8f', '#c9a6ff', '#8fe388']) },
      desc: `${mat.word}(으)로 만든 ${RARITY[rar].name} 등급 ${base.nouns[0]}.${effText ? ' ' + effText + '.' : ''}`,
      ilvl: level,
    };
    return def;
  }
  return null;
}

const SPELL_PARTS = {
  elements: [
    { w: '이슬', tag: 'life', col: '#9ff7e0', fx: 'leaf' }, { w: '잉크', tag: 'ink', col: '#6a7cff', fx: 'bolt' }, { w: '별빛', tag: 'star', col: '#b3c8ff', fx: 'beam' },
    { w: '메아리', tag: 'echo', col: '#c9a6ff', fx: 'ring' }, { w: '유리', tag: 'glass', col: '#ffd1a1', fx: 'rain' }, { w: '바람', tag: 'wind', col: '#e9f4ff', fx: 'wind' },
    { w: '등불', tag: 'light', col: '#ffe08a', fx: 'burst' }, { w: '밀물', tag: 'water', col: '#5fb7ff', fx: 'wave' },
  ],
  forms: {
    dmg: ['화살', '파동', '폭발', '창', '탄환'], dot: ['씨앗', '얼룩', '안개'], heal: ['노래', '숨결', '샘'],
    shield: ['장막', '방패', '결계'], drain: ['갈증', '소용돌이'], buff: ['영감', '각성'],
  },
};
/** 연구실 마법 연구 — 새 마법 정의 생성 */
export function genSpell(state, { level = 1, seed = null } = {}) {
  const r = rng(seed ?? uid('sp'));
  for (let attempt = 0; attempt < 8; attempt++) {
    const kind = r.pick(['dmg', 'dmg', 'dot', 'heal', 'shield', 'drain', 'buff']);
    const el = r.pick(SPELL_PARTS.elements);
    const form = r.pick(SPELL_PARTS.forms[kind]);
    const rar = rollRarity(r, 0.15);
    const name = `${el.w}의 ${form}`;
    if (state.genSpells.some((s) => s.name === name) || SPELLS.some((s) => s.name === name)) continue;
    const m = RARITY[rar].mult;
    const def = makeSpellDef({ name, kind, tag: el.tag, rarity: rar, col: el.col, fx: el.fx, level, m, r });
    def.lore = `연구실에서 새로 정리한 마법. ${el.w}의 성질을 ${form}의 형태로 엮었다.`;
    return def;
  }
  return null;
}
function makeSpellDef({ name, kind, tag, rarity, col, fx, level, m, r }) {
  const scale = (1 + level * 0.06) * m;
  const def = { id: uid('gs'), gen: true, name, rarity, kind, tags: [tag], col, fx, unlock: { research: true } };
  if (kind === 'dmg') { def.power = Math.round(18 * scale); def.mp = Math.round(6 + def.power / 5); }
  if (kind === 'dot') { def.power = Math.round(7 * scale); def.turns = 3; def.mp = Math.round(8 + def.power / 2); }
  if (kind === 'heal') { def.power = Math.round(22 * scale); def.mp = Math.round(8 + def.power / 5); }
  if (kind === 'shield') { def.power = Math.round(24 * scale); def.mp = Math.round(8 + def.power / 6); }
  if (kind === 'drain') { def.power = Math.round(14 * scale); def.mp = Math.round(9 + def.power / 5); }
  if (kind === 'buff') { def.power = +clamp(0.2 + 0.05 * RARITY[rarity].order, 0.2, 0.5).toFixed(2); def.mp = 8; }
  if (r && kind === 'dmg' && r.chance(0.35)) def.combo = { after: r.pick(['ink', 'star', 'light', 'echo', 'life']), bonus: 0.3 };
  return def;
}

/** AI가 만든 결과를 게임 규칙 안으로 정리한다 (능력치 상한, 허용 값만 통과) */
export function sanitizeAiItem(state, raw, level) {
  if (!raw || typeof raw !== 'object') return null;
  const slot = Object.keys({ staff: 1, weapon: 1, tome: 1, ring: 1, neck: 1, charm: 1, tool: 1, relic: 0 }).includes(raw.slot) ? raw.slot : 'charm';
  const rarity = RARITY_KEYS.includes(raw.rarity) && raw.rarity !== 'legend' ? raw.rarity : 'rare';
  const budget = Math.max(2, Math.round((3 + level * 0.9) * RARITY[rarity].mult)) + 2;
  const stats = {};
  let total = 0;
  for (const k of STAT_KEYS) {
    const v = clamp(Math.round(Number(raw.stats?.[k]) || 0), 0, budget);
    if (v && total + v <= budget) { stats[k] = v; total += v; }
  }
  if (!total) stats.int = Math.ceil(budget / 2);
  const name = String(raw.name || '').slice(0, 24).trim() || '이름 없는 유물';
  if (state.items.some((it) => it.def && it.def.name === name)) return null;
  const okFx = ['loot', 'restore', 'xp', 'light', 'research', 'crit'];
  let effect = null;
  if (raw.effect && okFx.includes(raw.effect.type)) effect = { [raw.effect.type]: clamp(Number(raw.effect.value) || 0.03, 0.01, 0.08) };
  const kind = { staff: 'staff', weapon: 'sword', tome: 'book', ring: 'ring', neck: 'neck', charm: 'charm', tool: 'tool' }[slot];
  const col = /^#[0-9a-f]{6}$/i.test(raw.color || '') ? raw.color : '#c9a6ff';
  return {
    id: uid('ai'), gen: true, ai: true, sig: name, slot, name, rarity, stats, effect,
    look: { kind, col, gem: '#ffffff' },
    desc: String(raw.description || '').slice(0, 160), lore: String(raw.lore || '').slice(0, 200), ilvl: level,
  };
}
export function sanitizeAiSpell(state, raw, level) {
  if (!raw || typeof raw !== 'object') return null;
  const kinds = ['dmg', 'dot', 'heal', 'shield', 'drain', 'buff'];
  const kind = kinds.includes(raw.kind) ? raw.kind : 'dmg';
  const rarity = ['common', 'fine', 'rare', 'epic'].includes(raw.rarity) ? raw.rarity : 'rare';
  const name = String(raw.name || '').slice(0, 20).trim();
  if (!name || state.genSpells.some((s) => s.name === name) || SPELLS.some((s) => s.name === name)) return null;
  const tags = ['life', 'ink', 'star', 'echo', 'glass', 'wind', 'light', 'water', 'fire', 'mind', 'ward'];
  const tag = tags.includes(raw.element) ? raw.element : 'light';
  const fxs = ['bolt', 'beam', 'burst', 'ring', 'rain', 'wave', 'leaf', 'sparkle', 'wind'];
  const def = makeSpellDef({ name, kind, tag, rarity, col: /^#[0-9a-f]{6}$/i.test(raw.color || '') ? raw.color : '#ffe08a', fx: fxs.includes(raw.visual) ? raw.visual : 'burst', level, m: RARITY[rarity].mult, r: null });
  def.ai = true;
  def.lore = String(raw.lore || '').slice(0, 220);
  def.look = String(raw.appearance || '').slice(0, 140);
  return def;
}

// ── 학생 · 교직원 ──
function personName(r) { return `${r.pick(NAME_POOL.given)} ${r.pick(NAME_POOL.family)}`; }
const HAIRS = ['#2a1a10', '#5a3a1a', '#c08a4a', '#e8d090', '#a03a2a', '#1a1a2a', '#d0d0d0', '#6a3a8a', '#3a6a8a'];
const SKINS = ['#ffd8b8', '#f0c8a0', '#d8a078', '#b07850', '#8a5a3a'];
export function genStudent(seedKey) {
  const r = rng(seedKey);
  return {
    id: uid('st'), name: personName(r), personality: r.pick(NAME_POOL.personality), talent: r.pick(NAME_POOL.talent), quirk: r.pick(NAME_POOL.quirk),
    aptitude: r.int(1, 5), year: 1, xp: 0, look: { hair: r.pick(HAIRS), skin: r.pick(SKINS) },
  };
}
export function genStaff(seedKey, rep = 0) {
  const r = rng(seedKey);
  const role = r.pick(Object.keys(STAFF_ROLES));
  const skill = clamp(r.int(1, 3) + (r.chance(Math.min(0.6, rep / 300)) ? 1 : 0) + (r.chance(Math.min(0.3, rep / 800)) ? 1 : 0), 1, 5);
  return {
    id: uid('sf'), name: personName(r), role, skill, salary: 4 + skill * 3 + r.int(0, 3), personality: r.pick(NAME_POOL.personality),
    line: r.pick(NAME_POOL.staffLine), hireCost: 100 + skill * 120, look: { hair: r.pick(HAIRS), skin: r.pick(SKINS) },
  };
}

export function itemDef(state, it) {
  if (!it) return null;
  if (it.def) return it.def;
  return ITEMS.find((x) => x.id === it.ref) || null;
}
export function spellDef(state, id) {
  return SPELLS.find((s) => s.id === id) || state.genSpells.find((s) => s.id === id) || null;
}
