// 공개 브라우저용 예보 경계.
//
// 공식 기관 예보만 이 경계를 통과한다. Earthus가 융합·보정한 자체 예보는 브라우저에서
// 클라이언트 tier를 보고 고르는 대상이 아니다. 서버의 forecast-v8 함수가 인증·이용권·release
// gate를 모두 검사한 뒤에만 별도 private 응답으로 보낸다.

export function buildOfficialForecast(input) {
  return Object.freeze({
    schemaVersion: '8.0',
    revisionId: input.revisionId,
    kind: 'OFFICIAL',
    variable: input.variable,
    value: input.value,
    unit: input.unit,
    issuedAt: input.issuedAt,
    validAt: input.validAt,
    dataClass: 'OFFICIAL_FORECAST',
    accessClass: 'PUBLIC',
    sourceRefs: [...input.sourceRefs],
    releaseState: 'RELEASED',
  });
}

export function servePublicForecast(outputs = []) {
  const clean = outputs.filter(Boolean);
  const premiumLeak = clean.some(output => (
    output?.dataClass === 'EARTHUS_DERIVED'
    || output?.accessClass === 'PREMIUM'
  ));
  if (premiumLeak) {
    return Object.freeze({
      status: 500,
      code: 'PREMIUM_PAYLOAD_REACHED_PUBLIC_BOUNDARY',
      outputs: [],
    });
  }
  return Object.freeze({
    status: 200,
    accessClass: 'PUBLIC',
    outputs: clean.filter(output => (
      output?.dataClass === 'OFFICIAL_FORECAST'
      && output?.accessClass === 'PUBLIC'
    )),
  });
}
