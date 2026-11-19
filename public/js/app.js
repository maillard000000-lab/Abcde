import * as store from './store.js';
import * as jobs from './jobs.js';
import { getStatus } from './api.js';
import { splitPassage, countWords } from './split.js';
import { esc, icon, $, $$, toast, confirmDialog, openModal, relTime, fmtDate, importanceBadge, debounce } from './ui.js';
import { renderPassage, ui as passageUi, TABS, filteredVocab, vocabList, questionTypeEditor } from './views/passage.js';
import { drawArcs, focusDiagram } from './views/diagram.js';
import { LEVEL_LABELS, reviewInfo, wordKey } from './shared.js';

const state = {
  status: null, // 서버 상태 (/api/status)
  route: { name: 'home' },
  sideFilter: 'all',
  sideQuery: '',
  nbFilter: 'todo',
  nbQuery: '',
};
const DRAFT_KEY = 'passage-lab:draft';
const THEME_KEY = 'passage-lab:theme';

// ───────────────────────── 부팅 ─────────────────────────
async function boot() {
  applyTheme(lsGet(THEME_KEY) || 'system');
  const backend = await store.init();
  if (backend === 'memory') toast('이 브라우저에서는 저장소를 사용할 수 없어 새로고침 시 데이터가 사라집니다.', 'error');
  try {
    state.status = await getStatus();
  } catch {
    state.status = null;
  }
  store.subscribe(onStoreChange);
  window.addEventListener('hashchange', route);
  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
  document.addEventListener('input', onInput);
  document.addEventListener('keydown', onKeydown);
  window.addEventListener('resize', debounce(redrawDiagram, 150));
  route();
  if (store.syncInfo().code) store.syncNow();
}

function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* 무시 */ } }

function applyTheme(t) {
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

// ───────────────────────── 라우팅 ─────────────────────────
function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const parts = h.split('/').filter(Boolean);
  if (parts[0] === 'p' && parts[1]) {
    const tab = TABS.some((t) => t.id === parts[2]) ? parts[2] : 'overview';
    return { name: 'passage', id: decodeURIComponent(parts[1]), tab };
  }
  if (parts[0] === 'vocab') return { name: 'vocab' };
  if (parts[0] === 'settings') return { name: 'settings' };
  return { name: 'home' };
}

export function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

function route() {
  const prev = state.route;
  state.route = parseHash();
  document.body.classList.remove('nav-open');
  if (state.route.name === 'passage') {
    const p = store.get(state.route.id);
    if (!p) { toast('지문을 찾을 수 없습니다.', 'error'); go('#/'); return; }
    if (prev.name !== 'passage' || prev.id !== p.id) {
      store.update(p.id, (x) => { x.lastOpenedAt = new Date().toISOString(); }, { silent: true });
    }
  }
  const samePassage = prev.name === 'passage' && state.route.name === 'passage' && prev.id === state.route.id;
  render({ keepScroll: false, tabSwitch: samePassage });
}

// ───────────────────────── 렌더링 ─────────────────────────
let rafPending = false;
function scheduleRender() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => { rafPending = false; render({ keepScroll: true }); });
}

function render({ keepScroll = true, tabSwitch = false } = {}) {
  renderSidebar();
  const view = $('#view');
  const active = document.activeElement;
  const focusId = active && view.contains(active) ? active.id : '';
  const selStart = focusId && 'selectionStart' in active ? active.selectionStart : null;
  const scrollY = window.scrollY;
  const r = state.route;
  let title = 'Passage Lab';
  if (r.name === 'passage') {
    const p = store.get(r.id);
    if (!p) return;
    view.innerHTML = renderPassage(p, r.tab);
    title = p.title || '지문 분석';
    if (r.tab === 'overview') requestAnimationFrame(redrawDiagram);
  } else if (r.name === 'vocab') {
    view.innerHTML = renderNotebook();
    title = '내 단어장';
  } else if (r.name === 'settings') {
    view.innerHTML = renderSettings();
    title = '동기화 · 설정';
  } else {
    view.innerHTML = renderHome();
    updateInputMeta();
  }
  $('#topbar-title').textContent = title;
  document.title = `${title === 'Passage Lab' ? '' : `${title} · `}Passage Lab`;
  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) {
      el.focus({ preventScroll: true });
      if (selStart != null && 'setSelectionRange' in el) { try { el.setSelectionRange(selStart, selStart); } catch { /* 무시 */ } }
    }
  }
  if (keepScroll) window.scrollTo(0, scrollY);
  else if (tabSwitch) {
    const tabs = $('.tabs-wrap');
    if (tabs && window.scrollY > tabs.offsetTop) window.scrollTo(0, tabs.offsetTop);
  } else window.scrollTo(0, 0);
}

function onStoreChange(kind, id) {
  if (kind === 'storage-error') { toast('브라우저 저장 공간에 저장하지 못했습니다. 저장 공간을 확인해 주세요.', 'error'); return; }
  if (kind === 'sync') { renderSidebar(); if (state.route.name === 'settings') scheduleRender(); return; }
  if (state.route.name === 'passage' && kind === 'delete' && id === state.route.id) { go('#/'); return; }
  // 입력 중인 답안이 있으면 해당 화면 전체를 다시 그리지 않고 사이드바만 갱신
  const a = document.activeElement;
  if (a && a.matches?.('textarea[data-action="written"], .p-title, #passage-input, #title-new')) { renderSidebar(); return; }
  scheduleRender();
}

function redrawDiagram() {
  const r = state.route;
  if (r.name !== 'passage' || r.tab !== 'overview') return;
  const p = store.get(r.id);
  const rel = p?.analysis?.overview?.data?.relations;
  if (rel) drawArcs($('#view'), rel);
}

