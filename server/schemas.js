// Claude 구조화 출력(JSON Schema) 정의
// 모든 객체는 additionalProperties:false + 전체 required 로 고정해 응답 형태를 보장한다.

const obj = (properties) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const arr = (items, description) => ({ type: 'array', items, ...(description ? { description } : {}) });
const str = (description) => ({ type: 'string', ...(description ? { description } : {}) });
const int = (description) => ({ type: 'integer', ...(description ? { description } : {}) });
const enm = (values, description) => ({ type: 'string', enum: values, ...(description ? { description } : {}) });

export const LEVEL3 = ['상', '중', '하'];

export const RELATION_TYPES = [
  'cause_effect', // 원인 → 결과
  'claim_evidence', // 주장 → 근거
  'problem_solution', // 문제 → 해결
  'general_example', // 일반 진술 → 구체적 사례
  'old_new', // 기존 관점 → 새로운 관점
  'claim_counter', // 주장 → 반론
  'contrast', // 대조
  'elaboration', // 부연·상술
  'premise_conclusion', // 전제 → 결론
  'restatement', // 재진술·요약
];

export const EXAM_TYPES = [
  '빈칸 추론', '주제', '제목', '요지', '주장', '문장 순서 배열', '문장 삽입', '어법', '어휘',
  '함축적 의미', '내용 일치·불일치', '요약문 완성', '무관한 문장', '서술형', '영작',
];

export const QUESTION_TYPES = [
  '객관식', '빈칸 추론', '어법 선택', '어휘 선택', '순서 배열', '문장 삽입', '서술형', '영작',
];

const sentenceRefs = arr(int(), '관련 문장 번호 목록 (S번호의 숫자)');

export const overviewSchema = obj({
  topic: str('지문의 핵심 주제 (한국어, 한 문장)'),
  title_en: str('적절한 영어 제목'),
  title_ko: str('적절한 한국어 제목'),
  gist: str('글의 요지 (한국어)'),
  claim: str('필자의 핵심 주장 (한국어). 주장이 드러나지 않는 설명문이면 그 사실을 밝힐 것'),
  intent: str('필자의 의도 (한국어)'),
  purpose: str('글의 목적 (예: 정보 전달, 설득, 비판 등)과 근거'),
  keywords: arr(obj({ term: str('영어 키워드'), meaning: str('문맥상 의미(한국어)') })),
  translation: str('지문 전체의 자연스러운 한국어 번역. 문단 구분은 빈 줄로 표시'),
  summary_ko: str('핵심 내용 요약 (한국어, 2~4문장)'),
  summary_en: str('핵심 내용 요약 (영어, 1~3문장)'),
  paragraphs: arr(obj({ label: str('예: 1문단'), sentences: sentenceRefs, point: str('문단 핵심 내용') })),
  development: obj({ method: str('글의 전개 방식 명칭'), explanation: str('지문에서 그렇게 판단한 근거') }),
  logic_flow: arr(obj({ sentences: sentenceRefs, description: str('논리적 흐름/인과관계의 한 단계') })),
  argument: obj({
    claim: str('필자의 주장 (주장이 없으면 중심 진술)'),
    claim_sentences: sentenceRefs,
    evidence: arr(obj({ sentences: sentenceRefs, content: str('근거 내용') })),
  }),
  core_message: str('글의 핵심 메시지 (한 문장)'),
  structure: arr(obj({
    label: str('단계 명칭 (실제 지문에 맞게, 예: 통념 제시, 반박, 사례, 결론)'),
    sentences: sentenceRefs,
    summary: str('이 단계의 내용'),
  })),
  sentence_roles: arr(obj({
    index: int('문장 번호'),
    role: str('글 안에서의 역할을 2~6자로 (예: 주제문, 통념, 근거, 사례, 반론, 결론)'),
    gist: str('문장 내용을 한국어 한 줄(25자 내외)로 요약'),
  }), '모든 문장에 대해 하나씩'),
  key_sentences: arr(obj({
    index: int('문장 번호'),
    role: str('글 전체에서 담당하는 역할'),
    reason: str('중요한 이유'),
  })),
  relations: arr(obj({
    from: int('출발 문장 번호'),
    to: int('도착 문장 번호'),
    type: enm(RELATION_TYPES),
    explanation: str('두 문장의 관계 설명 (지문에 실제로 드러나는 관계만)'),
  })),
  uncertainties: arr(str(), '해석이나 판단이 불확실한 부분. 없으면 빈 배열'),
});

