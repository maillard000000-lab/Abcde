// STUDYVERSE 콘텐츠 데이터베이스 — 마법, 장비, 의상, 특성, 시설, 지역, 몬스터, 교직원, 퀘스트.
// 모든 항목은 고유 ID를 가진다. 절차 생성 콘텐츠는 gen.js 가 이 데이터를 바탕으로 만든다.

export const SCHOOL_NAME = '헤스페린 학당';

export const RARITY = {
  common: { name: '일반', color: '#b8b8b8', mult: 1, order: 0 },
  fine: { name: '고급', color: '#6fd06f', mult: 1.35, order: 1 },
  rare: { name: '희귀', color: '#5aa7ff', mult: 1.8, order: 2 },
  epic: { name: '영웅', color: '#c27bff', mult: 2.4, order: 3 },
  legend: { name: '전설', color: '#ffc04a', mult: 3.2, order: 4 },
};
export const RARITY_KEYS = Object.keys(RARITY);

export const STATS = {
  int: { name: '지력', desc: '마법 공격력' },
  wil: { name: '의지', desc: '최대 마나 · 방어' },
  foc: { name: '집중', desc: '치명타 · 공부 경험치 보너스' },
  vit: { name: '활력', desc: '최대 체력' },
  ins: { name: '통찰', desc: '전리품 · 발견 확률' },
};

export const RESOURCES = {
  gold: { name: '골드', icon: 'coin' },
  mana: { name: '마나', icon: 'mana' },
  light: { name: '지식의 빛', icon: 'light' },
  wood: { name: '목재', icon: 'wood' },
  stone: { name: '석재', icon: 'stone' },
  crystal: { name: '수정', icon: 'crystal' },
  research: { name: '연구 점수', icon: 'research' },
};

// ───────────────────────── 마법 ─────────────────────────
// kind: dmg 피해 / dot 지속피해 / heal 회복 / shield 보호막 / buff 강화 / drain 흡수 / stun 기절
//       field: 탐험 중 상시 효과(explore 전리품, restore 복원, move 체력 절약)
// fx: 이펙트 형태(pixel 렌더러에서 사용) / col: 이펙트 색
export const SPELLS = [
  { id: 'sp_spark', name: '물음 불씨', rarity: 'common', kind: 'dmg', power: 14, mp: 0, tags: ['light'], fx: 'bolt', col: '#ffe08a',
    lore: '손끝의 불씨를 튕겨 낸다. 모든 점화자가 가장 먼저 익히는 마법. 마나가 들지 않는다.', unlock: { chapter: 0 } },
  { id: 'sp_lampward', name: '등잔의 장막', rarity: 'common', kind: 'shield', power: 26, mp: 8, tags: ['ward'], fx: 'ring', col: '#ffd36b',
    lore: '물음등의 불빛을 둥글게 펼쳐 몸을 감싼다. 아델이 남긴 수호 기법의 기초.', unlock: { chapter: 2 } },
  { id: 'sp_reedsong', name: '갈대의 노래', rarity: 'common', kind: 'heal', power: 24, mp: 9, tags: ['life'], fx: 'leaf', col: '#8fe388',
    lore: '이름을 부르는 갈대의 선율을 흉내 낸다. 듣는 이의 상처가 아문다.', unlock: { level: 3 } },
  { id: 'sp_inkdart', name: '먹물 화살', rarity: 'common', kind: 'dmg', power: 20, mp: 5, tags: ['ink'], fx: 'bolt', col: '#6a7cff',
    lore: '공책의 먹물을 응축해 쏘아 보낸다. 시험 전날 밤의 집중력으로 날카로워진다.', unlock: { level: 2 } },
  { id: 'sp_margin', name: '여백의 사색', rarity: 'common', kind: 'buff', power: 0.25, mp: 6, tags: ['mind'], fx: 'sparkle', col: '#cfe7ff',
    lore: '책의 여백처럼 생각할 틈을 만든다. 다음 공격이 25% 강해진다.', unlock: { level: 4 } },
  { id: 'sp_pathfinder', name: '길잡이 반딧불', rarity: 'fine', kind: 'field', field: 'explore', power: 0.15, mp: 0, tags: ['field'], fx: 'firefly', col: '#d7ff7a',
    lore: '탐험 중 반딧불이 숨은 보물을 가리킨다. (장착 시 전리품 +15%)', unlock: { level: 5 } },
  { id: 'sp_kindle', name: '복원의 점화', rarity: 'fine', kind: 'field', field: 'restore', power: 0.2, mp: 0, tags: ['field'], fx: 'sparkle', col: '#ffcf6b',
    lore: '탐험에서 모은 빛이 땅에 더 깊이 스며든다. (장착 시 복원량 +20%)', unlock: { level: 6 } },
  { id: 'sp_featherstep', name: '깃털 걸음', rarity: 'fine', kind: 'field', field: 'move', power: 2, mp: 0, tags: ['field'], fx: 'wind', col: '#e9f4ff',
    lore: '발소리가 사라질 만큼 가볍게 걷는다. (장착 시 탐험 소모 탐험력 -2)', unlock: { level: 8 } },
  { id: 'sp_chalkstorm', name: '분필 폭풍', rarity: 'fine', kind: 'dmg', power: 34, mp: 12, tags: ['ink', 'wind'], fx: 'burst', col: '#f2f2f2',
    lore: '칠판 가득한 공식이 흩날리며 적을 휘감는다. 먹물 계열 직후 사용하면 위력 +40%.', combo: { after: 'ink', bonus: 0.4 }, unlock: { level: 7 } },
  { id: 'sp_bookmark', name: '책갈피 결계', rarity: 'fine', kind: 'stun', power: 1, mp: 14, tags: ['ward'], fx: 'ring', col: '#ff8f8f',
    lore: '적의 시간에 책갈피를 꽂아 한 턴 멈춰 세운다.', unlock: { level: 9 } },
  { id: 'sp_dewlight', name: '이슬빛 순환', rarity: 'fine', kind: 'dot', power: 9, turns: 3, mp: 10, tags: ['life', 'light'], fx: 'leaf', col: '#9ff7e0',
    lore: '빛방울이 적에게 맺혀 3턴 동안 서서히 녹인다.', unlock: { level: 10 } },
  { id: 'sp_starlens', name: '별읽기 렌즈', rarity: 'rare', kind: 'dmg', power: 52, mp: 18, tags: ['star', 'light'], fx: 'beam', col: '#9fd8ff',
    lore: '가라앉은 천문대의 렌즈로 별빛을 한 점에 모은다. 치명타 확률 +20%.', crit: 0.2, unlock: { chapter: 4 } },
  { id: 'sp_tidequestion', name: '밀물의 물음', rarity: 'rare', kind: 'drain', power: 36, mp: 15, tags: ['water'], fx: 'wave', col: '#5fb7ff',
    lore: '물음이 밀물처럼 밀려와 적의 힘을 빼앗고 내 체력으로 되돌린다.', unlock: { level: 12 } },
  { id: 'sp_unbinding', name: '봉인 풀기', rarity: 'rare', kind: 'buff', power: 0.5, mp: 16, tags: ['mind', 'ward'], fx: 'sparkle', col: '#ffb3e6',
    lore: '렌하르트의 자물쇠 문양을 거꾸로 그린다. 다음 공격 +50%, 이어지는 연계 효과 보장.', unlock: { chapter: 6 } },
  { id: 'sp_glassrain', name: '유리비', rarity: 'rare', kind: 'dmg', power: 64, mp: 22, tags: ['fire', 'glass'], fx: 'rain', col: '#ffd1a1',
    lore: '칼더의 녹은 유리가 비처럼 쏟아진다. 별 계열 직후 +35%.', combo: { after: 'star', bonus: 0.35 }, unlock: { level: 17 } },
  { id: 'sp_echo', name: '메아리 되묻기', rarity: 'epic', kind: 'dmg', power: 40, mp: 20, tags: ['echo'], fx: 'ring', col: '#c9a6ff', repeat: 2,
    lore: '협곡의 메아리처럼 같은 물음을 두 번 던진다. (2회 타격)', unlock: { chapter: 8 } },
  { id: 'sp_archivist', name: '서고지기의 손', rarity: 'epic', kind: 'shield', power: 80, mp: 24, tags: ['ward', 'ink'], fx: 'book', col: '#ffe9b0',
    lore: '수백 권의 책이 날아와 방벽을 이룬다. 동시에 체력 20 회복.', heal: 20, unlock: { level: 20 } },
  { id: 'sp_compass', name: '물음표 나침반', rarity: 'epic', kind: 'field', field: 'explore', power: 0.3, mp: 0, tags: ['field'], fx: 'sparkle', col: '#ffd86b',
    lore: '바늘이 북쪽이 아니라 \'가장 궁금한 곳\'을 가리킨다. (전리품 +30%, 희귀품 확률 상승)', unlock: { level: 22 } },
  { id: 'sp_bloomgate', name: '만개의 문', rarity: 'epic', kind: 'field', field: 'restore', power: 0.45, mp: 0, tags: ['field'], fx: 'leaf', col: '#ffb7d5',
    lore: '빛이 닿은 자리에서 꽃이 문처럼 피어난다. (복원량 +45%)', unlock: { level: 25 } },
  { id: 'sp_dawnspear', name: '새벽창', rarity: 'legend', kind: 'dmg', power: 120, mp: 34, tags: ['light', 'star'], fx: 'beam', col: '#fff3b0', crit: 0.15,
    lore: '저녁별이 새벽별로 바뀌는 순간의 빛을 창으로 벼린다.', unlock: { level: 30 } },
  { id: 'sp_firstquestion', name: '첫 번째 물음', rarity: 'legend', kind: 'heal', power: 140, mp: 30, tags: ['life', 'light'], fx: 'sparkle', col: '#ffffff', cleanse: true,
    lore: '모든 아이가 태어날 때 가지고 오는 물음. 체력을 크게 회복하고 해로운 효과를 지운다.', unlock: { level: 32 } },
  { id: 'sp_constellation', name: '별자리 잇기', rarity: 'legend', kind: 'dot', power: 30, turns: 4, mp: 28, tags: ['star'], fx: 'beam', col: '#b3c8ff',
    lore: '흩어진 지식들을 선으로 이어 적을 별자리 속에 가둔다. 4턴 지속.', unlock: { level: 36 } },
];