// ───────────────────────── 사이드바 ─────────────────────────
function renderSidebar() {
  const all = store.list();
  const q = state.sideQuery.trim().toLowerCase();
  const counts = {
    all: all.length,
    fav: all.filter((p) => p.favorite).length,
    learning: all.filter((p) => !p.completed).length,
    done: all.filter((p) => p.completed).length,
    review: all.filter((p) => reviewInfo(p).due).length,
  };
  const filters = [['all', '전체'], ['fav', '즐겨찾기'], ['learning', '학습 중'], ['done', '학습 완료'], ['review', '복습 필요']];
  const list = all
    .filter((p) => ({
      all: true, fav: p.favorite, learning: !p.completed, done: p.completed, review: reviewInfo(p).due,
    }[state.sideFilter]))
    .filter((p) => !q || (p.title || '').toLowerCase().includes(q) || p.text.toLowerCase().includes(q))
    .sort((a, b) => (b.lastOpenedAt || b.createdAt).localeCompare(a.lastOpenedAt || a.createdAt));
  const cur = state.route.name === 'passage' ? state.route.id : '';
  const sync = store.syncInfo();
  const unmem = countUnmemorized();
  const searchFocused = document.activeElement?.id === 'side-search';
  $('#sidebar').innerHTML = `
    <a class="brand" href="#/">
      <span class="brand-mark">P</span>
      <span><div class="brand-name">Passage Lab</div><div class="brand-sub">영어 지문 분석 · 내신 대비</div></span>
    </a>
    <div class="side-actions">
      <a class="btn btn-primary btn-block" href="#/">${icon('plus')}새 지문 분석</a>
      <div class="side-search">${icon('search')}<input id="side-search" type="search" placeholder="제목·내용 검색" value="${esc(state.sideQuery)}" aria-label="지문 검색"></div>
    </div>
    <div class="side-filters" role="group" aria-label="지문 필터">
      ${filters.map(([k, l]) => `<button class="chip" data-action="side-filter" data-f="${k}" aria-pressed="${state.sideFilter === k}">${l}<span class="count">${counts[k]}</span></button>`).join('')}
    </div>
    <div class="side-list">
      <div class="side-section-title">최근 학습한 지문</div>
      ${list.length ? list.map((p) => {
        const a = p.analysis;
        const prog = jobs.progress(a);
        const running = jobs.isActive(p.id);
        const rv = reviewInfo(p);
        return `<a class="side-item ${p.id === cur ? 'active' : ''}" href="#/p/${encodeURIComponent(p.id)}/overview">
          <div class="side-item-title">${p.favorite ? icon('star', 'star-on') : ''}<span>${esc(p.title || '제목 없는 지문')}</span></div>
          <div class="side-item-meta">
            <span>${relTime(p.lastOpenedAt || p.createdAt)}</span>
            ${running ? `<span class="pill pill-warn">분석 중 ${prog.pct}%</span>` : ''}
            ${!running && a && prog.failed ? '<span class="pill pill-danger">일부 실패</span>' : ''}
            ${!a ? '<span class="pill">미분석</span>' : ''}
            ${p.completed ? '<span class="pill pill-ok">완료</span>' : ''}
            ${rv.due ? '<span class="pill pill-accent">복습</span>' : ''}
          </div>
        </a>`;
      }).join('') : `<div class="side-empty">${all.length ? '조건에 맞는 지문이 없습니다.' : '아직 저장된 지문이 없습니다.<br>새 지문을 분석해 보세요.'}</div>`}
    </div>
    <div class="side-foot">
      <a class="side-link ${state.route.name === 'vocab' ? 'active' : ''}" href="#/vocab">${icon('book')}내 단어장${unmem ? `<span class="pill pill-brand badge">${unmem}</span>` : ''}</a>
      <a class="side-link ${state.route.name === 'settings' ? 'active' : ''}" href="#/settings">${icon('cloud')}동기화 · 설정<span class="sync-dot ${sync.status}" title="${syncLabel(sync)}"></span></a>
    </div>`;
  if (searchFocused) {
    const el = $('#side-search');
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }
}

function syncLabel(s) {
  return { off: '클라우드 동기화 꺼짐 (이 기기에만 저장)', idle: '동기화됨', syncing: '동기화 중', error: `동기화 오류: ${s.error}` }[s.status] || '';
}

function countUnmemorized() {
  let n = 0;
  for (const p of store.list()) {
    const mem = p.memorized || {};
    for (const v of vocabList(p)) if (!mem[wordKey(v.word)]) n++;
  }
  return n;
}

