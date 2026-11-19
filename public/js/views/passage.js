// 지문 상세 화면: 헤더, 진행 상태, 6개 탭(전체 분석 / 문장별 분석 / 핵심 문법 / 중요 어휘 / 출제 포인트 / 예상 문제)
import { esc, icon, paragraphs, richText, importanceBadge, fmtDate, relTime } from '../ui.js';
import * as jobs from '../jobs.js';
import { diagramHtml, RELATION_META, STAGE_COLORS } from './diagram.js';
import { LEVEL_LABELS, QUESTION_TYPES, reviewInfo, wordKey } from '../shared.js';

export const TABS = [
  { id: 'overview', label: '전체 분석' },
  { id: 'sentences', label: '문장별 분석' },
  { id: 'grammar', label: '핵심 문법' },
  { id: 'vocab', label: '중요 어휘' },
  { id: 'exam', label: '출제 포인트' },
  { id: 'questions', label: '예상 문제' },
];

// 화면 상태 (지문별로 유지)
const uiState = new Map();
export function ui(id) {
  if (!uiState.has(id)) {
    uiState.set(id, {
      starredOnly: false, collapsed: new Set(), vocabFilter: 'all', vocabImp: 'all',
      grammarCat: 'all', regenOpen: false, showOriginal: false, menuOpen: false,
    });
  }
  return uiState.get(id);
}

const sref = (i) => `<button class="sref" data-action="goto-sentence" data-i="${i}" title="S${i} 문장별 분석으로 이동">S${i}</button>`;
const srefs = (list) => (list || []).filter((n) => Number.isInteger(n)).map(sref).join(' ');
const IMP_ORDER = { 상: 0, 중: 1, 하: 2 };
const byImp = (a, b) => (IMP_ORDER[a.importance] ?? 3) - (IMP_ORDER[b.importance] ?? 3);

function statusOf(p, part) {
  const a = p.analysis;
  if (!a) return 'none';
  if (part === 'sentences') {
    const cs = a.sentences.chunks.map((c) => c.status);
    if (cs.some((s) => s === 'running' || s === 'queued')) return 'running';
    if (cs.some((s) => s === 'error' || s === 'interrupted')) return 'error';
    return 'done';
  }
  if (part === 'vocab' || part === 'grammar' || part === 'exam') part = 'details';
  return a[part]?.status || 'none';
}

// ───────────────────────── Header ─────────────────────────
export function renderPassage(p, tab) {
  const u = ui(p.id);
  const a = p.analysis;
  const rv = reviewInfo(p);
  const prog = jobs.progress(a);
  const busy = jobs.isActive(p.id);
  const head = `
  <div class="p-head">
    <div class="p-title-row">
      <input class="p-title" id="title-input" value="${esc(p.title || '제목 없는 지문')}" aria-label="지문 제목 (클릭해서 수정)" maxlength="120" data-id="${p.id}">
    </div>
    <div class="p-meta">
      <span>${esc(LEVEL_LABELS[p.level] || '')}</span>
      <span>${p.sentences.length}문장 · ${countWordsLocal(p.text)}단어</span>
      <span>생성 ${fmtDate(p.createdAt)}</span>
      ${a?.model ? `<span>분석 모델 ${esc(a.model)}</span>` : ''}
      ${p.completed ? `<span class="pill pill-ok">${icon('check')}학습 완료</span>` : ''}
      ${rv.due ? '<span class="pill pill-warn">복습 필요</span>' : ''}
      ${rv.count ? `<span>복습 ${rv.count}회 · 최근 ${relTime(rv.last)}${rv.next && !rv.due ? ` · 다음 복습 ${fmtDate(rv.next)}` : ''}</span>` : ''}
    </div>
    <div class="p-actions">
      <button class="btn btn-sm ${p.favorite ? 'on-star' : ''}" data-action="toggle-fav" aria-pressed="${p.favorite}">${icon('star')}<span>즐겨찾기</span></button>
      <button class="btn btn-sm ${p.completed ? 'on-ok' : ''}" data-action="toggle-complete" aria-pressed="${p.completed}">${icon('checkCircle')}<span>${p.completed ? '학습 완료됨' : '학습 완료 표시'}</span></button>
      <button class="btn btn-sm" data-action="log-review" title="오늘 복습했다고 기록합니다">${icon('repeat')}<span>복습 기록<span class="lbl-long">하기</span></span></button>
      <button class="btn btn-sm ${p.review?.flagged ? 'on' : ''}" data-action="toggle-flag" aria-pressed="${!!p.review?.flagged}">${icon('bookmark')}<span>복습 필요</span></button>
      <span class="spacer"></span>
      <div class="menu-wrap">
        <button class="icon-btn" data-action="toggle-menu" aria-label="더 보기" aria-expanded="${u.menuOpen}">${icon('more')}</button>
        <div class="menu ${u.menuOpen ? 'open' : ''}" role="menu">
          <button data-action="show-original" role="menuitem">${icon('eye')}지문 원문 보기</button>
          <button data-action="copy-text" role="menuitem">${icon('copy')}원문 복사</button>
          <button data-action="reanalyze" role="menuitem" ${busy ? 'disabled' : ''}>${icon('refresh')}전체 다시 분석</button>
          <button data-action="print" role="menuitem">${icon('download')}인쇄 / PDF 저장</button>
          <hr>
          <button data-action="delete-passage" class="danger" role="menuitem">${icon('trash')}지문 삭제</button>
        </div>
      </div>
    </div>
  </div>`;

  const showProgress = a && (busy || prog.failed > 0 || !a.finishedAt);
  const tabs = `
  <div class="tabs-wrap no-print">
    <div class="tabs" role="tablist" aria-label="분석 항목">
      ${TABS.map((t, i) => {
        const st = statusOf(p, t.id);
        const n = tabCount(p, t.id);
        return `<button class="tab" role="tab" id="tab-${t.id}" aria-selected="${t.id === tab}" aria-controls="panel" data-action="tab" data-tab="${t.id}">
          <span>${i + 1}. ${t.label}</span>${n ? `<span class="tab-n">${n}</span>` : ''}
          ${st === 'running' ? '<i class="tab-state running" title="분석 중"></i>' : st === 'error' || st === 'interrupted' ? '<i class="tab-state error" title="오류"></i>' : ''}
        </button>`;
      }).join('')}
    </div>
  </div>`;

  let body;
  if (!a) {
    body = `<div class="card empty-state">${icon('sparkle')}<h3>아직 분석하지 않은 지문입니다</h3>
      <p>분석을 시작하면 전체 분석, 문장별 분석, 문법, 어휘, 출제 포인트, 예상 문제가 생성됩니다.</p>
      <button class="btn btn-primary" data-action="start-analysis">${icon('sparkle')}분석 시작</button></div>`;
  } else {
    body = ({
      overview: renderOverview,
      sentences: renderSentences,
      grammar: renderGrammar,
      vocab: renderVocab,
      exam: renderExam,
      questions: renderQuestions,
    }[tab] || renderOverview)(p);
  }

  return `${head}${showProgress ? renderProgress(p, prog, busy) : ''}${tabs}
    <section class="tab-panel" id="panel" role="tabpanel" aria-labelledby="tab-${tab}">${body}</section>`;
}

