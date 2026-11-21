// STUDYVERSE: AI 콘텐츠 창작 API (선택 기능)
// 게임은 이 API 없이도 모든 기본 플레이가 가능하다. 이 API는 연구실/등불 공방에서
// 세계관에 맞는 새 마법·장비 '설계안'만 만든다. 수치는 클라이언트가 게임 규칙 범위로 다시 조정한다.
import express from 'express';
import { callStructured, AnalysisError } from './ai.js';

// 공개 세계관 설정만 전달한다(스토리 결말·반전은 포함하지 않는다).
const WORLD = `[STUDYVERSE 공개 세계관]
- 세계를 유지하던 '지식의 빛'이 꺼져 가고, 빛을 잃은 땅은 '정적'에 잠긴다. 정적은 파괴가 아니라 아무도 궁금해하지 않게 되는 상태다.
- 정적 속 괴물은 '굳은 물음' — 답을 잃고 굳어 버린 물음의 잔해. 정화하면 원래의 질문을 남긴다.
- 플레이어는 마지막 빛이 남은 '헤스페린 학당'의 학생이며, 물음을 빛으로 바꾸는 힘 '점화'를 지녔다.
- 지역: 속삭이는 숲(이름을 부르는 갈대), 회색골(정적의 마을), 가라앉은 천문대(호수 밑 별의 기록소), 유리 사막(불탄 도시 칼더), 메아리 협곡(질문의 메아리), 잊힌 수도 아우렐(지식의 옛 왕국).
- 등장 집단: 등지기(정적의 땅에서 질문을 가르치는 사람들), 렌하르트 가문(학당 설립 가문).
- 문체: 따뜻하고 서정적인 판타지. 한국어. 유치하거나 흔한 이름(○○의 검, 불꽃 마법 등)은 피하고, 배움·질문·기록·빛의 모티프를 쓴다.`;

const SYSTEM = `당신은 픽셀 아트 판타지 RPG 'STUDYVERSE : 지식의 세계'의 콘텐츠 디자이너입니다.
주어진 세계관과 일관된, 독창적이고 기능이 분명한 게임 콘텐츠 하나를 설계합니다.
이미 존재하는 이름과 겹치지 않게 하고, 스토리의 결말이나 숨겨진 진실을 지어내거나 암시하지 마십시오.`;

const itemSchema = {
  type: 'object', additionalProperties: false,
  required: ['name', 'slot', 'rarity', 'stats', 'effect', 'color', 'description', 'lore'],
  properties: {
    name: { type: 'string', description: '한국어 아이템 이름, 2~14자' },
    slot: { type: 'string', enum: ['staff', 'weapon', 'tome', 'ring', 'neck', 'charm', 'tool'] },
    rarity: { type: 'string', enum: ['fine', 'rare', 'epic'] },
    stats: {
      type: 'object', additionalProperties: false, required: ['int', 'wil', 'foc', 'vit', 'ins'],
      properties: { int: { type: 'integer' }, wil: { type: 'integer' }, foc: { type: 'integer' }, vit: { type: 'integer' }, ins: { type: 'integer' } },
    },
    effect: {
      type: 'object', additionalProperties: false, required: ['type', 'value'],
      properties: { type: { type: 'string', enum: ['loot', 'restore', 'xp', 'light', 'research', 'crit', 'none'] }, value: { type: 'number' } },
    },
    color: { type: 'string', description: '대표 색 #rrggbb' },
    description: { type: 'string', description: '외형과 기능을 담은 한두 문장' },
    lore: { type: 'string', description: '세계관 속 유래 한두 문장' },
  },
};
const spellSchema = {
  type: 'object', additionalProperties: false,
  required: ['name', 'kind', 'rarity', 'element', 'visual', 'color', 'appearance', 'lore'],
  properties: {
    name: { type: 'string', description: '한국어 마법 이름, 2~12자' },
    kind: { type: 'string', enum: ['dmg', 'dot', 'heal', 'shield', 'drain', 'buff'] },
    rarity: { type: 'string', enum: ['common', 'fine', 'rare', 'epic'] },
    element: { type: 'string', enum: ['life', 'ink', 'star', 'echo', 'glass', 'wind', 'light', 'water', 'fire', 'mind', 'ward'] },
    visual: { type: 'string', enum: ['bolt', 'beam', 'burst', 'ring', 'rain', 'wave', 'leaf', 'sparkle', 'wind'] },
    color: { type: 'string', description: '이펙트 색 #rrggbb' },
    appearance: { type: 'string', description: '픽셀 이펙트의 외형 묘사 한 문장' },
    lore: { type: 'string', description: '마법의 설정과 배경 한두 문장' },
  },
};