// ───────────────────────── 홈 (새 지문 입력) ─────────────────────────
function renderHome() {
  const st = state.status;
  const limits = st?.limits || { maxChars: 12000, maxSentences: 120 };
  const draft = safeJson(lsGet(DRAFT_KEY)) || {};
  const recent = store.list().sort((a, b) => (b.lastOpenedAt || '').localeCompare(a.lastOpenedAt || '')).slice(0, 6);
  let aiNotice = '';
  if (!st) {
    aiNotice = `<div class="notice notice-danger" style="margin-bottom:16px">${icon('alert')}<div class="notice-body"><b>분석 서버에 연결할 수 없습니다.</b> 저장된 지문 열람은 가능하지만 새 분석은 서버 연결 후 실행할 수 있습니다. <button class="btn btn-sm" data-action="recheck-status" style="margin-left:6px">다시 확인</button></div></div>`;
  } else if (!st.ai.configured) {
    aiNotice = `<div class="notice notice-warn" style="margin-bottom:16px">${icon('alert')}<div class="notice-body"><b>AI 분석이 아직 연결되지 않았습니다.</b> 서버에 <code>ANTHROPIC_API_KEY</code> 환경 변수를 설정하면 분석을 실행할 수 있습니다. 연결 전에는 지문을 저장만 할 수 있으며, 가짜 분석 결과는 표시하지 않습니다.</div></div>`;
  }
  return `
  <div class="hero">
    <h1>영어 지문을 넣으면,<br>시험 대비 분석 자료가 완성됩니다</h1>
    <p>전체 내용·글의 구조, 모든 문장의 해석과 구조·문법, 핵심 어휘, 내신·수능 출제 포인트, 예상 문제까지 한 번에 분석합니다.</p>
  </div>
  ${aiNotice}
  <form class="card" id="new-form" autocomplete="off">
    <div class="stack">
      <div class="grid-2">
        <div class="field"><label for="title-new">지문 제목 <span class="muted">(선택 · 비우면 AI가 제목을 붙입니다)</span></label>
          <input class="input" id="title-new" name="title" maxlength="120" placeholder="예: 2025 고2 9월 모의고사 31번" value="${esc(draft.title || '')}"></div>
        <div class="field"><label for="level-new">학습자 수준</label>
          <select class="select" id="level-new" name="level">
            ${Object.entries(LEVEL_LABELS).map(([k, l]) => `<option value="${k}" ${(draft.level || 'high2') === k ? 'selected' : ''}>${l}</option>`).join('')}
          </select></div>
      </div>
      <div class="field">
        <label for="passage-input">영어 지문</label>
        <textarea class="textarea passage-input" id="passage-input" name="text" spellcheck="false" placeholder="분석할 영어 지문 전체를 붙여 넣으세요. 문단은 빈 줄로 구분합니다." maxlength="${limits.maxChars + 2000}">${esc(draft.text || '')}</textarea>
        <div class="input-meta" id="input-meta"></div>
      </div>
      <details class="preview" id="split-preview"><summary>${icon('chevron')}문장 분리 미리보기 <span class="muted" id="split-count"></span></summary><ol class="preview-list" id="split-list"></ol></details>
      <div class="field">
        <span class="label">예상 문제 유형과 문항 수</span>
        ${questionTypeEditor(draft.types || jobs.defaultQuestionTypes(), 'nq')}
      </div>
      <div class="row">
        <button class="btn btn-primary btn-lg" type="submit" id="analyze-btn">${icon('sparkle')}분석 시작</button>
        <button class="btn btn-ghost" type="button" data-action="save-only">지문만 저장</button>
        <span class="spacer"></span>
        <button class="btn btn-ghost btn-sm" type="button" data-action="clear-draft">입력 지우기</button>
      </div>
    </div>
  </form>
  ${recent.length ? `
  <div style="margin-top:32px">
    <div class="row" style="margin-bottom:12px"><h2 style="font-size:18px">최근 학습한 지문</h2><span class="spacer"></span><span class="muted small">총 ${store.list().length}개 저장됨</span></div>
    <div class="recent-grid">
      ${recent.map((p) => `<a class="recent-card" href="#/p/${encodeURIComponent(p.id)}/overview">
        <h4>${p.favorite ? '★ ' : ''}${esc(p.title || '제목 없는 지문')}</h4>
        <p>${esc(p.text.slice(0, 160))}</p>
        <div class="row small muted"><span>${relTime(p.lastOpenedAt)}</span>${p.completed ? '<span class="pill pill-ok">완료</span>' : ''}${reviewInfo(p).due ? '<span class="pill pill-accent">복습 필요</span>' : ''}</div>
      </a>`).join('')}
    </div>
  </div>` : ''}`;
}

function safeJson(s) { try { return s ? JSON.parse(s) : null; } catch { return null; } }

function readTypes(form, prefix) {
  const types = [];
  for (const cb of $$(`input[name="${prefix}"]`, form)) {
    if (!cb.checked) continue;
    const sel = $(`select[name="${prefix}-count"][data-type="${CSS.escape(cb.value)}"]`, form);
    types.push({ type: cb.value, count: Number(sel?.value || 1) });
  }
  return types;
}

function saveDraft() {
  const form = $('#new-form');
  if (!form) return;
  lsSet(DRAFT_KEY, JSON.stringify({
    title: form.title.value, level: form.level.value, text: form.text.value, types: readTypes(form, 'nq'),
  }));
}
const saveDraftDebounced = debounce(saveDraft, 400);

function updateInputMeta() {
  const ta = $('#passage-input');
  if (!ta) return;
  const limits = state.status?.limits || { maxChars: 12000, maxSentences: 120 };
  const text = ta.value;
  const sents = splitPassage(text);
  const words = countWords(text);
  const paras = new Set(sents.map((s) => s.paragraph)).size;
  const over = text.length > limits.maxChars;
  $('#input-meta').innerHTML = `
    <span><b>${words.toLocaleString()}</b> 단어</span>
    <span><b>${sents.length}</b> 문장</span>
    <span><b>${paras}</b> 문단</span>
    <span class="${over ? 'over' : ''}">${text.length.toLocaleString()} / ${limits.maxChars.toLocaleString()}자${over ? ' (너무 깁니다. 나누어 분석해 주세요)' : ''}</span>
    ${/[가-힣]/.test(text) ? '<span class="over">한글이 포함되어 있습니다. 영어 지문만 넣어 주세요.</span>' : ''}`;
  $('#split-count').textContent = sents.length ? `· ${sents.length}문장` : '';
  $('#split-list').innerHTML = sents.map((s) => `<li><span class="n">S${s.index}</span><span>${esc(s.text)}</span></li>`).join('');
}

function validateNew(form) {
  const text = form.text.value.trim();
  const limits = state.status?.limits || { maxChars: 12000, maxSentences: 120 };
  if (!text) return '분석할 영어 지문을 입력해 주세요.';
  if (countWords(text) < 5) return '영어 문장이 충분하지 않습니다. 영어 지문을 입력해 주세요.';
  if (text.length > limits.maxChars) return `지문이 너무 깁니다. ${limits.maxChars.toLocaleString()}자 이하로 나누어 주세요.`;
  const sents = splitPassage(text);
  if (sents.length > limits.maxSentences) return `문장 수가 너무 많습니다(최대 ${limits.maxSentences}문장).`;
  return '';
}

function createFromForm(analyze) {
  const form = $('#new-form');
  const err = validateNew(form);
  if (err) { toast(err, 'error'); $('#passage-input').focus(); return; }
  const types = readTypes(form, 'nq');
  if (analyze) {
    if (!state.status) { toast('분석 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.', 'error'); return; }
    if (!state.status.ai.configured) { toast('AI 분석이 연결되지 않아 분석을 시작할 수 없습니다. "지문만 저장"을 이용하세요.', 'error'); return; }
    if (!types.length) { toast('예상 문제 유형을 하나 이상 선택해 주세요.', 'error'); return; }
    if (types.reduce((a, t) => a + t.count, 0) > 16) { toast('예상 문제는 최대 16문항까지 만들 수 있습니다.', 'error'); return; }
  }
  const text = form.text.value.trim();
  const p = store.create({
    title: form.title.value.trim(),
    text,
    level: form.level.value,
    sentences: splitPassage(text),
    questionTypes: types.length ? types : jobs.defaultQuestionTypes(),
  });
  lsSet(DRAFT_KEY, null);
  if (analyze) jobs.run(p.id);
  go(`#/p/${encodeURIComponent(p.id)}/overview`);
  toast(analyze ? '분석을 시작했습니다.' : '지문을 저장했습니다.', 'ok');
}

