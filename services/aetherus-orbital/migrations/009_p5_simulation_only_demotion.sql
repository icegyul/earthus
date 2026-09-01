SET search_path TO public;

-- P5 적대 감사(2026-09-01, docs/audit/P5_BENEFIT_AUDIT_VERDICT.md) 후속 조치.
-- 현행 REMOVE counterfactual은 엣지삭제형(SIMULATION_ONLY)이므로 그 산출 행을
-- DB 수준에서 강등 표기한다. 물리 재계산 경로가 구현되기 전까지 이 경로가
-- 만드는 모든 행은 SIMULATION_ONLY다. (감사 확인: 기존에 validation_state는
-- baseline_graph_snapshot·risk_edge에만 있었고 scenario_run·benefit_result에는
-- 없어 운영/시뮬레이션 구분이 warnings_json 텍스트에만 의존했다.)
-- IF NOT EXISTS: 부분 적용 후 재실행에 안전하도록 멱등형으로 작성한다.

ALTER TABLE scenario_run
    ADD COLUMN IF NOT EXISTS validation_state TEXT NOT NULL DEFAULT 'SIMULATION_ONLY'
        CHECK (validation_state IN ('PUBLIC_SCREENING', 'SIMULATION_ONLY', 'VALIDATED'));

ALTER TABLE benefit_result
    ADD COLUMN IF NOT EXISTS validation_state TEXT NOT NULL DEFAULT 'SIMULATION_ONLY'
        CHECK (validation_state IN ('PUBLIC_SCREENING', 'SIMULATION_ONLY', 'VALIDATED'));