function countWordsLocal(t) {
  const m = String(t || '').match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g);
  return m ? m.length : 0;
}

function tabCount(p, tab) {
  const a = p.analysis;
  if (!a) return 0;
  if (tab === 'grammar') return a.details?.data?.grammar_points?.length || 0;
  if (tab === 'vocab') return a.details?.data?.vocabulary?.length || 0;
  if (tab === 'questions') return a.questions?.data?.questions?.length || 0;
  if (tab === 'sentences') return p.sentences.length;
  return 0;
}

// ───────────────────────── 진행 상태 ─────────────────────────
const STEP_LABELS = { overview: '전체 분석 · 구조 · 논리 관계', details: '핵심 문법 · 중요 어휘 · 출제 포인트', questions: '예상 문제 생성' };

function stepIcon(status) {
  if (status === 'done') return `<span class="st done">${icon('check')}</span>`;
  if (status === 'running') return '<span class="st running"></span>';
  if (status === 'error' || status === 'interrupted') return '<span class="st error">!</span>';
  return '<span class="st queued"></span>';
}

function renderProgress(p, prog, busy) {
  const a = p.analysis;
  const chunks = a.sentences.chunks;
  const doneChunks = chunks.filter((c) => c.status === 'done').length;
  const doneSent = Object.keys(a.sentences.items).length;
  const sentStatus = statusOf(p, 'sentences');
  const sentErr = chunks.find((c) => c.status === 'error' || c.status === 'interrupted');
  const step = (k) => {
    const s = a[k];
    return `<li class="step">${stepIcon(s.status)}<span>${STEP_LABELS[k]}</span>
      ${s.status === 'running' ? '<span class="muted small">분석 중…</span>' : ''}
      ${s.status === 'queued' && busy ? '<span class="muted small">대기 중</span>' : ''}
      ${(s.status === 'error' || s.status === 'interrupted') ? `<span class="step-err">${esc(s.error || '중단됨')}</span>
        ${busy ? '' : `<button class="btn btn-sm" data-action="retry" data-part="${k}">${icon('refresh')}다시 시도</button>`}` : ''}
    </li>`;
  };
  const failed = prog.failed > 0 && !busy;
  return `
  <div class="card progress-card no-print" aria-live="polite">
    <div class="row">
      <div class="card-title" style="margin:0">${busy ? 'AI가 지문을 분석하고 있습니다' : failed ? '일부 항목의 분석이 완료되지 않았습니다' : '분석 대기 중'}</div>
      <span class="spacer"></span>
      ${busy ? `<button class="btn btn-sm" data-action="cancel-analysis">${icon('stop')}중지</button>`
        : failed || !a.finishedAt ? `<button class="btn btn-sm btn-primary" data-action="resume-analysis">${icon('refresh')}남은 항목 분석</button>` : ''}
    </div>
    <div class="progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${prog.pct}"><i style="width:${Math.max(prog.pct, busy ? 4 : 0)}%"></i></div>
    <ul class="steps">
      ${step('overview')}
      <li class="step">${stepIcon(sentStatus === 'error' && busy ? 'running' : sentStatus)}<span>문장별 상세 분석 (${doneSent}/${p.sentences.length}문장)</span>
        ${sentErr && !busy ? `<span class="step-err">${esc(sentErr.error || '중단됨')}</span><button class="btn btn-sm" data-action="retry" data-part="sentences">${icon('refresh')}다시 시도</button>` : ''}
      </li>
      <li><div class="chunk-dots" aria-hidden="true">${chunks.map((c) => `<i class="${c.status}" title="S${c.indices.join(', S')}"></i>`).join('')}</div></li>
      ${step('details')}
      ${step('questions')}
    </ul>
    <p class="muted small" style="margin-top:12px">완료된 항목부터 바로 확인할 수 있습니다. 분석 결과는 자동으로 저장되며, 다른 화면으로 이동해도 분석은 계속됩니다. ${doneChunks ? '' : '지문 길이에 따라 수 분이 걸릴 수 있습니다.'}</p>
  </div>`;
}