// ───────────────────────── 내 단어장 ─────────────────────────
function notebookEntries() {
  const out = [];
  for (const p of store.list()) {
    const mem = p.memorized || {};
    for (const v of vocabList(p)) out.push({ v, p, memorized: !!mem[wordKey(v.word)] });
  }
  return out;
}

function notebookFiltered() {
  const q = state.nbQuery.trim().toLowerCase();
  return notebookEntries()
    .filter((e) => (state.nbFilter === 'all' ? true : state.nbFilter === 'todo' ? !e.memorized : e.memorized))
    .filter((e) => !q || e.v.word.toLowerCase().includes(q) || (e.v.context_meaning || '').includes(q))
    .sort((a, b) => ({ 상: 0, 중: 1, 하: 2 }[a.v.importance] ?? 3) - ({ 상: 0, 중: 1, 하: 2 }[b.v.importance] ?? 3) || a.v.word.localeCompare(b.v.word));
}

function renderNotebook() {
  const all = notebookEntries();
  const done = all.filter((e) => e.memorized).length;
  const list = notebookFiltered();
  const passagesWithVocab = new Set(all.map((e) => e.p.id)).size;
  return `
  <div class="hero" style="margin-bottom:18px"><h1>내 단어장</h1><p>분석한 모든 지문의 핵심 어휘를 모았습니다. 암기한 단어를 체크하고, 아직 외우지 못한 단어만 모아 카드로 학습하세요.</p></div>
  <div class="stat-row">
    <div class="stat"><div class="v">${all.length}</div><div class="k">전체 단어</div></div>
    <div class="stat"><div class="v">${all.length - done}</div><div class="k">암기할 단어</div></div>
    <div class="stat"><div class="v">${done}</div><div class="k">암기 완료</div></div>
    <div class="stat"><div class="v">${passagesWithVocab}</div><div class="k">지문 수</div></div>
  </div>
  <div class="vocab-toolbar">
    <div class="row" role="group" aria-label="암기 상태 필터">
      <button class="chip" data-action="nb-filter" data-f="todo" aria-pressed="${state.nbFilter === 'todo'}">암기 안 한 단어</button>
      <button class="chip" data-action="nb-filter" data-f="all" aria-pressed="${state.nbFilter === 'all'}">전체</button>
      <button class="chip" data-action="nb-filter" data-f="done" aria-pressed="${state.nbFilter === 'done'}">암기 완료</button>
    </div>
    <div class="side-search" style="min-width:200px">${icon('search')}<input id="nb-search" type="search" class="input" style="padding-left:34px" placeholder="단어·뜻 검색" value="${esc(state.nbQuery)}"></div>
    <button class="btn btn-sm btn-primary" data-action="nb-flashcards" ${list.length ? '' : 'disabled'}>${icon('layers')}단어 카드 학습 (${list.length})</button>
  </div>
  ${list.length ? `<div class="table-wrap"><table class="vocab" style="min-width:640px">
    <thead><tr><th>암기</th><th>단어</th><th>품사</th><th>문맥상 의미</th><th>유의어 / 반의어</th><th>중요도</th><th>지문</th></tr></thead>
    <tbody>${list.map((e, i) => `<tr class="${e.memorized ? 'memorized' : ''}">
      <td><label class="mem-check"><input type="checkbox" data-action="nb-memorize" data-pid="${esc(e.p.id)}" data-word="${esc(wordKey(e.v.word))}" ${e.memorized ? 'checked' : ''} aria-label="${esc(e.v.word)} 암기 완료"></label></td>
      <td><button class="word-btn" data-action="nb-card" data-i="${i}">${esc(e.v.word)}</button></td>
      <td class="muted">${esc(e.v.pos)}</td>
      <td><b>${esc(e.v.context_meaning)}</b><div class="muted small">${esc(e.v.base_meaning)}</div></td>
      <td class="en small">${esc((e.v.synonyms || []).join(', ')) || '-'}${e.v.antonyms?.length ? `<div class="muted">↔ ${esc(e.v.antonyms.join(', '))}</div>` : ''}</td>
      <td>${importanceBadge(e.v.importance)}</td>
      <td><a href="#/p/${encodeURIComponent(e.p.id)}/vocab" class="small">${esc(e.p.title || '지문')}</a></td>
    </tr>`).join('')}</tbody></table></div>`
    : `<div class="card empty-state">${icon('book')}<h3>${all.length ? (state.nbFilter === 'todo' ? '암기할 단어를 모두 외웠습니다!' : '조건에 맞는 단어가 없습니다') : '아직 단어가 없습니다'}</h3><p>${all.length ? '' : '지문을 분석하면 핵심 어휘가 이곳에 모입니다.'}</p></div>`}`;
}

