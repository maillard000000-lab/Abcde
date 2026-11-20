// UI 패널 — 모든 메뉴와 버튼은 실제 게임 시스템과 연결된다.
import * as G from './game.js';
import {
  SPELLS, ITEMS, OUTFITS, TRAITS, FACILITIES, FAC_MAX, SCHOOL_STAGES, REGIONS, MONSTERS, BOSSES, NPCS, SLOTS, RARITY, STATS,
  STAFF_ROLES, SIDE_QUESTS, LOOT, SCHOOL_NAME,
} from './content.js';
import { itemDef, spellDef, sanitizeAiItem, sanitizeAiSpell } from './gen.js';
import { story, chapter } from './story.js';
import { h, $, fmt, fmtDur, fmtMin, dayKey, clamp, beep } from './util.js';
import { itemIcon, resIcon, canvas, drawChar, drawMonster, charOpts, npcOpts } from './pixel.js';
import { exportSave, importSave, wipe, save } from './state.js';
import { WEATHER_NAME } from './scene.js';

export const ui = { view: 'home', sub: {}, previews: [], focusFac: null, selRegion: null, selItem: null };
let hooks = {};
export function setHooks(x) { hooks = x; }
const S = () => G.S;
const snd = (k) => beep(k, S().settings.sound);

// ───────────────────────── 공용 위젯 ─────────────────────────
const RES_NAME = { gold: '골드', light: '지식의 빛', mana: '마나', wood: '목재', stone: '석재', crystal: '수정', research: '연구', stamina: '탐험력' };
const RES_ICON = { gold: 'coin', light: 'light', mana: 'mana', wood: 'wood', stone: 'stone', crystal: 'crystal', research: 'research', stamina: 'stamina' };
export function resChip(k, v, need = null) {
  const lack = need != null && S().res[k] < need;
  return h('span.chip' + (lack ? '.lack' : ''), { title: RES_NAME[k] }, h('img.ico', { src: resIcon(RES_ICON[k]), alt: '' }), need != null ? fmt(need) : fmt(v));
}
const costRow = (c) => h('span.cost', Object.entries(c).filter(([, v]) => v > 0).map(([k, v]) => resChip(k, null, v)));
const bar = (cur, max, cls = '') => h('div.bar' + cls, h('i', { style: { width: `${clamp(cur / Math.max(1, max), 0, 1) * 100}%` } }));
const btn = (label, onclick, cls = '', disabled = false) => h('button.btn' + cls, { onclick: (e) => { snd('click'); onclick(e); }, disabled }, label);
const tabs = (key, list, cur) => h('div.tabs', list.map(([id, label]) => h('button.tab' + (cur === id ? '.on' : ''), { onclick: () => { ui.sub[key] = id; snd('click'); render(); } }, label)));
const rarityTag = (r) => h('span.rar', { style: { color: RARITY[r].color } }, RARITY[r].name);
function section(title, ...kids) { return h('section.card', h('h3', title), ...kids); }

/** 미리보기 캔버스: 매 프레임 그리는 작은 픽셀 캔버스 */
function preview(w, h_, draw) {
  const [c, ctx] = canvas(w, h_);
  c.className = 'pix';
  ui.previews.push({ c, ctx, draw });
  return c;
}

// ───────────────────────── 대화 (스토리 · NPC) ─────────────────────────
export function playDialogue(lines, { speakersOverride = null } = {}) {
  return new Promise((resolve) => {
    const st = story();
    const sp = { ...st.speakers, ...(speakersOverride || {}) };
    const flat = [];
    for (const l of lines) {
      if (Array.isArray(l)) flat.push(l);
      else if (l.if) { if (S().story.flags[l.if]) flat.push(...l.lines); }
      else if (l.choice) flat.push(l);
    }
    const root = $('#dialog');
    root.innerHTML = '';
    root.classList.add('show');
    const box = h('div.dbox');
    const portraitWrap = h('div.dport');
    const name = h('div.dname');
    const text = h('div.dtext');
    const choices = h('div.dchoices');
    const next = h('div.dnext', '▼');
    const skip = h('button.dskip', { onclick: (e) => { e.stopPropagation(); finish(null); } }, '건너뛰기');
    box.append(portraitWrap, h('div.dbody', name, text, choices, next), skip);
    root.append(box);
    let i = -1, typing = null, full = '';
    const sub = (s) => s.replaceAll('{name}', S().player.name);
    let chosen = null;
    function finish(c) { root.classList.remove('show'); root.innerHTML = ''; root.onclick = null; clearInterval(typing); resolve(c ?? chosen); }
    function show() {
      i++;
      if (i >= flat.length) return finish(chosen);
      const l = flat[i];
      choices.innerHTML = '';
      if (l.choice) {
        next.style.visibility = 'hidden';
        text.textContent = '';
        name.textContent = '';
        for (const c of l.choice) choices.append(h('button.btn', { onclick: (e) => { e.stopPropagation(); chosen = c.set; snd('ok'); show(); } }, sub(c.t)));
        return;
      }
      const [who, line] = l;
      next.style.visibility = 'visible';
      name.textContent = sub(sp[who]?.name ?? who);
      box.dataset.who = who;
      portraitWrap.innerHTML = '';
      if (who !== 'narr') portraitWrap.append(hooks.portraitFor(who));
      box.classList.toggle('narr', who === 'narr');
      full = sub(line);
      text.textContent = '';
      let k = 0;
      clearInterval(typing);
      typing = setInterval(() => { k += 2; text.textContent = full.slice(0, k); if (k >= full.length) { clearInterval(typing); typing = null; } }, 18);
    }
    root.onclick = () => {
      if (flat[i]?.choice) return;
      if (typing) { clearInterval(typing); typing = null; text.textContent = full; return; }
      snd('click');
      show();
    };
    show();
  });
}

export async function runStoryStep() {
  const st = G.storyStatus();
  if (st.phase === 'intro') {
    await playDialogue(st.c.intro);
    G.beginChapter();
    if (G.S.story.phase === 'active') G.toast(`「${st.c.title}」 시작 — 퀘스트 메뉴에서 목표를 확인하세요.`, 'story');
  } else if (st.phase === 'ready') {
    const flag = await playDialogue(st.c.outro);
    G.completeChapter(flag || undefined);
    G.toast(`「${st.c.title}」 완료!`, 'level');
    const n = G.storyStatus();
    if (n.phase === 'intro') setTimeout(() => G.toast('다음 이야기가 준비되었습니다. 스토리 메뉴에서 이어 보세요.', 'story'), 800);
  }
  render();
}

// ───────────────────────── 화면 렌더 ─────────────────────────
export function render() {
  const panel = $('#panel');
  ui.previews = [];
  const views = { home: vHome, study: vStudy, char: vChar, spells: vSpells, inv: vInv, quests: vQuests, school: vSchool, map: vMap, codex: vCodex, story: vStory, settings: vSettings, explore: vExplore };
  const scrollTop = panel.scrollTop;
  const sameView = panel.dataset.view === ui.view;
  panel.innerHTML = '';
  panel.dataset.view = ui.view;
  panel.append((views[ui.view] || vHome)());
  if (sameView) panel.scrollTop = scrollTop;
  document.querySelectorAll('#menu button').forEach((b) => b.classList.toggle('on', b.dataset.view === ui.view));
  renderHud();
}