function pendingBlock(p, part, label) {
  const st = statusOf(p, part);
  const a = p.analysis;
  const key = part === 'overview' || part === 'questions' ? part : 'details';
  if (st === 'error' || st === 'interrupted') {
    return `<div class="card"><div class="notice notice-danger">${icon('alert')}<div class="notice-body"><b>${label} 분석에 실패했습니다.</b><br>${esc(a?.[key]?.error || '')}</div></div>
      <div class="row" style="margin-top:12px"><button class="btn btn-primary" data-action="retry" data-part="${key}" ${jobs.isActive(p.id) ? 'disabled' : ''}>${icon('refresh')}다시 시도</button></div></div>`;
  }
  return `<div class="card"><div class="row muted">${stepIcon('running')}<span>${label}을(를) 분석하고 있습니다…</span></div>
    <div class="skeleton sk-line" style="width:92%;margin-top:18px"></div><div class="skeleton sk-line" style="width:78%"></div><div class="skeleton sk-line" style="width:85%"></div></div>`;
}

// ───────────────────────── 1. 전체 분석 ─────────────────────────
function renderOverview(p) {
  const ov = p.analysis.overview.data;
  if (!ov) return pendingBlock(p, 'overview', '전체 분석');
  const u = ui(p.id);
  const keyw = (ov.keywords || []).map((k) => `<span class="kw"><b>${esc(k.term)}</b>${esc(k.meaning)}</span>`).join('');
  const sentText = (i) => p.sentences[i - 1]?.text || '';
  return `
  <nav class="subnav no-print" aria-label="전체 분석 바로가기">
    <a href="#ov-basic">기본 정보</a><a href="#ov-trans">전체 번역</a><a href="#ov-summary">요약</a><a href="#ov-para">문단별 내용</a>
    <a href="#ov-logic">전개·논리</a><a href="#ov-structure">글의 구조</a><a href="#ov-key">핵심 문장</a><a href="#ov-diagram">논리 관계도</a>
  </nav>

  <div class="card" id="ov-basic">
    <div class="card-title">기본 정보</div>
    <dl class="kv">
      <dt>핵심 주제</dt><dd class="big">${esc(ov.topic)}</dd>
      <dt>제목</dt><dd><div class="en" style="font-weight:600">${esc(ov.title_en)}</div><div>${esc(ov.title_ko)}</div></dd>
      <dt>글의 요지</dt><dd>${esc(ov.gist)}</dd>
      <dt>필자의 주장</dt><dd>${esc(ov.claim)}</dd>
      <dt>필자의 의도</dt><dd>${esc(ov.intent)}</dd>
      <dt>글의 목적</dt><dd>${esc(ov.purpose)}</dd>
      <dt>핵심 키워드</dt><dd><div class="tag-list">${keyw || '<span class="muted">-</span>'}</div></dd>
    </dl>
    <div class="section-title" style="margin-top:20px">핵심 메시지</div>
    <div class="core-msg">${esc(ov.core_message)}</div>
  </div>

  <div class="card" id="ov-trans">
    <div class="card-title">전체 번역 <span class="card-sub"><button class="btn btn-sm btn-ghost" data-action="toggle-original">${icon('eye')}${u.showOriginal ? '원문 숨기기' : '원문과 함께 보기'}</button></span></div>
    ${u.showOriginal ? `<div class="grid-2"><div class="en" style="line-height:1.8">${paragraphs(paraText(p))}</div><div class="translation">${paragraphs(ov.translation)}</div></div>`
      : `<div class="translation">${paragraphs(ov.translation)}</div>`}
  </div>

  <div class="card" id="ov-summary">
    <div class="card-title">핵심 내용 요약</div>
    <p>${esc(ov.summary_ko)}</p>
    <div class="summary-en">${esc(ov.summary_en)}</div>
  </div>

  <div class="card" id="ov-para">
    <div class="card-title">문단별 핵심 내용</div>
    <div class="para-list">
      ${(ov.paragraphs || []).map((pp) => `<div class="para-item"><div><div class="lbl">${esc(pp.label)}</div><div>${srefs(pp.sentences)}</div></div><div>${esc(pp.point)}</div></div>`).join('')}
    </div>
  </div>

  <div class="card" id="ov-logic">
    <div class="card-title">글의 전개 방식과 논리</div>
    <div class="section-title">전개 방식</div>
    <p><span class="pill pill-brand">${esc(ov.development?.method)}</span></p>
    <p>${esc(ov.development?.explanation)}</p>
    <div class="section-title">논리적 흐름과 인과관계</div>
    <ol class="flow-list">${(ov.logic_flow || []).map((f) => `<li>${esc(f.description)} ${srefs(f.sentences)}</li>`).join('')}</ol>
    <div class="section-title">필자의 주장과 근거</div>
    <div class="core-msg" style="font-size:15.5px">${esc(ov.argument?.claim)} ${srefs(ov.argument?.claim_sentences)}</div>
    <ul class="evidence-list">${(ov.argument?.evidence || []).map((e) => `<li><b>근거</b> · ${esc(e.content)} ${srefs(e.sentences)}</li>`).join('')}</ul>
  </div>

  <div class="card" id="ov-structure">
    <div class="card-title">글의 구조</div>
    <div class="structure-flow">
      ${(ov.structure || []).map((st, i) => `
        <div class="stage">
          <div class="stage-rail"><div class="stage-dot" style="background:${STAGE_COLORS[i % STAGE_COLORS.length]}">${i + 1}</div><div class="stage-line"></div></div>
          <div class="stage-body"><div class="stage-label">${esc(st.label)} ${srefs(st.sentences)}</div><div class="stage-summary">${esc(st.summary)}</div></div>
        </div>`).join('')}
    </div>
  </div>

  <div class="card" id="ov-key">
    <div class="card-title">핵심 문장</div>
    ${(ov.key_sentences || []).map((k) => `
      <div class="key-sentence">
        <div class="row" style="margin-bottom:4px">${sref(k.index)}<span class="pill pill-accent">${esc(k.role)}</span></div>
        <div class="en-line">${esc(sentText(k.index))}</div>
        <div class="why">${esc(k.reason)}</div>
      </div>`).join('')}
  </div>

  <div class="card" id="ov-diagram">
    <div class="card-title">문장 간 논리 관계도</div>
    ${diagramHtml(p, ov)}
    <ul class="relation-list">
      ${(ov.relations || []).map((r, i) => {
        const m = RELATION_META[r.type] || RELATION_META.elaboration;
        return `<li data-action="focus-rel" data-rel="${i}" tabindex="0">
          <span class="rel-chip">S${r.from} ${icon('arrowRight')} S${r.to}</span>
          <span><span class="rel-type" style="background:${m.color}">${esc(m.label)}</span> ${esc(r.explanation)}</span>
        </li>`;
      }).join('')}
    </ul>
  </div>
  ${uncertaintyBlock(ov.uncertainties)}`;
}