// ───────────────────────── 단어 카드 (플래시카드) ─────────────────────────
function openFlashcards(entries, start = 0) {
  if (!entries.length) return;
  let i = Math.min(start, entries.length - 1);
  let flipped = false;
  const { el, close } = openModal('<div id="fc"></div>', { className: 'fc-modal', onClose: () => { document.removeEventListener('keydown', onKey); scheduleRender(); } });
  const draw = () => {
    const { v, p } = entries[i];
    const mem = !!store.get(p.id)?.memorized?.[wordKey(v.word)];
    const sent = p.sentences[v.sentence_index - 1]?.text || '';
    const join = (a) => (a?.length ? esc(a.join(', ')) : '-');
    const ctx = sent ? esc(sent).replace(new RegExp(`\\b(${escapeRe(esc(v.word))}\\w*)`, 'i'), '<b>$1</b>') : '';
    el.querySelector('#fc').innerHTML = `
      <div class="wordcard ${flipped ? 'flipped' : ''}">
        <div class="wc-inner" data-fc="flip" role="button" tabindex="0" aria-label="카드 뒤집기">
          <div class="wc-face wc-front">
            <div class="wc-word">${esc(v.word)}</div>
            <div class="wc-pos">${esc(v.pos)} ${importanceBadge(v.importance)}</div>
            ${mem ? '<div class="pill pill-ok" style="margin-top:12px">암기 완료</div>' : ''}
            <div class="wc-hint">카드를 누르면 뜻이 보입니다 (Space)</div>
          </div>
          <div class="wc-face wc-back">
            <div style="font-family:var(--font-en);font-weight:700;font-size:22px;margin-bottom:10px">${esc(v.word)} <span class="muted small" style="font-family:var(--font-ui)">${esc(v.pos)}</span></div>
            <dl>
              <dt>문맥상 의미</dt><dd><b>${esc(v.context_meaning)}</b></dd>
              <dt>기본 의미</dt><dd>${esc(v.base_meaning)}</dd>
              <dt>유의어</dt><dd class="en">${join(v.synonyms)}</dd>
              <dt>반의어</dt><dd class="en">${join(v.antonyms)}</dd>
              <dt>파생어</dt><dd class="en">${join(v.derivatives)}</dd>
              ${v.confusables ? `<dt>혼동 주의</dt><dd>${esc(v.confusables)}</dd>` : ''}
            </dl>
            ${ctx ? `<div class="ctx">S${v.sentence_index}. ${ctx}</div>` : ''}
          </div>
        </div>
      </div>
      <div class="wc-nav">
        <button class="btn btn-sm" data-fc="prev" ${i === 0 ? 'disabled' : ''} aria-label="이전 단어">${icon('arrowLeft')}</button>
        <span class="count">${i + 1} / ${entries.length} · ${esc(p.title || '')}</span>
        <button class="btn btn-sm" data-fc="next" ${i === entries.length - 1 ? 'disabled' : ''} aria-label="다음 단어">${icon('arrowRight')}</button>
      </div>
      <div class="row" style="margin-top:10px;justify-content:center">
        <button class="btn ${mem ? 'on-ok' : 'btn-primary'}" data-fc="mem">${icon('check')}${mem ? '암기 완료됨 (취소)' : '외웠어요'}</button>
      </div>`;
  };
  const toggleMem = () => {
    const { v, p } = entries[i];
    const k = wordKey(v.word);
    let nowMem = false;
    store.update(p.id, (x) => { x.memorized ||= {}; if (x.memorized[k]) delete x.memorized[k]; else { x.memorized[k] = true; nowMem = true; } }, { silent: true });
    if (nowMem && i < entries.length - 1) { i++; flipped = false; }
    draw();
  };
  const onKey = (e) => {
    if (e.target.closest?.('input, textarea, select')) return;
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flipped = !flipped; draw(); }
    if (e.key === 'ArrowRight' && i < entries.length - 1) { i++; flipped = false; draw(); }
    if (e.key === 'ArrowLeft' && i > 0) { i--; flipped = false; draw(); }
  };
  document.addEventListener('keydown', onKey);
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-fc]');
    if (!b) return;
    const a = b.dataset.fc;
    if (a === 'flip') flipped = !flipped;
    if (a === 'prev' && i > 0) { i--; flipped = false; }
    if (a === 'next' && i < entries.length - 1) { i++; flipped = false; }
    if (a === 'mem') return toggleMem();
    draw();
  });
  draw();
  return close;
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// ───────────────────────── 설정 / 동기화 ─────────────────────────
function renderSettings() {
  const st = state.status;
  const sync = store.syncInfo();
  const backend = store.getBackend();
  const theme = lsGet(THEME_KEY) || 'system';
  const all = store.list();
  return `
  <div class="hero" style="margin-bottom:18px"><h1>동기화 · 설정</h1><p>학습 데이터는 이 브라우저에 자동 저장됩니다. 클라우드 동기화를 켜면 다른 기기에서도 이어서 학습할 수 있습니다.</p></div>

  <div class="card">
    <div class="card-title">${icon('cloud')}클라우드 동기화</div>
    ${sync.code ? `
      <p>이 기기는 아래 동기화 코드로 연결되어 있습니다. 다른 기기에서 같은 코드를 입력하면 지문과 학습 기록이 함께 동기화됩니다. <b>코드를 아는 사람은 누구나 데이터에 접근할 수 있으니 비밀번호처럼 보관하세요.</b></p>
      <div class="sync-code" style="margin:12px 0"><span id="sync-code">${esc(sync.code)}</span><button class="btn btn-sm" data-action="copy-sync">${icon('copy')}복사</button></div>
      <div class="row small" style="margin-bottom:12px">
        <span>상태: <b>${esc(syncLabel(sync))}</b></span>
        ${sync.lastSyncAt ? `<span class="muted">· 마지막 동기화 ${fmtDate(sync.lastSyncAt, true)}</span>` : ''}
      </div>
      <div class="row">
        <button class="btn btn-primary" data-action="sync-now" ${sync.status === 'syncing' ? 'disabled' : ''}>${icon('refresh')}지금 동기화</button>
        <button class="btn btn-ghost" data-action="sync-off">연결 해제</button>
      </div>`
    : `
      <div class="notice" style="margin-bottom:14px">${icon('info')}<div class="notice-body small">현재 데이터는 이 기기의 브라우저에만 저장됩니다. 동기화 코드를 만들면 데이터가 분석 서버에 암호 같은 코드로 보관됩니다.</div></div>
      <div class="grid-2">
        <div class="stack">
          <div class="label">처음 사용하는 경우</div>
          <button class="btn btn-primary" data-action="sync-create">${icon('plus')}새 동기화 코드 만들기</button>
        </div>
        <div class="stack">
          <label class="label" for="sync-input">다른 기기의 코드가 있는 경우</label>
          <div class="row" style="flex-wrap:nowrap"><input class="input" id="sync-input" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX" autocomplete="off" spellcheck="false"><button class="btn" data-action="sync-join">연결</button></div>
        </div>
      </div>`}
    ${sync.status === 'error' ? `<div class="notice notice-danger" style="margin-top:12px">${icon('alert')}<div class="notice-body">${esc(sync.error)}</div></div>` : ''}
  </div>

  <div class="card">
    <div class="card-title">${icon('download')}백업 및 복원</div>
    <p class="muted small">모든 지문과 분석 결과, 학습 기록을 JSON 파일로 내보내거나 다시 불러올 수 있습니다.</p>
    <div class="row" style="margin-top:10px">
      <button class="btn" data-action="export">${icon('download')}백업 파일 내보내기</button>
      <label class="btn">${icon('upload')}백업 파일 불러오기<input type="file" accept="application/json,.json" data-action="import" class="sr-only"></label>
    </div>
  </div>

  <div class="card">
    <div class="card-title">${icon('settings')}화면 및 상태</div>
    <dl class="kv">
      <dt>화면 테마</dt><dd><div class="row" role="group">
        ${[['system', '시스템 설정'], ['light', '밝게'], ['dark', '어둡게']].map(([k, l]) => `<button class="chip" data-action="theme" data-t="${k}" aria-pressed="${theme === k}">${l}</button>`).join('')}
      </div></dd>
      <dt>AI 분석</dt><dd>${!st ? '<span class="pill pill-danger">서버 연결 안 됨</span>' : st.ai.configured ? `<span class="pill pill-ok">연결됨</span> <span class="muted small">${esc(st.ai.model)}</span>` : '<span class="pill pill-warn">API 키 미설정</span> <span class="muted small">서버에 ANTHROPIC_API_KEY 설정 필요</span>'}</dd>
      <dt>로컬 저장소</dt><dd>${backend === 'indexeddb' ? 'IndexedDB (브라우저를 닫아도 유지)' : backend === 'localstorage' ? 'localStorage (브라우저를 닫아도 유지)' : '<span class="pill pill-danger">임시 메모리 — 새로고침 시 삭제됨</span>'}</dd>
      <dt>저장된 지문</dt><dd>${all.length}개 · 분석 완료 ${all.filter((p) => p.analysis?.finishedAt).length}개 · 학습 완료 ${all.filter((p) => p.completed).length}개</dd>
    </dl>
  </div>`;
}

