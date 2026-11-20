import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitPassage, countWords } from '../public/js/split.js';
import { callStructured, aiConfigured, AnalysisError, MODEL } from './ai.js';
import { SYSTEM_PROMPT, passageBlock, overviewTask, detailsTask, sentencesTask, questionsTask, LEVELS } from './prompts.js';
import { overviewSchema, detailsSchema, sentencesSchema, questionsSchema, QUESTION_TYPES } from './schemas.js';
import { SyncStore, newSyncCode, isValidCode } from './sync-store.js';
import { studyverseRouter } from './studyverse.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
const PORT = Number(process.env.PORT || 3000);
const MAX_CHARS = Number(process.env.MAX_PASSAGE_CHARS || 12000);
const MAX_SENTENCES = 120;
const SENTENCE_BATCH_MAX = 6;
const RATE_LIMIT = Number(process.env.RATE_LIMIT_PER_10MIN || 80);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === '1');

// 보안 헤더
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com",
    "font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com data:",
    "img-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'self'",
  ].join('; '));
  next();
});

// ── 간단한 IP 단위 요청 제한 (AI 호출 비용 보호) ──
const hits = new Map();
function rateLimit(req, res, next) {
  const now = Date.now();
  const key = req.ip || 'unknown';
  const list = (hits.get(key) || []).filter((t) => now - t < 10 * 60 * 1000);
  if (list.length >= RATE_LIMIT) {
    return res.status(429).json({ error: { code: 'rate_limited', message: '요청이 너무 많습니다. 몇 분 후 다시 시도해 주세요.' } });
  }
  list.push(now);
  hits.set(key, list);
  next();
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of hits) if (!v.some((t) => now - t < 10 * 60 * 1000)) hits.delete(k);
}, 60 * 1000).unref();

// ── 상태 ──
app.get('/api/status', (req, res) => {
  res.json({
    ai: { configured: aiConfigured(), model: MODEL },
    cloudSync: true,
    limits: { maxChars: MAX_CHARS, maxSentences: MAX_SENTENCES, sentenceBatch: SENTENCE_BATCH_MAX },
    questionTypes: QUESTION_TYPES,
    levels: LEVELS,
  });
});

// ── 분석 공통: 입력 검증 ──
function readPassage(body) {
  const text = typeof body?.text === 'string' ? body.text : '';
  if (!text.trim()) throw new AnalysisError('invalid', '분석할 영어 지문을 입력해 주세요.', { status: 400 });
  if (text.length > MAX_CHARS) {
    throw new AnalysisError('too_long', `지문이 너무 깁니다. ${MAX_CHARS.toLocaleString()}자 이하로 나누어 분석해 주세요.`, { status: 400 });
  }
  if (countWords(text) < 5) throw new AnalysisError('invalid', '영어 문장이 충분하지 않습니다. 영어 지문을 입력해 주세요.', { status: 400 });
  const sentences = splitPassage(text);
  if (sentences.length > MAX_SENTENCES) {
    throw new AnalysisError('too_long', `문장 수가 너무 많습니다(최대 ${MAX_SENTENCES}문장).`, { status: 400 });
  }
  const level = LEVELS[body.level] ? body.level : 'high2';
  return { text, sentences, level };
}

/**
 * NDJSON 으로 응답한다. 분석이 수 분 걸릴 수 있으므로 15초마다 keep-alive 줄을 보내
 * 프록시가 연결을 끊지 않도록 하고, 클라이언트가 연결을 끊으면 AI 호출도 취소한다.
 */
function streamJob(handler) {
  return async (req, res) => {
    const controller = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    let started = false;
    let ping;
    const startStream = () => {
      if (started) return;
      started = true;
      res.status(200);
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();
      ping = setInterval(() => res.write(JSON.stringify({ type: 'ping', t: Date.now() }) + '\n'), 15000);
    };
    try {
      const input = readPassage(req.body); // 검증 오류는 일반 JSON 오류로 즉시 응답
      startStream();
      const result = await handler(input, req.body, controller.signal);
      res.write(JSON.stringify({ type: 'result', ...result }) + '\n');
    } catch (err) {
      const e = err instanceof AnalysisError ? err : new AnalysisError('internal', err?.message || String(err));
      if (e.code !== 'aborted') console.error(`[analyze] ${req.path}: ${e.code} ${e.message}`);
      const payload = { code: e.code, message: e.message, retryable: e.retryable };
      if (!started) {
        res.status(e.status || 500).json({ error: payload });
        return;
      }
      res.write(JSON.stringify({ type: 'error', error: payload }) + '\n');
    } finally {
      clearInterval(ping);
      if (started && !res.writableEnded) res.end();
    }
  };
}

const analyze = express.Router();
analyze.use(express.json({ limit: '200kb' }));
analyze.use(rateLimit);

analyze.post('/overview', streamJob(async ({ sentences, level }, body, signal) => {
  const { data, model } = await callStructured({
    system: SYSTEM_PROMPT,
    passage: passageBlock(sentences, level),
    task: overviewTask(sentences),
    schema: overviewSchema,
    signal,
  });
  return { data: sanitizeOverview(data, sentences.length), model, sentences };
}));

analyze.post('/details', streamJob(async ({ sentences, level }, body, signal) => {
  const { data, model } = await callStructured({
    system: SYSTEM_PROMPT,
    passage: passageBlock(sentences, level),
    task: detailsTask(),
    schema: detailsSchema,
    signal,
  });
  return { data, model };
}));