// ───────────────────────── 장비 · 도구 ─────────────────────────
export const SLOTS = {
  weapon: '무기', staff: '지팡이', tome: '마도서', ring: '반지', neck: '목걸이', charm: '장신구', tool: '탐험 도구', relic: '특수 유물',
};
// 기본 아이템(고유). gen.js 는 base 템플릿으로 변형 아이템을 생성한다.
export const ITEMS = [
  { id: 'it_twig', slot: 'staff', name: '견습생의 나뭇가지', rarity: 'common', stats: { int: 2 }, look: { kind: 'staff', col: '#8a5a2b', gem: '#ffe08a' }, desc: '입학 선물. 아무 나무에서 꺾었지만 꽤 손에 붙는다.' },
  { id: 'it_reedstaff', slot: 'staff', name: '이름 부르는 갈대 지팡이', rarity: 'fine', stats: { int: 6, ins: 2 }, look: { kind: 'staff', col: '#7fbf5a', gem: '#d7ff7a' }, desc: '속삭이는 숲의 갈대로 엮었다. 가끔 주인의 이름을 부른다.' },
  { id: 'it_astrolabe', slot: 'tool', name: '천문대의 별시계', rarity: 'rare', stats: { ins: 6, foc: 3 }, effect: { loot: 0.1 }, look: { kind: 'orb', col: '#9fd8ff' }, desc: '가라앉은 천문대의 관측 도구. 탐험 전리품 +10%.' },
  { id: 'it_glassquill', slot: 'tome', name: '칼더의 유리 깃펜', rarity: 'epic', stats: { int: 14, foc: 6 }, effect: { xp: 0.05 }, look: { kind: 'book', col: '#ffd1a1' }, desc: '불탄 도시의 유리로 깎은 깃펜. 공부 경험치 +5%.' },
  { id: 'it_firstpage', slot: 'relic', name: '전서의 첫 장', rarity: 'legend', stats: { int: 12, wil: 12, foc: 8, ins: 8 }, effect: { light: 0.15 }, look: { kind: 'page', col: '#fff3b0' }, desc: '종결의 전서에서 떨어져 나온 첫 장. 아무것도 적혀 있지 않다. 지식의 빛 획득 +15%.' },
  { id: 'it_lantern', slot: 'relic', name: '금이 간 물음등', rarity: 'legend', stats: { wil: 5, ins: 5 }, effect: { light: 0.05 }, look: { kind: 'lantern', col: '#ffd36b' }, desc: '도서관 맨 아래 칸에서 발견한 놋쇠 등잔. 네 안의 불씨를 지켜 준다.', bound: true },
  // 상점 · 제작 기본품
  { id: 'it_ashwand', slot: 'staff', name: '물푸레 완드', rarity: 'common', stats: { int: 4 }, look: { kind: 'wand', col: '#c49a6c', gem: '#ffffff' }, desc: '튼튼하고 무난한 수업용 완드.', shop: { gold: 150 } },
  { id: 'it_primer', slot: 'tome', name: '기초 주문 입문서', rarity: 'common', stats: { int: 2, foc: 2 }, look: { kind: 'book', col: '#7a4a8a' }, desc: '모서리마다 선배들의 낙서가 가득하다.', shop: { gold: 120 } },
  { id: 'it_copperring', slot: 'ring', name: '구리 집중 반지', rarity: 'common', stats: { foc: 3 }, look: { kind: 'ring', col: '#d08a4a' }, desc: '손가락이 따뜻해지면 집중력이 돌아온다고들 한다.', shop: { gold: 140 } },
  { id: 'it_reedcharm', slot: 'charm', name: '갈대 매듭 부적', rarity: 'common', stats: { vit: 4 }, look: { kind: 'charm', col: '#8fe388' }, desc: '숲 아이들이 엮어 주는 행운의 매듭.', shop: { gold: 100 } },
  { id: 'it_ropekit', slot: 'tool', name: '탐험가의 밧줄 세트', rarity: 'common', stats: { vit: 2, ins: 2 }, effect: { stamina: 1 }, look: { kind: 'tool', col: '#c9a35a' }, desc: '엘다 교수 추천품. 탐험 소모 탐험력 -1.', shop: { gold: 200 } },
  { id: 'it_owlpendant', slot: 'neck', name: '부엉이 눈 목걸이', rarity: 'fine', stats: { ins: 4, foc: 2 }, look: { kind: 'neck', col: '#e8c46a' }, desc: '밤에 공부할 때 은은하게 빛난다.', shop: { gold: 380 } },
  { id: 'it_shortsword', slot: 'weapon', name: '학당 의장검', rarity: 'common', stats: { int: 2, vit: 3 }, look: { kind: 'sword', col: '#cfd8e0' }, desc: '행사용이지만 날은 서 있다.', shop: { gold: 160 } },
  { id: 'it_lampblade', slot: 'weapon', name: '등지기의 등불칼', rarity: 'rare', stats: { int: 6, wil: 4, vit: 4 }, look: { kind: 'sword', col: '#ffd36b' }, desc: '칼날 대신 빛이 길게 뻗는다. 등지기들이 어둠 속에서 길을 낼 때 썼다.', craft: { light: 120, crystal: 6, gold: 600 } },
  { id: 'it_mirucompass', slot: 'tool', name: '미루표 자동 나침반 7호', rarity: 'rare', stats: { ins: 7 }, effect: { loot: 0.08, stamina: 1 }, look: { kind: 'tool', col: '#ff9a5a' }, desc: '1~6호에 대해서는 묻지 말 것. 전리품 +8%, 탐험력 -1.', quest: true },
];