function download(name, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ───────────────────────── 이벤트 처리 ─────────────────────────
function currentPassage() {
  return state.route.name === 'passage' ? store.get(state.route.id) : null;
}

async function onClick(e) {
  // 메뉴 밖을 누르면 닫기
  const p0 = currentPassage();
  if (p0 && passageUi(p0.id).menuOpen && !e.target.closest('.menu-wrap')) {
    passageUi(p0.id).menuOpen = false;
    $('.menu')?.classList.remove('open');
  }
  const t = e.target.closest('[data-action]');
  if (!t) return;
  const action = t.dataset.action;
  if (t.tagName === 'INPUT' && (t.type === 'checkbox' || t.type === 'radio' || t.type === 'file')) return; // change 이벤트에서 처리
  const p = currentPassage();
  const u = p ? passageUi(p.id) : null;

  switch (action) {
    case 'open-nav': document.body.classList.add('nav-open'); break;
    case 'close-nav': document.body.classList.remove('nav-open'); break;
    case 'side-filter': state.sideFilter = t.dataset.f; renderSidebar(); break;
    case 'recheck-status':
      try { state.status = await getStatus(); toast('서버에 연결되었습니다.', 'ok'); } catch { toast('여전히 연결할 수 없습니다.', 'error'); }
      render();
      break;
    case 'save-only': createFromForm(false); break;
    case 'clear-draft': {
      const ok = await confirmDialog({ title: '입력 지우기', message: '입력한 제목과 지문을 모두 지울까요?', okText: '지우기', danger: true });
      if (ok) { lsSet(DRAFT_KEY, null); render(); }
      break;
    }

    // 지문 화면
    case 'tab': go(`#/p/${encodeURIComponent(p.id)}/${t.dataset.tab}`); break;
    case 'start-analysis':
    case 'resume-analysis':
      if (!ensureAi()) break;
      jobs.run(p.id);
      break;
    case 'retry':
      if (!ensureAi()) break;
      jobs.run(p.id, { only: [t.dataset.part] });
      break;
    case 'retry-chunk': {
      if (!ensureAi()) break;
      jobs.run(p.id, { only: ['sentences'] });
      break;
    }
    case 'cancel-analysis': jobs.cancel(p.id); toast('분석을 중지했습니다. 완료된 결과는 저장되어 있습니다.'); break;
    case 'toggle-fav': store.update(p.id, (x) => { x.favorite = !x.favorite; }); break;
    case 'toggle-complete':
      store.update(p.id, (x) => { x.completed = !x.completed; x.completedAt = x.completed ? new Date().toISOString() : ''; });
      toast(p.completed ? '학습 완료로 표시했습니다.' : '학습 완료 표시를 해제했습니다.', 'ok');
      break;
    case 'log-review':
      store.update(p.id, (x) => { x.review ||= { log: [], flagged: false }; x.review.log.push(new Date().toISOString()); x.review.flagged = false; });
      toast(`복습을 기록했습니다. 다음 복습 권장일: ${fmtDate(reviewInfo(store.get(p.id)).next)}`, 'ok');
      break;
    case 'toggle-flag': store.update(p.id, (x) => { x.review ||= { log: [], flagged: false }; x.review.flagged = !x.review.flagged; }); break;
    case 'toggle-menu':
      u.menuOpen = !u.menuOpen;
      $('.menu').classList.toggle('open', u.menuOpen);
      t.setAttribute('aria-expanded', String(u.menuOpen));
      break;
    case 'show-original':
      u.menuOpen = false;
      openModal(`<h3>${esc(p.title || '지문 원문')}</h3><div class="en" style="line-height:1.8;margin-top:12px">${p.sentences.map((s) => `<span title="S${s.index}">${esc(s.text)}</span>`).join(' ')}</div>`);
      render();
      break;
    case 'copy-text':
      u.menuOpen = false;
      navigator.clipboard?.writeText(p.text).then(() => toast('원문을 복사했습니다.', 'ok'), () => toast('복사하지 못했습니다.', 'error'));
      render();
      break;
    case 'print': u.menuOpen = false; render(); setTimeout(() => window.print(), 50); break;
    case 'reanalyze': {
      u.menuOpen = false;
      render();
      if (!ensureAi()) break;
      const ok = await confirmDialog({ title: '전체 다시 분석', message: '기존 분석 결과와 문제 풀이 기록을 지우고 처음부터 다시 분석합니다. 즐겨찾기, 중요 문장, 암기 기록은 유지됩니다.', okText: '다시 분석' });
      if (!ok) break;
      store.update(p.id, (x) => { x.analysis = jobs.initAnalysis(x); x.answers = {}; });
      jobs.run(p.id);
      break;
    }
    case 'delete-passage': {
      u.menuOpen = false;
      const ok = await confirmDialog({ title: '지문 삭제', message: `"${p.title || '제목 없는 지문'}"과(와) 분석 결과, 학습 기록을 모두 삭제합니다. 되돌릴 수 없습니다.`, okText: '삭제', danger: true });
      if (!ok) { render(); break; }
      jobs.cancel(p.id);
      store.remove(p.id);
      toast('지문을 삭제했습니다.');
      go('#/');
      break;
    }
    case 'goto-sentence': {
      const i = Number(t.dataset.i);
      u.starredOnly = false;
      u.collapsed.delete(i);
      if (state.route.tab !== 'sentences') go(`#/p/${encodeURIComponent(p.id)}/sentences`);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const card = document.getElementById(`sent-${i}`);
        if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'start' }); card.animate?.([{ boxShadow: '0 0 0 3px var(--brand)' }, { boxShadow: '0 0 0 0 transparent' }], { duration: 1600 }); }
      }));
      break;
    }
    case 'toggle-original': u.showOriginal = !u.showOriginal; render(); break;
    case 'focus-rel': focusDiagram($('#view'), { rel: Number(t.dataset.rel) }); $('#diagram')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); break;
    case 'toggle-star': {
      const i = Number(t.dataset.i);
      store.update(p.id, (x) => {
        x.starred ||= [];
        x.starred = x.starred.includes(i) ? x.starred.filter((n) => n !== i) : [...x.starred, i].sort((a, b) => a - b);
      });
      break;
    }
    case 'toggle-sent': {
      const i = Number(t.dataset.i);
      if (u.collapsed.has(i)) u.collapsed.delete(i); else u.collapsed.add(i);
      render();
      break;
    }
    case 'starred-only': u.starredOnly = !u.starredOnly; render(); break;
    case 'collapse-all':
      if (u.collapsed.size >= p.sentences.length) u.collapsed.clear();
      else p.sentences.forEach((s) => u.collapsed.add(s.index));
      render();
      break;
    case 'grammar-cat': u.grammarCat = t.dataset.cat; render(); break;
    case 'vocab-filter': u.vocabFilter = t.dataset.f; render(); break;
    case 'flashcards': openFlashcards(filteredVocab(p).map((v) => ({ v, p }))); break;
    case 'word-card': {
      const v = vocabList(p)[Number(t.dataset.vi)];
      const list = filteredVocab(p);
      openFlashcards(list.map((x) => ({ v: x, p })), Math.max(0, list.indexOf(v)));
      break;
    }
    case 'toggle-regen': u.regenOpen = !u.regenOpen; render(); break;
    case 'regen-questions': {
      if (!ensureAi()) break;
      const types = readTypes($('#regen-panel'), 'rq');
      if (!types.length) { toast('문제 유형을 하나 이상 선택해 주세요.', 'error'); break; }
      if (types.reduce((a, x) => a + x.count, 0) > 16) { toast('최대 16문항까지 만들 수 있습니다.', 'error'); break; }
      if (p.analysis?.questions?.data) {
        const ok = await confirmDialog({ title: '예상 문제 새로 만들기', message: '새 문제가 만들어지면 기존 문제와 풀이 기록이 교체됩니다.', okText: '새로 만들기' });
        if (!ok) break;
      }
      u.regenOpen = false;
      jobs.regenerateQuestions(p.id, types);
      break;
    }
    case 'reset-answers': {
      const ok = await confirmDialog({ title: '풀이 초기화', message: '모든 문제의 답안과 채점 기록을 지웁니다.', okText: '초기화' });
      if (ok) store.update(p.id, (x) => { x.answers = {}; });
      break;
    }
    case 'submit-q': {
      const i = Number(t.dataset.q);
      const q = p.analysis.questions.data.questions[i];
      const a = p.answers?.[i] || {};
      if (q.answer_index >= 0 && !Number.isInteger(a.choice)) { toast('답을 선택한 뒤 제출하세요.', 'error'); break; }
      if (q.answer_index < 0 && !(a.text || '').trim()) { toast('답안을 작성한 뒤 제출하세요.', 'error'); break; }
      store.update(p.id, (x) => { x.answers ||= {}; x.answers[i] = { ...a, submitted: true, revealed: true, at: new Date().toISOString() }; });
      break;
    }
    case 'reveal-q': {
      const i = Number(t.dataset.q);
      store.update(p.id, (x) => { x.answers ||= {}; x.answers[i] = { ...(x.answers[i] || {}), revealed: true, submitted: false }; });
      break;
    }
    case 'retry-q': {
      const i = Number(t.dataset.q);
      store.update(p.id, (x) => { x.answers ||= {}; x.answers[i] = { text: x.answers[i]?.text || '' }; });
      break;
    }
    case 'self-grade': {
      const i = Number(t.dataset.q);
      store.update(p.id, (x) => { x.answers[i] = { ...x.answers[i], self: t.dataset.v }; });
      break;
    }

    // 단어장
    case 'nb-filter': state.nbFilter = t.dataset.f; render(); break;
    case 'nb-flashcards': openFlashcards(notebookFiltered()); break;
    case 'nb-card': openFlashcards(notebookFiltered(), Number(t.dataset.i)); break;

    // 설정
    case 'theme': lsSet(THEME_KEY, t.dataset.t); applyTheme(t.dataset.t); render(); break;
    case 'sync-create':
      try { t.disabled = true; await store.enableSync(); toast('클라우드 동기화를 켰습니다. 코드를 안전하게 보관하세요.', 'ok'); } catch (err) { toast(err.message, 'error'); }
      render();
      break;
    case 'sync-join': {
      const code = $('#sync-input').value;
      if (!code.trim()) { toast('동기화 코드를 입력해 주세요.', 'error'); break; }
      try { t.disabled = true; await store.enableSync(code); toast('동기화했습니다.', 'ok'); } catch (err) { toast(err.message, 'error'); }
      render();
      break;
    }
    case 'sync-now': await store.syncNow(); toast(store.syncInfo().status === 'error' ? store.syncInfo().error : '동기화했습니다.', store.syncInfo().status === 'error' ? 'error' : 'ok'); break;
    case 'sync-off': {
      const ok = await confirmDialog({ title: '동기화 연결 해제', message: '이 기기의 데이터는 그대로 남고, 이후 변경 사항은 클라우드에 저장되지 않습니다. 코드를 다시 입력하면 언제든 다시 연결할 수 있습니다.', okText: '연결 해제' });
      if (ok) { await store.disableSync(); render(); }
      break;
    }
    case 'copy-sync': navigator.clipboard?.writeText(store.syncInfo().code).then(() => toast('코드를 복사했습니다.', 'ok')); break;
    case 'export': download(`passage-lab-backup-${fmtDate(new Date().toISOString()).replace(/\./g, '')}.json`, store.exportJson()); break;
    default: break;
  }
}

