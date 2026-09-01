from __future__ import annotations

import os
import json
from typing import Any, Callable

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field


class PersonalContextUpdate(BaseModel):
    context: dict[str, Any] = Field(default_factory=dict)


class WorkspaceUpdate(BaseModel):
    workspace: dict[str, Any] = Field(default_factory=dict)


class AssistantToolRequest(BaseModel):
    tool_name: str
    args: dict[str, Any] = Field(default_factory=dict)
    allow_scientific_tool: bool = False


class ResearchDatasetRequest(BaseModel):
    dataset_key: str
    version: str
    domain: str
    record_type: str
    license_policy: str


class PrivateStateUpdate(BaseModel):
    value: Any


class OperationJobRequest(BaseModel):
    operation: str
    payload: dict[str, Any] = Field(default_factory=dict)
    idempotency_key: str
    run_now: bool = True
    max_attempts: int = Field(default=3, ge=1, le=10)


def register_platform_routes(
    app: FastAPI,
    *,
    require_product: Callable[[], Any],
    envelope: Callable[..., dict[str, Any]],
    jsonable: Callable[[Any], Any],
) -> None:
    """Integrate L01-L08/S01-S12 into the local product without pretending local headers are production auth."""

    def identity(
        x_aetherus_tenant: str | None = Header(default=None),
        x_aetherus_user: str | None = Header(default=None),
        x_aetherus_plan: str = Header(default="FREE"),
    ) -> tuple[str, str, str]:
        env=os.environ.get("AETHERUS_ENV","local").lower()
        trusted=os.environ.get("AETHERUS_TRUSTED_AUTH_ADAPTER","0")=="1"
        if env not in {"local","test"} and not trusted:
            raise HTTPException(503,"BLOCKED_AUTH_PROVIDER: configure a trusted deployment auth adapter")
        tenant=x_aetherus_tenant or ("LOCAL" if env in {"local","test"} else None)
        user=x_aetherus_user or ("LOCAL_USER" if env in {"local","test"} else None)
        if not tenant or not user:
            raise HTTPException(401,"authenticated tenant/user required")
        return tenant,user,x_aetherus_plan

    @app.get("/v1/my-aetherus")
    def my_aetherus(
        x_aetherus_tenant: str | None = Header(default=None),
        x_aetherus_user: str | None = Header(default=None),
        x_aetherus_plan: str = Header(default="FREE"),
    ):
        tenant,user,plan=identity(x_aetherus_tenant,x_aetherus_user,x_aetherus_plan)
        p=require_product()
        return envelope({
            "tenant_id":tenant,"user_id":user,"plan":plan,
            "capabilities":sorted(p.subscription.capabilities(plan)),
            "personal_context":p.load_personal_context(tenant,user),
            "workspace":p.load_workspace(tenant,user),
            "auth_mode":"LOCAL_HEADER_ADAPTER" if os.environ.get("AETHERUS_ENV","local").lower() in {"local","test"} else "TRUSTED_DEPLOYMENT_ADAPTER",
        },data_status="LOCAL_ONLY" if os.environ.get("AETHERUS_ENV","local").lower() in {"local","test"} else "OK")

    @app.put("/v1/my-aetherus/context")
    def update_context(
        req: PersonalContextUpdate,
        x_aetherus_tenant: str | None = Header(default=None),
        x_aetherus_user: str | None = Header(default=None),
        x_aetherus_plan: str = Header(default="FREE"),
    ):
        tenant,user,_=identity(x_aetherus_tenant,x_aetherus_user,x_aetherus_plan)
        p=require_product(); before=p.load_personal_context(tenant,user); after=p.save_personal_context(tenant,user,req.context)
        aid=p.audit_action(tenant,user,"PERSONAL_CONTEXT_UPDATE",f"{tenant}:{user}",before,after)
        return envelope(after,data_status="LOCAL_ONLY",provenance={"audit_id":aid})

    @app.get("/v1/control/workspace")
    def control_workspace(
        mission_state: str = Query(default="PRE-LAUNCH"),
        x_aetherus_tenant: str | None = Header(default=None),
        x_aetherus_user: str | None = Header(default=None),
        x_aetherus_plan: str = Header(default="FREE"),
    ):
        tenant,user,plan=identity(x_aetherus_tenant,x_aetherus_user,x_aetherus_plan)
        p=require_product()
        if not p.subscription.authorize(plan,"CONTROL_ROOM") and plan!="FREE":
            raise HTTPException(403,"CONTROL_ROOM capability required")
        saved=p.load_workspace(tenant,user)
        adaptive=p.workspace.layout_for(mission_state)
        return envelope({"adaptive":adaptive,"saved":saved,"mission_state":mission_state},data_status="LOCAL_ONLY")

    @app.put("/v1/control/workspace")
    def save_workspace(
        req: WorkspaceUpdate,
        x_aetherus_tenant: str | None = Header(default=None),
        x_aetherus_user: str | None = Header(default=None),
        x_aetherus_plan: str = Header(default="FREE"),
    ):
        tenant,user,plan=identity(x_aetherus_tenant,x_aetherus_user,x_aetherus_plan)
        p=require_product()
        if not p.subscription.authorize(plan,"CONTROL_ROOM"):
            raise HTTPException(403,"CONTROL_ROOM capability required")
        before=p.load_workspace(tenant,user); after=p.save_workspace(tenant,user,req.workspace)
        aid=p.audit_action(tenant,user,"WORKSPACE_UPDATE",f"{tenant}:{user}",before,after)
        return envelope(after,data_status="LOCAL_ONLY",provenance={"audit_id":aid})

    @app.post("/v1/follows/{target_id}")
    def follow_target(
        target_id: str,
        x_aetherus_tenant: str | None = Header(default=None),
        x_aetherus_user: str | None = Header(default=None),
        x_aetherus_plan: str = Header(default="FREE"),
    ):
        tenant,user,plan=identity(x_aetherus_tenant,x_aetherus_user,x_aetherus_plan)
        p=require_product()
        if not p.subscription.authorize(plan,"ALERTS"):
            raise HTTPException(403,"ALERTS capability required")
        result=p.follow_target(tenant,user,target_id); aid=p.audit_action(tenant,user,"FOLLOW",target_id,None,result)
        return envelope(result,data_status="LOCAL_ONLY",provenance={"audit_id":aid})

    @app.get("/v1/follows/{target_id}/alerts")
    def follow_alerts(
        target_id: str,
        revision_no: int = Query(ge=1),
        summary: str = "Revision changed",
        x_aetherus_tenant: str | None = Header(default=None),
        x_aetherus_user: str | None = Header(default=None),
        x_aetherus_plan: str = Header(default="FREE"),
    ):
        tenant,user,plan=identity(x_aetherus_tenant,x_aetherus_user,x_aetherus_plan)
        p=require_product()
        if not p.subscription.authorize(plan,"ALERTS"):
            raise HTTPException(403,"ALERTS capability required")
        p.restore_follow(tenant,user,target_id)
        ctx=p.api_gateway.context(tenant_id=tenant,user_id=user)
        rows=p.follows.alerts_for_revision(ctx,target_id,revision_no,summary)
        return envelope(rows,data_status="OK" if rows else "UNAVAILABLE")

    @app.post("/v1/assistant/tool")
    def assistant_tool(
        req: AssistantToolRequest,
        x_aetherus_tenant: str | None = Header(default=None),
        x_aetherus_user: str | None = Header(default=None),
        x_aetherus_plan: str = Header(default="FREE"),
    ):
        tenant,user,plan=identity(x_aetherus_tenant,x_aetherus_user,x_aetherus_plan)
        p=require_product()
        scientific=req.tool_name=="run_validation_scenario"
        if scientific and (not req.allow_scientific_tool or not p.subscription.authorize(plan,"SCENARIO")):
            raise HTTPException(403,"Scientific scenario tool requires explicit approval and SCENARIO capability")
        try:
            result=p.tool_orchestrator.call(req.tool_name,req.args,authorized=True,allow_scientific_tool=req.allow_scientific_tool)
        except (PermissionError,KeyError,TypeError,ValueError) as exc:
            raise HTTPException(422,str(exc)) from exc
        aid=p.audit_action(tenant,user,"ASSISTANT_TOOL",req.tool_name,{"args":req.args},{"result_hash_only":True})
        return envelope(jsonable(result),data_status="RESEARCH_ONLY" if scientific else "OK",provenance={"audit_id":aid,"tool":req.tool_name},warnings=["LLM/tool layer cannot create spacecraft commands or invent scientific values."])

    @app.post("/v1/research/datasets")
    def create_research_dataset(req: ResearchDatasetRequest):
        try:
            artifact=require_product().create_research_dataset(
                dataset_key=req.dataset_key,version=req.version,domain=req.domain,
                record_type=req.record_type,license_policy=req.license_policy,
            )
        except ValueError as exc:
            raise HTTPException(422,str(exc)) from exc
        return envelope(
            {"manifest":artifact["manifest"]},data_status="VALIDATED_PIPELINE",
            provenance={"dataset_hash":artifact["manifest"]["dataset_hash"]},
        )

    @app.get("/v1/research/datasets")
    def list_research_datasets():
        rows=require_product().list_research_datasets()
        return envelope(rows,data_status="OK" if rows else "UNAVAILABLE")

    @app.get("/v1/research/datasets/{dataset_key}")
    def download_research_dataset(dataset_key: str, format: str = Query(default="manifest", pattern="^(manifest|json|csv)$")):
        artifact=require_product().get_research_dataset(dataset_key)
        if artifact is None:
            raise HTTPException(404,"dataset not found")
        if format=="json":
            return Response(
                content=artifact["json_text"].encode("utf-8"),media_type="application/json",
                headers={"Content-Disposition":f'attachment; filename="{dataset_key}.json"'},
            )
        if format=="csv":
            return Response(
                content=artifact["csv_text"].encode("utf-8"),media_type="text/csv; charset=utf-8",
                headers={"Content-Disposition":f'attachment; filename="{dataset_key}.csv"'},
            )
        return Response(
            content=json.dumps(artifact["manifest"],sort_keys=True,separators=(",",":"),ensure_ascii=False).encode("utf-8"),
            media_type="application/json",
            headers={"Content-Disposition":f'attachment; filename="{dataset_key}.manifest.json"'},
        )

    @app.put("/v1/operations/private/{key}")
    def put_private_state(
        key: str,
        req: PrivateStateUpdate,
        x_aetherus_tenant: str | None = Header(default=None),
        x_aetherus_user: str | None = Header(default=None),
        x_aetherus_plan: str = Header(default="FREE"),
    ):
        tenant,user,plan=identity(x_aetherus_tenant,x_aetherus_user,x_aetherus_plan)
        if plan not in {"OPERATIONS","CONTROL / INSTITUTION","PRO / RESEARCH"}:
            raise HTTPException(403,"operations capability required")
        result=require_product().put_private_state(tenant_id=tenant,user_id=user,key=key,value=req.value)
        return envelope(result["value"],data_status="PRIVATE",provenance={"tenant_id":tenant})

    @app.get("/v1/operations/private/{key}")
    def get_private_state(
        key: str,
        x_aetherus_tenant: str | None = Header(default=None),
        x_aetherus_user: str | None = Header(default=None),
        x_aetherus_plan: str = Header(default="FREE"),
    ):
        tenant,_,plan=identity(x_aetherus_tenant,x_aetherus_user,x_aetherus_plan)
        if plan not in {"OPERATIONS","CONTROL / INSTITUTION","PRO / RESEARCH"}:
            raise HTTPException(403,"operations capability required")
        result=require_product().get_private_state(tenant_id=tenant,key=key)
        if result is None:
            raise HTTPException(404,"private state not found")
        return envelope(result,data_status="PRIVATE",provenance={"tenant_id":tenant})

    @app.get("/v1/operations/audit")
    def operations_audit(
        x_aetherus_tenant: str | None = Header(default=None),
        x_aetherus_user: str | None = Header(default=None),
        x_aetherus_plan: str = Header(default="FREE"),
    ):
        tenant,_,plan=identity(x_aetherus_tenant,x_aetherus_user,x_aetherus_plan)
        if plan not in {"OPERATIONS","CONTROL / INSTITUTION","PRO / RESEARCH"}:
            raise HTTPException(403,"operations capability required")
        return envelope(require_product().operations_audit(tenant_id=tenant),data_status="APPEND_ONLY")

    @app.post("/v1/operations/jobs")
    def submit_operation_job(
        req: OperationJobRequest,
        x_aetherus_tenant: str | None = Header(default=None),
        x_aetherus_user: str | None = Header(default=None),
        x_aetherus_plan: str = Header(default="FREE"),
    ):
        tenant,user,plan=identity(x_aetherus_tenant,x_aetherus_user,x_aetherus_plan)
        if plan not in {"OPERATIONS","CONTROL / INSTITUTION","PRO / RESEARCH"}:
            raise HTTPException(403,"operations capability required")
        try:
            result=require_product().submit_operation_job(
                operation=req.operation,payload=req.payload,
                idempotency_key=f"{tenant}:{req.idempotency_key}",
                run_now=req.run_now,max_attempts=req.max_attempts,
            )
        except (KeyError,ValueError) as exc:
            raise HTTPException(422,str(exc)) from exc
        require_product().audit_action(tenant,user,"JOB_SUBMIT",result["job_id"],None,{"status":result["status"]})
        return envelope(result,data_status=result["status"],provenance={"tenant_id":tenant})

    @app.get("/v1/operations/jobs/{job_id}")
    def operation_job(
        job_id: str,
        x_aetherus_tenant: str | None = Header(default=None),
        x_aetherus_user: str | None = Header(default=None),
        x_aetherus_plan: str = Header(default="FREE"),
    ):
        tenant,_,plan=identity(x_aetherus_tenant,x_aetherus_user,x_aetherus_plan)
        if plan not in {"OPERATIONS","CONTROL / INSTITUTION","PRO / RESEARCH"}:
            raise HTTPException(403,"operations capability required")
        result=require_product().get_operation_job(job_id)
        if result is None or not str(result["idempotency_key"]).startswith(f"{tenant}:"):
            raise HTTPException(404,"job not found")
        return envelope(result,data_status=result["status"],provenance={"tenant_id":tenant})

    @app.get("/v1/platform/readiness")
    def platform_readiness():
        p=require_product()
        env=os.environ.get("AETHERUS_ENV","local").lower()
        tests_pass=os.environ.get("AETHERUS_TESTS_PASS","0")=="1"
        backup_verified=os.environ.get("AETHERUS_BACKUP_VERIFIED","0")=="1"
        production_secrets=os.environ.get("AETHERUS_PRODUCTION_SECRETS_CONFIGURED","0")=="1"
        staging_secret=env=="staging" and os.environ.get("AETHERUS_AUTH_MODE")=="hmac-staging" and len(os.environ.get("AETHERUS_AUTH_HMAC_SECRET",""))>=32
        secrets_configured=production_secrets if env=="production" else staging_secret
        live_verified=os.environ.get("AETHERUS_LIVE_PROVIDER_VERIFIED","0")=="1"
        result=p.deployment.readiness(tests_pass=tests_pass,backup_verified=backup_verified,secrets_configured=secrets_configured,live_provider_verified=live_verified)
        production_blockers=[]
        if not production_secrets:production_blockers.append("BLOCKED_PRODUCTION_SECRETS")
        if not live_verified:production_blockers.append("BLOCKED_LIVE_PROVIDER_VERIFICATION")
        result.update({
            "production_ready":tests_pass and backup_verified and production_secrets and live_verified,
            "production_blockers":production_blockers,
            "secret_scope":"PRODUCTION_SECRET_MANAGER" if production_secrets else ("STAGING_HMAC" if staging_secret else "UNCONFIGURED"),
        })
        return envelope(result,data_status="OK" if result["staging_ready"] else "VALIDATION_PENDING")