export function renderHud() {
  const s = S(), p = s.player;
  const need = G.xpNeed(p.level);
  $('#hud-name').textContent = `${p.name}`;
  $('#hud-title').textContent = `${p.title} · Lv.${p.level}`;
  $('#hud-xp').firstChild.style.width = `${(p.xp / need) * 100}%`;
  $('#hud-xp').title = `경험치 ${fmt(p.xp)} / ${fmt(need)}`;
  const res = $('#hud-res');
  res.innerHTML = '';
  for (const k of ['gold', 'light', 'mana', 'stamina']) res.append(resChip(k, s.res[k]));
  const more = h('span.more', ['wood', 'stone', 'crystal', 'research'].map((k) => resChip(k, s.res[k])));
  res.append(more);
  const st = G.storyStatus();
  $('#menu [data-view="story"]').classList.toggle('alert', st.phase === 'intro' || st.phase === 'ready');
  $('#menu [data-view="school"]').classList.toggle('alert', s.school.applicants.length > 0);
  const q = s.quests.daily?.list.some((x) => { const v = G.questView(x); return v.done && !v.claimed; });
  $('#menu [data-view="quests"]').classList.toggle('alert', !!q);
}

// ── 메인 (학당 둘러보기) ──
function storyCard() {
  const st = G.storyStatus();
  if (st.phase === 'end') return section('이야기', h('p', '본편은 완결되었습니다. 남은 지역의 빛을 되찾고, 학당을 세계 최고의 배움터로 키워 보세요.'));
  const c = st.c;
  const kids = [h('div.chap', c.title)];
  if (st.phase === 'wait') kids.push(h('p.dim', `레벨 ${c.level}이 되면 다음 이야기가 열립니다. (현재 Lv.${S().player.level})`), bar(S().player.level, c.level));
  if (st.phase === 'intro') kids.push(h('p', '새로운 이야기가 기다리고 있습니다.'), btn('▶ 이야기 시작', runStoryStep, '.primary'));
  if (st.phase === 'active' || st.phase === 'ready') {
    kids.push(h('ul.objs', st.objs.map((o) => h('li' + (o.done ? '.done' : ''), h('span', o.done ? '■ ' : '□ ', o.text), h('span.num', `${Math.min(o.cur, o.max)}/${o.max}`)))));
    if (st.phase === 'ready') kids.push(btn('▶ 장 마무리하기', runStoryStep, '.primary.glow'));
  }
  return section('현재 이야기', ...kids);
}
function vHome() {
  const s = S();
  const stg = G.schoolStage();
  const tm = G.todayMin();
  const near = hooks.near?.();
  return h('div',
    h('div.homehead', h('h2', s.story.done.includes(10) ? '새벽별 학당' : SCHOOL_NAME), h('p.dim', `「${stg.name}」 · ${WEATHER_NAME[hooks.weather()]} · ${new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}`)),
    near ? h('div.near', btn(near.type === 'npc' ? `💬 ${NPCS[near.id]?.name || near.id}와 대화 (E)` : `🚪 ${FACILITIES.find((f) => f.id === near.id).name} 들어가기 (E)`, () => hooks.interact(near), '.primary')) : null,
    storyCard(),
    section('오늘의 공부',
      h('div.row', h('b.big', fmtMin(tm)), h('span.dim', ` / 목표 ${fmtMin(s.study.goalMin)}`)), bar(tm, s.study.goalMin, '.gold'),
      h('p.dim', `연속 ${s.study.streak}일 · 누적 ${fmtMin(G.totalMin())}`),
      btn(s.study.active ? '⏱ 공부 중 — 타이머 보기' : '⏱ 공부 시작', () => go('study'), '.primary')),
    section('조작', h('p.dim', 'PC: 방향키/WASD 이동, Shift 달리기, E·Space 상호작용, 클릭으로 이동.'), h('p.dim', '모바일: 화면을 눌러 이동하고, 건물이나 인물을 누르면 다가가서 대화합니다.')),
  );
}

// ── 공부 타이머 ──
export const timerRefs = {};
function vStudy() {
  const s = S(), a = s.study.active;
  const running = G.isRunning();
  const label = h('input.inp', { placeholder: '무엇을 공부하나요? (선택)', maxlength: 40, value: a?.label || '' });
  const mode = ui.sub.mode || 'free';
  const time = h('div.timer', fmtDur(G.activeElapsed()));
  const phase = h('div.phase', '');
  timerRefs.time = time; timerRefs.phase = phase;
  const ctrl = h('div.ctrl');
  if (!a) {
    ctrl.append(
      h('div.seg', [['free', '자유 타이머'], ['pomo', `뽀모도로 ${s.study.pomodoro.focus}/${s.study.pomodoro.rest}`]].map(([id, l]) => h('button.tab' + (mode === id ? '.on' : ''), { onclick: () => { ui.sub.mode = id; render(); } }, l))),
      btn('▶ 공부 시작', () => { G.startStudy({ label: label.value, mode }); snd('ok'); render(); }, '.primary.big'),
    );
  } else {
    if (running) ctrl.append(btn('❚❚ 일시정지', () => { G.pauseStudy(); render(); }));
    else ctrl.append(btn('▶ 다시 시작', () => { G.resumeStudy(); render(); }, '.primary'));
    ctrl.append(btn('■ 공부 끝내기 (보상 받기)', () => finishFlow(), '.gold'));
    ctrl.append(btn('취소', async () => { if (await confirmBox('이번 세션을 기록하지 않고 취소할까요? 보상을 받을 수 없습니다.')) { G.cancelStudy(); render(); } }, '.ghost'));
  }
  // 최근 7일 그래프
  const days = [];
  for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const k = dayKey(d.getTime()); days.push({ k, m: Math.floor(s.study.days[k] || 0), lbl: '일월화수목금토'[d.getDay()] }); }
  const maxM = Math.max(s.study.goalMin, ...days.map((d) => d.m));
  return h('div',
    h('h2', '공부 타이머'),
    h('p.dim', '실제 시각을 기준으로 기록합니다. 탭을 닫거나 화면이 꺼져도 시간이 정확하게 계산됩니다.'),
    h('div.timerbox', time, phase, a ? h('div.dim', a.label || '자유 공부', a.mode === 'pomo' ? ' · 뽀모도로' : '') : label, ctrl),
    section('보상 안내',
      h('ul.dim.small',
        h('li', '1분마다 경험치 10 (보너스 적용), 2분마다 지식의 빛 1, 골드 2, 마나 1'),
        h('li', '2분마다 탐험력 1 회복, 10분마다 연구 점수 1'),
        h('li', `일일 목표(${s.study.goalMin}분) 달성 시 빛 30 · 골드 150 · 수정 2 추가`),
        h('li', `한 세션 최대 ${s.settings.sessionCapMin}분까지 인정 · 1분 미만은 기록되지 않음`))),
    section('최근 7일',
      h('div.chart', days.map((d) => h('div.col', h('div.colbar', h('i', { style: { height: `${(d.m / maxM) * 100}%` }, class: d.m >= s.study.goalMin ? 'met' : '' })), h('span', d.lbl), h('span.small', d.m)))),
      h('p.dim', `오늘 ${fmtMin(G.todayMin())} · 연속 ${s.study.streak}일 (최고 ${s.study.bestStreak}일) · 최장 세션 ${s.study.longest}분`)),
    section('최근 기록',
      s.study.sessions.length ? h('ul.list', s.study.sessions.slice(-8).reverse().map((x) => h('li', h('span', new Date(x.start).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })), h('span', x.label || '공부'), h('b', `${x.min}분`), h('span.dim', `+${fmt(x.xp)} XP`)))) : h('p.dim', '아직 기록이 없습니다.')),
  );
}
async function finishFlow() {
  const r = G.finishStudy();
  if (!r) return render();
  if (r.minutes > 0) {
    snd('level');
    const rw = r.reward;
    await infoBox('공부 완료!', h('div',
      h('p', `${fmtMin(r.minutes)} 동안 공부했습니다.${r.capped ? ` (세션 상한 ${S().settings.sessionCapMin}분 적용)` : ''}`),
      h('div.rewards', h('span.chip', `+${fmt(rw.xp)} XP`), resChip('light', rw.light), resChip('gold', rw.gold), resChip('mana', rw.mana), resChip('stamina', rw.stamina), rw.research ? resChip('research', rw.research) : null),
      rw.goal ? h('p.gold', '★ 일일 목표 달성 보너스!') : null,
      h('p.dim', '책상 위 등잔이 조금 더 밝아졌다.')));
  }
  render();
}

