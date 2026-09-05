import fs from 'node:fs';
const rows=JSON.parse(fs.readFileSync('D:/## APP/Earthus v2_DOC/v3/service-review-2026-09-05/menu-inventory.json','utf8')).rows.slice(0,93);
const src=fs.readFileSync('prototype/v2-three/js/ui-shell.js','utf8').split('export const dataBadge')[0];
const ids=[...src.matchAll(/\{ id: '([^']+)', name: '([^']+)', state:/g)].map(m=>m[1]);
if(ids.length!==rows.length)throw Error('Menu registry changed; review source mapping');
const q=Object.fromEntries(ids.map((id,i)=>[id,rows[i].question]));
fs.writeFileSync('prototype/v2-three/js/menu-guide.js',`// 질문은 2026-09-05 서비스 검토에서 정리했다. 자료 값이나 상태를 생성하지 않는다.\nexport const MENU_QUESTIONS = Object.freeze(${JSON.stringify(q,null,2)});\n`);