// 절차 생성용 템플릿 (gen.js)
export const FORGE = {
  bases: [
    { slot: 'staff', kind: 'staff', nouns: ['지팡이', '봉', '홀'], stat: ['int', 'int', 'wil'] },
    { slot: 'staff', kind: 'wand', nouns: ['완드', '지휘봉'], stat: ['int', 'foc'] },
    { slot: 'weapon', kind: 'sword', nouns: ['검', '단검', '칼'], stat: ['int', 'vit'] },
    { slot: 'tome', kind: 'book', nouns: ['마도서', '공책', '사본', '일지'], stat: ['int', 'foc'] },
    { slot: 'ring', kind: 'ring', nouns: ['반지', '고리'], stat: ['foc', 'wil'] },
    { slot: 'neck', kind: 'neck', nouns: ['목걸이', '펜던트', '로켓'], stat: ['wil', 'ins'] },
    { slot: 'charm', kind: 'charm', nouns: ['부적', '매듭', '배지'], stat: ['vit', 'ins'] },
    { slot: 'tool', kind: 'tool', nouns: ['나침반', '돋보기', '측량기', '랜턴'], stat: ['ins', 'vit'] },
  ],
  materials: [
    { word: '갈대', col: '#7fbf5a', region: 'forest' }, { word: '이끼석', col: '#6f9a6a', region: 'forest' },
    { word: '잿빛', col: '#9a9a9a', region: 'greywick' }, { word: '우물돌', col: '#7c8a99', region: 'greywick' },
    { word: '별유리', col: '#9fd8ff', region: 'observatory' }, { word: '호수은', col: '#bcd7e8', region: 'observatory' },
    { word: '녹은 유리', col: '#ffd1a1', region: 'desert' }, { word: '그을린 놋쇠', col: '#c48a4a', region: 'desert' },
    { word: '메아리 수정', col: '#c9a6ff', region: 'canyon' }, { word: '협곡 흑요석', col: '#4a3a5a', region: 'canyon' },
    { word: '서가목', col: '#a07850', region: 'aurel' }, { word: '왕궁 금박', col: '#ffd86b', region: 'aurel' },
  ],
  prefixes: [
    { word: '날카로운', stat: 'int', w: 1.2 }, { word: '고요한', stat: 'wil', w: 1.2 }, { word: '또렷한', stat: 'foc', w: 1.2 },
    { word: '튼튼한', stat: 'vit', w: 1.3 }, { word: '꿰뚫어 보는', stat: 'ins', w: 1.2 }, { word: '밤샘의', stat: 'foc', w: 1.5 },
    { word: '호기심 많은', stat: 'ins', w: 1.5 }, { word: '되묻는', stat: 'int', w: 1.5 },
  ],
  suffixes: [
    { word: '탐험가', effect: { loot: 0.04 }, text: '전리품 +4%' },
    { word: '복원자', effect: { restore: 0.06 }, text: '복원량 +6%' },
    { word: '수험생', effect: { xp: 0.03 }, text: '공부 경험치 +3%' },
    { word: '등지기', effect: { light: 0.04 }, text: '지식의 빛 +4%' },
    { word: '방랑자', effect: { stamina: 1 }, text: '탐험력 소모 -1' },
    { word: '연구자', effect: { research: 0.08 }, text: '연구 점수 +8%' },
    { word: '수호자', effect: { hp: 0.06 }, text: '최대 체력 +6%' },
    { word: '별지기', effect: { crit: 0.04 }, text: '치명타 +4%' },
  ],
};

