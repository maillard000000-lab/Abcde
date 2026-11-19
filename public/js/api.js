// 서버 API 클라이언트. API 키는 서버에만 있고 브라우저에는 노출되지 않는다.

export class ApiError extends Error {
  constructor(code, message, retryable = false) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}

export async function getStatus() {
  const r = await fetch('/api/status', { cache: 'no-store' });
  if (!r.ok) throw new ApiError('status', '서버 상태를 확인하지 못했습니다.');
  return r.json();
}

/** NDJSON 스트림으로 응답하는 분석 작업 호출 */
export async function runJob(path, body, signal) {
  let res;
  try {
    res = await fetch(`/api/analyze/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw new ApiError('aborted', '분석이 취소되었습니다.');
    throw new ApiError('network', '서버에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.', true);
  }
  if (!res.ok) {
    let payload = null;
    try { payload = (await res.json()).error; } catch { /* 무시 */ }
    throw new ApiError(payload?.code || `http_${res.status}`, payload?.message || `서버 오류 (${res.status})`, payload?.retryable ?? res.status >= 500);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const msg = JSON.parse(line);
        if (msg.type === 'result') return msg;
        if (msg.type === 'error') throw new ApiError(msg.error.code, msg.error.message, msg.error.retryable);
      }
    }
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (e.name === 'AbortError') throw new ApiError('aborted', '분석이 취소되었습니다.');
    throw new ApiError('network', '분석 결과를 받는 중 연결이 끊어졌습니다. 다시 시도해 주세요.', true);
  }
  throw new ApiError('incomplete', '분석 결과를 받지 못했습니다. 다시 시도해 주세요.', true);
}

export async function syncNewCode() {
  const r = await fetch('/api/sync/new', { method: 'POST' });
  if (!r.ok) throw new ApiError('sync', '동기화 코드를 만들지 못했습니다.');
  return (await r.json()).code;
}

export async function syncGet(code) {
  const r = await fetch(`/api/sync/${encodeURIComponent(code)}`, { cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(j.error?.code || 'sync', j.error?.message || '클라우드 데이터를 불러오지 못했습니다.');
  return j;
}

export async function syncPut(code, library, baseVersion) {
  const r = await fetch(`/api/sync/${encodeURIComponent(code)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ library, baseVersion }),
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 409) return { conflict: true };
  if (!r.ok) throw new ApiError(j.error?.code || 'sync', j.error?.message || '클라우드에 저장하지 못했습니다.');
  return j;
}