// ── 캐릭터 ──
function vChar() {
  const s = S(), p = s.player, st = G.stats();
  const tab = ui.sub.char || 'stat';
  const pv = preview(120, 96, (ctx, t) => {
    ctx.fillStyle = '#2a2440'; ctx.fillRect(0, 0, 120, 96);
    ctx.fillStyle = '#3a3050'; ctx.fillRect(0, 70, 120, 26);
    const anims = ['idle', 'walk', 'run', 'cast', 'attack', 'interact', 'hit'];
    const a = anims[Math.floor(t / 2.2) % anims.length];
    drawChar(ctx, 40, 10, hooks.playerOpts(), a, t, a === 'walk' || a === 'run' || a === 'attack' ? 'right' : 'down', 2);
  });
  const kids = [
    h('div.charhead', pv, h('div', h('h2', p.name), h('p', p.title), h('p.dim', `Lv.${p.level} · 경험치 ${fmt(p.xp)}/${fmt(G.xpNeed(p.level))}`), bar(p.xp, G.xpNeed(p.level)))),
    tabs('char', [['stat', '능력치'], ['outfit', '의상'], ['trait', '특성']], tab),
  ];
  if (tab === 'stat') {
    kids.push(section('능력치', p.statPts ? h('p.gold', `분배 가능한 포인트: ${p.statPts}`) : null,
      h('table.stats', Object.entries(STATS).map(([k, d]) => h('tr', h('td', d.name), h('td.dim', d.desc), h('td.num', st[k]), h('td', p.statPts ? btn('+', () => { G.allocStat(k); snd('ok'); }, '.sm') : ''))))),
    section('전투 능력', h('table.stats',
      h('tr', h('td', '최대 체력'), h('td.num', st.maxHp)), h('tr', h('td', '최대 마나'), h('td.num', st.maxMp)),
      h('tr', h('td', '방어'), h('td.num', st.def)), h('tr', h('td', '치명타'), h('td.num', `${Math.round(st.crit * 100)}%`)), h('tr', h('td', '피해 배율'), h('td.num', `×${st.dmgMul.toFixed(2)}`)))),
    section('적용 중인 보너스', bonusList()));
  }
  if (tab === 'outfit') {
    kids.push(section('의상 · 외형', h('p.dim', '의상은 캐릭터의 모습에 그대로 반영됩니다. 머리 모양과 색은 설정에서 바꿀 수 있습니다.'),
      h('div.grid', OUTFITS.map((o) => {
        const own = s.outfits.includes(o.id);
        const c = preview(40, 60, (ctx, t) => { ctx.clearRect(0, 0, 40, 60); drawChar(ctx, 0, 0, { ...hooks.playerOpts(), pal: o.pal, hat: o.hat, cape: o.cape }, 'idle', t, 'down', 2); });
        if (!own) c.classList.add('locked');
        return h('div.tile' + (p.outfit === o.id ? '.on' : '') + (own ? '' : '.dis'), { onclick: () => { if (own) { p.outfit = o.id; G.commit(); snd('ok'); } } },
          c, h('b', own ? o.name : '???'), rarityTag(o.rarity), h('span.small.dim', own ? o.cat : unlockText(o.unlock)));
      }))));
  }
  if (tab === 'trait') {
    kids.push(section(`특성 (장착 ${p.traitSlots.length}/${G.traitSlotsMax()})`, h('p.dim', '8레벨마다 장착 칸이 하나씩 늘어납니다.'),
      h('div.list2', TRAITS.map((t) => {
        const own = s.traits.includes(t.id), on = p.traitSlots.includes(t.id);
        return h('div.item' + (own ? '' : '.dis') + (on ? '.on' : ''),
          h('div', h('b', own ? t.name : '???'), h('p.small', own ? t.desc : `해금 조건: ${t.how}`)),
          own ? btn(on ? '해제' : '장착', () => G.setTraitSlot(t.id, !on), on ? '.ghost.sm' : '.sm') : null);
      }))));
  }
  return h('div', ...kids);
}
function bonusList() {
  const b = G.bonuses();
  const names = { xp: '공부 경험치', light: '지식의 빛', loot: '전리품', restore: '복원량', research: '연구 점수', stamina: '탐험력 소모 감소', crit: '치명타', dmg: '전투 피해', hp: '최대 체력', mp: '최대 마나', rare: '희귀품 확률', deep: '몰입(45분+) 경험치', night: '밤 공부 경험치', morning: '아침 공부 빛', streak: '연속일당 경험치', satisfaction: '학생 만족도', tuition: '학비 수입', buildCost: '건설비 절감', combo: '연계 보너스', bossShield: '보스전 보호막', goal: '목표 보상 추가', staminaGain: '탐험력 회복' };
  const rows = Object.entries(b).filter(([k, v]) => v && names[k]);
  if (!rows.length) return h('p.dim', '아직 없습니다. 장비 · 특성 · 탐험 마법이 보너스를 줍니다.');
  return h('ul.small', rows.map(([k, v]) => h('li', `${names[k]} ${['stamina', 'bossShield', 'satisfaction'].includes(k) ? '+' + Math.round(v) : '+' + Math.round(v * 100) + '%'}`)));
}
function unlockText(u) {
  switch (u.type) {
    case 'level': return `Lv.${u.n} 달성`;
    case 'chapter': return '이야기 진행';
    case 'season': return `${u.months.join('·')}월 한정`;
    case 'facility': return `${FACILITIES.find((f) => f.id === u.fac).name} ${u.lv}단계`;
    case 'minutes': return `누적 공부 ${Math.round(u.n / 60)}시간`;
    case 'trait': return '특성 획득';
    default: return '???';
  }
}