// ───────────────────────── 의상 ─────────────────────────
// 캐릭터 스프라이트에 그대로 반영되는 색상/형태 정보
export const OUTFITS = [
  { id: 'of_uniform', name: '헤스페린 교복', cat: '학교 교복', rarity: 'common', pal: { robe: '#2b3a67', trim: '#e8c46a', under: '#e9e4d8', leg: '#22263a' }, hat: null, cape: false, unlock: { type: 'default' }, desc: '남색 로브에 금색 저녁별 자수. 모든 신입생의 시작.' },
  { id: 'of_uniform_summer', name: '하복 교복', cat: '학교 교복', rarity: 'common', pal: { robe: '#e9e4d8', trim: '#2b3a67', under: '#ffffff', leg: '#2b3a67' }, hat: null, cape: false, unlock: { type: 'default' }, desc: '소매가 짧은 여름용 교복. 등이 덜 덥다.' },
  { id: 'of_explorer', name: '탐험복', cat: '탐험복', rarity: 'fine', pal: { robe: '#7a5a3a', trim: '#c9a35a', under: '#d8cbb0', leg: '#4a3a2a' }, hat: 'cap', cape: false, unlock: { type: 'level', n: 5 }, desc: '엘다 교수 디자인. 주머니가 열두 개.' },
  { id: 'of_mage', name: '정식 마법사 로브', cat: '마법사 의상', rarity: 'fine', pal: { robe: '#4a2a6a', trim: '#c27bff', under: '#2a1a3a', leg: '#2a1a3a' }, hat: 'witch', cape: true, unlock: { type: 'level', n: 10 }, desc: '고깔모자와 별 자수 망토. 이제 진짜 마법사처럼 보인다.' },
  { id: 'of_lamplighter', name: '등지기의 외투', cat: '희귀 의상', rarity: 'rare', pal: { robe: '#3a3a2a', trim: '#ffd36b', under: '#6a5a3a', leg: '#2a2a1a' }, hat: 'hood', cape: true, unlock: { type: 'chapter', n: 3 }, desc: '어머니의 배지와 같은 등잔 문양. 정적의 땅을 걷는 사람들의 옷.' },
  { id: 'of_warden', name: '문지기의 제복', cat: '희귀 의상', rarity: 'rare', pal: { robe: '#5a5f6a', trim: '#d8dde5', under: '#2a2e36', leg: '#2a2e36' }, hat: null, cape: true, unlock: { type: 'chapter', n: 6 }, desc: '렌하르트 가문의 옛 제복을 고쳐 만들었다. 자물쇠 문양은 뜯어냈다.' },
  { id: 'of_echo', name: '메아리 망토', cat: '희귀 의상', rarity: 'epic', pal: { robe: '#3a2a5a', trim: '#c9a6ff', under: '#e0d0ff', leg: '#2a1a4a' }, hat: 'hood', cape: true, unlock: { type: 'chapter', n: 8 }, desc: '협곡의 수정실로 짰다. 움직이면 옷자락이 한 박자 늦게 따라온다.' },
  { id: 'of_spring', name: '봄 소풍 의상', cat: '계절 의상', rarity: 'fine', pal: { robe: '#ffb7d5', trim: '#ffffff', under: '#fff0f6', leg: '#8a6a7a' }, hat: 'flower', cape: false, unlock: { type: 'season', months: [3, 4, 5] }, desc: '봄(3~5월)에만 받을 수 있다. 머리에 꽃이 핀다.' },
  { id: 'of_summer', name: '호숫가 여름옷', cat: '계절 의상', rarity: 'fine', pal: { robe: '#5fb7ff', trim: '#ffffff', under: '#e8f6ff', leg: '#2a5a8a' }, hat: 'straw', cape: false, unlock: { type: 'season', months: [6, 7, 8] }, desc: '여름(6~8월) 한정. 밀짚모자 포함.' },
  { id: 'of_autumn', name: '낙엽 사서복', cat: '계절 의상', rarity: 'fine', pal: { robe: '#b0602a', trim: '#ffd06b', under: '#f0d8b0', leg: '#5a3a1a' }, hat: 'beret', cape: false, unlock: { type: 'season', months: [9, 10, 11] }, desc: '가을(9~11월) 한정. 책 냄새가 나는 베레모.' },
  { id: 'of_winter', name: '눈송이 털코트', cat: '계절 의상', rarity: 'fine', pal: { robe: '#e8f0ff', trim: '#8fb8ff', under: '#ffffff', leg: '#5a6a8a' }, hat: 'beanie', cape: false, unlock: { type: 'season', months: [12, 1, 2] }, desc: '겨울(12~2월) 한정. 입김까지 반짝인다.' },
  { id: 'of_festival', name: '빛의 축제 예복', cat: '축제 의상', rarity: 'rare', pal: { robe: '#c0283a', trim: '#ffd86b', under: '#fff0d0', leg: '#5a1a2a' }, hat: 'crown', cape: true, unlock: { type: 'facility', fac: 'hall', lv: 3 }, desc: '대강당 3단계에서 열리는 \'빛의 축제\' 기념 예복.' },
  { id: 'of_scholar', name: '수석의 가운', cat: '특별 이벤트 의상', rarity: 'rare', pal: { robe: '#1a1a1a', trim: '#ffffff', under: '#e0e0e0', leg: '#1a1a1a' }, hat: 'mortar', cape: false, unlock: { type: 'minutes', n: 3000 }, desc: '누적 50시간 공부 달성 기념. 학사모의 술이 자랑스럽게 흔들린다.' },
  { id: 'of_nightowl', name: '밤샘 부엉이 잠옷', cat: '특별 이벤트 의상', rarity: 'fine', pal: { robe: '#3a3a6a', trim: '#ffe08a', under: '#5a5a8a', leg: '#3a3a6a' }, hat: 'owl', cape: false, unlock: { type: 'trait', id: 'tr_nightowl' }, desc: '특성 \'밤의 학자\' 획득 시 해금. 귀가 달린 모자.' },
  { id: 'of_dawn', name: '새벽을 연 자의 예복', cat: '전설 의상', rarity: 'legend', pal: { robe: '#fff3d0', trim: '#ffb84a', under: '#ffffff', leg: '#c08a4a' }, hat: 'halo', cape: true, unlock: { type: 'chapter', n: 10 }, desc: '최종장 완료의 증표. 옷자락 끝에 새벽빛이 맺힌다.' },
  { id: 'of_morningstar', name: '새벽별 학당 교복', cat: '전설 의상', rarity: 'legend', pal: { robe: '#2a4a8a', trim: '#fff3b0', under: '#ffffff', leg: '#1a2a5a' }, hat: null, cape: true, unlock: { type: 'chapter', n: 11 }, desc: '새로운 이름의 첫 교복. 가슴의 별 자수가 아침을 향해 있다.' },
];

