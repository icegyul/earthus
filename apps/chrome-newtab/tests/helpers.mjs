// 시험 공용 — 고정 자료(2026-09-24 운영 파일을 공개 GET 으로 받은 사본)와 _locales 를 읽는 번역기.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { makeTranslator } from '../feeds.js';

export const EXT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const fixture = (name) => JSON.parse(readFileSync(path.join(EXT, 'tests/fixtures', `live-20260924-${name}.json`), 'utf8'));
export const messages = (lang) => JSON.parse(readFileSync(path.join(EXT, '_locales', lang, 'messages.json'), 'utf8'));
export const tKo = makeTranslator(messages('ko'));
export const tEn = makeTranslator(messages('en'));
export const clone = (o) => JSON.parse(JSON.stringify(o));
export const SEOUL = { id: 'seoul', ko: '서울', en: 'Seoul', stationId: '108', stationName: '서울', lat: 37.5714, lon: 126.9658 };
