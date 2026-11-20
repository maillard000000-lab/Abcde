// STUDYVERSE 게임 로직 단위 테스트 (브라우저 없이 실행 가능한 모듈만)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { genItem, genSpell, sanitizeAiItem, sanitizeAiSpell } from '../public/studyverse/js/gen.js';
import { story } from '../public/studyverse/js/story.js';
import { SPELLS, ITEMS, OUTFITS, TRAITS, FACILITIES, REGIONS, MONSTERS, BOSSES } from '../public/studyverse/js/content.js';

const fresh = () => ({ items: [], genSpells: [] });

test('스토리 팩이 해독되고 모든 장이 이어진다', () => {
  const s = story();
  assert.ok(s.chapters.length >= 10);
  s.chapters.forEach((c, i) => assert.equal(c.id, i));
  for (const c of s.chapters) {
    for (const o of c.objectives) if (o.region) assert.ok(REGIONS.some((r) => r.id === o.region), o.region);
    if (c.reward.spell) assert.ok(SPELLS.some((x) => x.id === c.reward.spell));
    if (c.reward.item) assert.ok(ITEMS.some((x) => x.id === c.reward.item));
    if (c.reward.outfit) assert.ok(OUTFITS.some((x) => x.id === c.reward.outfit));
    for (const l of [...c.intro, ...c.outro]) if (Array.isArray(l)) assert.ok(s.speakers[l[0]], `speaker ${l[0]}`);
  }
});

test('콘텐츠 ID는 모두 고유하다', () => {
  for (const list of [SPELLS, ITEMS, OUTFITS, TRAITS, FACILITIES, REGIONS]) {
    const ids = list.map((x) => x.id);
    assert.equal(new Set(ids).size, ids.length);
  }
  for (const r of REGIONS) for (const m of r.mobs || []) assert.ok(MONSTERS[m], m);
  for (const r of REGIONS) if (r.boss) assert.ok(BOSSES[r.boss], r.boss);
});

test('생성 장비는 고유 ID와 서명을 가지며 중복되지 않는다', () => {
  const st = fresh();
  for (let i = 0; i < 40; i++) {
    const d = genItem(st, { level: 10, seed: `s${i}` });
    if (d) st.items.push({ uid: d.id, def: d });
  }
  const sigs = st.items.map((i) => i.def.sig);
  assert.equal(new Set(sigs).size, sigs.length);
  // 같은 시드로 다시 만들면 중복 방지로 다른 결과이거나 null
  const again = genItem(st, { level: 10, seed: 's0' });
  if (again) assert.ok(!sigs.includes(again.sig));
});

test('AI 결과는 게임 규칙 범위로 제한된다', () => {
  const st = fresh();
  const d = sanitizeAiItem(st, { name: '과한 반지', slot: 'ring', rarity: 'legend', stats: { int: 999, wil: 999 }, effect: { type: 'xp', value: 5 }, color: 'red' }, 5);
  assert.equal(d.rarity, 'rare'); // 전설 등급 금지
  const total = Object.values(d.stats).reduce((a, b) => a + b, 0);
  assert.ok(total <= 30, `total ${total}`);
  assert.ok(d.effect.xp <= 0.08);
  assert.equal(d.look.col, '#c9a6ff');
  const sp = sanitizeAiSpell(st, { name: '테스트 마법', kind: 'nuke', rarity: 'epic', element: 'x', visual: 'y' }, 5);
  assert.equal(sp.kind, 'dmg');
  assert.ok(sp.power > 0 && sp.mp > 0);
  assert.equal(sanitizeAiSpell(st, { name: SPELLS[0].name }, 5), null); // 기존 이름 중복 거부
});

test('연구 마법 생성', () => {
  const st = fresh();
  const s = genSpell(st, { level: 5, seed: 'x' });
  assert.ok(s && s.name && s.kind);
});
