// 분석 작업 관리: 지문 하나의 분석을 여러 AI 호출로 나누어 병렬 실행하고 진행 상태를 저장한다.
import * as store from './store.js';
import { runJob } from './api.js';

const CONCURRENCY = 4;
const running = new Map(); // passageId -> { controller, active:Set }

export function isActive(id) { return running.has(id); }

function makeChunks(sentences) {
  const chunks = [];
  let cur = [];
  let chars = 0;
  for (const s of sentences) {
    if (cur.length && (cur.length >= 4 || chars + s.text.length > 480)) {
      chunks.push(cur);
      cur = [];
      chars = 0;
    }
    cur.push(s.index);
    chars += s.text.length;
  }
  if (cur.length) chunks.push(cur);
  return chunks.map((indices) => ({ indices, status: 'queued', error: '' }));
}

export function initAnalysis(p) {
  return {
    startedAt: new Date().toISOString(),
    finishedAt: '',
    model: '',
    overview: { status: 'queued', data: null, error: '' },
    details: { status: 'queued', data: null, error: '' },
    sentences: { items: {}, chunks: makeChunks(p.sentences) },
    questions: { status: 'queued', data: null, error: '' },
  };
}

function body(p, extra = {}) {
  return { text: p.text, level: p.level, ...extra };
}

/** 대기/실패/중단 상태인 모든 작업을 실행한다. */
export function run(id, { only } = {}) {
  const p = store.get(id);
  if (!p) return;
  if (!p.analysis) store.update(id, (x) => { x.analysis = initAnalysis(x); });
  const pending = (s) => s === 'queued' || s === 'error' || s === 'interrupted';

  const tasks = [];
  const a = store.get(id).analysis;
  const want = (k) => !only || only.includes(k);
  if (want('overview') && pending(a.overview.status)) tasks.push({ kind: 'overview' });
  if (want('details') && pending(a.details.status)) tasks.push({ kind: 'details' });
  a.sentences.chunks.forEach((c, i) => { if (want('sentences') && pending(c.status)) tasks.push({ kind: 'chunk', i }); });
  if (want('questions') && pending(a.questions.status)) tasks.push({ kind: 'questions' });
  if (!tasks.length) return;

  // 대기 상태로 표시
  store.update(id, (x) => {
    for (const t of tasks) target(x, t).status = 'queued';
    x.analysis.finishedAt = '';
  });

  let job = running.get(id);
  if (!job) {
    job = { controller: new AbortController(), queue: [], active: 0 };
    running.set(id, job);
  }
  job.queue.push(...tasks.filter((t) => !job.queue.some((q) => same(q, t))));
  pump(id, job);
}

function same(a, b) { return a.kind === b.kind && a.i === b.i; }

function target(p, t) {
  const a = p.analysis;
  if (t.kind === 'chunk') return a.sentences.chunks[t.i];
  return a[t.kind];
}

function pump(id, job) {
  while (job.active < CONCURRENCY && job.queue.length) {
    const t = job.queue.shift();
    job.active++;
    execute(id, t, job.controller.signal).finally(() => {
      job.active--;
      if (!job.queue.length && job.active === 0) {
        if (running.get(id) === job) running.delete(id);
        store.update(id, (x) => {
          if (x.analysis && isComplete(x.analysis)) x.analysis.finishedAt = new Date().toISOString();
        });
      } else pump(id, job);
    });
  }
}

async function execute(id, t, signal) {
  const p = store.get(id);
  if (!p) return;
  store.update(id, (x) => { const tg = target(x, t); tg.status = 'running'; tg.error = ''; tg.startedAt = new Date().toISOString(); });
  try {
    if (t.kind === 'overview' || t.kind === 'details') {
      const r = await runJob(t.kind, body(p), signal);
      store.update(id, (x) => {
        x.analysis[t.kind] = { status: 'done', data: r.data, error: '' };
        x.analysis.model = r.model || x.analysis.model;
        if (t.kind === 'overview' && x.titleAuto && r.data?.title_ko) x.title = r.data.title_ko;
      });
    } else if (t.kind === 'chunk') {
      const chunk = p.analysis.sentences.chunks[t.i];
      const r = await runJob('sentences', body(p, { indices: chunk.indices }), signal);
      store.update(id, (x) => {
        for (const s of r.data.sentences) x.analysis.sentences.items[s.index] = s;
        const c = x.analysis.sentences.chunks[t.i];
        if (r.missing?.length) {
          c.indices = r.missing;
          c.status = 'error';
          c.error = `일부 문장(S${r.missing.join(', S')})의 분석 결과가 누락되었습니다. 다시 시도해 주세요.`;
        } else {
          c.status = 'done';
          c.error = '';
        }
      });
    } else if (t.kind === 'questions') {
      const types = p.questionTypes?.length ? p.questionTypes : defaultQuestionTypes();
      const r = await runJob('questions', body(p, { types }), signal);
      store.update(id, (x) => {
        x.analysis.questions = { status: 'done', data: r.data, error: '', generatedAt: new Date().toISOString() };
        x.answers = {};
      });
    }
  } catch (e) {
    const aborted = e.code === 'aborted';
    store.update(id, (x) => {
      const tg = target(x, t);
      if (!tg) return;
      tg.status = aborted ? 'interrupted' : 'error';
      tg.error = aborted ? '사용자가 분석을 중지했습니다.' : e.message;
      tg.errorCode = e.code;
    });
  }
}

export function cancel(id) {
  const job = running.get(id);
  if (!job) return;
  job.queue.length = 0;
  job.controller.abort();
  running.delete(id);
  store.update(id, (x) => {
    const a = x.analysis;
    if (!a) return;
    for (const k of ['overview', 'details', 'questions']) if (a[k].status === 'queued') a[k].status = 'interrupted';
    for (const c of a.sentences.chunks) if (c.status === 'queued') c.status = 'interrupted';
  });
}

export function regenerateQuestions(id, types) {
  store.update(id, (x) => {
    x.questionTypes = types;
    if (!x.analysis) x.analysis = initAnalysis(x);
    x.analysis.questions = { status: 'queued', data: x.analysis.questions?.data || null, error: '' };
  });
  run(id, { only: ['questions'] });
}

export function defaultQuestionTypes() {
  return ['객관식', '빈칸 추론', '어법 선택', '어휘 선택', '순서 배열', '문장 삽입', '서술형', '영작'].map((type) => ({ type, count: 1 }));
}

export function isComplete(a) {
  return a.overview.status === 'done' && a.details.status === 'done' && a.questions.status === 'done'
    && a.sentences.chunks.every((c) => c.status === 'done');
}

/** 진행률 요약 */
export function progress(a) {
  if (!a) return { done: 0, total: 0, failed: 0, running: 0, pct: 0 };
  const items = [a.overview.status, a.details.status, a.questions.status, ...a.sentences.chunks.map((c) => c.status)];
  // 문장 묶음은 가중치를 둔다
  const weights = [3, 3, 3, ...a.sentences.chunks.map(() => 2)];
  let done = 0; let total = 0; let failed = 0; let run = 0;
  items.forEach((s, i) => {
    total += weights[i];
    if (s === 'done') done += weights[i];
    if (s === 'error' || s === 'interrupted') failed++;
    if (s === 'running' || s === 'queued') run++;
  });
  return { done, total, failed, running: run, pct: total ? Math.round((done / total) * 100) : 0 };
}