function ensureAi() {
  if (!state.status) { toast('분석 서버에 연결할 수 없습니다.', 'error'); return false; }
  if (!state.status.ai.configured) { toast('AI 분석이 연결되지 않았습니다. 서버에 API 키를 설정해야 합니다.', 'error'); return false; }
  return true;
}

async function onChange(e) {
  const t = e.target;
  const action = t.dataset?.action;
  const p = currentPassage();
  if (t.closest('#new-form')) {
    if (t.matches('input[type="checkbox"]')) t.closest('.qtype')?.classList.toggle('off', !t.checked);
    saveDraft();
  }
  if (t.closest('#regen-panel') && t.matches('input[type="checkbox"]')) t.closest('.qtype')?.classList.toggle('off', !t.checked);
  if (t.id === 'title-input' && p) {
    const v = t.value.trim();
    store.update(p.id, (x) => { x.title = v || '제목 없는 지문'; x.titleAuto = false; });
    toast('제목을 저장했습니다.', 'ok');
    return;
  }
  switch (action) {
    case 'memorize': {
      const k = t.dataset.word;
      store.update(p.id, (x) => { x.memorized ||= {}; if (t.checked) x.memorized[k] = true; else delete x.memorized[k]; });
      break;
    }
    case 'nb-memorize': {
      const k = t.dataset.word;
      store.update(t.dataset.pid, (x) => { x.memorized ||= {}; if (t.checked) x.memorized[k] = true; else delete x.memorized[k]; });
      break;
    }
    case 'vocab-imp': passageUi(p.id).vocabImp = t.value; render(); break;
    case 'choose': {
      const i = Number(t.dataset.q);
      store.update(p.id, (x) => { x.answers ||= {}; x.answers[i] = { ...(x.answers[i] || {}), choice: Number(t.value) }; }, { silent: true });
      break;
    }
    case 'import': {
      const f = t.files?.[0];
      if (!f) break;
      try {
        const n = await store.importJson(await f.text());
        toast(`${n}개의 지문을 불러왔습니다.`, 'ok');
      } catch (err) { toast(`불러오기 실패: ${err.message}`, 'error'); }
      t.value = '';
      break;
    }
    default: break;
  }
}

