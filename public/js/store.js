// 학습 데이터 저장소
// - 기본: IndexedDB (브라우저를 닫아도 유지, 용량 넉넉)
// - IndexedDB 를 쓸 수 없으면 localStorage 로 대체
// - 선택: 동기화 코드를 이용한 클라우드 동기화 (서버 디스크 저장)
import { syncGet, syncPut, syncNewCode } from './api.js';
import { uid, debounce } from './ui.js';

const DB_NAME = 'passage-lab';
const DB_VERSION = 1;
const LS_KEY = 'passage-lab:v1';

let db = null;
let backend = 'memory';
const passages = new Map();
const meta = { sync: { code: '', version: 0, lastSyncAt: '', status: 'off', error: '' } };
const listeners = new Set();

function emit(kind, id) { for (const fn of listeners) fn(kind, id); }
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('no idb'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('passages')) d.createObjectStore('passages', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('blocked'));
  });
}

function idbAll(storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const r = tx.objectStore(storeName).getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  });
}

function idbPut(storeName, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function lsSave() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ passages: [...passages.values()], meta }));
  } catch (e) {
    console.error(e);
    emit('storage-error');
  }
}

export async function init() {
  try {
    db = await openDb();
    backend = 'indexeddb';
    for (const p of await idbAll('passages')) passages.set(p.id, p);
    for (const m of await idbAll('meta')) if (m.key === 'sync') Object.assign(meta.sync, m.value);
    // 이전 localStorage 데이터가 있으면 옮긴다
    const legacy = safeLsRead();
    if (legacy?.passages?.length) {
      for (const p of legacy.passages) if (!passages.has(p.id)) { passages.set(p.id, p); await idbPut('passages', p); }
      localStorage.removeItem(LS_KEY);
    }
  } catch {
    db = null;
    const data = safeLsRead();
    backend = data !== undefined ? 'localstorage' : 'memory';
    for (const p of data?.passages || []) passages.set(p.id, p);
    if (data?.meta?.sync) Object.assign(meta.sync, data.meta.sync);
  }
  // 새로고침 등으로 중단된 분석 작업 표시
  for (const p of passages.values()) {
    let changed = false;
    const a = p.analysis;
    if (!a) continue;
    for (const k of ['overview', 'details', 'questions']) {
      if (a[k]?.status === 'running' || a[k]?.status === 'queued') { a[k].status = 'interrupted'; changed = true; }
    }
    for (const c of a.sentences?.chunks || []) {
      if (c.status === 'running' || c.status === 'queued') { c.status = 'interrupted'; changed = true; }
    }
    if (changed) await persist(p);
  }
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  meta.sync.status = meta.sync.code ? 'idle' : 'off';
  return backend;
}

function safeLsRead() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return undefined;
  }
}

async function persist(p) {
  if (db) {
    try { await idbPut('passages', p); } catch (e) { console.error(e); emit('storage-error'); }
  } else if (backend === 'localstorage') {
    lsSave();
  }
}

async function persistMeta() {
  if (db) {
    try { await idbPut('meta', { key: 'sync', value: { ...meta.sync, status: undefined, error: undefined } }); } catch (e) { console.error(e); }
  } else if (backend === 'localstorage') lsSave();
}

export function getBackend() { return backend; }

export function list() {
  return [...passages.values()].filter((p) => !p.deleted);
}

export function get(id) {
  const p = passages.get(id);
  return p && !p.deleted ? p : null;
}

export function create({ title, text, level, sentences, questionTypes }) {
  const now = new Date().toISOString();
  const p = {
    id: uid(),
    title: title || '',
    titleAuto: !title,
    text,
    level,
    sentences,
    questionTypes,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    favorite: false,
    completed: false,
    completedAt: '',
    review: { log: [], flagged: false },
    starred: [],
    memorized: {},
    answers: {},
    analysis: null,
  };
  passages.set(p.id, p);
  persist(p);
  emit('create', p.id);
  scheduleSync();
  return p;
}