function paraText(p) {
  const out = [];
  let cur = -1;
  for (const s of p.sentences) {
    if (s.paragraph !== cur) { out.push([]); cur = s.paragraph; }
    out[out.length - 1].push(s.text);
  }
  return out.map((x) => x.join(' ')).join('\n\n');
}

function uncertaintyBlock(list) {
  if (!list?.length) return '';
  return `<div class="notice notice-warn uncertain">${icon('info')}<div class="notice-body"><b>해석·판단이 불확실한 부분</b>
    <ul style="margin:6px 0 0;padding-left:18px">${list.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></div>`;
}

// ───────────────────────── 2. 문장별 분석 ─────────────────────────
const ROLE_LABEL = { S: '주어', V: '동사', O: '목적어', IO: '간접목적어', DO: '직접목적어', C: '보어', OC: '목적격보어', M: '수식어', CONJ: '연결어' };
const ROLE_SHORT = { S: 'S', V: 'V', O: 'O', IO: 'I.O', DO: 'D.O', C: 'C', OC: 'O.C', M: 'M', CONJ: '접' };

/** 원문에서 성분 위치를 순서대로 찾아 색칠한 HTML 을 만든다. 찾지 못한 성분은 건너뛴다. */
export function structureLine(text, components) {
  const segs = [];
  let cursor = 0;
  const lower = text.toLowerCase();
  for (const c of components || []) {
    const t = (c.text || '').trim();
    if (!t) continue;
    let at = text.indexOf(t, cursor);
    if (at < 0) at = lower.indexOf(t.toLowerCase(), cursor);
    if (at < 0) continue;
    if (at > cursor) segs.push({ text: text.slice(cursor, at) });
    segs.push({ text: text.slice(at, at + t.length), role: c.role });
    cursor = at + t.length;
  }
  if (cursor < text.length) segs.push({ text: text.slice(cursor) });
  const matched = segs.filter((s) => s.role).length;
  if (!matched) return '';
  return segs.map((s) => (s.role
    ? `<span class="sv sv-${s.role}" data-role="${ROLE_SHORT[s.role] || s.role}">${esc(s.text)}</span>`
    : `<span class="sv-plain">${esc(s.text)}</span>`)).join('');
}

function renderSentences(p) {
  const u = ui(p.id);
  const items = p.analysis.sentences.items;
  const starred = new Set(p.starred || []);
  const list = p.sentences.filter((s) => !u.starredOnly || starred.has(s.index));
  const chunks = p.analysis.sentences.chunks;
  const chunkOf = (i) => chunks.findIndex((c) => c.indices.includes(i));
  const busy = jobs.isActive(p.id);
  const cards = list.map((s) => {
    const d = items[s.index];
    const collapsed = u.collapsed.has(s.index);
    const isStar = starred.has(s.index);
    let body;
    if (!d) {
      const c = chunks[chunkOf(s.index)];
      const st = c?.status || 'queued';
      body = st === 'error' || st === 'interrupted'
        ? `<div class="notice notice-danger">${icon('alert')}<div class="notice-body">${esc(c.error || '분석이 중단되었습니다.')}</div></div>
           <div class="row" style="margin-top:10px"><button class="btn btn-sm" data-action="retry-chunk" data-chunk="${chunkOf(s.index)}" ${busy ? 'disabled' : ''}>${icon('refresh')}이 문장 다시 분석</button></div>`
        : `<div class="row muted small">${stepIcon('running')}<span>${st === 'running' ? '분석 중…' : '분석 대기 중'}</span></div><div class="skeleton sk-line" style="width:80%"></div><div class="skeleton sk-line" style="width:60%"></div>`;
    } else {
      body = sentenceDetail(s, d);
    }
    return `
    <article class="card sent-card ${collapsed ? 'collapsed' : ''}" id="sent-${s.index}" data-sent="${s.index}">
      <div class="sent-head">
        <span class="sent-num">S${s.index}</span>
        <div class="sent-en">${esc(s.text)}</div>
        <button class="icon-btn ${isStar ? 'on' : ''}" data-action="toggle-star" data-i="${s.index}" aria-pressed="${isStar}" title="${isStar ? '중요 문장 해제' : '중요 문장으로 표시'}">${icon('star')}</button>
      </div>
      <div class="sent-body">${body}</div>
      <button class="sent-toggle" data-action="toggle-sent" data-i="${s.index}" aria-expanded="${!collapsed}">${icon('chevronDown')}${collapsed ? '분석 펼치기' : '분석 접기'}</button>
    </article>`;
  }).join('');
  return `
  <div class="sent-toolbar no-print">
    <button class="btn btn-sm ${u.starredOnly ? 'on' : ''}" data-action="starred-only" aria-pressed="${u.starredOnly}">${icon('star')}중요 문장만 (${starred.size})</button>
    <button class="btn btn-sm" data-action="collapse-all">${u.collapsed.size >= p.sentences.length ? '모두 펼치기' : '모두 접기'}</button>
    <span class="spacer"></span>
    <span class="muted small">문장 성분: <span class="sv sv-S" style="line-height:1.4">S</span> 주어 <span class="sv sv-V">V</span> 동사 <span class="sv sv-O">O</span> 목적어 <span class="sv sv-C">C</span> 보어 <span class="sv sv-M">M</span> 수식어</span>
  </div>
  ${list.length ? cards : `<div class="card empty-state">${icon('star')}<h3>중요 문장이 없습니다</h3><p>문장 오른쪽의 별표를 눌러 중요 문장으로 표시하세요.</p></div>`}`;
}

