from datetime import datetime, timezone
from aetherus_domain.models import ConfidenceAssessment, ConfidenceFactor, ConfidenceGrade, UncertaintyAssessment

DEFAULT_WEIGHTS={'source_quality':0.25,'freshness':0.20,'completeness':0.15,'agreement':0.20,'time_alignment':0.10,'validation':0.10}

def grade(score: float)->ConfidenceGrade:
    if score < .2: return ConfidenceGrade.VERY_LOW
    if score < .4: return ConfidenceGrade.LOW
    if score < .6: return ConfidenceGrade.MEDIUM
    if score < .8: return ConfidenceGrade.HIGH
    return ConfidenceGrade.VERY_HIGH

class ConfidenceEngine:
    def assess(self, target_type:str, target_id:str, values:dict[str,float], reasons:dict[str,str]|None=None)->ConfidenceAssessment:
        reasons=reasons or {}; factors=[]; num=den=0.0
        for name,w in DEFAULT_WEIGHTS.items():
            v=max(0.0,min(1.0,float(values.get(name,0.0))))
            num += v*w; den += w
            factors.append(ConfidenceFactor(name=name,value=v,weight=w,reason=reasons.get(name,'policy factor')))
        score=num/den if den else 0.0
        return ConfidenceAssessment(target_type=target_type,target_id=target_id,score=score,grade=grade(score),factors=factors,computed_at=datetime.now(timezone.utc),policy_version='0.1')

class UncertaintyEngine:
    def unavailable(self,target_type:str,target_id:str,reason:str)->UncertaintyAssessment:
        return UncertaintyAssessment(target_type=target_type,target_id=target_id,representation='UNAVAILABLE',computed_at=datetime.now(timezone.utc),limitations=[reason])
    def interval(self,target_type:str,target_id:str,lower:float,upper:float,units:str)->UncertaintyAssessment:
        return UncertaintyAssessment(target_type=target_type,target_id=target_id,representation='INTERVAL',lower=lower,upper=upper,units=units,computed_at=datetime.now(timezone.utc))