analyze.post('/sentences', streamJob(async ({ sentences, level }, body, signal) => {
  const wanted = Array.isArray(body.indices) ? body.indices.map(Number) : [];
  const targets = sentences.filter((s) => wanted.includes(s.index));
  if (!targets.length || targets.length > SENTENCE_BATCH_MAX) {
    throw new AnalysisError('invalid', `분석할 문장 번호가 올바르지 않습니다(1회 최대 ${SENTENCE_BATCH_MAX}문장).`, { status: 400 });
  }
  const { data, model } = await callStructured({
    system: SYSTEM_PROMPT,
    passage: passageBlock(sentences, level),
    task: sentencesTask(targets),
    schema: sentencesSchema,
    signal,
  });
  // 요청한 문장만, 번호 기준으로 정리. 누락된 문장은 클라이언트에 알려 재시도할 수 있게 한다.
  const byIndex = new Map();
  for (const s of data.sentences || []) {
    if (targets.some((t) => t.index === s.index) && !byIndex.has(s.index)) byIndex.set(s.index, s);
  }
  const missing = targets.filter((t) => !byIndex.has(t.index)).map((t) => t.index);
  return { data: { sentences: [...byIndex.values()].sort((a, b) => a.index - b.index) }, missing, model };
}));

analyze.post('/questions', streamJob(async ({ sentences, level }, body, signal) => {
  const req = Array.isArray(body.types) ? body.types : [];
  const types = req
    .filter((t) => QUESTION_TYPES.includes(t?.type))
    .map((t) => ({ type: t.type, count: Math.min(3, Math.max(1, Number(t.count) || 1)) }));
  if (!types.length) throw new AnalysisError('invalid', '문제 유형을 하나 이상 선택해 주세요.', { status: 400 });
  const total = types.reduce((a, t) => a + t.count, 0);
  if (total > 16) throw new AnalysisError('invalid', '한 번에 최대 16문항까지 생성할 수 있습니다.', { status: 400 });
  const { data, model } = await callStructured({
    system: SYSTEM_PROMPT,
    passage: passageBlock(sentences, level),
    task: questionsTask(types, level),
    schema: questionsSchema,
    signal,
  });
  return { data: { questions: (data.questions || []).map(sanitizeQuestion) }, model };
}));

function sanitizeOverview(d, n) {
  const ok = (i) => Number.isInteger(i) && i >= 1 && i <= n;
  d.relations = (d.relations || []).filter((r) => ok(r.from) && ok(r.to) && r.from !== r.to);
  d.key_sentences = (d.key_sentences || []).filter((k) => ok(k.index));
  d.sentence_roles = (d.sentence_roles || []).filter((r) => ok(r.index));
  return d;
}

function sanitizeQuestion(q) {
  const mc = Array.isArray(q.choices) && q.choices.length >= 2;
  return {
    ...q,
    choices: mc ? q.choices.map((c) => String(c).replace(/^\s*[①②③④⑤]\s*/, '')) : [],
    answer_index: mc && Number.isInteger(q.answer_index) && q.answer_index >= 0 && q.answer_index < q.choices.length ? q.answer_index : -1,
  };
}

app.use('/api/analyze', analyze);

// ── 클라우드 동기화 ──
const store = new SyncStore(process.env.SYNC_DATA_DIR || path.join(ROOT, 'data', 'sync'));
const sync = express.Router();
sync.use(express.json({ limit: '30mb' }));

sync.post('/new', rateLimit, (req, res) => {
  res.json({ code: newSyncCode() });
});
sync.get('/:code', async (req, res, next) => {
  try {
    const code = String(req.params.code).toUpperCase();
    if (!isValidCode(code)) return res.status(400).json({ error: { code: 'invalid_code', message: '동기화 코드 형식이 올바르지 않습니다.' } });
    const rec = await store.get(code);
    if (!rec) return res.json({ version: 0, library: null });
    res.json(rec);
  } catch (e) { next(e); }
});
sync.put('/:code', async (req, res, next) => {
  try {
    const code = String(req.params.code).toUpperCase();
    if (!isValidCode(code)) return res.status(400).json({ error: { code: 'invalid_code', message: '동기화 코드 형식이 올바르지 않습니다.' } });
    const { library, baseVersion } = req.body || {};
    if (!library || !Array.isArray(library.passages)) {
      return res.status(400).json({ error: { code: 'invalid', message: '저장할 데이터 형식이 올바르지 않습니다.' } });
    }
    const r = await store.put(code, library, Number(baseVersion) || 0);
    if (r.conflict) return res.status(409).json({ error: { code: 'conflict', message: '다른 기기에서 먼저 저장했습니다.' }, version: r.version });
    res.json(r);
  } catch (e) { next(e); }
});
app.use('/api/sync', sync);

// ── STUDYVERSE 게임: AI 콘텐츠 창작 (선택) ──
app.use('/api/studyverse', studyverseRouter(rateLimit));

app.use('/api', (req, res) => res.status(404).json({ error: { code: 'not_found', message: '존재하지 않는 API입니다.' } }));

// ── 정적 파일 ──
app.use(express.static(path.join(ROOT, 'public'), { extensions: ['html'], maxAge: '1h' }));
app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(ROOT, 'public', 'index.html')));

app.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'too_large', message: '요청 데이터가 너무 큽니다.' } });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'invalid', message: '요청 형식이 올바르지 않습니다.' } });
  }
  console.error(err);
  res.status(500).json({ error: { code: 'internal', message: '서버 오류가 발생했습니다.' } });
});

await store.init();
const server = app.listen(PORT, () => {
  console.log(`Passage Lab running at http://localhost:${PORT}`);
  console.log(`AI: ${aiConfigured() ? `configured (${MODEL})` : 'NOT configured — set ANTHROPIC_API_KEY'}`);
});
server.requestTimeout = 0; // 분석은 수 분 걸릴 수 있다
server.headersTimeout = 65000;