function sentenceDetail(s, d) {
  const line = structureLine(s.text, d.components);
  const comps = (d.components || []).map((c) => `<tr><td><span class="role-tag sv-${esc(c.role)}">${esc(ROLE_SHORT[c.role] || c.role)}</span></td>
    <td><span class="en">${esc(c.text)}</span><div class="muted small">${esc(ROLE_LABEL[c.role] || '')}${c.note ? ` · ${esc(c.note)}` : ''}</div></td></tr>`).join('');
  const steps = (d.reading_steps || []).length
    ? `<div class="sub-block"><div class="sub-title">어순에 따른 해석 과정</div><div class="chunks">${d.reading_steps.map((c, i) => `${i ? '<span class="chunk-sep">/</span>' : ''}<div class="chunk"><span class="c-en">${esc(c.chunk)}</span><span class="c-ko">${esc(c.meaning)}</span></div>`).join('')}</div></div>`
    : '';
  const vocab = (d.vocabulary || []).map((v) => {
    const extra = [
      v.synonyms?.length ? `유의어 ${v.synonyms.map(esc).join(', ')}` : '',
      v.antonyms?.length ? `반의어 ${v.antonyms.map(esc).join(', ')}` : '',
      v.derivatives?.length ? `파생어 ${v.derivatives.map(esc).join(', ')}` : '',
    ].filter(Boolean).join(' · ');
    return `<div class="vm"><div class="w">${esc(v.expression)}</div><div>${esc(v.context_meaning)}${extra ? `<div class="extra">${extra}</div>` : ''}${v.note ? `<div class="extra">${esc(v.note)}</div>` : ''}</div></div>`;
  }).join('');
  const grammar = (d.grammar || []).map((g) => `
    <div class="gram-item">
      <h5>${esc(g.name)} ${g.target ? `<span class="en">${esc(g.target)}</span>` : ''}</h5>
      <dl>
        <dt>적용</dt><dd>${esc(g.application)}</dd>
        <dt>문법 원리</dt><dd>${esc(g.principle)}</dd>
        <dt>해석 영향</dt><dd>${esc(g.interpretation_effect)}</dd>
        <dt>시험 변형</dt><dd>${esc(g.exam_variation)}</dd>
      </dl>
    </div>`).join('');
  return `
    <div class="trans-grid">
      <div class="trans-row"><span class="lbl">직역</span><div class="val">${esc(d.literal)}</div></div>
      <div class="trans-row natural"><span class="lbl">의역</span><div class="val">${esc(d.natural)}</div></div>
    </div>
    ${steps}
    <div class="sub-block"><div class="sub-title">문장 구조</div>
      ${line ? `<div class="sv-line">${line}</div>` : ''}
      ${comps ? `<table class="comp-table">${comps}</table>` : ''}
      ${(d.clauses || []).length ? `<ul class="clause-list" style="margin-top:10px">${d.clauses.map((c) => `<li><span class="pill">${esc(c.kind)}</span> <span class="en">${esc(c.text)}</span><div class="muted small" style="margin-top:2px">→ ${esc(c.modifies)}</div></li>`).join('')}</ul>` : ''}
      ${d.structure_note ? `<p style="margin-top:10px">${esc(d.structure_note)}</p>` : ''}
    </div>
    ${vocab ? `<div class="sub-block"><div class="sub-title">핵심 어휘</div><div class="vocab-mini">${vocab}</div></div>` : ''}
    <div class="sub-block"><div class="sub-title">핵심 의미 (글 속에서의 역할)</div>
      <div class="meaning-grid">
        <div><span class="lbl">제시 이유</span>${esc(d.meaning?.purpose)}</div>
        <div><span class="lbl">앞뒤 문장과의 관계</span>${esc(d.meaning?.context_link)}</div>
        <div><span class="lbl">문맥상 함축</span>${esc(d.meaning?.implication)}</div>
        <div><span class="lbl">주제와의 연결</span>${esc(d.meaning?.theme_link)}</div>
      </div>
    </div>
    ${grammar ? `<div class="sub-block"><div class="sub-title">문장별 문법</div>${grammar}</div>` : ''}
    ${d.uncertainty ? `<div class="notice notice-warn uncertain">${icon('info')}<div class="notice-body"><b>불확실한 부분</b> ${esc(d.uncertainty)}</div></div>` : ''}`;
}

