const ACTION_TRUTH = Object.freeze({
  OFFICIAL_ACTION: 'OFFICIAL_ACTION',
  NGO_REPORTED: 'NGO_REPORTED',
  NEWS_REPORTED: 'NEWS_REPORTED',
  COMMUNITY_REPORTED: 'COMMUNITY_REPORTED',
  UNVERIFIED: 'UNVERIFIED',
});

export function classifyActionTruth({ source, corroborationCount = 0 } = {}) {
  const type = String(source?.type || '').toUpperCase();
  if (['OFFICIAL_API', 'OFFICIAL_RSS', 'OFFICIAL_PAGE', 'OFFICIAL_EVENT_PLATFORM', 'OFFICIAL_SOCIAL'].includes(type)) {
    return { truthClass: ACTION_TRUTH.OFFICIAL_ACTION, confidenceCap: 1 };
  }
  if (type === 'NEWS_REPORT') return { truthClass: ACTION_TRUTH.NEWS_REPORTED, confidenceCap: corroborationCount > 1 ? 0.8 : 0.65 };
  if (type === 'COMMUNITY_REPORT') return { truthClass: ACTION_TRUTH.COMMUNITY_REPORTED, confidenceCap: Math.min(0.6, 0.35 + 0.05 * corroborationCount) };
  return { truthClass: ACTION_TRUTH.UNVERIFIED, confidenceCap: 0.25 };
}

export function canLabelLiveAction(truth, status) {
  return truth?.truthClass === ACTION_TRUTH.OFFICIAL_ACTION && status === 'ACTIVE';
}

export { ACTION_TRUTH };