// ───────────────────────── 특성 ─────────────────────────
export const TRAITS = [
  { id: 'tr_firstflame', name: '첫 불씨', desc: '공부 경험치 +5%', effect: { xp: 0.05 }, unlock: { type: 'minutes', n: 30 }, how: '누적 공부 30분' },
  { id: 'tr_explorer', name: '탐험가', desc: '탐험 전리품 +12%', effect: { loot: 0.12 }, unlock: { type: 'expeditions', n: 10 }, how: '탐험 10회' },
  { id: 'tr_researcher', name: '연구자', desc: '연구 점수 획득 +20%', effect: { research: 0.2 }, unlock: { type: 'facility', fac: 'lab', lv: 2 }, how: '연구실 2단계' },
  { id: 'tr_collector', name: '수집가', desc: '희귀 아이템 발견 확률 상승, 전리품 +6%', effect: { rare: 0.5, loot: 0.06 }, unlock: { type: 'items', n: 15 }, how: '아이템 15개 보유' },
  { id: 'tr_focus', name: '몰입', desc: '45분 이상 이어서 공부한 세션 경험치 +15%', effect: { deep: 0.15 }, unlock: { type: 'longsession', n: 45 }, how: '한 세션 45분 이상 공부' },
  { id: 'tr_pioneer', name: '개척자', desc: '복원량 +15%, 보스전 첫 턴 보호막', effect: { restore: 0.15, bossShield: 30 }, unlock: { type: 'restoreTotal', n: 150 }, how: '모든 지역 복원도 합계 150%' },
  { id: 'tr_nightowl', name: '밤의 학자', desc: '밤(21시~5시) 공부 경험치 +10%', effect: { night: 0.1 }, unlock: { type: 'night', n: 5 }, how: '밤에 5회 공부 세션 완료' },
  { id: 'tr_earlybird', name: '새벽 종달새', desc: '아침(5시~9시) 공부 시 빛 +20%', effect: { morning: 0.2 }, unlock: { type: 'morning', n: 5 }, how: '아침에 5회 공부 세션 완료' },
  { id: 'tr_steady', name: '꾸준함', desc: '연속 공부일 1일당 경험치 +1% (최대 +14%)', effect: { streak: 0.01 }, unlock: { type: 'streak', n: 3 }, how: '3일 연속 공부' },
  { id: 'tr_mentor', name: '선배의 품격', desc: '학생 만족도 +8, 학비 수입 +10%', effect: { satisfaction: 8, tuition: 0.1 }, unlock: { type: 'students', n: 6 }, how: '재학생 6명' },
  { id: 'tr_architect', name: '건축가', desc: '시설 건설 비용 -10%', effect: { buildCost: 0.1 }, unlock: { type: 'buildTotal', n: 12 }, how: '시설 레벨 합계 12' },
  { id: 'tr_spellweaver', name: '주문 직조사', desc: '연계 보너스 +25%', effect: { combo: 0.25 }, unlock: { type: 'spells', n: 8 }, how: '마법 8개 습득' },
  { id: 'tr_slayer', name: '정적을 걷는 자', desc: '전투 피해 +10%', effect: { dmg: 0.1 }, unlock: { type: 'bosses', n: 2 }, how: '수호자 2체 정화' },
  { id: 'tr_lampkin', name: '등지기의 핏줄', desc: '지식의 빛 획득 +10%', effect: { light: 0.1 }, unlock: { type: 'chapter', n: 3 }, how: '제3장 완료' },
  { id: 'tr_unbound', name: '풀린 자물쇠', desc: '최대 마나 +20%', effect: { mp: 0.2 }, unlock: { type: 'chapter', n: 5 }, how: '제5장 완료' },
  { id: 'tr_ashreader', name: '재를 읽는 자', desc: '치명타 확률 +8%', effect: { crit: 0.08 }, unlock: { type: 'chapter', n: 7 }, how: '제7장 완료' },
  { id: 'tr_question', name: '세 번째 길', desc: '모든 보너스 효과 +5%', effect: { all: 0.05 }, unlock: { type: 'chapter', n: 9 }, how: '제9장 완료' },
  { id: 'tr_marathon', name: '완주자', desc: '일일 목표 달성 보상 2배', effect: { goal: 1 }, unlock: { type: 'goals', n: 7 }, how: '일일 목표 7회 달성' },
  { id: 'tr_morningstar', name: '새벽별', desc: '공부 경험치 +10%, 지식의 빛 +10%', effect: { xp: 0.1, light: 0.1 }, unlock: { type: 'chapter', n: 11 }, how: '에필로그 도달' },
];

// ───────────────────────── 학교 시설 ─────────────────────────
// x,y: 학교 맵의 타일 위치(좌상단), w,h: 크기(타일). style: 렌더링 형태
export const FACILITIES = [
  { id: 'classroom', name: '교실', desc: '배움의 기본. 교육 수준과 공부 경험치를 높인다.', eff: '레벨당 공부 경험치 +3%, 교육 수준 +6', style: 'hall', roof: '#8a3a3a', x: 16, y: 6, w: 7, h: 5, start: 1 },
  { id: 'library', name: '도서관', desc: '지식의 빛이 가장 오래 머무는 곳. 빛과 연구를 늘린다.', eff: '레벨당 지식의 빛 +4%, 연구 +1/시간', style: 'library', roof: '#3a4a8a', x: 25, y: 5, w: 7, h: 6, start: 1 },
  { id: 'dorm', name: '기숙사', desc: '학생들이 머무는 곳. 수용 인원을 늘린다.', eff: '레벨당 학생 정원 +4', style: 'house', roof: '#5a7a3a', x: 6, y: 6, w: 6, h: 5, start: 1 },
  { id: 'lab', name: '연구실', desc: '연구 점수를 생산한다. 마법 강화와 공방 제작에 필요.', eff: '레벨당 연구 +2/시간, 마법 강화 비용 -4%', style: 'tower', roof: '#3a7a7a', x: 34, y: 6, w: 4, h: 5 },
  { id: 'training', name: '훈련장', desc: '전투 감각을 기른다.', eff: '레벨당 전투 체력 +6%, 피해 +3%', style: 'yard', roof: '#8a6a3a', x: 5, y: 15, w: 6, h: 5 },
  { id: 'garden', name: '정원', desc: '학생들의 쉼터. 만족도와 목재를 제공한다.', eff: '레벨당 만족도 +6, 목재 +1/시간', style: 'garden', roof: '#4a9a4a', x: 13, y: 21, w: 6, h: 4 },
  { id: 'dining', name: '식당', desc: '든든해야 공부도 된다.', eff: '레벨당 만족도 +5, 탐험력 회복 +5%', style: 'house', roof: '#b06a2a', x: 21, y: 21, w: 6, h: 4 },
  { id: 'hall', name: '대강당', desc: '행사와 축제가 열린다. 명성을 높인다.', eff: '레벨당 명성 +2/시간, 3단계에서 \'빛의 축제\'', style: 'hall', roof: '#6a3a8a', x: 28, y: 15, w: 8, h: 5 },
  { id: 'archive', name: '마법 유물 보관소', desc: '유물을 모아 보관한다. 희귀품 발견 확률을 높인다.', eff: '레벨당 희귀품 확률 +5%, 석재 +1/시간', style: 'vault', roof: '#5a5a6a', x: 37, y: 15, w: 4, h: 4 },
  { id: 'lampworks', name: '등불 공방', desc: '장비와 도구를 제작하고 강화한다.', eff: '레벨당 제작 가능 등급 상승', style: 'workshop', roof: '#a04a2a', x: 12, y: 15, w: 5, h: 4 },
  { id: 'startower', name: '별읽기 탑', desc: '먼 지역을 관측해 탐험을 돕는다.', eff: '레벨당 탐험 소모 탐험력 -1(최대 -3), 수정 +0.5/시간', style: 'tower', roof: '#2a3a7a', x: 37, y: 22, w: 3, h: 4 },
  { id: 'greenhouse', name: '별빛 온실', desc: '빛을 먹고 자라는 식물이 마나를 만든다.', eff: '레벨당 마나 +3/시간', style: 'glass', roof: '#9fd8ff', x: 5, y: 22, w: 6, h: 4 },
];
export const FAC_MAX = 5;
export function facilityCost(fid, lv) { // lv: 목표 레벨
  const base = { classroom: 1, library: 1.1, dorm: 0.9, lab: 1.2, training: 1, garden: 0.8, dining: 0.85, hall: 1.4, archive: 1.3, lampworks: 1.1, startower: 1.3, greenhouse: 1 }[fid] || 1;
  const m = base * Math.pow(lv, 1.7);
  return {
    gold: Math.round(180 * m / 10) * 10,
    wood: Math.round(8 * m),
    stone: Math.round(6 * m),
    crystal: lv >= 3 ? Math.round(2 * m / 2) : 0,
    light: Math.round(10 * m),
  };
}
export const SCHOOL_STAGES = [
  { n: 1, name: '기울어진 학당', need: 0, desc: '금 간 벽, 꺼진 등불. 그래도 아직 문은 열려 있다.' },
  { n: 2, name: '다시 불 밝힌 학당', need: 12, desc: '창마다 불이 켜졌다. 학생들이 돌아오기 시작했다.' },
  { n: 3, name: '빛의 학당', need: 24, desc: '정원이 피고, 탑이 섰다. 다른 지방에서도 입학 문의가 온다.' },
  { n: 4, name: '별의 학원', need: 38, desc: '밤에도 학당이 별처럼 빛난다. 세상이 이곳을 바라본다.' },
  { n: 5, name: '새벽별 학당', need: 50, desc: '세계 최고의 지식의 중심지. 빛을 건네는 곳.', ending: true },
];