// ── 마법 ──
function spellCard(sp, learned) {
  const lv = S().spells[sp.id];
  const kindName = { dmg: '공격', dot: '지속 피해', heal: '회복', shield: '방어', buff: '강화', drain: '흡수', stun: '봉쇄', field: '탐험' }[sp.kind];
  const icon = preview(32, 32, (ctx, t) => { ctx.fillStyle = '#1a1626'; ctx.fillRect(0, 0, 32, 32); ctx.fillStyle = sp.col; const k = (t * 0.8) % 1; for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28 + t; ctx.fillRect(16 + Math.round(Math.cos(a) * (5 + k * 8)), 16 + Math.round(Math.sin(a) * (5 + k * 8)), 2, 2); } ctx.fillStyle = '#fff'; ctx.fillRect(15, 15, 2, 2); });
  if (!learned) {
    const hint = sp.unlock.level ? `Lv.${sp.unlock.level}에 습득` : sp.unlock.chapter != null ? '이야기 진행으로 습득' : '연구로 습득';
    return h('div.item.dis', icon, h('div', h('b', '???'), rarityTag(sp.rarity), h('p.small.dim', hint)));
  }
  const kids = [h('div', h('b', sp.name), ' ', rarityTag(sp.rarity), h('span.small.dim', ` · ${kindName} · ${lv}단계${sp.ai ? ' · AI 창작' : ''}${sp.gen && !sp.ai ? ' · 연구 마법' : ''}`),
    h('p.small', sp.lore), sp.look ? h('p.small.dim', `외형: ${sp.look}`) : null,
    h('p.small.dim', spellEffText(sp, lv)))];
  const actions = h('div.acts');
  if (sp.kind === 'field') {
    [0, 1].forEach((i) => actions.append(btn(S().player.fieldSlots[i] === sp.id ? `탐험 ${i + 1}칸 ✓` : `탐험 ${i + 1}칸`, () => G.setSpellSlot('field', i, sp.id), '.sm')));
  } else {
    [0, 1, 2, 3].forEach((i) => actions.append(btn(S().player.spellSlots[i] === sp.id ? `${i + 1}번 ✓` : `${i + 1}번`, () => G.setSpellSlot('battle', i, sp.id), '.sm' + (S().player.spellSlots[i] === sp.id ? '.on' : ''))));
  }
  if (lv < 5) { const c = G.spellUpgradeCost(sp.id); actions.append(h('span.upg', btn(`강화 → ${lv + 1}`, () => G.upgradeSpell(sp.id), '.sm.gold'), costRow(c))); }
  kids.push(actions);
  return h('div.item', icon, h('div.grow', ...kids));
}
function spellEffText(sp, lv) {
  const m = 1 + 0.15 * (lv - 1);
  const p = typeof sp.power === 'number' && sp.power < 1 ? `${Math.round(sp.power * m * 100)}%` : Math.round(sp.power * m);
  const parts = [];
  if (sp.kind === 'field') parts.push(sp.field === 'explore' ? `전리품 +${Math.round(sp.power * m * 100)}%` : sp.field === 'restore' ? `복원량 +${Math.round(sp.power * m * 100)}%` : `탐험력 소모 -${Math.round(sp.power * m)}`);
  else parts.push(`위력 ${p}`, `마나 ${sp.mp}`);
  if (sp.combo) parts.push(`연계: ${sp.combo.after} 계열 다음 +${Math.round(sp.combo.bonus * 100)}%`);
  if (sp.repeat) parts.push(`${sp.repeat}회 타격`);
  if (sp.turns) parts.push(`${sp.turns}턴 지속`);
  return parts.join(' · ');
}
function vSpells() {
  const s = S();
  const all = [...SPELLS, ...s.genSpells];
  const learned = all.filter((sp) => s.spells[sp.id]);
  const locked = SPELLS.filter((sp) => !s.spells[sp.id]);
  const rc = G.researchCost();
  return h('div',
    h('h2', '마법 및 능력'),
    h('p.dim', '모든 마법의 근원은 지식의 빛입니다. 전투용 마법 4칸과 탐험 마법 2칸을 장착할 수 있습니다.'),
    section('장착 중',
      h('div.slots', s.player.spellSlots.map((id, i) => h('div.slot', h('span.small.dim', `${i + 1}번`), h('b', id ? spellDef(s, id)?.name : '—'))),
        s.player.fieldSlots.map((id, i) => h('div.slot.field', h('span.small.dim', `탐험 ${i + 1}`), h('b', id ? spellDef(s, id)?.name : '—'))))),
    section('마법 연구 (연구실)',
      h('p.small.dim', '연구 점수와 마나를 사용해 새로운 마법을 정리합니다. 연구실 레벨이 높을수록 강한 마법이 나옵니다.'),
      h('div.acts', btn('새 마법 연구', () => { const d = G.researchSpell(); if (d) infoBox('연구 성공!', h('p', `「${d.name}」(${RARITY[d.rarity].name})을 정리했습니다.`)); }, '', !s.school.fac.lab), costRow(rc)),
      aiButton('spell')),
    section(`습득한 마법 (${learned.length})`, h('div.list2', learned.map((sp) => spellCard(sp, true)))),
    section('아직 모르는 마법', h('div.list2', locked.map((sp) => spellCard(sp, false)))),
  );
}
function aiButton(kind) {
  const s = S();
  if (!s.settings.ai) return h('p.small.dim', 'AI 창작은 설정에서 켤 수 있습니다 (서버에 API 키가 설정된 경우).');
  return h('div.acts', btn(kind === 'spell' ? '✦ AI에게 새 마법 창작 의뢰' : '✦ AI 장인에게 제작 의뢰', () => aiForge(kind), '.ai'), h('span.small.dim', '같은 재료가 소모됩니다. 실패하면 일반 연구/제작으로 대체됩니다.'));
}
async function aiForge(kind) {
  const s = S();
  if (kind === 'spell') { const c = G.researchCost(); if (s.res.research < c.research || s.res.mana < c.mana) return G.toast('재료가 부족합니다.', 'warn'); }
  else { const c = G.forgeCost(); for (const [k, v] of Object.entries(c)) if (s.res[k] < v) return G.toast('재료가 부족합니다.', 'warn'); if (!s.school.fac.lampworks) return G.toast('등불 공방이 필요합니다.', 'warn'); }
  const busy = loadingBox('AI가 세계관에 맞는 새 콘텐츠를 창작하는 중…');
  let def = null;
  try {
    const known = kind === 'spell' ? [...SPELLS, ...s.genSpells].map((x) => x.name) : s.items.map((i) => itemDef(s, i)?.name).filter(Boolean);
    const regions = s.unlockedRegions.filter((r) => r !== 'school').map((r) => REGIONS.find((x) => x.id === r).name);
    const res = await fetch('/api/studyverse/forge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, level: s.player.level, regions, known: known.slice(-40), slot: ui.sub.forgeSlot || null }) });
    const j = await res.json();
    if (!res.ok) throw new Error(j?.error?.message || 'AI 요청 실패');
    def = kind === 'spell' ? sanitizeAiSpell(s, j.data, s.player.level) : sanitizeAiItem(s, j.data, s.player.level + (s.school.fac.lampworks || 0));
    if (!def) throw new Error('중복되거나 형식이 맞지 않는 결과');
  } catch (e) {
    G.toast(`AI 창작 실패: ${e.message} — 일반 방식으로 진행합니다.`, 'warn');
  } finally { busy(); }
  if (kind === 'spell') { const d = G.researchSpell(def); if (d) infoBox(d.ai ? 'AI 창작 마법' : '연구 성공', h('div', h('p', h('b', d.name), ` (${RARITY[d.rarity].name})`), h('p.small', d.lore || ''), d.look ? h('p.small.dim', d.look) : null)); }
  else { const it = G.forgeItem(ui.sub.forgeSlot || null, def); if (it) { const d = itemDef(s, it); infoBox(d.ai ? 'AI 장인의 작품' : '제작 완료', itemDetail(d)); } }
  render();
}

// ── 인벤토리 ──
function itemDetail(d) {
  return h('div.idetail', h('img.big', { src: itemIcon(d.look, RARITY[d.rarity].color, 48) }),
    h('div', h('b', d.name), ' ', rarityTag(d.rarity), h('p.small.dim', SLOTS[d.slot]),
      h('p.small', Object.entries(d.stats || {}).map(([k, v]) => `${STATS[k].name} +${v}`).join(' · ')),
      d.effect ? h('p.small.gold', Object.entries(d.effect).map(([k, v]) => effName(k, v)).join(' · ')) : null,
      h('p.small', d.desc), d.lore ? h('p.small.dim', d.lore) : null));
}
function effName(k, v) {
  const n = { loot: '전리품', restore: '복원량', xp: '공부 경험치', light: '지식의 빛', research: '연구', hp: '최대 체력', crit: '치명타' }[k];
  return k === 'stamina' ? `탐험력 소모 -${v}` : `${n} +${Math.round(v * 100)}%`;
}
function vInv() {
  const s = S();
  const tab = ui.sub.inv || 'equip';
  const kids = [h('h2', '인벤토리'), tabs('inv', [['equip', '장비'], ['bag', '가방'], ['shop', '상점'], ['craft', '등불 공방']], tab)];
  if (tab === 'equip') {
    kids.push(section('장착 중', h('div.eqgrid', Object.entries(SLOTS).map(([slot, name]) => {
      const u = s.player.equip[slot];
      const d = u ? itemDef(s, s.items.find((i) => i.uid === u)) : null;
      return h('div.eq', { onclick: () => { ui.sub.inv = 'bag'; ui.sub.bagSlot = slot; render(); } },
        d ? h('img', { src: itemIcon(d.look, RARITY[d.rarity].color, 32) }) : h('div.empty'), h('span.small.dim', name), h('b.small', d ? d.name : '비어 있음'),
        d && !d.bound ? btn('해제', (e) => { e.stopPropagation(); G.unequip(slot); }, '.sm.ghost') : null);
    }))), section('능력치 합계', bonusList()));
  }
  if (tab === 'bag') {
    const slotF = ui.sub.bagSlot || 'all';
    const list = s.items.filter((i) => slotF === 'all' || itemDef(s, i)?.slot === slotF)
      .sort((a, b) => RARITY[itemDef(s, b).rarity].order - RARITY[itemDef(s, a).rarity].order);
    kids.push(h('div.tabs.small', [['all', '전체'], ...Object.entries(SLOTS)].map(([id, n]) => h('button.tab' + (slotF === id ? '.on' : ''), { onclick: () => { ui.sub.bagSlot = id; render(); } }, n))));
    kids.push(section(`장비 (${s.items.length})`, h('div.list2', list.map((it) => {
      const d = itemDef(s, it);
      const on = Object.values(s.player.equip).includes(it.uid);
      return h('div.item' + (on ? '.on' : ''), itemDetail(d), h('div.acts',
        on ? h('span.small.gold', '장착 중') : btn('장착', () => G.equip(it.uid), '.sm'),
        !on && !d.bound ? btn('판매', () => G.sellItem(it.uid), '.sm.ghost') : null));
    }))));
    const loots = Object.entries(s.loot).filter(([, n]) => n > 0);
    kids.push(section('소지품', loots.length ? h('ul.list', loots.map(([k, n]) => h('li', h('b', LOOT[k].name), h('span', `×${n}`), h('span.small.dim', LOOT[k].desc), LOOT[k].use ? btn('사용', () => G.useLoot(k), '.sm') : null))) : h('p.dim', '탐험에서 얻은 물건이 여기에 쌓입니다.')));
  }
  if (tab === 'shop') {
    kids.push(section('학당 매점', h('p.dim', '기본 장비를 골드로 구입할 수 있습니다.'), h('div.list2', ITEMS.filter((d) => d.shop).map((d) => h('div.item', itemDetail(d), h('div.acts', btn('구입', () => G.buyItem(d.id), '.sm'), costRow(d.shop)))))));
  }
  if (tab === 'craft') {
    const lv = s.school.fac.lampworks || 0;
    const fc = G.forgeCost();
    kids.push(section('등불 공방', lv ? h('p.dim', `공방 ${lv}단계 — 레벨이 높을수록 좋은 장비가 나옵니다.`) : h('p.warn', '학교 경영에서 등불 공방을 먼저 건설하세요.'),
      h('div.tabs.small', [['', '무작위'], ...Object.entries(SLOTS).filter(([k]) => k !== 'relic')].map(([id, n]) => h('button.tab' + ((ui.sub.forgeSlot || '') === id ? '.on' : ''), { onclick: () => { ui.sub.forgeSlot = id || null; render(); } }, n))),
      h('div.acts', btn('장비 제작', () => { const it = G.forgeItem(ui.sub.forgeSlot || null); if (it) infoBox('제작 완료', itemDetail(itemDef(s, it))); }, '', !lv), costRow(fc)),
      aiButton('item')),
    section('특별 제작법', h('div.list2', ITEMS.filter((d) => d.craft).map((d) => h('div.item', itemDetail(d), h('div.acts', btn('제작', () => G.craftItem(d.id), '.sm', lv < 2), costRow(d.craft), lv < 2 ? h('span.small.dim', '공방 2단계 필요') : null))))));
  }
  return h('div', ...kids);
}

// ── 퀘스트 ──
function vQuests() {
  const s = S();
  G.ensureQuests();
  const qrow = (kind) => (q, i) => { const v = G.questView(q); return h('li' + (v.claimed ? '.done' : ''), h('span', v.text), h('span.num', `${v.cur}/${v.n}`), v.claimed ? h('span.small.dim', '완료') : btn('보상', () => G.claimQuest(kind, i), '.sm', !v.done)); };
  const sideList = SIDE_QUESTS.map((q) => {
    const st = G.sideQuestState(q);
    if (st.state === 'locked') return null;
    return h('div.item' + (st.state === 'done' ? '.dis' : ''), h('div.grow', h('b', q.title), h('span.small.dim', ` · ${NPCS[q.npc].name}`), h('p.small', q.desc),
      st.checks ? h('ul.small', st.checks.map((c) => h('li' + (c.ok ? '.done' : ''), c.t))) : null,
      st.state === 'done' ? h('p.small.dim', '완료') : st.state === 'available' ? h('p.small.gold', '학당에서 의뢰인에게 말을 걸어 수락하세요.') : st.ok ? h('p.small.gold', '의뢰인에게 돌아가 보고하세요!') : null));
  }).filter(Boolean);
  return h('div', h('h2', '퀘스트'),
    storyCard(),
    section('오늘의 과제', h('ul.objs', s.quests.daily.list.map(qrow('daily')))),
    section('이번 주 과제', h('ul.objs', s.quests.weekly.list.map(qrow('weekly')))),
    section('인물들의 부탁', sideList.length ? h('div.list2', sideList) : h('p.dim', '이야기가 진행되면 학당 사람들이 부탁을 해 옵니다.')),
  );
}

// ── 학교 경영 ──
function vSchool() {
  const s = S(), sc = s.school;
  const tab = ui.sub.school || 'fac';
  const stg = G.schoolStage();
  const next = SCHOOL_STAGES.find((x) => x.n === stg.n + 1);
  const pr = G.production();
  const kids = [h('h2', '학교 경영'),
    section(`발전 단계 ${stg.n} · 「${stg.name}」`, h('p.small', stg.desc),
      next ? h('div', h('p.small.dim', `다음 단계 「${next.name}」: 시설 레벨 합계 ${G.facTotal()}/${next.need}${next.ending ? ' + 최종장 완료' : ''}`), bar(G.facTotal(), next.need, '.gold')) : h('p.gold', '최고 단계에 도달했습니다.'),
      h('div.kpis',
        h('div', h('span.dim', '학생'), h('b', `${sc.students.length}/${G.capacity()}`)), h('div', h('span.dim', '교직원'), h('b', `${sc.staff.length}/${G.staffCap()}`)),
        h('div', h('span.dim', '교육 수준'), h('b', G.education())), h('div', h('span.dim', '만족도'), h('b', G.satisfaction())),
        h('div', h('span.dim', '명성'), h('b', fmt(sc.rep))), h('div', h('span.dim', '졸업생'), h('b', sc.graduates))),
      h('p.small.dim', `시간당: 학비 +${pr.tuition.toFixed(1)} 골드 · 급여 -${pr.salary} 골드 · 연구 +${pr.research.toFixed(1)} · 마나 +${pr.mana.toFixed(1)} · 목재 +${pr.wood.toFixed(1)} · 석재 +${pr.stone.toFixed(1)} · 수정 +${pr.crystal.toFixed(2)}`),
      h('p.small.dim', '학교는 실제 시간에 따라 운영됩니다(최대 48시간 소급). 공부하지 않은 날에도 학교가 쇠퇴하지는 않습니다.')),
    tabs('school', [['fac', '시설'], ['stu', `학생${sc.applicants.length ? ` (+${sc.applicants.length})` : ''}`], ['staff', '교직원'], ['log', '학당 소식']], tab)];
  if (tab === 'fac') {
    const list = FACILITIES.slice().sort((a, b) => (a.id === ui.focusFac ? -1 : b.id === ui.focusFac ? 1 : 0));
    kids.push(h('div.list2', list.map((f) => {
      const lv = sc.fac[f.id] || 0;
      const c = G.buildCost(f.id);
      return h('div.item' + (f.id === ui.focusFac ? '.on' : ''), h('div.grow',
        h('b', f.name), h('span.small.dim', ` · ${lv ? `${lv}단계` : '미건설'} / ${FAC_MAX}`), h('div.pips', Array.from({ length: FAC_MAX }, (_, i) => h('i' + (i < lv ? '.on' : '')))),
        h('p.small', f.desc), h('p.small.dim', f.eff),
        lv < FAC_MAX ? h('div.acts', btn(lv ? `확장 → ${lv + 1}단계` : '건설', () => { G.build(f.id); snd('level'); }, '.sm' + (lv ? '' : '.gold')), costRow(c)) : h('p.small.gold', '최대 단계')));
    })));
  }
  if (tab === 'stu') {
    kids.push(section(`입학 지원자 (${sc.applicants.length})`, sc.applicants.length ? h('div.list2', sc.applicants.map((a) => h('div.item', personIcon(a.look), h('div.grow', h('b', a.name), h('span.small.dim', ` · ${a.personality} · 재능: ${a.talent} · 적성 ${'★'.repeat(a.aptitude)}`), h('p.small', a.quirk)),
      h('div.acts', btn('입학 허가', () => G.admit(a.id), '.sm'), btn('거절', () => G.reject(a.id), '.sm.ghost'))))) : h('p.dim', '명성과 만족도가 높을수록 지원자가 빨리 찾아옵니다.')));
    kids.push(section(`재학생 (${sc.students.length}/${G.capacity()})`, sc.students.length ? h('div.list2', sc.students.map((x) => h('div.item', personIcon(x.look), h('div.grow', h('b', x.name), h('span.small.dim', ` · ${x.year}학년 · ${x.personality} · ${x.talent} ${'★'.repeat(x.aptitude)}`), h('p.small', x.quirk), bar(x.xp, 100))))) : h('p.dim', '아직 학생이 없습니다.')));
  }
  if (tab === 'staff') {
    kids.push(section(`교직원 (${sc.staff.length}/${G.staffCap()})`, sc.staff.length ? h('div.list2', sc.staff.map((x) => h('div.item', personIcon(x.look), h('div.grow', h('b', x.name), h('span.small.dim', ` · ${STAFF_ROLES[x.role].name} · 숙련 ${'★'.repeat(x.skill)} · 급여 ${x.salary}/시간${x.unpaid ? ' · 급여 부족(효율 절반)' : ''}`), h('p.small', `${STAFF_ROLES[x.role].eff} — “${x.line}”`)), btn('퇴직', () => G.dismiss(x.id), '.sm.ghost')))) : h('p.dim', '교직원은 시설 효율을 높여 줍니다.')));
    kids.push(section('채용 후보 (매일 갱신)', h('div.list2', sc.candidates.map((x) => h('div.item', personIcon(x.look), h('div.grow', h('b', x.name), h('span.small.dim', ` · ${STAFF_ROLES[x.role].name} · 숙련 ${'★'.repeat(x.skill)} · ${x.personality}`), h('p.small', `${STAFF_ROLES[x.role].eff} · 급여 ${x.salary}/시간`), h('p.small.dim', `“${x.line}”`)), h('div.acts', btn('채용', () => G.hire(x.id), '.sm'), resChip('gold', null, x.hireCost)))))));
  }
  if (tab === 'log') kids.push(section('학당 소식', sc.log.length ? h('ul.list', sc.log.map((l) => h('li', h('span.dim', new Date(l.t).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })), h('span', l.text)))) : h('p.dim', '아직 소식이 없습니다.')));
  return h('div', ...kids);
}
function personIcon(look) {
  return preview(24, 24, (ctx, t) => { ctx.fillStyle = '#2a2440'; ctx.fillRect(0, 0, 24, 24); drawChar(ctx, 2, 0, hooks.studentOpts(look), 'idle', t + look.hair.length, 'down', 1); });
}