/** 변경 함수를 적용하고 저장한다. touch=false 면 정렬용 수정 시각을 바꾸지 않는다. */
export function update(id, mutate, { silent = false } = {}) {
  const p = passages.get(id);
  if (!p || p.deleted) return null;
  mutate(p);
  p.updatedAt = new Date().toISOString();
  persist(p);
  if (!silent) emit('update', id);
  scheduleSync();
  return p;
}

export function remove(id) {
  const p = passages.get(id);
  if (!p) return;
  const tomb = { id, deleted: true, updatedAt: new Date().toISOString() };
  passages.set(id, tomb);
  persist(tomb);
  emit('delete', id);
  scheduleSync();
}

export function exportJson() {
  return JSON.stringify({ app: 'passage-lab', version: 1, exportedAt: new Date().toISOString(), passages: list() }, null, 2);
}

export async function importJson(text) {
  const data = JSON.parse(text);
  const items = Array.isArray(data?.passages) ? data.passages : null;
  if (!items) throw new Error('올바른 백업 파일이 아닙니다.');
  let n = 0;
  for (const p of items) {
    if (!p?.id || typeof p.text !== 'string') continue;
    const cur = passages.get(p.id);
    if (!cur || (p.updatedAt || '') > (cur.updatedAt || '')) {
      passages.set(p.id, p);
      await persist(p);
      n++;
    }
  }
  emit('import');
  scheduleSync();
  return n;
}

// ───────────────────────── 클라우드 동기화 ─────────────────────────

export function syncInfo() { return { ...meta.sync }; }

function setSync(patch) {
  Object.assign(meta.sync, patch);
  emit('sync');
}

let syncing = null;
let pending = false;

export async function syncNow() {
  if (!meta.sync.code) return;
  if (syncing) { pending = true; return syncing; }
  syncing = (async () => {
    setSync({ status: 'syncing', error: '' });
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const remote = await syncGet(meta.sync.code);
        let changed = false;
        for (const rp of remote.library?.passages || []) {
          const lp = passages.get(rp.id);
          if (!lp || (rp.updatedAt || '') > (lp.updatedAt || '')) {
            // 진행 중인 로컬 분석은 덮어쓰지 않는다
            if (lp && isRunning(lp)) continue;
            passages.set(rp.id, rp);
            await persist(rp);
            changed = true;
          }
        }
        if (changed) emit('import');
        const library = { passages: [...passages.values()].map(stripRuntime) };
        const r = await syncPut(meta.sync.code, library, remote.version || 0);
        if (r.conflict) continue;
        setSync({ version: r.version, lastSyncAt: new Date().toISOString(), status: 'idle' });
        await persistMeta();
        return;
      }
      throw new Error('다른 기기와 저장이 충돌했습니다. 잠시 후 다시 시도해 주세요.');
    } catch (e) {
      setSync({ status: 'error', error: e.message || '동기화 실패' });
    } finally {
      syncing = null;
      if (pending) { pending = false; scheduleSync(); }
    }
  })();
  return syncing;
}

function isRunning(p) {
  const a = p.analysis;
  if (!a) return false;
  return ['overview', 'details', 'questions'].some((k) => a[k]?.status === 'running')
    || (a.sentences?.chunks || []).some((c) => c.status === 'running');
}

function stripRuntime(p) { return p; }

const scheduleSync = debounce(() => { if (meta.sync.code && navigator.onLine !== false) syncNow(); }, 2500);

export async function enableSync(code) {
  const c = code ? code.trim().toUpperCase() : await syncNewCode();
  if (!/^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){4}$/.test(c)) throw new Error('동기화 코드 형식이 올바르지 않습니다. (예: ABCD-EFGH-JKLM-NPQR-STUV)');
  meta.sync.code = c;
  meta.sync.version = 0;
  await persistMeta();
  await syncNow();
  if (meta.sync.status === 'error') {
    const err = meta.sync.error;
    meta.sync.code = '';
    meta.sync.status = 'off';
    await persistMeta();
    throw new Error(err);
  }
  return c;
}

export async function disableSync() {
  meta.sync = { code: '', version: 0, lastSyncAt: '', status: 'off', error: '' };
  await persistMeta();
  emit('sync');
}

window.addEventListener('online', () => scheduleSync());