// ───────────────────────── 지역 ─────────────────────────
export const REGIONS = [
  { id: 'school', name: SCHOOL_NAME, map: { x: 50, y: 52 }, home: true, desc: '마지막 빛이 남은 배움의 집.' },
  { id: 'forest', name: '속삭이는 숲', map: { x: 30, y: 46 }, lvl: 1, cost: 10, bg: 'forest', mats: ['wood', 'wood', 'stone'],
    dark: ['#2c3133', '#3d4443', '#545b57'], bright: ['#2f6b3a', '#4f9a4a', '#9ad86a'], sky: ['#3a3f45', '#8fd0ff'],
    desc: '지나가는 이의 이름을 불러 주던 갈대숲. 지금은 숨소리조차 들리지 않는다.',
    mobs: ['m_reed', 'm_moss', 'm_wisp'], boss: 'b_reedking' },
  { id: 'greywick', name: '회색골', map: { x: 18, y: 66 }, lvl: 5, cost: 12, bg: 'village', mats: ['stone', 'wood', 'stone'],
    dark: ['#2a2a2e', '#3a3a40', '#55555c'], bright: ['#7a5a3a', '#c9a35a', '#ffe0a0'], sky: ['#35353a', '#ffc98a'],
    desc: '네가 자란 마을. 아무도 묻지 않아서, 아무것도 변하지 않는 곳.',
    mobs: ['m_dust', 'm_well', 'm_clock'], boss: 'b_well' },
  { id: 'observatory', name: '가라앉은 천문대', map: { x: 56, y: 22 }, lvl: 9, cost: 14, bg: 'lake', mats: ['crystal', 'stone', 'stone'],
    dark: ['#1d2633', '#2a3647', '#3d4c60'], bright: ['#1a4a8a', '#3a8ad0', '#9fd8ff'], sky: ['#1a2230', '#2a3a7a'],
    desc: '호수 밑에 잠긴 옛 아우렐의 천문대. 별을 보는 대신 별을 적던 곳.',
    mobs: ['m_star', 'm_lens', 'm_tide'], boss: 'b_starscribe' },
  { id: 'desert', name: '유리 사막', map: { x: 80, y: 40 }, lvl: 17, cost: 16, bg: 'desert', mats: ['crystal', 'stone', 'crystal'],
    dark: ['#3a332c', '#4d453b', '#6a5f52'], bright: ['#d0903a', '#f0c070', '#fff0c0'], sky: ['#3d3833', '#ffb070'],
    desc: '모래가 유리가 될 만큼 큰 불이 났던 땅. 중심에 옛 도시 칼더가 있다.',
    mobs: ['m_glass', 'm_ash', 'm_page'], boss: 'b_burnshelf' },
  { id: 'canyon', name: '메아리 협곡', map: { x: 74, y: 70 }, lvl: 20, cost: 18, bg: 'canyon', mats: ['crystal', 'stone', 'crystal'],
    dark: ['#2a2433', '#3a3247', '#524864'], bright: ['#6a3a8a', '#a06ad0', '#e0c0ff'], sky: ['#26222e', '#c08ae0'],
    desc: '침묵자들의 목소리가 새어 나오는 깊은 협곡. 모든 메아리가 질문이다.',
    mobs: ['m_echo', 'm_shard', 'm_unfinished'], boss: 'b_thousand' },
  { id: 'aurel', name: '잊힌 수도 아우렐', map: { x: 50, y: 84 }, lvl: 23, cost: 20, bg: 'city', mats: ['crystal', 'stone', 'wood'],
    dark: ['#232323', '#333333', '#4a4a4a'], bright: ['#8a6a2a', '#d0b060', '#fff0b0'], sky: ['#202020', '#ffe0a0'],
    desc: '천 년 전 지식의 왕국의 수도. 이곳에서 앎은 \'완성\'되었다.',
    mobs: ['m_citizen', 'm_index', 'm_seal'], boss: 'b_king' },
  { id: 'vault', name: '제0서고', map: { x: 50, y: 60 }, hidden: true, lvl: 28, cost: 0, bg: 'vault', mats: [],
    dark: ['#140f1a', '#221a2a', '#33283d'], bright: ['#5a4a2a', '#c0a050', '#fff3b0'], sky: ['#0f0a14', '#fff3b0'],
    desc: '학당 지하 가장 깊은 곳. 종결의 전서가 잠든 서고.', mobs: [], boss: 'b_codex' },
];