// ── 세계 지도 ──
function vMap() {
  const s = S();
  const id = ui.selRegion;
  const reg = id && REGIONS.find((r) => r.id === id);
  const list = REGIONS.filter((r) => !r.home && (!r.hidden || G.vaultVisible()));
  const kids = [h('h2', '세계 지도'), h('p.dim', '지도에서 지역을 누르거나 아래 목록에서 고르세요. 탐험하고 빛을 봉헌하면 어둠에 잠긴 땅이 되살아납니다.')];
  if (reg) {
    const un = s.unlockedRegions.includes(reg.id) || (reg.id === 'vault' && G.vaultVisible());
    const R = s.regions[reg.id];
    if (!un) kids.push(section(reg.name === '' ? '???' : '???', h('p.dim', '아직 갈 수 없는 곳입니다. 이야기가 진행되면 길이 열립니다.')));
    else {
      const cost = reg.id === 'vault' ? 0 : G.expeditionCost(reg.id);
      const per = G.restoreCostPerPct(reg.id);
      const boss = BOSSES[reg.boss];
      kids.push(section(reg.name,
        h('p.small', reg.desc),
        reg.id !== 'vault' ? h('div', h('div.row', h('span', '복원도'), h('b', `${Math.floor(R.restore)}%`)), bar(R.restore, 100, '.gold'), h('p.small.dim', `권장 레벨 ${reg.lvl} · 탐험 완료 ${R.exps}회`)) : null,
        reg.id !== 'vault' ? h('div.acts', btn(`⚔ 탐험 떠나기`, () => hooks.startExplore(reg.id, false), '.primary'), resChip('stamina', null, cost), h('span.small.dim', `보유 ${Math.floor(s.res.stamina)}`)) : null,
        reg.id !== 'vault' && R.restore < 100 ? h('div.acts', btn('빛 봉헌 +1%', () => G.donateLight(reg.id, 1), '.sm'), btn('+5%', () => G.donateLight(reg.id, 5), '.sm'), h('span.small.dim', `1%당 지식의 빛 ${per}`)) : null,
        boss ? h('div.bossbox', h('b', `수호자: ${R.boss ? boss.name + ' (정화 완료)' : G.bossAvailable(reg.id) ? boss.name : '???'}`),
          R.boss ? null : G.bossAvailable(reg.id) ? btn('수호자에게 도전', () => hooks.startExplore(reg.id, true), '.gold') : h('p.small.dim', boss.final ? '최종장에서 열립니다.' : `복원도 ${boss.minRestore}% 이상에서 모습을 드러냅니다.`)) : null,
        h('p.small.dim', `출몰: ${reg.mobs.map((m) => s.codex.mobs[m] != null ? MONSTERS[m].name : '???').join(', ') || '—'}`)));
    }
  }
  kids.push(section('지역 목록', h('ul.list', list.map((r) => {
    const un = s.unlockedRegions.includes(r.id) || (r.id === 'vault' && G.vaultVisible());
    return h('li.click' + (r.id === id ? '.on' : ''), { onclick: () => { ui.selRegion = r.id; render(); } }, h('b', un ? r.name : '???'), un && r.id !== 'vault' ? h('span', `${Math.floor(s.regions[r.id].restore)}%`) : h('span.dim', un ? '' : '잠김'),
      un && G.bossAvailable(r.id) ? h('span.gold.small', '수호자 출현!') : null);
  }))));
  return h('div', ...kids);
}

