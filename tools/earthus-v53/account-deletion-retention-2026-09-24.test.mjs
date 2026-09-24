// 계정 삭제가 결제 주문·동의 이력까지 지우던 것 — 보존 마이그레이션 정적 검사 (2026-09-24)
//
// 왜: orders·consents 가 auth.users 에 on delete cascade 로 묶여 계정 삭제 때 함께 지워졌다
//   (전자상거래법 시행령 제6조 5년 보존 위반 · schema.sql 주석과 실제 동작이 달랐다).
//   고침: prototype/supabase/migrations/20260924120000_account_deletion_retains_legal_records.sql (PD 적용 대기).
//
// ⚠️ 이 컴퓨터에 Postgres(psql·pglite)가 없어 SQL 을 실제로 돌리지 못한다 — 여기서는 글자로 볼 수 있는 것만 본다:
//   트리거 자리(auth.users BEFORE DELETE) · 옮기는 칸이 원본 표에 실제로 있는가 · 평문 이메일이 없는가 ·
//   분리 보관 표가 잠겨 있는가 · 롤백이 표를 지우지 않는가. 실제 동작 확인은 파일 안 '적용 뒤 2)' 를 PD 가 돌린다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const MIG_REL = 'prototype/supabase/migrations/20260924120000_account_deletion_retains_legal_records.sql';
const raw = read(MIG_REL);
// 주석을 뺀 실행 부분 — 주석 속 예시(롤백·시험 SQL)가 실행문으로 오인되지 않게
const sql = raw.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');

/** create table 본문 + add column if not exists 로 모은 칸 이름 */
function columnsOf(table, files) {
  const cols = new Set();
  for (const f of files) {
    const src = read(f).split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
    const m = new RegExp(`create table if not exists public\\.${table} \\(([\\s\\S]*?)\\n\\);`).exec(src);
    if (m) for (const line of m[1].split('\n')) {
      const c = /^\s*([a-z_][a-z0-9_]*)\s+/.exec(line);
      if (c) cols.add(c[1]);
    }
    for (const a of src.matchAll(new RegExp(`alter table public\\.${table}([\\s\\S]*?);`, 'g'))) {
      for (const c of a[1].matchAll(/add column if not exists\s+([a-z_][a-z0-9_]*)/g)) cols.add(c[1]);
    }
  }
  return cols;
}

test('LF 줄끝 · 이름이 migrations 관례(14자리 시각_이름.sql)', () => {
  assert.ok(!raw.includes('\r'), 'CRLF 가 섞이면 안 된다');
  assert.match(path.basename(MIG_REL), /^\d{14}_[a-z0-9_]+\.sql$/);
});

test('트리거는 auth.users BEFORE DELETE 행 트리거다(cascade 전에 옮긴다)', () => {
  assert.match(sql, /create trigger trg_retain_legal_records_before_user_delete\s+before delete on auth\.users\s+for each row execute function public\.retain_legal_records_before_user_delete\(\);/);
  assert.match(sql, /drop trigger if exists trg_retain_legal_records_before_user_delete on auth\.users;/, '다시 돌려도 트리거가 하나');
  assert.doesNotMatch(sql, /before delete on public\.(orders|consents)/, 'orders·consents 에 걸면 누구의 기록인지 잃는다');
  assert.match(sql, /return old;/);
  assert.doesNotMatch(sql, /exception\s+when/i, '옮기기 실패를 삼키면 기록 없이 계정만 지워진다');
});

test('원본 표의 외래키·cascade 는 건드리지 않는다(되돌리기는 트리거 하나)', () => {
  assert.doesNotMatch(sql, /alter table public\.(orders|consents)\b/);
  assert.doesNotMatch(sql, /\bdrop\s+(table|constraint)\b/i, '실행 부분에 drop table·constraint 가 없어야 한다');
});

test('옮기는 칸이 원본 표에 실제로 있다(없으면 첫 계정 삭제가 실패한다)', () => {
  const orders = columnsOf('orders', ['prototype/supabase/billing.sql', 'prototype/supabase/refund.sql', 'prototype/supabase/founding.sql']);
  const consents = columnsOf('consents', ['prototype/supabase/schema.sql']);
  assert.ok(orders.has('payment_key') && orders.has('refunded_at') && orders.has('discount_kind'), `orders 칸 수집: ${[...orders]}`);
  const oRefs = [...sql.matchAll(/\bo\.([a-z_][a-z0-9_]*)/g)].map((m) => m[1]);
  const cRefs = [...sql.matchAll(/\bc\.([a-z_][a-z0-9_]*)/g)].map((m) => m[1]);
  assert.ok(oRefs.length > 10 && cRefs.length > 8);
  for (const c of oRefs) assert.ok(orders.has(c), `orders.${c} 가 원본 정의에 없다`);
  for (const c of cRefs) assert.ok(consents.has(c), `consents.${c} 가 원본 정의에 없다`);
});