const saveWritten = debounce((pid, i, text) => {
  store.update(pid, (x) => { x.answers ||= {}; x.answers[i] = { ...(x.answers[i] || {}), text }; }, { silent: true });
}, 400);

function onInput(e) {
  const t = e.target;
  if (t.id === 'passage-input') { updateInputMeta(); saveDraftDebounced(); return; }
  if (t.closest?.('#new-form')) { saveDraftDebounced(); return; }
  if (t.id === 'side-search') { state.sideQuery = t.value; renderSidebar(); return; }
  if (t.id === 'nb-search') { state.nbQuery = t.value; renderNbDebounced(); return; }
  if (t.dataset?.action === 'written') {
    const p = currentPassage();
    if (p) saveWritten(p.id, Number(t.dataset.q), t.value);
  }
}
const renderNbDebounced = debounce(() => render(), 200);

function onKeydown(e) {
  if (e.key === 'Enter' && e.target.id === 'title-input') { e.preventDefault(); e.target.blur(); }
  if (e.key === 'Escape' && e.target.id === 'title-input') { const p = currentPassage(); e.target.value = p?.title || ''; e.target.blur(); }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.dnode, .relation-list li')) { e.preventDefault(); e.target.click(); }
  // 탭 키보드 이동
  if (e.target.matches?.('.tab') && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
    const tabs = $$('.tab');
    const i = tabs.indexOf(e.target);
    const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    n.click();
    requestAnimationFrame(() => $(`#tab-${n.dataset.tab}`)?.focus());
  }
}

// 다이어그램 노드 클릭: 관련 관계 강조 + 원문 펼치기
document.addEventListener('click', (e) => {
  const node = e.target.closest('.dnode');
  if (node) {
    const n = Number(node.dataset.node);
    const diagram = $('#diagram');
    const already = node.classList.contains('hl') && diagram.classList.contains('focus');
    $$('.dnode.expanded').forEach((x) => x !== node && x.classList.remove('expanded'));
    node.classList.toggle('expanded', !already);
    focusDiagram($('#view'), already ? {} : { node: n });
    requestAnimationFrame(redrawDiagram);
    requestAnimationFrame(() => { if (!already) focusDiagram($('#view'), { node: n }); });
    return;
  }
  if (!e.target.closest('#diagram') && !e.target.closest('.relation-list')) focusDiagram($('#view') || document, {});
});

// 새 지문 폼 제출
document.addEventListener('submit', (e) => {
  if (e.target.id === 'new-form') { e.preventDefault(); createFromForm(true); }
});

window.addEventListener('beforeunload', (e) => {
  if (store.list().some((p) => jobs.isActive(p.id))) { e.preventDefault(); e.returnValue = ''; }
});

boot();