// ── 탐험 / 전투 ──
function vExplore() {
  const E = G.EXP;
  if (!E) return h('div', h('p', '탐험 중이 아닙니다.'), btn('세계 지도로', () => go('map')));
  const reg = REGIONS.find((r) => r.id === E.region);
  const B = E.battle, st = G.stats();
  const kids = [h('h2', `${reg.name} ${E.boss ? '· 수호자 전투' : `· 조우 ${E.idx + 1}/${E.encounters.length}`}`)];
  kids.push(h('div.bstat',
    h('div', h('span.small', `체력 ${Math.max(0, Math.round(E.hp))}/${B.maxHp}`), bar(E.hp, B.maxHp, '.hp')),
    h('div', h('span.small', `마나 ${Math.round(E.mp)}/${B.maxMp}`), bar(E.mp, B.maxMp, '.mp')),
    B.shield ? h('span.small.gold', `보호막 ${B.shield}`) : null, B.buff ? h('span.small.gold', ` 강화 +${Math.round(B.buff * 100)}%`) : null));
  kids.push(h('div.enemy', h('b', B.enemy.name), h('span.small', ` 체력 ${Math.max(0, B.enemy.hp)}/${B.enemy.maxHp}`), B.enemy.dots.length ? h('span.small.dim', ' · 지속 피해 중') : null, B.enemy.stun ? h('span.small.gold', ' · 멈춤') : null));
  if (!B.over) {
    const acts = h('div.spellbar');
    S().player.spellSlots.forEach((id, i) => {
      const sp = id && spellDef(S(), id);
      acts.append(h('button.sbtn', { disabled: !sp || E.mp < (sp?.mp || 0), onclick: () => hooks.act(id), title: sp ? spellEffText(sp, S().spells[id]) : '' },
        h('span.k', i + 1), h('b', sp ? sp.name : '—'), sp ? h('span.small', sp.mp ? `마나 ${sp.mp}` : '무료') : null));
    });
    kids.push(acts);
    kids.push(h('div.acts', btn(`약초 (${S().loot.loot_herb || 0})`, () => hooks.act('herb'), '.sm', !(S().loot.loot_herb > 0)), btn('후퇴', () => hooks.act('flee'), '.sm.ghost'),
      h('label.small', h('input', { type: 'checkbox', checked: S().settings.autoBattle, onchange: (e) => { S().settings.autoBattle = e.target.checked; save(S()); } }), ' 자동 전투')));
  } else if (!E.done) {
    kids.push(h('div.won', h('p.gold', `정화 완료! 남은 물음: “${B.enemy.q}”`), btn('▶ 계속 나아가기', () => hooks.nextEnc(), '.primary')));
  }
  kids.push(h('ul.blog', B.log.map((l) => h('li', l))));
  if (E.done) {
    const L = E.loot;
    const title = { cleared: E.boss ? '수호자를 정화했다!' : '탐험 성공!', fled: '무사히 후퇴했다.', lost: '쓰러졌다… 동료들이 학당으로 데려왔다.' }[E.result];
    kids.push(section(title,
      E.result === 'lost' ? h('p.small.dim', '전리품의 절반을 지켰습니다. 그 외의 손실은 없습니다.') : null,
      h('div.rewards', ['light', 'gold', 'wood', 'stone', 'crystal'].filter((k) => L[k]).map((k) => resChip(k, L[k])),
        Object.entries(L.drops).filter(([, n]) => n).map(([k, n]) => h('span.chip', `${LOOT[k].name} ×${n}`))),
      L.restored ? h('p.gold', `${reg.name} 복원도 +${L.restored}%`) : null,
      L.items.length ? h('div.list2', L.items.map((d) => h('div.item', itemDetail(d)))) : null,
      E.questions.length ? h('div', h('p.small.dim', '정화한 굳은 물음들이 남긴 질문:'), h('ul.small', E.questions.map((q) => h('li', `“${q}”`)))) : null,
      btn('학당으로 돌아가기', () => hooks.endExplore(), '.primary')));
  }
  return h('div', ...kids);
}