// 몬스터: 굳은 물음 — 답을 잃고 굳어 버린 물음의 잔해. 정화하면 원래의 질문을 남긴다.
// shape: 렌더링 형태, c: 색상
export const MONSTERS = {
  m_reed: { name: '말 잃은 갈대', hp: 40, atk: 7, def: 1, shape: 'reed', c: ['#5a6a55', '#8a9a7a'], q: '이 갈대는 왜 노래했을까?' },
  m_moss: { name: '이끼 덮인 물음표', hp: 55, atk: 6, def: 3, shape: 'blob', c: ['#4a5a4a', '#7a9a6a'], q: '이끼는 어느 쪽으로 자랄까?' },
  m_wisp: { name: '꺼진 반딧불', hp: 32, atk: 10, def: 0, shape: 'wisp', c: ['#6a6a5a', '#c0c08a'], q: '빛은 어디로 사라질까?' },
  m_dust: { name: '먼지 쌓인 인사', hp: 70, atk: 11, def: 3, shape: 'blob', c: ['#5a5a5a', '#8a8a8a'], q: '오늘은 무슨 요일이지?' },
  m_well: { name: '고인 물그림자', hp: 60, atk: 13, def: 2, shape: 'wisp', c: ['#3a4a5a', '#7a9aba'], q: '우물 밑에는 뭐가 있을까?' },
  m_clock: { name: '멈춘 시계추', hp: 85, atk: 10, def: 5, shape: 'clock', c: ['#6a5a3a', '#b09a6a'], q: '시간은 왜 앞으로만 갈까?' },
  m_star: { name: '적히기만 한 별', hp: 95, atk: 16, def: 4, shape: 'star', c: ['#4a5a7a', '#a0b8e0'], q: '저 별의 이름은 누가 지었을까?' },
  m_lens: { name: '흐린 렌즈', hp: 110, atk: 14, def: 7, shape: 'eye', c: ['#3a4a5a', '#8ab0d0'], q: '보이지 않는 것은 없는 걸까?' },
  m_tide: { name: '썰물의 잔상', hp: 90, atk: 19, def: 3, shape: 'wave', c: ['#2a4a6a', '#5f9fd0'], q: '달은 왜 바다를 당길까?' },
  m_glass: { name: '굳은 유리 그림자', hp: 150, atk: 22, def: 8, shape: 'shard', c: ['#8a6a4a', '#ffd1a1'], q: '그날, 무엇을 안고 달렸을까?' },
  m_ash: { name: '잿더미 서표', hp: 130, atk: 26, def: 5, shape: 'wisp', c: ['#4a4040', '#a08070'], q: '타 버린 책의 마지막 문장은?' },
  m_page: { name: '흩날리는 낱장', hp: 120, atk: 24, def: 6, shape: 'page', c: ['#8a7a6a', '#f0e0c0'], q: '이 이야기는 어떻게 끝날까?' },
  m_echo: { name: '되울리는 물음', hp: 170, atk: 27, def: 8, shape: 'ring', c: ['#4a3a6a', '#c9a6ff'], q: '내 목소리는 어디까지 갈까?' },
  m_shard: { name: '메아리 수정체', hp: 200, atk: 25, def: 12, shape: 'shard', c: ['#5a4a7a', '#e0c0ff'], q: '돌도 기억을 할까?' },
  m_unfinished: { name: '미완성 문장', hp: 160, atk: 31, def: 6, shape: 'page', c: ['#3a2a4a', '#b08ad0'], q: '그래서, 그다음은…?' },
  m_citizen: { name: '평온한 시민', hp: 230, atk: 30, def: 12, shape: 'statue', c: ['#5a5a5a', '#c0c0c0'], q: '나는 왜 웃고 있지?' },
  m_index: { name: '색인 조각', hp: 210, atk: 35, def: 10, shape: 'book', c: ['#4a3a2a', '#d0b060'], q: '분류되지 않는 것은 없을까?' },
  m_seal: { name: '봉인 문양', hp: 260, atk: 32, def: 15, shape: 'ring', c: ['#5a2a2a', '#ff8a6a'], q: '이 문은 왜 닫혀 있지?' },
};
export const BOSSES = {
  b_reedking: { name: '이름 없는 갈대왕', region: 'forest', hp: 260, atk: 14, def: 4, shape: 'reed', big: true, c: ['#4a5a45', '#b0d080'], q: '나를 부르던 마지막 이름은 누구의 것이었을까?', minRestore: 50 },
  b_well: { name: '고인 우물의 메아리', region: 'greywick', hp: 420, atk: 20, def: 6, shape: 'wisp', big: true, c: ['#2a3a4a', '#9ab0d0'], q: '우리는 왜 아무것도 묻지 않았을까?', minRestore: 50 },
  b_starscribe: { name: '별을 적는 자', region: 'observatory', hp: 640, atk: 26, def: 9, shape: 'eye', big: true, c: ['#2a3a6a', '#c0d8ff'], q: '모든 별을 적으면, 하늘은 끝나는 걸까?', minRestore: 60 },
  b_burnshelf: { name: '불길을 기억하는 서가', region: 'desert', hp: 900, atk: 34, def: 12, shape: 'book', big: true, c: ['#6a3a2a', '#ffb070'], q: '잃은 것을 되찾는 방법은 지키는 것뿐일까?', minRestore: 60 },
  b_thousand: { name: '천 개의 미완성 문장', region: 'canyon', hp: 1150, atk: 40, def: 14, shape: 'page', big: true, c: ['#3a2a5a', '#e0c0ff'], q: '대답하지 않아도 괜찮은 질문도 있을까?', minRestore: 60 },
  b_king: { name: '완성된 왕', region: 'aurel', hp: 1500, atk: 46, def: 18, shape: 'statue', big: true, c: ['#6a5a2a', '#ffe08a'], q: '완성된 것은, 정말 끝난 것일까?', minRestore: 70 },
  b_codex: { name: '종결의 전서', region: 'vault', hp: 2200, atk: 52, def: 20, shape: 'codex', big: true, c: ['#3a2a1a', '#fff3b0'], q: '그다음 이야기는 무엇일까?', minRestore: 0, final: true },
};

// ───────────────────────── 인물 ─────────────────────────
// look: 픽셀 초상/스프라이트 정보
export const NPCS = {
  toren: { name: '사서 토렌', role: '도서관 사서', look: { hair: '#e0e0e0', skin: '#e0b090', robe: '#4a3a2a', trim: '#c9a35a', hat: null, eyes: 'closed', beard: true },
    personality: '느긋하고 귀가 밝다. 말수가 적지만 한 마디가 무겁다.', bg: '앞을 보지 못하는 늙은 사서. 학당에서 가장 오래 일했다.', ability: '소리로 책의 위치를 찾는다', place: 'library', from: 0 },
  miru: { name: '미루 페넬', role: '동기 · 발명가 지망생', look: { hair: '#ff8a4a', skin: '#ffd0a8', robe: '#2b3a67', trim: '#e8c46a', hat: 'goggles' },
    personality: '밝고 시끄럽다. 무엇이든 분해해 보고 싶어 한다.', bg: '상인 가문 출신. 공구 상자 세 개를 들고 입학했다.', ability: '기계 장치와 도구 제작', place: 'lampworks', from: 0 },
  kai: { name: '카이 렌하르트', role: '동기 · 렌하르트가의 후계자', look: { hair: '#d8dde5', skin: '#f0d0b8', robe: '#2b3a67', trim: '#d8dde5', hat: null, ring: true },
    personality: '냉정하고 자존심이 세다. 그러나 틀린 것을 틀렸다고 인정할 줄 안다.', bg: '학당을 세운 렌하르트 가문의 후계자.', ability: '봉인술', place: 'training', from: 0 },
  elda: { name: '엘다 브라이어 교수', role: '탐험학 교수', look: { hair: '#7a3a2a', skin: '#d8a078', robe: '#5a4a3a', trim: '#c9a35a', hat: 'cap', arm: true },
    personality: '퉁명스럽지만 학생을 절대 버리지 않는다. 입버릇은 \'가서 알아 와\'.', bg: '전직 탐험가. 정적에 오른팔을 잃고 의수를 달았다.', ability: '야외 생존, 정적 탐지', place: 'startower', from: 0 },
  oswin: { name: '오스윈 원장', role: '학당 원장', look: { hair: '#c0c0c0', skin: '#e8c0a0', robe: '#5a2a3a', trim: '#e8c46a', hat: 'mortar', beard: true },
    personality: '온화하고 정중하다. 언제나 차를 권한다.', bg: '40년째 학당을 이끈 원장. 무언가를 오래 감춰 온 눈빛.', ability: '학당 결계 유지', place: 'hall', from: 0 },
  evelyn: { name: '에블린', role: '회색 학생', look: { hair: '#b8b8b8', skin: '#d8d8d8', robe: '#7a7a7a', trim: '#a0a0a0', hat: null, grey: true },
    personality: '조용하고 조심스럽다. 따뜻한 것을 좋아한다.', bg: '???', ability: '???', place: 'library', from: 2 },
};
export const PORTRAIT_EXTRA = {
  lantern: { lantern: true },
  index: { look: { hair: '#2a2a2a', skin: '#3a3a3a', robe: '#1a1a1a', trim: '#d0b060', hat: 'hood', eyes: 'glow' } },
  hesper: { look: { hair: '#f0f0f0', skin: '#e0c8a8', robe: '#3a2a1a', trim: '#fff3b0', hat: null, beard: true, eyes: 'glow' } },
  mother: { look: { hair: '#4a2a1a', skin: '#f0c8a0', robe: '#3a3a2a', trim: '#ffd36b', hat: 'hood' } },
  grey: { look: NPCS.evelyn.look },
  adel: { page: true },
};

