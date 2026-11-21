// STUDYVERSE : 지식의 세계 — 부팅, 게임 루프, 입력, 장면 전환
import * as G from './game.js';
import { ui, render, renderHud, setHooks, go, playDialogue, runStoryStep, timerRefs, choiceBox, infoBox } from './ui.js';
import { load, newState, save, setWriteBlocked, lockIsFree, takeLock, holdsLock, releaseLock } from './state.js';
import { SchoolScene, WorldScene, RegionScene, StudyScene, nightLevel, weather, season } from './scene.js';
import { OUTFITS, NPCS, FACILITIES, PORTRAIT_EXTRA, SIDE_QUESTS, REGIONS } from './content.js';
G.on('chapterDone', (c) => { if (c.id === 10) REGIONS[0].name = '새벽별 학당'; });
import { charOpts, npcOpts, portrait, lanternPortrait, pagePortrait } from './pixel.js';
import { itemDef } from './gen.js';
import { story } from './story.js';
import { $, h, fmtDur, fmtMin, beep } from './util.js';

const scenes = { school: new SchoolScene(), world: new WorldScene(), region: new RegionScene(), study: new StudyScene() };
let aiState = '확인 중…';
let aiOk = false;
let blocked = false;

// ───────────────────────── 외형 ─────────────────────────
function playerOpts() {
  const p = G.S.player;
  const o = OUTFITS.find((x) => x.id === p.outfit) || OUTFITS[0];
  const wu = p.equip.staff || p.equip.weapon || p.equip.tome;
  const wd = wu ? itemDef(G.S, G.S.items.find((i) => i.uid === wu)) : null;
  return charOpts(o, p.look || { hair: '#3a2a1a', skin: '#f0c8a0', style: 'short' }, wd?.look || null);
}
const uniform = OUTFITS[0];
function studentOpts(look) { return { pal: uniform.pal, hat: null, cape: false, hair: look.hair, skin: look.skin, style: look.hair.length % 2 ? 'bob' : 'short' }; }
function portraitFor(who) {
  if (who === 'me') return portrait(playerOpts(), '#2a3a5a');
  if (who === 'lantern') return lanternPortrait(performance.now() / 1000);
  if (who === 'adel') return pagePortrait();
  const look = NPCS[who]?.look || PORTRAIT_EXTRA[who]?.look || (who === 'evelyn' ? NPCS.evelyn.look : null);
  if (!look) return pagePortrait();
  const greyLook = who === 'evelyn' && G.S.story.ch >= 8 ? { ...look, grey: false, hair: '#a8c8e8', robe: '#2b3a67', trim: '#e8c46a' } : look;
  return portrait(npcOpts(greyLook), who === 'index' || who === 'hesper' ? '#2a2010' : '#2a2440');
}

// ───────────────────────── NPC 배치 ─────────────────────────
function npcList() {
  const s = G.S;
  const out = [];
  const st = G.storyStatus();
  for (const [id, n] of Object.entries(NPCS)) {
    if (s.story.ch < n.from && s.story.phase !== 'end') continue;
    if (id === 'evelyn' && s.story.ch < 8 && nightLevel() < 0.3) continue; // 회색 학생은 밤에만
    const f = FACILITIES.find((x) => x.id === n.place);
    const built = (s.school.fac[f.id] || 0) > 0;
    const base = built ? scenes.school.door(f) : { x: 18 * 16 + Object.keys(NPCS).indexOf(id) * 22, y: 19 * 16 + 8 };
    const off = { toren: -14, evelyn: 14 }[id] || 12;
    let mark = null;
    const talkObj = st.objs?.some((o) => o.type === 'talk' && o.npc === id && !o.done);
    const sq = SIDE_QUESTS.find((q) => q.npc === id && ['available', 'active'].includes(G.sideQuestState(q).state) && (G.sideQuestState(q).state === 'available' || G.sideQuestState(q).ok));
    if (talkObj || sq) mark = '!';
    else if (!s.story.talk[s.story.ch]?.[id]) mark = '…';
    const look = id === 'evelyn' && s.story.ch >= 8 ? { ...n.look, grey: false, hair: '#a8c8e8', robe: '#2b3a67', trim: '#e8c46a' } : n.look;
    out.push({ id, x: base.x + off, y: base.y + 8, opts: npcOpts(look), mark, dir: 'down' });
  }
  return out;
}

