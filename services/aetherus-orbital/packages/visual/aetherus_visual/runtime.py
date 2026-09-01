from __future__ import annotations

from dataclasses import dataclass, replace
from enum import StrEnum
from typing import Any

from aetherus_domain import EvidenceClass, canonical_hash


class SemanticScale(StrEnum):
    SOLAR_SYSTEM_VIEW="SOLAR_SYSTEM_VIEW"
    CISLUNAR_VIEW="CISLUNAR_VIEW"
    EARTH_VIEW="EARTH_VIEW"
    ORBITAL_VIEW="ORBITAL_VIEW"
    OBJECT_VIEW="OBJECT_VIEW"
    EVENT_VIEW="EVENT_VIEW"


@dataclass(frozen=True)
class SceneLayer:
    layer_id:str
    evidence_class:EvidenceClass
    source_label:str
    uncertainty_visible:bool=False
    validation_label:str|None=None

@dataclass(frozen=True)
class SceneState:
    scale:SemanticScale
    camera_focus:str|None
    selected_object:str|None
    selected_event:str|None
    active_shell:str|None
    device_profile:str
    layers:tuple[SceneLayer,...]
    render_object_ids:tuple[str,...]
    scientific_object_ids:tuple[str,...]
    scientific_hash:str


class MultiScaleSpaceSceneEngine:
    id="E34"
    precision_budget_km={
        SemanticScale.SOLAR_SYSTEM_VIEW:1e3,
        SemanticScale.CISLUNAR_VIEW:10,
        SemanticScale.EARTH_VIEW:1,
        SemanticScale.ORBITAL_VIEW:0.01,
        SemanticScale.OBJECT_VIEW:0.001,
        SemanticScale.EVENT_VIEW:0.0001,
    }
    def build(self,*,scale:SemanticScale,scientific_object_ids:list[str],render_object_ids:list[str],layers:list[SceneLayer],camera_focus:str|None=None,device_profile:str="FULL") -> SceneState:
        allowed={"FULL","FAST","LIGHT","STATIC"}
        if device_profile not in allowed: device_profile="STATIC"
        # Scientific hash intentionally excludes render subset, camera, layers and device profile.
        sh=canonical_hash({"scientific_object_ids":sorted(scientific_object_ids)})
        return SceneState(scale,camera_focus,None,None,None,device_profile,tuple(layers),tuple(render_object_ids),tuple(scientific_object_ids),sh)
    def transition(self,state:SceneState,to_scale:SemanticScale)->SceneState:
        return replace(state,scale=to_scale)


class SemanticZoomCameraFocusEngine:
    id="E35"
    def __init__(self,state:SceneState):
        self.state=state; self.history:list[SceneState]=[]
    def focus_object(self,object_id:str)->SceneState:
        self.history.append(self.state); self.state=replace(self.state,scale=SemanticScale.OBJECT_VIEW,camera_focus=object_id,selected_object=object_id,selected_event=None); return self.state
    def focus_event(self,event_id:str,*,object_id:str|None=None)->SceneState:
        self.history.append(self.state); self.state=replace(self.state,scale=SemanticScale.EVENT_VIEW,camera_focus=object_id or self.state.camera_focus,selected_object=object_id or self.state.selected_object,selected_event=event_id); return self.state
    def switch_mode(self,scale:SemanticScale)->SceneState:
        self.history.append(self.state); self.state=replace(self.state,scale=scale); return self.state
    def back(self)->SceneState:
        if self.history: self.state=self.history.pop()
        return self.state
    def now_reset(self)->SceneState:
        # Time reset is outside this visual state; focus is intentionally preserved.
        return self.state


class OrbitalShellLODEngine:
    id="E36"
    shell_limits={"LEO":5000,"MEO":2500,"GEO":1500,"GLOBAL":2000}
    def render_set(self,object_ids:list[str],*,view:str="GLOBAL",viewport_query:list[str]|None=None,important_ids:list[str]|None=None)->list[str]:
        cap=self.shell_limits.get(view,1000)
        important=list(dict.fromkeys(important_ids or [])); viewport=list(dict.fromkeys(viewport_query or []))
        merged=[]
        for x in important+viewport+object_ids:
            if x not in merged: merged.append(x)
        return merged[:cap]
    def select_shell(self,state:SceneState,shell:str)->SceneState:
        if shell not in {"LEO","MEO","GEO"}: raise ValueError("unknown shell")
        return replace(state,scale=SemanticScale.ORBITAL_VIEW,active_shell=shell,camera_focus=shell)
    def science_subset_unchanged(self,state:SceneState,new_render_ids:list[str])->SceneState:
        return replace(state,render_object_ids=tuple(new_render_ids))


@dataclass(frozen=True)
class VisualToken:
    evidence_class:EvidenceClass
    pattern:str
    stroke:str
    opacity:float
    badge:str
    uncertainty_style:str

class VisualSemanticsEngine:
    id="E37"
    tokens={
        EvidenceClass.OBSERVED:VisualToken(EvidenceClass.OBSERVED,"solid","strong",1.0,"OBSERVED","envelope"),
        EvidenceClass.OFFICIAL:VisualToken(EvidenceClass.OFFICIAL,"solid","strong",1.0,"OFFICIAL","envelope"),
        EvidenceClass.DERIVED:VisualToken(EvidenceClass.DERIVED,"solid","medium",0.9,"DERIVED","range"),
        EvidenceClass.MODEL_SIGNAL:VisualToken(EvidenceClass.MODEL_SIGNAL,"dash","medium",0.75,"MODEL","volume"),
        EvidenceClass.AI_SIGNAL:VisualToken(EvidenceClass.AI_SIGNAL,"dot","medium",0.7,"AI SIGNAL","range"),
        EvidenceClass.SIMULATION_ONLY:VisualToken(EvidenceClass.SIMULATION_ONLY,"dash-dot","soft",0.65,"SIMULATION","volume"),
        EvidenceClass.COUNTERFACTUAL:VisualToken(EvidenceClass.COUNTERFACTUAL,"double-dash","soft",0.6,"COUNTERFACTUAL","volume"),
        EvidenceClass.ATTRIBUTION_RESULT:VisualToken(EvidenceClass.ATTRIBUTION_RESULT,"bracket","medium",0.8,"ATTRIBUTION","range"),
    }
    def token(self,evidence_class:EvidenceClass)->VisualToken: return self.tokens[evidence_class]
    def assert_no_promotion(self,source:EvidenceClass,displayed:EvidenceClass)->None:
        if source in {EvidenceClass.MODEL_SIGNAL,EvidenceClass.AI_SIGNAL,EvidenceClass.SIMULATION_ONLY,EvidenceClass.COUNTERFACTUAL} and displayed in {EvidenceClass.OBSERVED,EvidenceClass.OFFICIAL}:
            raise ValueError("visual layer may not promote evidence class")
    def validation_badge(self,validation_state:str)->str:
        mapping={"SCREENING_ONLY":"SCREENING","VALIDATED_PIPELINE":"VALIDATED","VALIDATION_PENDING":"PENDING","RESEARCH_ONLY":"RESEARCH","INSUFFICIENT_DATA":"INSUFFICIENT DATA"}
        return mapping.get(validation_state,validation_state)
    def accessibility_check(self,token:VisualToken)->bool:
        # Evidence semantics are encoded by pattern + badge in addition to opacity/color.
        return bool(token.pattern and token.badge and token.opacity>=0.5)