test('최소 항목 — 평문 이메일·이름·계정 id 를 남기지 않고, 계약이 성립한 주문만 5년', () => {
  for (const t of ['retained_orders', 'retained_consents']) {
    const body = new RegExp(`create table if not exists public\\.${t} \\(([\\s\\S]*?)\\n\\);`).exec(sql)[1];
    assert.match(body, /email_sha256\s+text/);
    assert.doesNotMatch(body, /^\s*(email|display_name|provider_id|user_id|name)\s/m, `${t}: 평문 개인 식별 칸이 없어야 한다`);
    assert.match(body, /retain_until\s+timestamptz not null/);
  }
  assert.match(sql, /encode\(sha256\(convert_to\(lower\(trim\(old\.email\)\), 'UTF8'\)\), 'hex'\)/);
  assert.match(sql, /o\.status in \('paid', 'refunded'\)/);
  assert.match(sql, /coalesce\(o\.refunded_at, o\.approved_at, o\.created_at\) \+ interval '5 years'/);
  assert.match(sql, /now\(\) \+ interval '3 years'/);
});

test('분리 보관 표는 잠겨 있다 — RLS 켜고 정책 없음, 일반 역할 권한 회수, 파기 함수는 service_role 만', () => {
  for (const t of ['retained_orders', 'retained_consents']) {
    assert.match(sql, new RegExp(`alter table public\\.${t}\\s+enable row level security;`));
    assert.match(sql, new RegExp(`revoke all on public\\.${t}\\s+from public, anon, authenticated;`));
    assert.doesNotMatch(sql, new RegExp(`create policy[^;]*on public\\.${t}`), `${t} 에 정책을 두지 않는다`);
  }
  assert.match(sql, /grant execute on function public\.purge_expired_retained_records\(\) to service_role;/);
  assert.doesNotMatch(sql, /grant execute on function public\.retain_legal_records_before_user_delete/);
  assert.equal((sql.match(/\$\$/g) || []).length % 2, 0, '$$ 짝');
});

test('롤백 안내 — 트리거·함수만 지우고 보존 표는 지우지 않는다고 적혀 있다. 동의 A/B 결정이 적혀 있다', () => {
  const rb = raw.slice(raw.indexOf('-- 롤백'));
  assert.ok(raw.includes('-- 롤백'), '롤백 절');
  assert.match(rb, /drop trigger if exists trg_retain_legal_records_before_user_delete on auth\.users;/);
  assert.match(rb, /표는 \*\*롤백에서 지우지 않는다\.\*\*/);
  assert.match(raw, /PD 결정 대기/);
  assert.match(raw, /동의 B 선택 시/);
});

test('검증 SQL(account-deletion-retention-verify.sql) — 한 거래 안에서 결과를 확인하고 rollback 한다', () => {
  // (2026-09-24 검수 추가) 로컬 postgres:17 컨테이너에서 실제로 돌려 통과한 시나리오를 PD 가 운영 적용 뒤 돌리게 옮겼다.
  //   여기서는 그 파일이 운영 표를 바꾸지 않는 꼴(begin … rollback, commit 없음)인지와, 결과를 **확인하는** 줄이 있는지를 본다.
  const v = read('prototype/supabase/account-deletion-retention-verify.sql');
  assert.ok(!v.includes('\r'), 'LF');
  const body = v.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
  assert.match(body, /^\s*begin;/m);
  assert.match(body, /\n\s*rollback;\s*$/);
  assert.doesNotMatch(body, /\bcommit\b/i);
  for (const tag of ['SCENARIO_OK', 'PRIV_AUTH_OK', 'PRIV_ANON_OK', 'PURGE_OK']) assert.ok(body.includes(`raise notice '${tag}'`), tag);
  assert.match(body, /array\['verify-A-paid', 'verify-A-refunded'\]/, 'paid·refunded 만 남는지 결과로 본다');
  assert.match(body, /refund_transaction_key = 'rtk_verify'/);
  assert.match(sql, /o\.refund_transaction_key/, '환불 거래키를 옮긴다(청약철회 기록 대사)');
  assert.doesNotMatch(sql, /o\.refund_reason/, '자유 글 환불 사유는 옮기지 않는다');
});

test('schema.sql·billing.sql 의 틀린 주석은 지우지 않고 정정 줄을 더했다', () => {
  const schema = read('prototype/supabase/schema.sql');
  assert.match(schema, /update\/delete 정책 없음 = 아무도 못 고치고 못 지운다 \(이력 보존\)\n-- \(2026-09-24 정정\)/);
  assert.match(schema, /-- delete from public\.consents where user_id = uid;\n  -- \(2026-09-24 정정\)/);
  assert.match(read('prototype/supabase/billing.sql'), /on delete cascade,\n  -- \(2026-09-24 정정\)/);
});
