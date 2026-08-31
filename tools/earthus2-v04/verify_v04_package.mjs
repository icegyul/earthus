import fs from 'node:fs'; import crypto from 'node:crypto'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)); const root=path.resolve(here,'../..'); const manifest=JSON.parse(fs.readFileSync(path.join(root,'PACKAGE_MANIFEST_v0.4.json'),'utf8')); let ok=0;
for(const row of manifest.files){const p=path.join(root,row.path);if(!fs.existsSync(p))throw new Error(`missing ${row.path}`);const b=fs.readFileSync(p);const h=crypto.createHash('sha256').update(b).digest('hex');if(h!==row.sha256||b.length!==row.bytes)throw new Error(`manifest mismatch ${row.path}`);ok++;}
console.log(`v0.4 manifest PASS ${ok}/${manifest.files.length}`);
