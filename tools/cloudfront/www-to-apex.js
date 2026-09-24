// CloudFront Function (viewer-request · runtime cloudfront-js-2.0) — www.earthus.net → https://earthus.net 301
//
// 왜 (2026-09-24, 앱 지시서 D18 · §3-2 host · verify-feasibility #22)
//   www.earthus.net 이 리다이렉트 없이 같은 내용을 200 으로 준다(같은 배포 E193CZEBLWEB56 의 별칭).
//   출처(origin)가 둘이 되면 세 가지가 갈라진다:
//     ① 안드로이드 앱(TWA)의 App Link 는 earthus.net 하나만 연다 — www 링크는 앱을 열지 않는다
//     ② localStorage·로그인 세션이 www 와 apex 에서 따로 논다
//     ③ Supabase 로그인 redirectTo(location.href)가 www 주소로 돌아간다
//   그래서 www 로 온 요청은 경로·쿼리를 그대로 붙여 apex 로 301 한다.
//
// ⚠️ 이 파일은 CloudFront Functions 문법이다: 모듈이 아니라 스크립트다. export·import 를 쓰지 않는다.
//    최상위에 handler 함수 하나. 배포·연결은 PD 가 한다(tools/cloudfront/README.md). 이 저장소는 올리지 않는다.
// ⚠️ 쿼리 값은 받은 그대로 다시 붙인다(다시 인코딩하지 않는다). 이벤트의 쿼리 값이 이미 퍼센트 인코딩된
//    원문인지는 AWS 문서에 명시가 없다(UNVERIFIED, 2026-09-24 읽음) — README 의 확인 절차 3번
//    (`?q=a%26b`)으로 PD 가 운영 전에 test-function 으로 확인한다.
// ⚠️ www 의 /.well-known/assetlinks.json 도 301 이 된다. 앱은 host earthus.net 하나만 주장하므로
//    검증에 영향이 없다(Digital Asset Links 는 주장한 host 에서 리다이렉트 없이 200 이어야 한다).

var APEX = 'earthus.net';

function queryString(qs) {
  var parts = [];
  var keys = Object.keys(qs || {});
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    var item = qs[k];
    if (!item) continue;
    if (item.multiValue && item.multiValue.length) {
      for (var j = 0; j < item.multiValue.length; j++) {
        parts.push(pair(k, item.multiValue[j].value));
      }
    } else {
      parts.push(pair(k, item.value));
    }
  }
  return parts.length ? '?' + parts.join('&') : '';
}

function pair(k, v) {
  return (v === undefined || v === null || v === '') ? k + '=' : k + '=' + v;
}

function handler(event) {
  var request = event.request;
  var hostHeader = request.headers && request.headers.host ? request.headers.host.value : '';
  var host = String(hostHeader || '').toLowerCase().replace(/\.$/, '');
  if (host !== 'www.' + APEX) {
    return request;                 // apex·cloudfront.net 주소는 그대로 통과
  }
  var location = 'https://' + APEX + (request.uri || '/') + queryString(request.querystring);
  return {
    statusCode: 301,
    statusDescription: 'Moved Permanently',
    headers: {
      location: { value: location },
      // 영구 이동이라 길게 캐시해도 되지만, 첫 적용 주에는 되돌릴 수 있게 하루로 둔다.
      'cache-control': { value: 'public, max-age=86400' },
    },
  };
}
