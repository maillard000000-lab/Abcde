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
  r.use(express.json({ limit: '32kb' }));
  r.post('/forge', rateLimit, async (req, res) => {
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
  return r;
}