async function talkTo(id) {
  const s = G.S;
  const n = NPCS[id];
  scenes.school.player.interactT = 0.6;
  const lines = G.npcLines(id) || ['…'];
  const line = lines[Math.floor(Math.random() * lines.length)];
  const who = id === 'evelyn' && s.story.ch < 8 ? 'grey' : id;
  await playDialogue([[who, line]], { speakersOverride: { grey: { name: s.story.ch >= 8 ? '에블린' : '회색 학생' } } });
  G.recordTalk(id);
  // 의뢰
  for (const q of SIDE_QUESTS.filter((x) => x.npc === id)) {
    const st = G.sideQuestState(q);
    if (st.state === 'available') {
      const v = await choiceBox(h('div', h('h3', `의뢰: ${q.title}`), h('p', q.desc)), [['yes', '수락한다', '.primary'], ['no', '나중에', '.ghost']]);
      if (v === 'yes') { G.acceptSide(q.id); G.toast(`의뢰 수락: ${q.title}`, 'story'); }
    } else if (st.state === 'active' && st.ok) {
      const done = G.completeSide(q.id);
      if (done) { await playDialogue([[id, done.line]]); G.toast(`의뢰 완료: ${q.title}`, 'level'); }
    }
  }
  G.commit();
  if (G.storyStatus().phase === 'ready') G.toast('이 장의 목표를 모두 달성했습니다! 스토리를 마무리하세요.', 'story');
}
function interact(t) {
  if (!t) return;
  if (t.type === 'npc') talkTo(t.id);
  else { scenes.school.player.interactT = 0.5; ui.focusFac = t.id; ui.sub.school = 'fac'; ui.view = 'school'; render(); }
}

