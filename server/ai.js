import Anthropic from '@anthropic-ai/sdk';

export const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';
const EFFORT = process.env.ANALYSIS_EFFORT || 'high';
const USE_FALLBACKS = process.env.DISABLE_REFUSAL_FALLBACK !== '1';

export class AnalysisError extends Error {
  constructor(code, message, { status = 500, retryable = false } = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

let client = null;
export function aiConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}
function getClient() {
  if (!aiConfigured()) {
    throw new AnalysisError('not_configured',
      'AI 분석 서버에 API 키가 설정되어 있지 않습니다. 서버 관리자가 ANTHROPIC_API_KEY 환경 변수를 설정해야 분석을 실행할 수 있습니다.',
      { status: 503 });
  }
  if (!client) client = new Anthropic({ maxRetries: 2 });
  return client;
}

function mapApiError(err) {
  if (err instanceof AnalysisError) return err;
  if (err?.name === 'AbortError' || err instanceof Anthropic.APIUserAbortError) {
    return new AnalysisError('aborted', '분석이 취소되었습니다.', { status: 499 });
  }
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new AnalysisError('auth', 'AI 서비스 인증에 실패했습니다. 서버의 API 키 설정을 확인해 주세요.', { status: 502 });
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new AnalysisError('rate_limited', 'AI 서비스 요청이 많아 잠시 처리할 수 없습니다. 1~2분 후 다시 시도해 주세요.', { status: 429, retryable: true });
  }
  if (err instanceof Anthropic.BadRequestError) {
    return new AnalysisError('bad_request', `AI 요청 형식 오류: ${err.message}`, { status: 502 });
  }
  if (err instanceof Anthropic.InternalServerError) {
    return new AnalysisError('upstream', 'AI 서비스에 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.', { status: 502, retryable: true });
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new AnalysisError('connection', 'AI 서비스에 연결하지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.', { status: 502, retryable: true });
  }
  if (err instanceof Anthropic.APIError) {
    return new AnalysisError('upstream', `AI 서비스 오류 (${err.status ?? '알 수 없음'}): ${err.message}`, { status: 502, retryable: true });
  }
  return new AnalysisError('internal', `분석 중 오류가 발생했습니다: ${err?.message || err}`, { status: 500 });
}

/**
 * 구조화된 JSON 결과를 받는 Claude 호출.
 * 긴 출력을 안정적으로 받기 위해 스트리밍 + finalMessage 를 사용한다.
 */
export async function callStructured({ system, passage, task, schema, maxTokens = 32000, signal }) {
  const anthropic = getClient();
  const params = {
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{
      role: 'user',
      content: [
        // 같은 지문에 대한 여러 호출이 지문 블록까지의 접두부를 공유하므로 캐시 지점을 둔다.
        { type: 'text', text: passage, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: task },
      ],
    }],
    output_config: { effort: EFFORT, format: { type: 'json_schema', schema } },
  };
  if (USE_FALLBACKS) {
    params.betas = ['server-side-fallback-2026-07-01'];
    params.fallbacks = 'default';
  }

  let message;
  try {
    const stream = USE_FALLBACKS
      ? anthropic.beta.messages.stream(params, { signal })
      : anthropic.messages.stream(params, { signal });
    message = await stream.finalMessage();
  } catch (err) {
    throw mapApiError(err);
  }

  if (message.stop_reason === 'refusal') {
    throw new AnalysisError('refusal', 'AI가 이 지문의 분석을 거절했습니다. 지문 내용을 확인해 주세요.', { status: 422 });
  }
  if (message.stop_reason === 'max_tokens') {
    throw new AnalysisError('truncated', '분석 결과가 너무 길어 중간에 잘렸습니다. 지문을 나누어 분석하거나 다시 시도해 주세요.', { status: 502, retryable: true });
  }
  const text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  try {
    return { data: JSON.parse(text), model: message.model, usage: message.usage };
  } catch {
    throw new AnalysisError('parse', 'AI 응답을 해석하지 못했습니다. 다시 시도해 주세요.', { status: 502, retryable: true });
  }
}