// ───────────────────────── 3. 핵심 문법 ─────────────────────────
function renderGrammar(p) {
  const det = p.analysis.details.data;
  if (!det) return pendingBlock(p, 'grammar', '핵심 문법');
  const u = ui(p.id);
  const gps = det.grammar_points || [];
  if (!gps.length) return `<div class="card empty-state">${icon('layers')}<h3>선별된 중요 문법이 없습니다</h3></div>`;
  const cats = [...new Set(gps.map((g) => g.category).filter(Boolean))];
  const list = gps.filter((g) => u.grammarCat === 'all' || g.category === u.grammarCat)
    .sort((a, b) => (IMP_ORDER[a.exam_likelihood] ?? 3) - (IMP_ORDER[b.exam_likelihood] ?? 3) || a.sentence_index - b.sentence_index);
  return `
  <div class="gp-filter no-print" role="group" aria-label="문법 분류">
    <button class="chip" data-action="grammar-cat" data-cat="all" aria-pressed="${u.grammarCat === 'all'}">전체 <span class="count">${gps.length}</span></button>
    ${cats.map((c) => `<button class="chip" data-action="grammar-cat" data-cat="${esc(c)}" aria-pressed="${u.grammarCat === c}">${esc(c)} <span class="count">${gps.filter((g) => g.category === c).length}</span></button>`).join('')}
  </div>
  <p class="muted small" style="margin-bottom:12px">지문에 실제로 쓰인 문법만 선별했습니다. 출제 가능성은 분석에 근거한 예상이며 실제 출제를 보장하지 않습니다. 문장별 세부 문법은 '문장별 분석' 탭에서 볼 수 있습니다.</p>
  ${list.map((g, i) => `
    <div class="card gp-card">
      <div class="gp-head">
        <span class="pill pill-brand">${i + 1}</span>
        <h3>${esc(g.name)}</h3>
        <span class="pill">${esc(g.category)}</span>
        ${sref(g.sentence_index)}
        <span class="spacer"></span>
        <span class="small muted">출제 가능성(예상)</span>${importanceBadge(g.exam_likelihood)}
      </div>
      <div class="quote">${esc(g.excerpt)}</div>
      <dl class="kv">
        <dt>문법적 원리</dt><dd>${esc(g.principle)}</dd>
        <dt>해석</dt><dd>${esc(g.interpretation)}</dd>
        <dt>출제 포인트</dt><dd>${esc(g.exam_note)}</dd>
      </dl>
    </div>`).join('')}
  ${uncertaintyBlock(det.uncertainties)}`;
}

// ───────────────────────── 4. 중요 어휘 ─────────────────────────
export function vocabList(p) {
  return p.analysis?.details?.data?.vocabulary || [];
}