// ───────────────────────── 탐험 ─────────────────────────
let autoTimer = 0;
function startExplore(id, boss) {
  if (G.S.study.active && G.isRunning()) G.toast('공부 타이머는 계속 기록 중입니다.', 'info');
  const e = G.startExpedition(id, boss);
  if (!e) return;
  scenes.region.setRegion(id);
  ui.view = 'explore';
  render();
}
async function act(a) {
  const E = G.EXP;
  if (!E || E.battle.over) return;
  const t = performance.now() / 1000;
  const sc = scenes.region;
  const r = G.playerAct(a);
  if (!r) return render();
  if (r.spell) { sc.castFx(r.spell, t); sc.playerDo(r.spell.kind === 'dmg' || r.spell.kind === 'drain' || r.spell.kind === 'dot' ? 'attack' : 'cast', t, 0.6); beep(r.spell.kind === 'dmg' ? 'cast' : 'ok', G.S.settings.sound); }
  if (r.dmg) { sc.float(`-${r.dmg}${r.crit ? '!' : ''}`, 'enemy', r.crit ? '#ffd86b' : '#ffffff', t + 0.35); sc.enemyHurt = 0.4; }
  if (r.heal) sc.float(`+${r.heal}`, 'player', '#8fe388', t);
  if (r.enemy?.dmg) { setTimeout(() => { sc.float(`-${r.enemy.dmg}`, 'player', '#ff6a6a', performance.now() / 1000); sc.playerDo('hit', performance.now() / 1000, 0.35); sc.shake = 0.2; beep('hit', G.S.settings.sound); }, 450); }
  if (r.win) beep('level', G.S.settings.sound);
  if (r.midline) {
    render();
    await playDialogue(story().finalMid);
  }
  render();
}
function autoBattleTick(dt) {
  const E = G.EXP;
  if (!E || !G.S.settings.autoBattle || E.battle.over || ui.view !== 'explore' || $('#dialog').classList.contains('show')) return;
  autoTimer += dt;
  if (autoTimer < 1.0) return;
  autoTimer = 0;
  const s = G.S, st = G.stats();
  const slots = s.player.spellSlots.filter(Boolean).map((id) => ({ id, sp: G.S.genSpells.find((x) => x.id === id) || null })).map(({ id }) => ({ id, sp: spellLookup(id) })).filter((x) => x.sp && (x.sp.mp || 0) <= E.mp);
  const heal = slots.find((x) => x.sp.kind === 'heal' || x.sp.kind === 'drain');
  if (E.hp < st.maxHp * 0.35 && heal) return act(heal.id);
  const dmg = slots.filter((x) => ['dmg', 'drain', 'dot'].includes(x.sp.kind)).sort((a, b) => b.sp.power - a.sp.power)[0];
  act(dmg ? dmg.id : slots[0]?.id || s.player.spellSlots.find(Boolean));
}
import { spellDef } from './gen.js';
const spellLookup = (id) => spellDef(G.S, id);
function nextEnc() { G.nextEncounter(); render(); }
async function endExplore() {
  const wasFinal = G.EXP?.boss && G.EXP.region === 'vault' && G.EXP.result === 'cleared';
  G.closeExpedition();
  ui.view = 'map';
  render();
  if (wasFinal || G.storyStatus().phase === 'ready') {
    G.toast('이야기의 목표를 모두 달성했습니다!', 'story');
    if (wasFinal) { ui.view = 'story'; render(); await runStoryStep(); }
  }
}

