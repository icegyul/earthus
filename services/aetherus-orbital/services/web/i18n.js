(function(){
const dict={
  en:{
    'nav.space':'SPACE','nav.control':'CONTROL','nav.orbit':'ORBIT','nav.intelligence':'INTEL','nav.archive':'ARCHIVE',
    'mobile.details':'INTELLIGENCE / DETAILS','mobile.swipe':'TAP TO EXPAND',
    'workspace.current':'CURRENT WORKSPACE','focus':'FOCUS','persistent':'PERSISTENT UNIVERSE','layers':'ACTIVE LAYERS','semantic':'SEMANTIC LOD','science':'SCIENTIFIC STATE','visible':'VISIBLE AT ALL TIMES',
    'important':'IMPORTANT NOW','priority':'INTELLIGENCE PRIORITY','provenance':'PROVENANCE','trust':'WHY YOU CAN TRUST THIS','inspector':'Evidence inspector','raw':'RAW',
    'universal.workspace':'UNIVERSAL WORKSPACE','system.overview':'SYSTEM OVERVIEW','local.product':'LOCAL PRODUCT','universal.now':'UNIVERSAL NOW',
    'labels':'LABELS','grid':'GRID','observed':'OBSERVED','official':'OFFICIAL','derived':'DERIVED','model':'MODEL','simulation':'SIMULATION',
    'phase.title':'P6–P12 VALIDATION WORKSPACE','phase.scope':'EXECUTE · PERSIST · VERIFY','phase.copy':'Run research and operations flows against the current Aetherus runtime. No spacecraft command is created.','phase.token':'STAGING TEST TOKEN','phase.save':'SAVE','phase.p6':'PROTECT / OCM','phase.p7':'GENEALOGY','phase.p8':'FRAGMENTATION','phase.p9':'OBSERVATION','phase.p10':'DATASET','phase.p11':'OPERATIONS','phase.p12':'HARDENING','phase.ready':'READY','phase.hint':'Select a phase to execute its validation path.',
    'mode.SPACE.title':'SOLAR SYSTEM','mode.SPACE.subtitle':'SOLAR SYSTEM EPHEMERIS · MULTI-SCALE SPACE','mode.SPACE.caption':'From Earth to the solar system — one continuous universe.',
    'mode.CONTROL.title':'MISSION CONTROL','mode.CONTROL.subtitle':'MISSION LIFECYCLE · OFFICIAL / MODELLED SEPARATION','mode.CONTROL.caption':'Mission state, trajectory and evidence — never mixed.',
    'mode.ORBIT.title':'ORBITAL ENVIRONMENT','mode.ORBIT.subtitle':'LEO / MEO / GEO · SEMANTIC LOD · CONJUNCTION','mode.ORBIT.caption':"Don't show every object. Show what matters.",
    'mode.INTELLIGENCE.title':'INTELLIGENCE CORE','mode.INTELLIGENCE.subtitle':'EVIDENCE → SIGNAL → EVENT → REVISION → DECISION','mode.INTELLIGENCE.caption':'Why it matters, how certain it is, and what changed.',
    'mode.ARCHIVE.title':'TIME MACHINE / ARCHIVE','mode.ARCHIVE.subtitle':'APPEND-ONLY HISTORY · ARCHIVED ≠ RECONSTRUCTED','mode.ARCHIVE.caption':'Past state stays traceable. Reconstructed state stays labelled.',
    'warning.SPACE':'Local ephemeris is RESEARCH_ONLY until JPL precision provider validation.',
    'warning.ORBIT':'Screening environment only. Covariance is absent, therefore Pc remains unavailable.',
    'warning.CONTROL':'Official mission record and modelled trajectory remain visually and semantically separate.',
    'warning.INTELLIGENCE':'LLM explains Intelligence Packets; it does not calculate scientific risk.',
    'warning.ARCHIVE':'Archived state and reconstructed state are never displayed as the same class.'
  },
  ko:{
    'nav.space':'우주','nav.control':'관제','nav.orbit':'궤도','nav.intelligence':'인텔리전스','nav.archive':'아카이브',
    'mobile.details':'인텔리전스 / 상세정보','mobile.swipe':'탭하여 펼치기',
    'workspace.current':'현재 작업공간','focus':'포커스','persistent':'지속형 유니버스','layers':'활성 레이어','semantic':'시맨틱 LOD','science':'과학 상태','visible':'항상 표시',
    'important':'지금 중요한 것','priority':'인텔리전스 우선순위','provenance':'근거 / 출처','trust':'왜 신뢰할 수 있는가','inspector':'근거 상세 보기','raw':'원문',
    'universal.workspace':'유니버설 워크스페이스','system.overview':'시스템 개요','local.product':'로컬 제품','universal.now':'유니버설 현재',
    'labels':'라벨','grid':'그리드','observed':'관측','official':'공식','derived':'도출','model':'모델','simulation':'시뮬레이션',
    'phase.title':'P6–P12 실행 검증 워크스페이스','phase.scope':'실행 · 저장 · 검증','phase.copy':'현재 Aetherus runtime에서 연구·운영 경로를 직접 실행합니다. 우주선 명령은 생성하지 않습니다.','phase.token':'스테이징 테스트 토큰','phase.save':'저장','phase.p6':'PROTECT / OCM','phase.p7':'계보','phase.p8':'파편화','phase.p9':'관측','phase.p10':'데이터셋','phase.p11':'운영','phase.p12':'하드닝','phase.ready':'준비','phase.hint':'Phase를 선택해 검증 경로를 실행하세요.',
    'mode.SPACE.title':'태양계','mode.SPACE.subtitle':'태양계 천체력 · 멀티스케일 우주','mode.SPACE.caption':'지구에서 태양계까지, 하나의 연속된 우주.',
    'mode.CONTROL.title':'미션 관제','mode.CONTROL.subtitle':'미션 생명주기 · 공식 / 모델 경로 분리','mode.CONTROL.caption':'미션 상태·궤적·근거를 혼동 없이 추적합니다.',
    'mode.ORBIT.title':'궤도 환경','mode.ORBIT.subtitle':'LEO / MEO / GEO · 시맨틱 LOD · 근접사건','mode.ORBIT.caption':'모든 물체가 아니라, 중요한 것을 보여줍니다.',
    'mode.INTELLIGENCE.title':'인텔리전스 코어','mode.INTELLIGENCE.subtitle':'근거 → 신호 → 이벤트 → 리비전 → 판단','mode.INTELLIGENCE.caption':'왜 중요한지, 얼마나 확실한지, 무엇이 바뀌었는지.',
    'mode.ARCHIVE.title':'타임머신 / 아카이브','mode.ARCHIVE.subtitle':'추가 전용 이력 · 보관 ≠ 재구성','mode.ARCHIVE.caption':'과거 상태는 추적 가능하게, 재구성 상태는 명확하게 구분합니다.',
    'warning.SPACE':'JPL 정밀 공급자 검증 전까지 로컬 천체력은 RESEARCH_ONLY입니다.',
    'warning.ORBIT':'스크리닝 환경입니다. 공분산이 없어 Pc는 사용할 수 없습니다.',
    'warning.CONTROL':'공식 미션 기록과 모델 궤적은 시각·의미적으로 분리합니다.',
    'warning.INTELLIGENCE':'LLM은 Intelligence Packet을 설명하며 과학 위험값을 계산하지 않습니다.',
    'warning.ARCHIVE':'보관 상태와 재구성 상태를 동일한 상태로 표시하지 않습니다.'
  }
};
const exactKo={
  'CURRENT WORKSPACE':'현재 작업공간','FOCUS':'포커스','PERSISTENT UNIVERSE':'지속형 유니버스','ACTIVE LAYERS':'활성 레이어','SEMANTIC LOD':'시맨틱 LOD','SCIENTIFIC STATE':'과학 상태','VISIBLE AT ALL TIMES':'항상 표시',
  'IMPORTANT NOW':'지금 중요한 것','INTELLIGENCE PRIORITY':'인텔리전스 우선순위','PROVENANCE':'근거 / 출처','WHY YOU CAN TRUST THIS':'왜 신뢰할 수 있는가','Evidence inspector':'근거 상세 보기','RAW':'원문',
  'UNIVERSAL WORKSPACE':'유니버설 워크스페이스','SYSTEM OVERVIEW':'시스템 개요','LOCAL PRODUCT':'로컬 제품','UNIVERSAL NOW':'유니버설 현재','LABELS':'라벨','GRID':'그리드',
  'OBSERVED':'관측','OFFICIAL':'공식','DERIVED':'도출','MODEL':'모델','SIMULATION':'시뮬레이션','FOCUS OBJECTS':'포커스 객체','MISSION QUEUE':'미션 큐','MISSION TIMELINE':'미션 타임라인',
  'LAUNCH SITE':'발사장','ORBITAL RADAR':'궤도 레이더','SYSTEM STATUS':'시스템 상태','CLOSE APPROACH':'근접 접근','COVERAGE':'커버리지','RENDERED':'렌더링','SAFETY GATE':'안전 게이트',
  'EVIDENCE':'근거','SIGNAL':'신호','EVENT':'이벤트','REVISION':'리비전','WHY IT MATTERS':'왜 중요한가','SOURCES':'출처','CURRENT':'현재','GATED':'게이트 적용',
  'CURSOR':'시간 커서','ARCHIVE RECORDS':'아카이브 기록','EARLIEST RECORD':'최초 기록','REVISION MODEL':'리비전 모델','IMMUTABLE':'불변','READY':'준비','UNAVAILABLE':'사용 불가','NOMINAL':'정상',
  'MISSION STATE':'미션 상태','PLANETS IN VIEW':'표시 행성','UNIVERSAL STATE':'유니버설 상태','TELEMETRY':'텔레메트리','KM MISS DISTANCE':'최근접 거리','EVIDENCE SOURCES':'근거 출처','ARCHIVE RECORDS':'아카이브 기록',
  'CELESTIAL OBJECTS':'천체','MISSION QUEUE':'미션 큐','WORKSPACE':'워크스페이스','ADAPTIVE':'적응형','ORBITAL SHELLS':'궤도 쉘','ENVIRONMENT':'환경','SCREENING OBJECTS':'스크리닝 객체','VALIDATION FIXTURE':'검증용 고정 자료','EVENT QUEUE':'이벤트 큐','INTELLIGENCE GATES':'인텔리전스 게이트','SCIENTIFIC BOUNDARY':'과학 경계','EVIDENCE FUSION':'근거 융합','SIGNAL PROMOTION':'신호 승격','LLM CLAIM VALIDATION':'LLM 주장 검증','TIME MACHINE':'타임머신','ARCHIVED STATE':'보관 상태','RECONSTRUCTED':'재구성','STORED HISTORICAL SNAPSHOT':'저장된 과거 스냅샷',
  'SPACE CONTEXT':'우주 컨텍스트','CURRENT VIEW':'현재 뷰','EARTH / HELIOCENTRIC':'지구 / 태양중심','SPACE WEATHER':'우주기상','NEO WATCH':'NEO 감시','MISSION STREAM':'미션 스트림','MISSION':'미션','MISSION → ORBIT':'미션 → 궤도','CONJUNCTION WATCH':'근접사건 감시','MISS DISTANCE':'최근접 거리','COLLISION PROBABILITY':'충돌 확률','WHY IT MATTERS':'왜 중요한가','WHAT CHANGED':'무엇이 바뀌었나','CONFIDENCE / UNCERTAINTY':'신뢰도 / 불확실성','ARCHIVE INTEGRITY':'아카이브 무결성','STATE CLASS':'상태 클래스','CURRENT EVENT MUTATION':'현재 이벤트 변경','FORBIDDEN':'금지',
  'TRACKED PLANETS':'추적 행성','LOCAL VIEW':'로컬 뷰','OBJECTS':'객체','FARTHEST IN VIEW':'가장 먼 객체','EPHEMERIS':'천체력','LIVE PROVIDERS':'실시간 공급자','VERIFIED HERE':'여기서 검증됨','LAUNCH SITE':'발사장','ORBITAL RADAR':'궤도 레이더','SYSTEM STATUS':'시스템 상태','CLOSE APPROACH':'근접 접근','VISUAL ONLY':'시각화 전용','SAFETY GATE':'안전 게이트','CURSOR':'시간 커서','EARLIEST RECORD':'최초 기록','REVISION MODEL':'리비전 모델','INDEXED':'인덱싱됨',
  'Aetherus stays quiet until evidence clears the promotion gate.':'근거가 승격 기준을 통과하기 전까지 Aetherus는 조용히 대기합니다.','Nothing promoted right now.':'현재 승격된 이벤트가 없습니다.','No evidence-backed event is currently promoted.':'현재 근거 기반으로 승격된 이벤트가 없습니다.','No source-backed mission is available.':'출처가 확인된 미션이 없습니다.','Layers are context-driven by the selected workspace.':'레이어는 선택한 워크스페이스 컨텍스트에 따라 구성됩니다.','No risk claim is generated without official small-body data.':'공식 소천체 데이터 없이는 위험 주장을 생성하지 않습니다.','Confidence never hides uncertainty; both retain evidence lineage.':'신뢰도와 불확실성을 분리해 표시하며 둘 다 근거 계보를 유지합니다.','Covariance required for probability.':'확률 계산에는 공분산이 필요합니다.','Historical replay and reconstruction cannot create a current real-world event.':'과거 재생과 재구성은 현재의 실제 이벤트를 생성할 수 없습니다.','Historical state rebuilt from evidence':'근거를 바탕으로 재구성한 과거 상태','Target orbit and mission trajectory remain source-classed.':'목표 궤도와 미션 궤적은 출처 클래스가 유지됩니다.','JPL / SWPC remain staging integrations.':'JPL / SWPC는 스테이징 연결 단계입니다.','Payload / stage handover remains evidence-linked to the mission record.':'Payload / Stage 인계는 미션 기록의 근거와 연결됩니다.','Stored historical snapshot':'저장된 과거 스냅샷','No archive records found.':'아카이브 기록이 없습니다.','Append-only archive':'추가 전용 아카이브','NASA fixed official historical fixture':'NASA 공식 고정 과거 자료','Mission record':'미션 기록','Live telemetry':'실시간 텔레메트리','Overwrite history':'과거 덮어쓰기','Replay → current event':'재생 → 현재 이벤트',
  'Apollo 11 launch is recorded by the fixed NASA official fixture.':'Apollo 11 발사가 NASA 공식 고정 자료에 기록되어 있습니다.',
  'This proves the first evidence-backed Mission-to-Intelligence integration path without inventing telemetry or risk metrics.':'텔레메트리나 위험 수치를 만들어내지 않고, 근거 기반 Mission-to-Intelligence 통합 경로를 검증합니다.',
  'What happened':'무슨 일이 있었나','What changed':'무엇이 바뀌었나','Why it matters':'왜 중요한가','Limitations':'제한사항','Validation':'검증 상태',
  'Explanation temporarily unavailable.':'설명을 일시적으로 사용할 수 없습니다.','AETHERUS EXPLAINS':'AETHERUS 설명','PACKET ONLY':'PACKET 전용','NO SCIENTIFIC CALCULATION':'과학 계산 없음','APPEND-ONLY':'추가 전용','The historical launch fact entered the executable Aetherus Foundation state and event lineage.':'과거 발사 사실이 실행 가능한 Aetherus Foundation 상태와 이벤트 계보에 반영되었습니다.'
};
let saved='';try{saved=localStorage.getItem('aetherus.locale')||''}catch(e){}let locale=(saved||navigator.language||'en').toLowerCase().startsWith('ko')?'ko':'en';
function t(key,fallback=''){return dict[locale]?.[key]??dict.en[key]??fallback??key}
function apply(root=document){document.documentElement.lang=locale;document.documentElement.dataset.locale=locale;document.querySelectorAll('[data-i18n]').forEach(el=>{el.textContent=t(el.dataset.i18n,el.textContent)});document.querySelectorAll('[data-i18n-placeholder]').forEach(el=>{el.placeholder=t(el.dataset.i18nPlaceholder,el.placeholder)});if(locale==='ko')translateExact(root);document.querySelector('.locale-en')?.classList.toggle('active',locale==='en');document.querySelector('.locale-ko')?.classList.toggle('active',locale==='ko')}
function translateExact(root=document){const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;while(n=walker.nextNode()){const p=n.parentElement;if(!p||['SCRIPT','STYLE','PRE','CODE'].includes(p.tagName))continue;const raw=n.nodeValue;const trim=raw.trim();if(!trim)continue;const mapped=exactKo[trim];if(mapped)n.nodeValue=raw.replace(trim,mapped)}}
function setLocale(next){locale=next==='ko'?'ko':'en';try{localStorage.setItem('aetherus.locale',locale)}catch(e){}apply();return locale}
window.AetherusI18n={t,apply,setLocale,get locale(){return locale}};
})();