// ── 도감 ──
function vCodex() {
  const s = S();
  const tab = ui.sub.codex || 'mob';
  const kids = [h('h2', '도감'), tabs('codex', [['mob', '굳은 물음'], ['item', '장비'], ['spell', '마법'], ['outfit', '의상'], ['npc', '인물'], ['lore', '기록']], tab)];
  if (tab === 'mob') {
    const all = [...Object.entries(MONSTERS), ...Object.entries(BOSSES).filter(([, b]) => !b.final || s.regions.vault.boss)];
    kids.push(h('p.dim', '굳은 물음: 답을 잃고 굳어 버린 물음의 잔해. 정화하면 원래의 질문을 남긴다.'));
    kids.push(h('div.grid', all.map(([id, m]) => {
      const seen = s.codex.mobs[id] != null, n = s.codex.mobs[id] || 0;
      const c = preview(48, 48, (ctx, t) => { ctx.fillStyle = '#1a1626'; ctx.fillRect(0, 0, 48, 48); if (seen) drawMonster(ctx, { ...m, big: false }, 1, 2, t, 2); else { ctx.fillStyle = '#3a3450'; ctx.fillRect(14, 12, 20, 24); } });
      return h('div.tile' + (seen ? '' : '.dis'), c, h('b.small', seen ? m.name : '???'), h('span.small.dim', seen ? (n ? `정화 ${n}회` : '조우함') : ''), n ? h('span.small', `“${m.q}”`) : null);
    })));
  }
  if (tab === 'item') {
    const found = ITEMS.map((d) => ({ d, f: s.codex.items[d.id] }));
    const gens = s.items.map((i) => itemDef(s, i)).filter((d) => d.gen);
    kids.push(section(`고유 장비 (${found.filter((x) => x.f).length}/${found.length})`, h('div.grid', found.map(({ d, f }) => h('div.tile' + (f ? '' : '.dis'), h('img', { src: itemIcon(f ? d.look : { kind: d.look.kind, col: '#3a3450' }, f ? RARITY[d.rarity].color : '#3a3450', 32) }), h('b.small', f ? d.name : '???'))))));
    kids.push(section(`생성된 장비 (${gens.length})`, gens.length ? h('div.grid', gens.map((d) => h('div.tile', h('img', { src: itemIcon(d.look, RARITY[d.rarity].color, 32) }), h('b.small', d.name), d.ai ? h('span.small.dim', 'AI 창작') : null))) : h('p.dim', '탐험과 제작으로 얻은 고유 장비가 기록됩니다.')));
  }
  if (tab === 'spell') kids.push(h('div.list2', [...SPELLS, ...s.genSpells].map((sp) => h('div.item' + (s.spells[sp.id] ? '' : '.dis'), h('div', h('b', s.spells[sp.id] ? sp.name : '???'), ' ', rarityTag(sp.rarity), s.spells[sp.id] ? h('p.small', sp.lore) : null)))));
  if (tab === 'outfit') kids.push(h('div.list2', OUTFITS.map((o) => h('div.item' + (s.outfits.includes(o.id) ? '' : '.dis'), h('div', h('b', s.outfits.includes(o.id) ? o.name : '???'), ' ', rarityTag(o.rarity), h('p.small', s.outfits.includes(o.id) ? o.desc : unlockText(o.unlock)))))));
  if (tab === 'npc') {
    kids.push(h('div.list2', Object.entries(NPCS).map(([id, n]) => {
      const met = s.story.ch >= n.from || s.codex.npcs[id];
      const hidden = id === 'evelyn' && s.story.ch < 8;
      return h('div.item' + (met ? '' : '.dis'), met ? hooks.portraitFor(id) : null, h('div.grow', h('b', met ? (hidden ? '회색 학생' : n.name) : '???'), met ? h('span.small.dim', ` · ${hidden ? '???' : n.role}`) : null,
        met ? h('p.small', `성격: ${n.personality}`) : null, met && !hidden ? h('p.small.dim', `${n.bg} 능력: ${n.ability}`) : null));
    })));
  }
  if (tab === 'lore') {
    const lore = story().regionLore;
    kids.push(h('p.dim', '지역을 복원하면 그곳에 잠들어 있던 기록이 드러납니다.'));
    for (const reg of REGIONS.filter((r) => lore[r.id])) {
      if (reg.hidden && !s.regions.vault.boss) continue;
      const un = s.unlockedRegions.includes(reg.id) || reg.id === 'vault';
      kids.push(section(un ? reg.name : '???', h('ul.small', lore[reg.id].map(([th, text]) => h('li', s.codex.lore[`${reg.id}:${th}`] || (reg.id === 'vault' && s.regions.vault.boss) ? text : `(복원도 ${th}%에서 해금)`)))));
    }
  }
  return h('div', ...kids);
}