export const detailsSchema = obj({
  grammar_points: arr(obj({
    name: str('문법 명칭 (예: 관계대명사 what, 분사구문, 가주어-진주어)'),
    category: str('상위 분류 (예: 관계사, 분사, 가정법, 도치, 수동태, 병렬구조, 비교, 명사절, 부사절, to부정사, 동명사, 접속사·전치사, 생략·대용, 일치, 기타)'),
    sentence_index: int('문장 번호'),
    excerpt: str('원문에서 해당 부분을 그대로 인용'),
    principle: str('문법적 원리'),
    interpretation: str('해당 부분의 해석과 해석상 유의점'),
    exam_likelihood: enm(LEVEL3, '시험 출제 가능성(예상)'),
    exam_note: str('예상 출제 방식 (어법 변형 포인트 등)'),
  })),
  vocabulary: arr(obj({
    word: str('표제어 (원형)'),
    pos: str('품사 (n., v., adj., adv., phr. 등)'),
    context_meaning: str('지문 문맥상 의미'),
    base_meaning: str('기본 의미'),
    synonyms: arr(str()),
    antonyms: arr(str()),
    derivatives: arr(str(), '파생어와 품사, 예: "evident (adj.)"'),
    confusables: str('혼동하기 쉬운 어휘와 차이. 없으면 빈 문자열'),
    importance: enm(LEVEL3),
    sentence_index: int('처음 등장하는 문장 번호'),
  })),
  exam: obj({
    predicted_types: arr(obj({
      type: enm(EXAM_TYPES),
      importance: enm(LEVEL3),
      reason: str('이 유형으로 출제될 수 있다고 보는 근거'),
      focus: str('출제 시 핵심이 될 부분'),
    })),
    key_sentences: arr(obj({ index: int(), reason: str('핵심 문장 선정 이유'), importance: enm(LEVEL3) })),
    blank_candidates: arr(obj({ sentence_index: int(), expression: str('원문 표현 그대로'), reason: str(), importance: enm(LEVEL3) })),
    grammar_transforms: arr(obj({ sentence_index: int(), excerpt: str('원문 그대로'), point: str('어법 문제로 변형할 수 있는 방식'), importance: enm(LEVEL3) })),
    connectives: arr(obj({ sentence_index: int(), expression: str('원문 연결어'), role: str('논리적 역할'), importance: enm(LEVEL3) })),
    references: arr(obj({ sentence_index: int(), expression: str('지시어/대명사 원문'), refers_to: str('지칭 대상'), importance: enm(LEVEL3) })),
    turning_points: arr(obj({ sentence_index: int(), description: str('논리 전환 내용'), importance: enm(LEVEL3) })),
    distractors: arr(obj({ content: str('오답 선택지로 쓰일 수 있는 혼동 요소'), why_confusing: str(), importance: enm(LEVEL3) })),
  }),
  uncertainties: arr(str()),
});

export const COMPONENT_ROLES = ['S', 'V', 'O', 'IO', 'DO', 'C', 'OC', 'M', 'CONJ'];

export const sentencesSchema = obj({
  sentences: arr(obj({
    index: int('문장 번호'),
    literal: str('직역'),
    natural: str('자연스러운 의역'),
    reading_steps: arr(obj({ chunk: str('원문 의미 단위(원문 그대로)'), meaning: str('해당 덩어리의 해석') }),
      '복잡한 문장일 때 어순에 따른 끊어 읽기. 단순한 문장이면 빈 배열'),
    components: arr(obj({
      text: str('원문에 있는 그대로의 부분 문자열'),
      role: enm(COMPONENT_ROLES, 'S 주어, V 동사, O 목적어, IO 간접목적어, DO 직접목적어, C 주격보어, OC 목적격보어, M 수식어(부사구/부사절 등), CONJ 문장 연결어'),
      note: str('간단한 설명 (예: 동명사구 주어). 필요 없으면 빈 문자열'),
    }), '주절의 문장 성분을 등장 순서대로'),
    clauses: arr(obj({
      text: str('원문 그대로의 절/구'),
      kind: str('종류 (예: 관계대명사절, 명사절, 부사절, 분사구, to부정사구)'),
      modifies: str('수식/연결 대상과 범위'),
    })),
    structure_note: str('문장 성분 간 관계와 주요 구문, 수식 범위 설명'),
    vocabulary: arr(obj({
      expression: str('단어 또는 숙어 (원문 기준)'),
      context_meaning: str('문맥상 의미'),
      synonyms: arr(str()),
      antonyms: arr(str()),
      derivatives: arr(str()),
      note: str('품사 변화, 혼동 어휘, 관용 표현 설명. 없으면 빈 문자열'),
    })),
    meaning: obj({
      purpose: str('필자가 이 문장을 제시한 이유'),
      context_link: str('앞뒤 문장과의 관계'),
      implication: str('문맥상 함축 의미. 특별히 없으면 그렇다고 명시'),
      theme_link: str('글의 주제와 연결되는 부분'),
    }),
    grammar: arr(obj({
      name: str('문법의 정확한 명칭'),
      target: str('해당 문법이 쓰인 원문 부분'),
      application: str('이 문장에서의 적용 방식'),
      principle: str('문법적 원리'),
      interpretation_effect: str('해석에 미치는 영향'),
      exam_variation: str('시험에서 변형될 수 있는 부분'),
    })),
    uncertainty: str('불확실한 해석이 있으면 설명, 없으면 빈 문자열'),
  })),
});

export const questionsSchema = obj({
  questions: arr(obj({
    type: enm(QUESTION_TYPES),
    subtype: str('세부 유형 (예: 주제, 제목, 요지, 내용 일치, 함축 의미). 해당 없으면 빈 문자열'),
    prompt: str('발문 (한국어, 실제 시험 형식)'),
    passage: str('문제에 제시되는 지문/발췌문. 밑줄은 <u>…</u>, 빈칸은 ________, 선택 괄호는 (A) [ x / y ] 형식. 별도 지문이 필요 없으면 빈 문자열'),
    box: str('<보기> 또는 주어진 문장/글. 없으면 빈 문자열'),
    choices: arr(str(), '객관식이면 정확히 5개, 서술형·영작이면 빈 배열'),
    answer_index: int('객관식 정답의 0부터 시작하는 인덱스, 서술형·영작이면 -1'),
    answer_text: str('정답 (객관식은 정답 선택지 내용, 서술형·영작은 모범 답안)'),
    explanation: str('상세 해설: 정답 근거 + 오답 이유'),
    evidence_sentences: sentenceRefs,
    grading: str('서술형·영작 채점 기준과 조건. 객관식이면 빈 문자열'),
    difficulty: enm(LEVEL3),
  })),
});