function renderVocab(p) {
  const det = p.analysis.details.data;
  if (!det) return pendingBlock(p, 'vocab', '중요 어휘');
  const u = ui(p.id);
  const all = vocabList(p);
  const mem = p.memorized || {};
  const memCount = all.filter((v) => mem[wordKey(v.word)]).length;
  const list = filteredVocab(p);
  const join = (a) => (a?.length ? a.map(esc).join(', ') : '<span class="muted">-</span>');
  return `
  <div class="vocab-toolbar no-print">
    <div class="row" role="group" aria-label="암기 상태 필터">
      <button class="chip" data-action="vocab-filter" data-f="all" aria-pressed="${u.vocabFilter === 'all'}">전체 <span class="count">${all.length}</span></button>
      <button class="chip" data-action="vocab-filter" data-f="todo" aria-pressed="${u.vocabFilter === 'todo'}">암기 안 한 단어 <span class="count">${all.length - memCount}</span></button>
      <button class="chip" data-action="vocab-filter" data-f="done" aria-pressed="${u.vocabFilter === 'done'}">암기 완료 <span class="count">${memCount}</span></button>
    </div>
    <select class="select" style="width:auto;padding:4px 8px;font-size:13px" data-action="vocab-imp" aria-label="중요도 필터">
      <option value="all" ${u.vocabImp === 'all' ? 'selected' : ''}>중요도 전체</option>
      <option value="상" ${u.vocabImp === '상' ? 'selected' : ''}>중요도 상</option>
      <option value="중" ${u.vocabImp === '중' ? 'selected' : ''}>중요도 중</option>
      <option value="하" ${u.vocabImp === '하' ? 'selected' : ''}>중요도 하</option>
    </select>
    <button class="btn btn-sm btn-primary" data-action="flashcards" ${list.length ? '' : 'disabled'}>${icon('layers')}단어 카드로 학습 (${list.length})</button>
    <div class="vocab-stats"><span>암기 <b>${memCount}</b>/${all.length}</span></div>
  </div>
  ${list.length ? `
  <div class="table-wrap">
    <table class="vocab">
      <thead><tr><th>암기</th><th>단어</th><th>품사</th><th>문맥상 의미</th><th>기본 의미</th><th>유의어</th><th>반의어</th><th>파생어</th><th>중요도</th><th>문장</th></tr></thead>
      <tbody>
        ${list.map((v) => {
          const k = wordKey(v.word);
          const vi = all.indexOf(v);
          return `<tr class="${mem[k] ? 'memorized' : ''}">
            <td><label class="mem-check"><input type="checkbox" data-action="memorize" data-word="${esc(k)}" ${mem[k] ? 'checked' : ''} aria-label="${esc(v.word)} 암기 완료"></label></td>
            <td><button class="word-btn" data-action="word-card" data-vi="${vi}">${esc(v.word)}</button>${v.confusables ? `<div class="muted small" style="margin-top:3px;max-width:200px">⚠ ${esc(v.confusables)}</div>` : ''}</td>
            <td class="muted">${esc(v.pos)}</td>
            <td><b>${esc(v.context_meaning)}</b></td>
            <td>${esc(v.base_meaning)}</td>
            <td class="en">${join(v.synonyms)}</td>
            <td class="en">${join(v.antonyms)}</td>
            <td class="en">${join(v.derivatives)}</td>
            <td>${importanceBadge(v.importance)}</td>
            <td>${sref(v.sentence_index)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>` : `<div class="card empty-state">${icon('checkCircle')}<h3>${u.vocabFilter === 'todo' ? '모든 단어를 암기했습니다!' : '조건에 맞는 단어가 없습니다'}</h3></div>`}`;
}

export function filteredVocab(p) {
  const u = ui(p.id);
  const mem = p.memorized || {};
  return vocabList(p)
    .filter((v) => (u.vocabFilter === 'all' ? true : u.vocabFilter === 'todo' ? !mem[wordKey(v.word)] : !!mem[wordKey(v.word)]))
    .filter((v) => u.vocabImp === 'all' || v.importance === u.vocabImp);
}

// ───────────────────────── 5. 출제 포인트 ─────────────────────────
function renderExam(p) {
  const det = p.analysis.details.data;
  if (!det) return pendingBlock(p, 'exam', '출제 포인트');
  const ex = det.exam || {};
  const sentText = (i) => p.sentences[i - 1]?.text || '';
  const table = (title, rows, cols, id) => {
    if (!rows?.length) return '';
    return `<div class="card" id="${id}"><div class="card-title">${title}<span class="card-sub">${rows.length}개</span></div>
      <table class="ep-table">${[...rows].sort(byImp).map((r) => `<tr><td class="imp-cell">${importanceBadge(r.importance)}</td>${cols(r)}</tr>`).join('')}</table></div>`;
  };
  return `
  <div class="notice notice-info disclaimer" style="margin-bottom:16px">${icon('info')}<div class="notice-body">아래 내용은 지문 분석에 근거한 <b>출제 예상</b>입니다. 실제 시험 출제 여부를 보장하지 않으며, 중요도(상·중·하)는 학습 우선순위를 정하는 참고용입니다.</div></div>
  <nav class="subnav no-print">
    <a href="#ex-types">예상 유형</a><a href="#ex-key">핵심 문장</a><a href="#ex-blank">빈칸 후보</a><a href="#ex-grammar">어법 변형</a>
    <a href="#ex-conn">연결어</a><a href="#ex-ref">지시어</a><a href="#ex-turn">전환 지점</a><a href="#ex-dist">혼동 요소</a>
  </nav>
  ${ex.predicted_types?.length ? `<div class="card" id="ex-types"><div class="card-title">예상 출제 유형</div><div class="ptype-grid">
    ${[...ex.predicted_types].sort(byImp).map((t) => `<div class="ptype"><h4>${importanceBadge(t.importance)}${esc(t.type)}</h4><p>${esc(t.reason)}</p><div class="focus">핵심: ${esc(t.focus)}</div></div>`).join('')}
  </div></div>` : ''}
  ${table('핵심 문장과 선정 이유', ex.key_sentences, (r) => `<td class="ref-cell">${sref(r.index)}</td><td><div class="en">${esc(sentText(r.index))}</div><div class="sub">${esc(r.reason)}</div></td>`, 'ex-key')}
  ${table('빈칸으로 출제하기 좋은 표현', ex.blank_candidates, (r) => `<td class="ref-cell">${sref(r.sentence_index)}</td><td><div class="en"><b>${esc(r.expression)}</b></div><div class="sub">${esc(r.reason)}</div></td>`, 'ex-blank')}
  ${table('어법 문제로 변형하기 좋은 구문', ex.grammar_transforms, (r) => `<td class="ref-cell">${sref(r.sentence_index)}</td><td><div class="en">${esc(r.excerpt)}</div><div class="sub">${esc(r.point)}</div></td>`, 'ex-grammar')}
  ${table('문맥상 중요한 연결어', ex.connectives, (r) => `<td class="ref-cell">${sref(r.sentence_index)}</td><td><div class="en"><b>${esc(r.expression)}</b></div><div class="sub">${esc(r.role)}</div></td>`, 'ex-conn')}
  ${table('지시어·대명사의 지칭 대상', ex.references, (r) => `<td class="ref-cell">${sref(r.sentence_index)}</td><td><div><span class="en"><b>${esc(r.expression)}</b></span> ${icon('arrowRight')} ${esc(r.refers_to)}</div></td>`, 'ex-ref')}
  ${table('글의 논리적 전환 지점', ex.turning_points, (r) => `<td class="ref-cell">${sref(r.sentence_index)}</td><td>${esc(r.description)}</td>`, 'ex-turn')}
  ${table('오답으로 활용될 수 있는 혼동 요소', ex.distractors, (r) => `<td><b>${esc(r.content)}</b><div class="sub">${esc(r.why_confusing)}</div></td>`, 'ex-dist')}`;
}

// ───────────────────────── 6. 예상 문제 ─────────────────────────
const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦'];

export function questionTypeEditor(selected, prefix = 'qt') {
  const map = new Map((selected || []).map((t) => [t.type, t.count]));
  return `<div class="qtype-grid">${QUESTION_TYPES.map((t) => {
    const on = map.has(t);
    return `<label class="qtype ${on ? '' : 'off'}"><input type="checkbox" name="${prefix}" value="${esc(t)}" ${on ? 'checked' : ''}>${esc(t)}
      <select name="${prefix}-count" data-type="${esc(t)}" aria-label="${esc(t)} 문항 수">${[1, 2, 3].map((n) => `<option ${map.get(t) === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`;
  }).join('')}</div>`;
}

function renderQuestions(p) {
  const q = p.analysis.questions;
  const u = ui(p.id);
  const busy = jobs.isActive(p.id);
  const regen = `
  <div class="card regen-panel ${u.regenOpen ? 'open' : ''}" id="regen-panel">
    <div class="card-title">예상 문제 새로 만들기</div>
    <p class="muted small" style="margin-bottom:10px">유형과 문항 수를 선택하세요(최대 16문항). 새로 만들면 기존 문제와 풀이 기록이 바뀝니다.</p>
    ${questionTypeEditor(p.questionTypes || jobs.defaultQuestionTypes(), 'rq')}
    <div class="row" style="margin-top:14px"><button class="btn btn-primary" data-action="regen-questions" ${busy && q.status === 'running' ? 'disabled' : ''}>${icon('sparkle')}문제 생성</button>
    <button class="btn btn-ghost" data-action="toggle-regen">취소</button></div>
  </div>`;
  if (!q.data?.questions) {
    return regen + pendingBlock(p, 'questions', '예상 문제');
  }
  const qs = q.data.questions;
  const ans = p.answers || {};
  const graded = qs.map((x, i) => ({ x, a: ans[i] })).filter(({ x, a }) => a?.submitted && (x.answer_index >= 0 ? true : a.self));
  const correct = graded.filter(({ x, a }) => (x.answer_index >= 0 ? a.choice === x.answer_index : a.self === 'ok')).length;
  return `
  <div class="q-toolbar no-print">
    <button class="btn btn-sm" data-action="toggle-regen">${icon('refresh')}문제 다시 만들기</button>
    <button class="btn btn-sm" data-action="reset-answers">${icon('repeat')}풀이 초기화</button>
    ${q.status === 'running' || q.status === 'queued' ? `<span class="pill pill-warn">${stepIcon('running')}새 문제 생성 중…</span>` : ''}
    ${q.status === 'error' ? `<span class="pill pill-danger">새 문제 생성 실패: ${esc(q.error)}</span>` : ''}
    <span class="q-score">채점 <b>${graded.length}</b>/${qs.length}문항 · 정답 <b>${correct}</b>문항</span>
  </div>
  ${regen}
  <div class="notice" style="margin-bottom:16px">${icon('info')}<div class="notice-body small">지문 내용에 근거해 AI가 만든 예상 문제입니다. 정답은 답안을 제출하거나 '정답 확인'을 눌러야 공개됩니다. 문제에 오류가 있다고 생각되면 해설의 근거 문장을 함께 확인하세요.</div></div>
  ${qs.map((x, i) => questionCard(x, i, ans[i] || {})).join('')}`;
}

function questionCard(x, i, a) {
  const mc = x.answer_index >= 0 && x.choices?.length;
  const revealed = !!a.revealed;
  const isKoChoice = (c) => /[가-힣]/.test(c);
  let answerArea;
  if (mc) {
    answerArea = `<ul class="q-choices" role="radiogroup" aria-label="${i + 1}번 선택지">
      ${x.choices.map((c, ci) => {
        let cls = '';
        if (revealed && ci === x.answer_index) cls = 'correct';
        else if (revealed && a.submitted && a.choice === ci) cls = 'wrong';
        return `<li class="q-choice ${cls}"><input type="radio" name="q${i}" id="q${i}c${ci}" value="${ci}" data-action="choose" data-q="${i}" ${a.choice === ci ? 'checked' : ''} ${revealed ? 'disabled' : ''}>
          <label for="q${i}c${ci}"><span class="cn">${CIRCLED[ci] || ci + 1}</span><span class="ct ${isKoChoice(c) ? 'ko' : ''}">${richText(c)}</span></label></li>`;
      }).join('')}
    </ul>`;
  } else {
    answerArea = `<textarea class="textarea" rows="4" placeholder="답안을 작성하세요" data-action="written" data-q="${i}" ${revealed ? 'readonly' : ''} aria-label="${i + 1}번 답안">${esc(a.text || '')}</textarea>`;
  }
  let result = '';
  if (revealed && mc && a.submitted) {
    result = a.choice === x.answer_index
      ? `<span class="q-result ok">${icon('checkCircle')}정답입니다</span>`
      : `<span class="q-result bad">${icon('x')}오답입니다</span>`;
  }
  const actions = revealed
    ? `<button class="btn btn-sm" data-action="retry-q" data-q="${i}">${icon('repeat')}다시 풀기</button>${result}`
    : mc
      ? `<button class="btn btn-sm btn-primary" data-action="submit-q" data-q="${i}">답안 제출</button><button class="btn btn-sm btn-ghost" data-action="reveal-q" data-q="${i}">${icon('eye')}정답 확인</button>`
      : `<button class="btn btn-sm btn-primary" data-action="submit-q" data-q="${i}">제출하고 모범 답안 보기</button><button class="btn btn-sm btn-ghost" data-action="reveal-q" data-q="${i}">${icon('eye')}정답 확인</button>`;
  const answerBlock = revealed ? `
    <div class="q-answer">
      ${mc ? `<div class="ans">정답 ${CIRCLED[x.answer_index]} ${richText(x.answer_text || x.choices[x.answer_index])}</div>`
        : `<div class="ans">모범 답안</div><div class="model-ans">${richText(x.answer_text)}</div>`}
      <div class="expl">${esc(x.explanation)}</div>
      ${x.evidence_sentences?.length ? `<div class="small" style="margin-top:8px">근거 문장 ${srefs(x.evidence_sentences)}</div>` : ''}
      ${x.grading ? `<div class="grading"><b>채점 기준</b>\n${esc(x.grading)}</div>` : ''}
      ${!mc && a.submitted ? `<div class="self-grade">자기 채점:
        ${[['ok', '맞음'], ['partial', '부분 정답'], ['bad', '틀림']].map(([k, l]) => `<button class="btn btn-sm ${a.self === k ? 'on' : ''}" data-action="self-grade" data-q="${i}" data-v="${k}">${l}</button>`).join('')}</div>` : ''}
    </div>` : '';
  return `
  <div class="card q-card" id="q-${i}">
    <div class="q-head"><span class="q-no">${i + 1}.</span><span class="pill pill-brand">${esc(x.type)}</span>${x.subtype ? `<span class="pill">${esc(x.subtype)}</span>` : ''}<span class="pill">난이도 ${esc(x.difficulty)}</span></div>
    <div class="q-prompt">${richText(x.prompt)}</div>
    ${x.box ? `<div class="q-box">${richText(x.box)}</div>` : ''}
    ${x.passage ? `<div class="q-passage">${richText(x.passage)}</div>` : ''}
    ${answerArea}
    <div class="q-actions no-print">${actions}</div>
    ${answerBlock}
  </div>`;
}