export function studyverseRouter(rateLimit) {
  const r = express.Router();
  r.post('/forge', rateLimit, express.json({ limit: '32kb' }), async (req, res) => {
    try {
      const { kind, level, regions, known, slot } = req.body || {};
      if (!['item', 'spell'].includes(kind)) throw new AnalysisError('invalid', '알 수 없는 창작 종류입니다.', { status: 400 });
      const lv = Math.max(1, Math.min(80, Number(level) || 1));
      const regionText = Array.isArray(regions) ? regions.filter((x) => typeof x === 'string').slice(0, 8).join(', ') : '';
      const knownText = Array.isArray(known) ? known.filter((x) => typeof x === 'string').map((x) => x.slice(0, 30)).slice(0, 40).join(', ') : '';
      const slotText = typeof slot === 'string' && /^[a-z]{3,8}$/.test(slot) ? slot : '';
      const task = kind === 'item'
        ? `학당의 '등불 공방'에서 제작될 장비 하나를 설계하세요.
- 플레이어 레벨: ${lv}. 능력치 합계는 대략 ${Math.round(4 + lv)} 이하.
- 플레이어가 가 본 지역: ${regionText || '학당 주변'} — 이 중 한 곳의 재료나 분위기를 반영하세요.
${slotText ? `- 부위: ${slotText}` : '- 부위는 자유롭게 고르세요.'}
- 이미 있는 이름(겹치지 말 것): ${knownText || '없음'}
- effect.value 는 0.02~0.08 사이 비율. 효과가 없으면 type "none".`
        : `학당 '연구실'에서 새로 정리될 마법 하나를 설계하세요.
- 플레이어 레벨: ${lv}.
- 모든 마법의 근원은 지식의 빛이며, 특정 교과목과 연결하지 않습니다.
- 이미 있는 마법(겹치지 말 것): ${knownText || '없음'}
- kind 는 효과 유형(dmg 공격, dot 지속 피해, heal 회복, shield 보호막, drain 흡수, buff 다음 공격 강화).`;
      const { data } = await callStructured({ system: SYSTEM, passage: WORLD, task, schema: kind === 'item' ? itemSchema : spellSchema, maxTokens: 12000 });
      res.json({ data });
    } catch (err) {
      const status = err.status || 500;
      res.status(status).json({ error: { code: err.code || 'internal', message: err.message || 'AI 창작 중 오류가 발생했습니다.' } });
    }
  });

  // ── 공부 시간 사진 인증: 다른 공부 앱(타이머) 스크린샷을 읽는다 ──
  r.post('/verify', rateLimit, express.json({ limit: '9mb' }), async (req, res) => {
    try {
      const { image, mediaType, today } = req.body || {};
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(mediaType)) throw new AnalysisError('invalid', 'JPEG, PNG, WebP 이미지만 인증할 수 있습니다.', { status: 400 });
      if (typeof image !== 'string' || image.length < 100 || image.length > 8_000_000 || !/^[A-Za-z0-9+/=]+$/.test(image)) {
        throw new AnalysisError('invalid', '이미지 데이터가 올바르지 않거나 너무 큽니다.', { status: 400 });
      }
      const todayText = typeof today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(today) ? today : '';
      const { data } = await callStructured({
        system: VERIFY_SYSTEM,
        passage: VERIFY_GUIDE,
        images: [{ mediaType, data: image }],
        task: `위 스크린샷을 판독해 주세요.${todayText ? ` (참고: 사용자의 오늘 날짜는 ${todayText}입니다. 연도는 화면에 보이지 않으면 추측하지 말고 월·일만 적으세요.)` : ''}`,
        schema: verifySchema,
        maxTokens: 8000,
      });
      res.json({ data: sanitizeVerify(data) });
    } catch (err) {
      const status = err.status || 500;
      res.status(status).json({ error: { code: err.code || 'internal', message: err.message || '사진 판독 중 오류가 발생했습니다.' } });
    }
  });
  return r;
}