// ── 스토리 기록 ──
function vStory() {
  const s = S();
  const done = s.story.done.map((id) => chapter(id)).filter(Boolean);
  return h('div', h('h2', '스토리 기록'),
    h('p.dim', '지금까지 겪은 이야기만 기록됩니다. 앞으로의 일은 아직 아무도 모릅니다.'),
    storyCard(),
    section(`지나온 이야기 (${done.length})`, done.length ? h('div.list2', done.map((c) => h('div.item', h('div.grow', h('b', c.title), h('p.small', c.summary)),
      h('div.acts', btn('다시 보기', async () => { await playDialogue([...c.intro, ...c.outro.filter((l) => !l.choice)]); render(); }, '.sm'))))) : h('p.dim', '아직 완료한 장이 없습니다.')),
  );
}

// ── 설정 ──
function vSettings() {
  const s = S(), st = s.settings, p = s.player;
  const look = p.look || (p.look = { hair: '#3a2a1a', skin: '#f0c8a0', style: 'short' });
  const num = (label, val, min, max, set, unit = '분') => h('label.field', h('span', label), h('input.inp', { type: 'number', min, max, value: val, onchange: (e) => { const v = clamp(Math.round(+e.target.value || min), min, max); set(v); G.commit(); } }), h('span.dim', unit));
  const chk = (label, key) => h('label.field', h('input', { type: 'checkbox', checked: st[key], onchange: (e) => { st[key] = e.target.checked; G.commit(); } }), h('span', label));
  const hairs = ['#2a1a10', '#5a3a1a', '#c08a4a', '#e8d090', '#a03a2a', '#1a1a2a', '#d0d0d0', '#6a3a8a', '#3a6a8a', '#ff8a4a'];
  const skins = ['#ffd8b8', '#f0c8a0', '#d8a078', '#b07850', '#8a5a3a'];
  return h('div', h('h2', '설정'),
    section('플레이어',
      h('label.field', h('span', '이름'), h('input.inp', { value: p.name, maxlength: 12, onchange: (e) => { p.name = e.target.value.trim().slice(0, 12) || p.name; G.commit(); } })),
      h('div.field', h('span', '머리색'), h('div.swatches', hairs.map((c) => h('button.sw' + (look.hair === c ? '.on' : ''), { style: { background: c }, onclick: () => { look.hair = c; G.commit(); } })))),
      h('div.field', h('span', '피부색'), h('div.swatches', skins.map((c) => h('button.sw' + (look.skin === c ? '.on' : ''), { style: { background: c }, onclick: () => { look.skin = c; G.commit(); } })))),
      h('div.field', h('span', '머리 모양'), h('div.seg', [['short', '짧은 머리'], ['bob', '단발'], ['long', '긴 머리'], ['pony', '묶은 머리']].map(([id, l]) => h('button.tab' + (look.style === id ? '.on' : ''), { onclick: () => { look.style = id; G.commit(); } }, l))))),
    section('공부',
      num('일일 목표', s.study.goalMin, 10, 720, (v) => { s.study.goalMin = v; }),
      num('뽀모도로 집중', s.study.pomodoro.focus, 5, 120, (v) => { s.study.pomodoro.focus = v; }),
      num('뽀모도로 휴식', s.study.pomodoro.rest, 1, 60, (v) => { s.study.pomodoro.rest = v; }),
      num('세션 최대 인정 시간', st.sessionCapMin, 30, 600, (v) => { st.sessionCapMin = v; }),
      num('자리 비움 확인 기준', st.awayConfirmMin, 3, 120, (v) => { st.awayConfirmMin = v; }),
      h('p.small.dim', '타이머가 켜진 채 앱을 오래 떠나 있었다면, 돌아왔을 때 그 시간을 공부로 인정할지 물어봅니다.')),
    section('게임', chk('효과음', 'sound'), chk('움직임 줄이기 (날씨 입자 끔)', 'reduceMotion'), chk('자동 전투 기본값', 'autoBattle')),
    section('AI 창작 (선택)',
      h('p.small', 'AI 서버가 연결되면 연구실과 등불 공방에서 AI가 세계관에 맞춘 새 마법과 장비를 창작합니다. 연결되지 않아도 모든 기본 플레이는 정상 작동합니다.'),
      h('p.small.dim', `서버 상태: ${hooks.aiStatus()}`),
      chk('AI 창작 사용', 'ai')),
    section('저장 데이터',
      h('p.small.dim', `자동 저장됨 (저장 번호 ${s.rev}). 브라우저 저장소에 보관되며, 백업 파일로 다른 기기에 옮길 수 있습니다.`),
      h('div.acts',
        btn('백업 파일 내보내기', () => { const blob = new Blob([exportSave(s)], { type: 'application/json' }); const a = h('a', { href: URL.createObjectURL(blob), download: `studyverse-${dayKey()}.json` }); document.body.append(a); a.click(); a.remove(); }),
        btn('백업 불러오기', () => { const inp = h('input', { type: 'file', accept: '.json,application/json' }); inp.onchange = async () => { try { const text = await inp.files[0].text(); const ns = importSave(text); if (await confirmBox('현재 진행 상황을 백업 파일의 내용으로 바꿀까요?')) { hooks.replaceState(ns); } } catch (e) { G.toast(e.message, 'warn'); } }; inp.click(); }, '.ghost'),
        btn('처음부터 다시 시작', async () => { if (await confirmBox('모든 진행 상황이 삭제됩니다. 정말 처음부터 시작할까요?') && await confirmBox('되돌릴 수 없습니다. 백업을 내보냈나요? 계속하면 삭제합니다.')) { wipe(); location.reload(); } }, '.danger'))),
    section('정보', h('p.small.dim', 'STUDYVERSE : 지식의 세계 — 네가 공부한 만큼, 세계가 깨어난다.'), h('p.small.dim', '글꼴: Galmuri (SIL Open Font License)')),
  );
}

// ───────────────────────── 모달 ─────────────────────────
export function infoBox(title, body) {
  return new Promise((res) => {
    const m = $('#modal');
    const close = () => { m.classList.remove('show'); m.innerHTML = ''; res(); };
    m.innerHTML = '';
    m.append(h('div.mbox', h('h3', title), body, h('div.acts', btn('확인', close, '.primary'))));
    m.classList.add('show');
  });
}
export function confirmBox(text, ok = '확인', cancel = '취소') {
  return new Promise((res) => {
    const m = $('#modal');
    const close = (v) => { m.classList.remove('show'); m.innerHTML = ''; res(v); };
    m.innerHTML = '';
    m.append(h('div.mbox', h('p', text), h('div.acts', btn(ok, () => close(true), '.primary'), btn(cancel, () => close(false), '.ghost'))));
    m.classList.add('show');
  });
}
export function choiceBox(text, options) {
  return new Promise((res) => {
    const m = $('#modal');
    const close = (v) => { m.classList.remove('show'); m.innerHTML = ''; res(v); };
    m.innerHTML = '';
    m.append(h('div.mbox', typeof text === 'string' ? h('p', text) : text, h('div.acts.col', options.map(([v, l, cls]) => btn(l, () => close(v), cls || '')))));
    m.classList.add('show');
  });
}
function loadingBox(text) {
  const m = $('#modal');
  m.innerHTML = '';
  m.append(h('div.mbox', h('p', text), h('div.spinner')));
  m.classList.add('show');
  return () => { m.classList.remove('show'); m.innerHTML = ''; };
}
export function go(view) {
  ui.view = view;
  if (view !== 'school') ui.focusFac = null;
  hooks.onView?.(view);
  render();
  const panel = $('#panel');
  panel.scrollTop = 0;
}