// ───────────────────────── 화면 · 루프 ─────────────────────────
const cv = $('#stage');
const ctx = cv.getContext('2d');
function resize() {
  const r = cv.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.max(1, Math.round(r.width * dpr));
  cv.height = Math.max(1, Math.round(r.height * dpr));
  ctx.imageSmoothingEnabled = false;
}
window.addEventListener('resize', resize);
function schoolZoom(W, H) {
  let z = Math.max(2, Math.round(Math.min(W / (16 * 22), H / (16 * 15))));
  while (H / z > 31 * 16 || W / z > 44 * 16) z++;
  return z;
}
function sceneFor(view) { return view === 'study' ? 'study' : view === 'map' ? 'world' : view === 'explore' ? 'region' : 'school'; }
let last = performance.now();
let tickAcc = 0, schoolAcc = 0, beatAcc = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const t = now / 1000;
  if (G.S && !blocked) {
    const W = cv.width, H = cv.height;
    ctx.imageSmoothingEnabled = false;
    const s = G.S;
    const night = nightLevel();
    const env = {
      zoom: schoolZoom(W, H),
      fac: s.school.fac, stage: G.schoolStage().n, students: s.school.students, npcs: npcList(), season: season(), night, weather: weather(),
      playerOpts: playerOpts(), studentOpts, lanternRadius: 30 + s.player.level, reduceMotion: s.settings.reduceMotion,
      unlocked: s.unlockedRegions, regions: s.regions, vault: G.vaultVisible(),
      running: G.isRunning(), progress: Math.min(1, G.activeElapsed() / (s.study.goalMin * 60000)),
    };
    const sc = sceneFor(ui.view);
    if (sc === 'region' && G.EXP) {
      const E = G.EXP;
      Object.assign(env, { region: E.region, restore: s.regions[E.region].restore, battle: true, enemy: E.battle.enemy, lost: E.result === 'lost' });
    }
    try { scenes[sc].render(ctx, W, H, t, dt, env); } catch (e) { console.error(e); }
    for (const p of ui.previews) { if (p.c.isConnected) { p.ctx.imageSmoothingEnabled = false; p.draw(p.ctx, t); } }
    autoBattleTick(dt);
    tickAcc += dt; schoolAcc += dt; beatAcc += dt;
    if (tickAcc >= 0.5) { tickAcc = 0; secondTick(); }
    if (schoolAcc >= 60) { schoolAcc = 0; G.schoolTick(); G.ensureQuests(); G.checkUnlocks(); save(s); renderHud(); if (['school', 'quests'].includes(ui.view)) render(); }
    if (beatAcc >= 15) { beatAcc = 0; if (holdsLock()) { takeLock(); save(s); } else lockLost(); }
  }
  requestAnimationFrame(frame);
}
let lastSecond = Date.now();
function secondTick() {
  const now = Date.now();
  // 기기가 잠들었다 깨어난 경우(2분 이상 공백) 자리 비움 확인
  if (now - lastSecond > 120000 && G.S.study.active && G.isRunning()) awayCheck(lastSecond);
  lastSecond = now;
  const ph = G.pomoTick(now);
  if (ph) { beep('bell', G.S.settings.sound); G.toast(ph === 'rest' ? `집중 시간 끝! ${G.S.study.pomodoro.rest}분 휴식 (기록 일시정지)` : '휴식 끝! 다시 집중합니다.', 'story'); if (ui.view === 'study') render(); }
  const a = G.S.study.active;
  if (timerRefs.time?.isConnected) {
    timerRefs.time.textContent = fmtDur(G.activeElapsed());
    if (a?.pomo) {
      const { focus, rest } = G.S.study.pomodoro;
      const left = a.pomo.phase === 'focus' ? focus * 60000 - (now - a.pomo.phaseStart) : rest * 60000 - (now - a.pomo.phaseStart);
      timerRefs.phase.textContent = `${a.pomo.phase === 'focus' ? '집중' : '휴식'} 남은 시간 ${fmtDur(Math.max(0, left))} · ${a.pomo.cycles}회 완료`;
    } else timerRefs.phase.textContent = a ? (G.isRunning() ? '기록 중' : '일시정지됨') : '';
  }
  const chip = $('#hud-timer');
  if (a) { chip.hidden = false; chip.textContent = `⏱ ${fmtDur(G.activeElapsed())}${G.isRunning() ? '' : ' ❚❚'}`; } else chip.hidden = true;
  document.title = a && G.isRunning() ? `⏱ ${fmtDur(G.activeElapsed())} · STUDYVERSE` : 'STUDYVERSE : 지식의 세계';
}

let awayOpen = false;
async function awayCheck(lastSeen) {
  if (awayOpen) return;
  const a = G.S.study.active;
  if (!a || !G.isRunning()) return;
  const gap = Date.now() - lastSeen;
  if (gap < G.S.settings.awayConfirmMin * 60000) return;
  awayOpen = true;
  const v = await choiceBox(h('div', h('h3', '타이머가 켜진 채로 자리를 비웠어요'), h('p', `마지막으로 확인된 뒤 ${fmtMin(gap / 60000)}이 지났습니다. 그동안 계속 공부했나요?`), h('p.small.dim', '정직하게 기록할수록 게임 속 성장도 의미가 있어요.')),
    [['yes', '네, 계속 공부했어요 (전부 기록)', '.primary'], ['no', '아니요, 자리를 비웠어요 (그 전까지만 기록)', '']]);
  if (v === 'no') G.pauseStudy(lastSeen);
  awayOpen = false;
  render();
}

