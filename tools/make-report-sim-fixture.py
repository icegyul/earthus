# -*- coding: utf-8 -*-
"""INTEGRATION-3 §12 — 시뮬레이션 클릭을 실제로 해 보기 위한 보고서 픽스처.

    python3 tools/make-report-sim-fixture.py
    # → prototype/v2-three/_verify/reports/{index.json, TEST-REPORT-001/v1.json}
    # 그 뒤 브라우저에서:
    #   window.EARTHUS_REPORT_BASE = '<origin>/v2-three/_verify'
    #   리포트 → 읽기 → '조건을 바꿔보기'

⚠️ 산출물은 `_verify/` 아래에 둔다 — 공개 빌드 거름망(aws/_shared/public_build.py)이
   그 경로를 막는다. 시험 자료가 제품으로 나가지 않는다. 확인이 끝나면 지운다.

⚠️ 숫자를 지어내지 않는다. 실제 2026-08 보고서를 바탕으로 하고,
   **연결(어느 현상을 가리키는가)만** 바꾼 두 개의 이야기를 얹는다.
   그 두 현상(ocean.wave · hazards.tsunami)이 레지스트리에서 시뮬레이션 능력을
   가진 정확히 두 개다. 지금 어느 보고서에도 그 현상을 가리키는 이야기가 없어서
   '조건을 바꿔보기' 버튼을 실제로 눌러 본 적이 없었다.
"""
import io
import json
import os

REPO = r'D:\## APP\EARTHUS v2_APP'
SRC = os.path.join(REPO, 'build', 'e2e', 'report', 'EARTHUS_MONTHLY_2026_08.json')
OUTDIR = os.path.join(REPO, 'prototype', 'v2-three', '_verify', 'reports')

d = json.load(io.open(SRC, encoding='utf-8'))
base_story = dict(d['stories'][0])

d['reportId'] = 'TEST-REPORT-001'
d['canonicalUrl'] = '/reports/TEST-REPORT-001'


def story(sid, phen, title_ko, title_en, summary_ko, summary_en):
    s = dict(base_story)
    s.update({
        'storyId': sid,
        'reportId': 'TEST-REPORT-001',
        'phenomenonIds': [phen],
        'title': title_ko, 'titleEn': title_en,
        'summary': summary_ko, 'summaryEn': summary_en,
        # 숫자를 지어내지 않는다 — 비교·범위 항목은 비운다.
        'comparison': {}, 'temporalExtent': {}, 'spatialExtent': {},
        'factors': {}, 'factIds': [], 'eventIds': [],
        'sourceRefs': ['(시험 픽스처 — 실제 자료 아님)'],
        'evidenceLevel': None,
    })
    return s


extra = [
    story('story:test:wave', 'ocean.wave',
          '유의파고 — 시뮬레이션 연결 확인용',
          'Significant wave height — simulation link check',
          '이 이야기는 시뮬레이션 버튼을 실제로 눌러 보기 위한 시험 자료다. 숫자를 담지 않는다.',
          'A test story used only to click the simulation button. It carries no numbers.'),
    story('story:test:tsunami', 'hazards.tsunami',
          '쓰나미 — 시뮬레이션 연결 확인용',
          'Tsunami — simulation link check',
          '이 이야기는 시뮬레이션 버튼을 실제로 눌러 보기 위한 시험 자료다. 숫자를 담지 않는다.',
          'A test story used only to click the simulation button. It carries no numbers.'),
]
d['stories'] = list(d['stories']) + extra

for sec in d['sections']:
    if sec.get('id') == 'top_stories':
        sec['storyRefs'] = ['story:test:wave', 'story:test:tsunami'] + list(sec.get('storyRefs') or [])

out = os.path.join(OUTDIR, 'TEST-REPORT-001')
os.makedirs(out, exist_ok=True)
with io.open(os.path.join(out, 'v1.json'), 'w', encoding='utf-8') as fh:
    json.dump(d, fh, ensure_ascii=False)

index = {
    'schemaVersion': 'earthus.report-index.v1',
    'generatedAt': d.get('generatedAt'),
    # 색인 모양은 ui-shell.allReports() 가 읽는 그대로다: years[연도][]
    'years': {'2026': [{
        'reportId': 'TEST-REPORT-001', 'type': d['type'], 'period': d['period'],
        'version': 1, 'lifecycle': 'PUBLISHED', 'title': d['sections'][0].get('titleKo'),
        'dataLabel': d.get('dataLabel'),
    }]},
}
with io.open(os.path.join(OUTDIR, 'index.json'), 'w', encoding='utf-8') as fh:
    json.dump(index, fh, ensure_ascii=False)

print('wrote', os.path.join(out, 'v1.json'))
print('stories:', len(d['stories']), '| top_stories refs:',
      [s['storyRefs'] for s in d['sections'] if s['id'] == 'top_stories'][0][:4])
