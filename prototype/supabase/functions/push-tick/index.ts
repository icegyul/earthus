// earthus — 알림 발송 (주기 실행)
//
// ⚠️⚠️⚠️ **이 함수가 조용히 죽으면 아무도 모른다.** 안 오는 알림은 티가 안 난다.
//    사용자는 "위험이 없었구나"라고 생각한다. 그래서 마지막에 반드시 통계를 남기고,
//    호출한 쪽(Lambda ticker)이 그 숫자를 보고 이상하면 health 에 남긴다.
//
// 하는 일
//   1. 우리 공개 자료(이안류·지진·특보)를 읽는다
//   2. 사용자가 저장한 지점과 맞춰 본다
//   3. 아직 안 보낸 것만 보낸다 (alert_claim 이 원자적으로 막는다)
//
// ⚠️ **먼저 기록하고 보낸다.** 보내고 기록하면 그 사이에 죽었을 때 같은 알림이
//    다음 주기에 또 간다. 한 번 덜 가는 쪽이 낫다 — 반복 알림은 알림을 끄게 만들고,
//    꺼진 알림은 다음 진짜 위험을 놓치게 한다.
//
// ⚠️ **안전 알림은 무료 사용자에게도 보낸다.** 이안류·지진·특보는 사람이 다치는
//    일이라 결제 뒤에 두지 않는다 (billing.js 의 FREE_FEATURES 참고).
//    유료로 갈리는 것은 **지점 개수**(1곳 vs 20곳)뿐이고, 그건 DB 트리거가 막는다.
//
// 배포
//   supabase functions deploy push-tick --no-verify-jwt
//   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... \
//                        VAPID_SUBJECT=mailto:dalur@kakao.com PUSH_TICK_TOKEN=...
//   ⚠️ --no-verify-jwt 로 열되 **PUSH_TICK_TOKEN 으로 스스로 막는다.**
//      안 막으면 아무나 불러 알림을 쏟아부을 수 있다.

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CDN = Deno.env.get('CDN_BASE') ?? 'https://earthus.net';

/** 지점에서 몇 km 안의 이안류·지진을 내 일로 볼까.
 *  ⚠️ 이안류는 **해변마다 다르다.** 넓게 잡으면 옆 해변 경보를 이 해변 것으로 알린다.
 *     화면(coast.js)과 같은 기준을 쓴다 — 두 곳이 다르면 화면과 알림이 어긋난다. */
const RIP_KM = 20;
/* 기상특보 화면(warn.js)과 같은 최대 거리다. 특보구역 경계가 공개되지 않아
   가장 가까운 기상 관측지점의 구역을 저장 지점의 구역으로 근사한다.
   ⚠️ 특보 자체를 반경으로 고르는 값이 아니다. 반경은 '구역을 정할 관측지점이
   충분히 가까운가'만 판단하며, 못 정하면 보내지 않는다. */
const WARN_ZONE_MAX_KM = 60;

