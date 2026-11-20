// 스토리 원고(비공개)를 게임용 암호화 팩으로 변환한다.
// 사용법: node tools/pack-story.mjs <story.src.mjs 경로>
// 원고는 스포일러이므로 저장소에 커밋하지 않는다. 팩은 런타임에 js/story.js 가 해독한다.
// 팩에서 원고를 되살리려면: node tools/unpack-story.mjs  (※ 결말 스포일러 주의)
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const src = process.argv[2];
if (!src) { console.error('usage: node tools/pack-story.mjs <story.src.mjs>'); process.exit(1); }
const mod = await import(pathToFileURL(path.resolve(src)).href);
const payload = JSON.stringify({ speakers: mod.speakers, chapters: mod.chapters, regionLore: mod.regionLore, npcTalk: mod.npcTalk, finalMid: mod.finalMid });
const KEY = 'hesperine-lantern';
const bytes = new TextEncoder().encode(payload);
const out = Buffer.alloc(bytes.length);
for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ KEY.charCodeAt(i % KEY.length) ^ (i * 7 & 255);
const b64 = out.toString('base64');
const here = path.dirname(fileURLToPath(import.meta.url));
const dest = path.resolve(here, '../public/studyverse/js/story.pack.js');
const lines = b64.match(/.{1,120}/g).map((l) => `  '${l}',`).join('\n');
writeFileSync(dest, `// 자동 생성 파일 — 스토리 스포일러 보호를 위해 인코딩되어 있습니다. 직접 수정하지 마세요.\n// tools/pack-story.mjs 로 생성.\nexport const STORY_KEY = '${KEY}';\nexport const STORY_PACK = [\n${lines}\n].join('');\n`);
console.log(`packed ${payload.length} chars -> ${dest}`);