// 교직원 후보 생성용
export const STAFF_ROLES = {
  teacher: { name: '교사', fac: 'classroom', eff: '교육 수준 +' },
  researcher: { name: '연구원', fac: 'lab', eff: '연구 점수 +' },
  librarian: { name: '사서', fac: 'library', eff: '지식의 빛 +' },
  caretaker: { name: '관리인', fac: 'dorm', eff: '만족도 · 건설비 절감' },
  cook: { name: '요리사', fac: 'dining', eff: '만족도 · 탐험력 회복' },
  gardener: { name: '정원사', fac: 'garden', eff: '목재 · 마나 생산' },
  trainer: { name: '교관', fac: 'training', eff: '전투력 +' },
};
export const NAME_POOL = {
  given: ['아린', '벨라', '세오', '로웬', '하린', '테오', '루시안', '이나', '모아', '단테', '엘리', '노엘', '시아', '레오', '유나', '카렌', '펠릭스', '오렌', '미라', '제논', '하늘', '소라', '윤슬', '라온', '브린', '킬리안', '마렌', '이솔', '피오', '네라'],
  family: ['그레이', '솔', '벨크', '하스', '모르', '윈터', '애쉬', '브룩', '라벤', '크로', '실버', '페른', '오크', '데일', '마르', '틸', '로즈', '빈터', '헤일', '코브'],
  personality: ['호기심 많은', '느긋한', '성실한', '수줍은', '활발한', '고집 센', '다정한', '엉뚱한', '냉철한', '수다스러운', '꼼꼼한', '대담한'],
  talent: ['별읽기', '약초학', '고대 문자', '수리 마법', '기억술', '연금술', '음향 마법', '탐험술', '서예 주문', '빛의 공학'],
  quirk: ['밤마다 일기를 쓴다', '고양이와 대화한다고 주장한다', '항상 간식을 들고 다닌다', '모르는 단어를 모은다', '시험 전날 꼭 정원을 걷는다',
    '질문 노트가 세 권째다', '도서관 구석 자리를 고집한다', '매일 아침 하늘을 기록한다', '말할 때 손짓이 크다', '잠꼬대로 주문을 외운다'],
  staffLine: ['학생들이 질문을 많이 하면 좋겠군요.', '맡은 일은 끝까지 합니다.', '차 한 잔이면 무엇이든 고칠 수 있어요.', '정적의 땅에서 왔습니다. 다시 배울 수 있어서 기뻐요.',
    '예산은 아껴 쓰겠습니다. 아마도.', '제 수업은 조금 시끄러울 겁니다.', '책은 빌려 가면 돌려주는 겁니다. 꼭.', '실패한 실험도 기록할 가치가 있죠.'],
};

// ───────────────────────── 서브 퀘스트 (NPC 의뢰) ─────────────────────────
export const SIDE_QUESTS = [
  { id: 'sq_miru1', npc: 'miru', title: '미루의 공구 재료', from: 1, desc: '미루가 새 발명품에 쓸 목재와 석재를 부탁했다.', need: { wood: 20, stone: 15 }, reward: { gold: 300, xp: 300, item: 'it_mirucompass' }, line: '고마워! 7호는 진짜 폭발 안 해. 약속!' },
  { id: 'sq_elda1', npc: 'elda', title: '정적 표본 채집', from: 1, desc: '엘다 교수가 굳은 물음 12체 정화를 과제로 냈다.', needKills: 12, reward: { xp: 500, light: 40, outfit: 'of_explorer' }, line: '좋아. 표본이 많을수록 정적을 더 잘 알게 되지. 이 탐험복은 내 예전 것과 같은 디자인이다.' },
  { id: 'sq_toren1', npc: 'toren', title: '흩어진 책 찾기', from: 2, desc: '도서관에서 사라진 책들을 탐험 중 찾아 달라는 부탁. (탐험에서 \'낡은 책\' 5권)', needItem: { id: 'loot_book', n: 5 }, reward: { xp: 600, light: 60, research: 30 }, line: '이 소리… 맞다, 우리 책이구나. 책장 넘기는 소리가 반가워.' },
  { id: 'sq_kai1', npc: 'kai', title: '렌하르트의 대련', from: 5, desc: '카이가 정식 대련을 신청했다. 레벨 14를 달성하고 훈련장 3단계에서 맞붙자.', needLevel: 14, needFac: { training: 3 }, reward: { xp: 900, gold: 800, item: 'it_lampblade' }, line: '…졌다. 이상하게 기분이 나쁘지 않군. 이 검, 네가 쓰는 게 어울려.' },
  { id: 'sq_oswin1', npc: 'oswin', title: '오늘의 질문 게시판', from: 6, desc: '원장이 학생들에게 질문할 공간을 만들고 싶어 한다. 대강당 2단계와 재학생 10명.', needFac: { hall: 2 }, needStudents: 10, reward: { xp: 1200, light: 120, gold: 1000 }, line: '첫 질문이 붙었네. \'원장님은 왜 차를 좋아하세요?\' …대답하기 어렵군. 아주 좋아.' },
  { id: 'sq_evelyn1', npc: 'evelyn', title: '바다 밑의 별', from: 8, desc: '에블린의 질문을 함께 알아보자. 천문대 복원도 100%.', needRestore: { observatory: 100 }, reward: { xp: 2000, light: 200, outfit: 'of_summer' }, line: '호수 밑에서 별빛이 보였어! 바다는 아니지만… 이것도 답의 시작이야.' },
];

// 탐험 전리품 (재료 외)
export const LOOT = {
  loot_book: { name: '낡은 책', desc: '도서관에서 사라졌던 책. 토렌에게 가져가자.' },
  loot_seed: { name: '빛의 씨앗', desc: '사용하면 지식의 빛 15를 얻는다.', use: { light: 15 } },
  loot_herb: { name: '온실 약초', desc: '사용하면 탐험력 15를 회복한다.', use: { stamina: 15 } },
};