// ───────────────────────── 입력 ─────────────────────────
const typing = () => ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
const overlayOpen = () => $('#dialog').classList.contains('show') || $('#modal').classList.contains('show');
window.addEventListener('keydown', (e) => {
  if (!G.S || typing()) return;
  if (overlayOpen()) {
    if ((e.key === ' ' || e.key === 'Enter') && $('#dialog').classList.contains('show')) { e.preventDefault(); $('#dialog').click(); }
    return;
  }
  if (ui.view === 'explore' && /^[1-4]$/.test(e.key)) { const id = G.S.player.spellSlots[+e.key - 1]; if (id) act(id); return; }
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (sceneFor(ui.view) === 'school') {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'Shift'].includes(k)) { scenes.school.keys.add(k); if (k.startsWith('Arrow')) e.preventDefault(); }
    if ((k === 'e' || k === ' ') && scenes.school.near) { e.preventDefault(); interact(scenes.school.near); }
  }
});
window.addEventListener('keyup', (e) => { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; scenes.school.keys.delete(k); });
window.addEventListener('blur', () => scenes.school.keys.clear());
cv.addEventListener('pointerdown', (e) => {
  if (!G.S || overlayOpen()) return;
  const r = cv.getBoundingClientRect();
  const dpr = cv.width / r.width;
  const sx = (e.clientX - r.left) * dpr, sy = (e.clientY - r.top) * dpr;
  const sc = sceneFor(ui.view);
  if (sc === 'school') {
    const z = schoolZoom(cv.width, cv.height);
    const w = scenes.school.screenToWorld(sx, sy, z);
    const hit = scenes.school.hitTest(w.x, w.y);
    const pl = scenes.school.player;
    if (hit) {
      const tgt = hit.type === 'npc' ? scenes.school.npcs.find((n) => n.id === hit.id) : scenes.school.door(FACILITIES.find((f) => f.id === hit.id));
      pl.target = { x: tgt.x, y: tgt.y + (hit.type === 'npc' ? 10 : 0), run: true, onArrive: () => interact(hit) };
    } else pl.target = { x: w.x, y: w.y };
    if (ui.view !== 'home' && window.innerWidth < 860) go('home');
  } else if (sc === 'world') {
    const p = scenes.world.pick(sx, sy);
    if (p) { ui.selRegion = p.id; ui.view = 'map'; render(); document.body.classList.add('panel-open'); }
  }
});

// ───────────────────────── 토스트 ─────────────────────────
G.on('toast', ({ msg, kind }) => {
  const box = $('#toasts');
  const el = h('div.toast.' + kind, msg);
  box.append(el);
  if (kind === 'level') beep('level', G.S?.settings.sound);
  setTimeout(() => el.classList.add("out"), 3200);
  setTimeout(() => el.remove(), 3800);
  while (box.children.length > 4) box.firstChild.remove();
});
G.on('change', () => { if (!$('#dialog').classList.contains('show')) { if (ui.view === 'study' && G.S.study.active && G.isRunning()) renderHud(); else render(); } });

// ───────────────────────── 탭 잠금 ─────────────────────────
function lockLost() {
  blocked = true;
  setWriteBlocked(true);
  const ov = $('#blocker');
  ov.hidden = false;
  ov.innerHTML = '';
  ov.append(h('div.mbox', h('h3', '다른 탭에서 게임이 열려 있어요'), h('p', '같은 저장 데이터를 두 곳에서 동시에 쓰면 기록이 꼬이거나 보상이 중복될 수 있어 이 탭을 멈췄습니다.'),
    h('div.acts', h('button.btn.primary', { onclick: () => { takeLock(); location.reload(); } }, '여기서 계속하기'))));
}
window.addEventListener('storage', (e) => { if (e.key === 'studyverse.lock' && G.S && !blocked && !holdsLock()) lockLost(); });
window.addEventListener('beforeunload', () => { if (G.S && !blocked) { save(G.S); releaseLock(); } });
document.addEventListener('visibilitychange', () => {
  if (!G.S || blocked) return;
  if (document.hidden) save(G.S);
  else { G.schoolTick(); render(); }
});