/** 지구 두 점 사이 거리(km) */
function km(aLat: number, aLon: number, bLat: number, bLon: number) {
  const R = 6371, rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat), dLon = rad(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** 우리 공개 자료 — ⚠️ 하나가 실패해도 나머지는 보낸다.
 *  이안류를 못 받았다고 지진 경보까지 막으면 안 된다. */
async function grab(path: string) {
  try {
    const r = await fetch(`${CDN}/${path}`, { headers: { 'Cache-Control': 'no-cache' } });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

/** "2026-08-04 07:55" (KST) → 몇 분 전인가.
 *  ⚠️ new Date(문자열) 은 런타임마다 다르게 읽는다. 직접 쪼갠다. */
function ageMin(s: string | null | undefined) {
  const m = String(s ?? '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return null;
  const [y, mo, d, H, M] = m.slice(1).map(Number);
  return (Date.now() - (Date.UTC(y, mo - 1, d, H, M) - 9 * 3600_000)) / 60_000;
}

/** 기상청 특보 등급 영문. 화면(warn.js)과 같은 표만 쓴다.
 *  표에 없는 새 등급은 원문을 남긴다 — 임의 번역으로 위험도를 바꾸지 않는다. */
function warnLevel(level: unknown, ko: boolean) {
  if (ko) return String(level ?? '');
  return ({
    '주의': 'Advisory', '주의보': 'Advisory', '경보': 'Warning',
    '중대경보': 'Emergency Warning', '예비특보': 'Preliminary',
  } as Record<string, string>)[String(level ?? '').trim()] || String(level ?? '');
}

/** 같은 사건을 어느 기기에 보냈는지 구분하는 비식별 키.
 *  ⚠️ 예전 alert_claim 키는 사용자+사건뿐이라 같은 계정의 첫 기기가 자리를 잡으면
 *     휴대폰·태블릿 등 나머지 구독은 전부 '이미 보냄'으로 건너뛰었다.
 *  endpoint 원문은 브라우저 푸시 주소이므로 DB 기록에 넣지 않고 SHA-256 앞부분만 쓴다. */
async function deviceKey(endpoint: string) {
  const bytes = new TextEncoder().encode(endpoint);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest.slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  // ── 문지기 ────────────────────────────────────────────────
  const want = Deno.env.get('PUSH_TICK_TOKEN');
  if (!want || req.headers.get('x-tick-token') !== want) {
    return new Response('forbidden', { status: 403 });
  }
  const priv = Deno.env.get('VAPID_PRIVATE_KEY');
  const pub = Deno.env.get('VAPID_PUBLIC_KEY');
  if (!priv || !pub) return new Response('no vapid', { status: 503 });
  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT') ?? 'mailto:dalur@kakao.com', pub, priv);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!,
                             Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const [coast, quake, warn, warnZones, targets] = await Promise.all([
    grab('events/coast-kr.json'),
    grab('events/quake-asia.json'),
    grab('events/kma-warn.json'),
    grab('events/kma-warn-stations.json'),
    admin.rpc('push_targets').then((r) => r.data ?? []),
  ]);

  const stat = { targets: targets.length, sent: 0, skipped: 0, dead: 0, failed: 0 };
  if (!targets.length) return json(stat);

  /* ── 무엇을 알릴지 고른다 ──────────────────────────────────
     ⚠️ 여기서 **판단을 만들지 않는다.** 기관이 매긴 등급을 그대로 옮긴다.
        "위험합니다"는 국립해양조사원이 한 말이지 우리 말이 아니다. */
  const ripHot = ((coast?.rip?.beaches ?? []) as any[]).filter((b) => {
    if ((b.gradeRank ?? 0) < 3) return false;          // 경계 이상만
    // ⚠️ 오래된 값으로 알리지 않는다. 수집이 멈췄는데 알림이 가면 최악이다.
    const a = ageMin(b.at);
    return a !== null && a <= 40;
  });
  const quakes = ((quake?.quakes ?? []) as any[]).filter((q) => {
    if (q.lat == null || q.mag == null) return false;
    const a = ageMin(String(q.at ?? '').replace('T', ' '));
    return a !== null && a <= 60;                      // 최근 1시간
  });
  /* 오래된 특보 파일로 알리지 않는다. active 배열이 남아 있으면 수집이 멎은 뒤에도
     경보가 계속 살아 있는 것처럼 보인다. 파일 생성 후 30분을 넘기면 전부 건너뛴다. */
  const warnGenerated = Date.parse(String(warn?.generated ?? ''));
  const warnFresh = Number.isFinite(warnGenerated)
    && Date.now() - warnGenerated <= 30 * 60_000;
  const activeWarns = warnFresh ? ((warn?.active ?? []) as any[]) : [];
  const warnStations = ((warnZones?.stations ?? []) as any[]).filter((s) =>
    s.lat != null && s.lon != null && s.zone);

  for (const t of targets as any[]) {
    const ko = (t.lang ?? 'ko') === 'ko';
    const device = await deviceKey(String(t.endpoint ?? ''));
    const jobs: { key: string; title: string; body: string; urgent: boolean; tag: string }[] = [];

    // ── 이안류 ──────────────────────────────────────────────
    if (t.rip) {
      for (const b of ripHot) {
        if (b.lat == null) continue;
        const d = km(t.lat, t.lon, b.lat, b.lon);
        if (d > RIP_KM) continue;
        const near = d <= 2;
        jobs.push({
          // ⚠️ 등급을 열쇠에 넣는다. '경계'→'위험' 으로 오르면 **다시 알린다.**
          //    넣지 않으면 등급이 올라도 조용해서, 더 위험해진 걸 모른다.
          key: `rip:${b.id}:${b.grade}`,
          title: ko ? `이안류 ${b.grade} — ${b.ko}` : `Rip current: ${b.grade} — ${b.ko}`,
          body: ko
            ? `${near ? '' : `${t.label} 에서 ${Math.round(d)}km · `}`
              + `국립해양조사원이 매긴 등급입니다. 들어가도 되는지는 현장 안내를 따르세요.`
            : `Graded by KHOA. Follow on-site guidance.`,
          urgent: (b.gradeRank ?? 0) >= 4,
          tag: `rip-${b.id}`,
        });
      }
    }

    // ── 지진 ────────────────────────────────────────────────
    if (t.quake) {
      for (const q of quakes) {
        if (Number(q.mag) < Number(t.quake_min_mag)) continue;
        const d = km(t.lat, t.lon, q.lat, q.lon);
        if (d > Number(t.quake_max_km)) continue;
        const place = q.placeEn || q.place || '';
        jobs.push({
          key: `quake:${q.src}:${q.at}`,
          title: ko ? `지진 M${Number(q.mag).toFixed(1)} · ${Math.round(d)}km`
                    : `Quake M${Number(q.mag).toFixed(1)} · ${Math.round(d)} km`,
          body: `${place}${q.depthKm != null ? ` · ${ko ? '깊이' : 'depth'} ${q.depthKm}km` : ''}`,
          urgent: Number(q.mag) >= 5.0,
          tag: `quake-${q.src}-${q.at}`,
        });
      }
    }

    // ── 기상특보 ────────────────────────────────────────────
    if (t.warn && activeWarns.length && warnStations.length) {
      /* 브라우저 화면(warn.js)과 같은 판정: 가장 가까운 관측지점의 특보구역을 쓴다.
         ⚠️ 구역 경계 바로 옆에서는 어긋날 수 있으므로 알림 본문에 구역명을 밝히고
         공식 발표 확인을 요구한다. 평균 좌표까지의 거리로 특보를 고르면 넓은 시군이
         불리해지므로 절대 그렇게 하지 않는다. */
      let best: any = null;
      for (const s of warnStations) {
        const d = km(t.lat, t.lon, Number(s.lat), Number(s.lon));
        if (d <= WARN_ZONE_MAX_KM && (!best || d < best.km)) best = { ...s, km: d };
      }
      if (best) {
        const mine = activeWarns
          .filter((w) => w.regionId === best.zone || w.parentId === best.zone)
          .sort((a, b) => Number(b.levelRank ?? 0) - Number(a.levelRank ?? 0));
        for (const w of mine) {
          const kind = ko ? w.kind : (w.kindEn || w.kind);
          jobs.push({
            key: `warn:${w.regionId}:${w.kind}:${w.issuedKst}`,
            title: `${w.icon || '⚠️'} ${w.region} ${kind} ${warnLevel(w.level, ko)}`,
            body: ko
              ? `${t.label} · 가장 가까운 관측지점 기준 ${best.zoneName}. 기상청 공식 발표를 확인하세요.`
              : `${t.label} · Approximate KMA zone: ${best.zoneName}. Check the official KMA bulletin.`,
            urgent: Number(w.levelRank ?? 0) >= 2,
            tag: `warn-${w.regionId}-${w.kind}`,
          });
        }
      }
    }

    // ── 보내기 ──────────────────────────────────────────────
    for (const j of jobs) {
      // ⚠️⚠️ **먼저 자리를 잡는다.** 이미 보냈으면 여기서 false 가 나온다.
      const { data: claimed } = await admin.rpc('alert_claim',
        /* 한 계정의 여러 저장 지점에서는 같은 사건을 한 기기에 한 번만 보내되,
           같은 계정의 다른 기기에는 각각 도착해야 한다. */
        { p_user: t.user_id, p_key: `${j.key}:device:${device}` });
      if (!claimed) { stat.skipped++; continue; }

      try {
        await webpush.sendNotification(
          { endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } },
          JSON.stringify({ title: j.title, body: j.body, urgent: j.urgent,
                           tag: j.tag, url: '/' }),
          { TTL: 3600 },
        );
        stat.sent++;
        await admin.from('push_subscriptions')
          .update({ failed: 0, last_ok: new Date().toISOString() })
          .eq('endpoint', t.endpoint);
      } catch (e) {
        const code = Number((e as any)?.statusCode ?? 0);
        if (code === 404 || code === 410) {
          /* ⚠️ 브라우저가 구독을 버린 것이다(앱 삭제·캐시 정리).
             지우지 않으면 죽은 구독이 쌓여 발송이 점점 느려진다. */
          await admin.from('push_subscriptions').delete().eq('endpoint', t.endpoint);
          stat.dead++;
        } else {
          /* ⚠️ 실패를 세어 둔다. 계속 실패하는 구독은 push_targets 가 걸러낸다 —
             한 기기 때문에 전체 발송이 늦어지면 안 된다. */
          await admin.from('push_subscriptions')
            .update({ failed: (t.failed ?? 0) + 1 }).eq('endpoint', t.endpoint);
          stat.failed++;
          console.error('[push] 실패', code, String(e).slice(0, 120));
        }
      }
    }
  }

  // 오래된 기록 정리 — ⚠️ 24시간은 남긴다 (push.sql 주석 참고)
  await admin.rpc('alert_sent_prune').catch(() => {});
  console.log('[push]', JSON.stringify(stat));
  return json(stat);
});

function json(b: unknown) {
  return new Response(JSON.stringify(b),
    { headers: { 'Content-Type': 'application/json' } });
}
