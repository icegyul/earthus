// Presentation policy: a selected topic must reveal its results without changing saved layouts.
export function widgetVisible(id, hidden, allowed) {
  return allowed ? allowed.includes(id) : !hidden.includes(id);
}

export function launchStatusLabel(status) {
  return ({ 'To Be Confirmed': '일정 미확정', 'To Be Determined': '일정 미정',
    'Go for Launch': '발사 예정', 'Launch Successful': '발사 성공',
    'Launch Failure': '발사 실패', 'Partial Failure': '부분 실패',
    'Hold': '대기', 'In Flight': '비행 중' })[status] || status || '상태 미수신';
}

// Selection is transient, following is persisted: opening details must not follow a launch.
export function selectedLaunch(launches, selectedId) {
  return launches.find(item => item.id === selectedId) || launches[0] || null;
}