// ───────────────────────── 시작 ─────────────────────────
function initState(s) {
  G.setState(s);
  if (s.story.done.includes(10)) REGIONS[0].name = '새벽별 학당';
  s.player.look ||= { hair: '#3a2a1a', skin: '#f0c8a0', style: 'short' };
  if (G.refundPendingExpedition()) G.toast('중단된 탐험의 탐험력을 돌려받았습니다.', 'info');
  G.bootstrap();
  save(s);
}
setHooks({
  portraitFor, playerOpts, studentOpts, weather, interact, startExplore, act, nextEnc, endExplore,
  near: () => scenes.school.near, aiStatus: () => aiState, aiConfigured: () => aiOk,
  replaceState: (ns) => { initState(ns); render(); G.toast('백업을 불러왔습니다.', 'level'); },
  onView: (v) => document.body.classList.toggle('panel-open', v !== 'home'),
});

async function checkAi() {
  try {
    const r = await fetch('/api/status');
    const j = await r.json();
    aiOk = Boolean(j?.ai?.configured);
    aiState = j?.ai?.configured ? `연결됨 (${j.ai.model})` : '서버에 API 키가 설정되지 않음 — 기본 콘텐츠로 플레이합니다';
  } catch { aiState = 'AI 서버 없음 (정적 호스팅) — 기본 콘텐츠로 플레이합니다'; }
}

function titleScreen() {
  return new Promise((resolve) => {
    const ov = $('#title');
    ov.hidden = false;
    const name = h('input.inp', { placeholder: '이름을 입력하세요', maxlength: 12, value: '' });
    const start = () => { const n = name.value.trim().slice(0, 12); if (!n) { name.focus(); return; } ov.hidden = true; resolve(n); };
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') start(); });
    ov.querySelector('.tform').append(name, h('button.btn.primary.big', { onclick: start }, '입학하기'));
    setTimeout(() => name.focus(), 50);
  });
}

async function boot() {
  resize();
  checkAi();
  if (!lockIsFree()) { G.setState(newState()); lockLost(); requestAnimationFrame(frame); return; }
  takeLock();
  const { state, recovered } = load();
  let fresh = false;
  const prevSeen = state?.lastSeen || Date.now();
  if (state) initState(state);
  else {
    const name = await titleScreen();
    initState(newState(name));
    fresh = true;
  }
  document.body.classList.add('ready');
  resize();
  render();
  requestAnimationFrame(frame);
  if (recovered) infoBox('저장 데이터 복구', h('p', '최근 저장 데이터가 손상되어 직전 백업에서 복구했습니다.'));
  // 공부 타이머가 켜진 채로 떠나 있었다면 확인
  if (!fresh && G.S.study.active && G.isRunning()) await awayCheck(prevSeen);
  if (fresh) await runStoryStep();
  else if (G.storyStatus().phase === 'intro') G.toast('새로운 이야기가 기다리고 있습니다. (스토리 메뉴)', 'story');
}

// 메뉴
document.querySelectorAll('#menu button').forEach((b) => b.addEventListener('click', () => { beep('click', G.S?.settings.sound); if (b.dataset.view === 'explore' && !G.EXP) return go('map'); if (G.EXP?.done && b.dataset.view !== 'explore') G.closeExpedition(); if (G.EXP && !G.EXP.done && b.dataset.view !== 'explore') { G.toast('전투 중에는 이동할 수 없습니다. 후퇴하거나 전투를 끝내세요.', 'warn'); return; } go(b.dataset.view); }));
$('#panel-close').addEventListener('click', () => { if (G.EXP && !G.EXP.done) return; if (G.EXP) G.closeExpedition(); go('home'); });
$('#hud-timer').addEventListener('click', () => go('study'));
// 개발용: ?debug=1 일 때만 콘솔에서 상태를 살펴볼 수 있게 노출
if (new URLSearchParams(location.search).has('debug')) window.__sv = { G, ui, scenes, runStoryStep, render, act, endExplore, nextEnc, startExplore, talkTo };
boot();