const VERIFY_SYSTEM = `당신은 공부 시간 기록 앱(열품타, 공부 타이머, 스톱워치형 플래너 등)의 스크린샷에서 숫자를 정확히 옮겨 적는 판독기입니다.
화면에 실제로 보이는 값만 적고, 보이지 않거나 흐릿한 값은 추측하지 말고 null 로 둡니다. 사용자의 이익을 위해 값을 부풀리지 마십시오.`;
const VERIFY_GUIDE = `[판독 규칙]
- is_study_timer: 공부 시간을 기록하는 앱/타이머 화면이면 true. 게임, 일반 사진, 시계 앱, 문서 등은 false.
- date: 화면에 표시된 기록 날짜(예: "11. 20 (금)" → month 11, day 20, weekday "금"). 요일은 한 글자 한국어(일 월 화 수 목 금 토)로. 날짜가 없으면 null.
- total_seconds: 그날의 총 공부 시간으로 가장 크게 표시된 값(H:MM:SS → 초). 총합이 없으면 null.
- total_text: total_seconds 를 읽은 원문 그대로.
- subjects: 과목/항목별 시간 목록(이름과 초). 0초인 과목도 포함해도 됩니다.
- running: 타이머가 지금 측정 중으로 보이면 true.
- edited_suspicion: 숫자가 겹치거나 글꼴이 다르거나 편집 흔적이 보이면 그 이유를 짧게, 없으면 빈 문자열.
- confidence: 판독 확신도 high / medium / low.`;
const verifySchema = {
  type: 'object', additionalProperties: false,
  required: ['is_study_timer', 'app_guess', 'date', 'total_seconds', 'total_text', 'subjects', 'running', 'edited_suspicion', 'confidence'],
  properties: {
    is_study_timer: { type: 'boolean' },
    app_guess: { type: 'string' },
    date: {
      anyOf: [{ type: 'null' }, {
        type: 'object', additionalProperties: false, required: ['month', 'day', 'weekday'],
        properties: { month: { type: 'integer' }, day: { type: 'integer' }, weekday: { anyOf: [{ type: 'string' }, { type: 'null' }] } },
      }],
    },
    total_seconds: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
    total_text: { type: 'string' },
    subjects: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['name', 'seconds'], properties: { name: { type: 'string' }, seconds: { type: 'integer' } } },
    },
    running: { type: 'boolean' },
    edited_suspicion: { type: 'string' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
};
function sanitizeVerify(d) {
  const int = (v, max) => (Number.isInteger(v) && v >= 0 && v <= max ? v : null);
  const date = d?.date && int(d.date.month, 12) && int(d.date.day, 31)
    ? { month: d.date.month, day: d.date.day, weekday: '일월화수목금토'.includes(d.date.weekday || 'x') && String(d.date.weekday).length === 1 ? d.date.weekday : null }
    : null;
  return {
    is_study_timer: Boolean(d?.is_study_timer),
    app_guess: String(d?.app_guess || '').slice(0, 40),
    date,
    total_seconds: int(d?.total_seconds, 24 * 3600),
    total_text: String(d?.total_text || '').slice(0, 20),
    subjects: (Array.isArray(d?.subjects) ? d.subjects : []).slice(0, 20)
      .map((x) => ({ name: String(x?.name || '').slice(0, 20), seconds: int(x?.seconds, 24 * 3600) || 0 })),
    running: Boolean(d?.running),
    edited_suspicion: String(d?.edited_suspicion || '').slice(0, 120),
    confidence: ['high', 'medium', 'low'].includes(d?.confidence) ? d.confidence : 'low',
  };
}
