#!/usr/bin/env python3
"""EARTHUS AWS Lambda runtime inventory without secret values.

Read-only calls only. The report intentionally omits environment values, role/account
ARNs, function URLs, SSM parameters, object bodies, and log contents.
"""

import concurrent.futures
import json
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

import boto3
from botocore.exceptions import ClientError


ROOT = Path(__file__).resolve().parents[1]
AWS_ROOT = ROOT / "aws"
REGION = "ap-northeast-2"


def error_code(exc):
    return exc.response.get("Error", {}).get("Code", type(exc).__name__)


def local_function_units():
    units = set()
    for filename in AWS_ROOT.glob("*/handler.py"):
        units.add(filename.parent.name)
    for filename in AWS_ROOT.glob("*/index.mjs"):
        units.add(filename.parent.name)
    return sorted(units)


def event_rule_names(policy):
    rules = []
    for statement in policy.get("Statement") or []:
        principal = statement.get("Principal")
        service = principal.get("Service") if isinstance(principal, dict) else None
        if service != "events.amazonaws.com":
            continue
        source_arn = None
        for conditions in (statement.get("Condition") or {}).values():
            if isinstance(conditions, dict):
                source_arn = (conditions.get("AWS:SourceArn")
                              or conditions.get("aws:SourceArn") or source_arn)
        if isinstance(source_arn, str):
            rules.append(source_arn.rsplit("/", 1)[-1])
    return sorted(set(rules))


def distribution(values):
    return {str(key): count for key, count in sorted(Counter(values).items(),
                                                      key=lambda item: str(item[0]))}


def main():
    lambda_client = boto3.client("lambda", region_name=REGION)
    events = boto3.client("events", region_name=REGION)
    logs = boto3.client("logs", region_name=REGION)
    cloudwatch = boto3.client("cloudwatch", region_name=REGION)

    deployed = []
    for page in lambda_client.get_paginator("list_functions").paginate():
        deployed.extend(page.get("Functions") or [])

    def inspect(base):
        name = base["FunctionName"]
        config = lambda_client.get_function_configuration(FunctionName=name)
        vpc = config.get("VpcConfig") or {}
        item = {
            "name": name,
            "runtime": config.get("Runtime"),
            "handler": config.get("Handler"),
            "architecture": (config.get("Architectures") or [None])[0],
            "timeoutSeconds": config.get("Timeout"),
            "memoryMb": config.get("MemorySize"),
            "ephemeralStorageMb": (config.get("EphemeralStorage") or {}).get("Size"),
            "packageType": config.get("PackageType"),
            "lastModified": config.get("LastModified"),
            "state": config.get("State"),
            "lastUpdateStatus": config.get("LastUpdateStatus"),
            "vpcAttached": bool(vpc.get("VpcId")),
            "subnetCount": len(vpc.get("SubnetIds") or []),
            "securityGroupCount": len(vpc.get("SecurityGroupIds") or []),
            "deadLetterConfigured": bool(
                (config.get("DeadLetterConfig") or {}).get("TargetArn")),
            "tracing": (config.get("TracingConfig") or {}).get("Mode"),
            "environmentNames": sorted(
                ((config.get("Environment") or {}).get("Variables") or {}).keys()),
            "logGroupConfigured": bool(
                (config.get("LoggingConfig") or {}).get("LogGroup")),
            "eventRuleNames": [],
            "functionUrl": None,
        }
        try:
            raw = lambda_client.get_policy(FunctionName=name)["Policy"]
            item["eventRuleNames"] = event_rule_names(json.loads(raw))
        except ClientError as exc:
            if error_code(exc) != "ResourceNotFoundException":
                item["resourcePolicyReadError"] = error_code(exc)
        try:
            url = lambda_client.get_function_url_config(FunctionName=name)
            cors = url.get("Cors") or {}
            item["functionUrl"] = {
                "authType": url.get("AuthType"),
                "allowMethods": sorted(cors.get("AllowMethods") or []),
                "allowOrigins": sorted(cors.get("AllowOrigins") or []),
            }
        except ClientError as exc:
            if error_code(exc) != "ResourceNotFoundException":
                item["functionUrlReadError"] = error_code(exc)
        return item

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        functions = list(executor.map(inspect, deployed))
    functions.sort(key=lambda item: item["name"])

    referenced_rules = sorted({rule for item in functions
                               for rule in item["eventRuleNames"]})
    rules = []
    for name in referenced_rules:
        try:
            rule = events.describe_rule(Name=name)
            rules.append({
                "name": name,
                "state": rule.get("State"),
                "scheduleExpression": rule.get("ScheduleExpression"),
                "eventBusName": rule.get("EventBusName") or "default",
            })
        except ClientError as exc:
            rules.append({"name": name, "readError": error_code(exc)})

    permission_probes = {}

    def probe(name, call):
        try:
            call()
            permission_probes[name] = "READABLE"
        except ClientError as exc:
            permission_probes[name] = error_code(exc)

    probe("events:ListRules", lambda: events.list_rules(Limit=1))
    if referenced_rules:
        probe("events:ListTargetsByRule", lambda: events.list_targets_by_rule(
            Rule=referenced_rules[0], Limit=1))
    probe("logs:DescribeLogGroups", lambda: logs.describe_log_groups(limit=1))
    probe("cloudwatch:DescribeAlarms", lambda: cloudwatch.describe_alarms(MaxRecords=1))
    now = datetime.now(timezone.utc)
    probe("cloudwatch:GetMetricStatistics", lambda: cloudwatch.get_metric_statistics(
        Namespace="AWS/Lambda", MetricName="Invocations",
        Dimensions=[{"Name": "FunctionName", "Value": functions[0]["name"]}],
        StartTime=now - timedelta(hours=1), EndTime=now, Period=3600,
        Statistics=["Sum"]))
    probe("lambda:ListEventSourceMappings", lambda: lambda_client.list_event_source_mappings(
        MaxItems=1))
    probe("lambda:GetFunctionConcurrency", lambda: lambda_client.get_function_concurrency(
        FunctionName=functions[0]["name"]))

    local = local_function_units()
    deployed_names = sorted(item["name"] for item in functions)
    summary = {
        "localFunctionUnits": len(local),
        "deployedFunctions": len(functions),
        "localOnly": sorted(set(local) - set(deployed_names)),
        "deployedOnly": sorted(set(deployed_names) - set(local)),
        "runtimes": distribution(item["runtime"] for item in functions),
        "architectures": distribution(item["architecture"] for item in functions),
        "timeoutsSeconds": distribution(item["timeoutSeconds"] for item in functions),
        "memoryMb": distribution(item["memoryMb"] for item in functions),
        "vpcAttached": sum(item["vpcAttached"] for item in functions),
        "deadLetterConfigured": sum(item["deadLetterConfigured"] for item in functions),
        "tracingActive": sum(item["tracing"] == "Active" for item in functions),
        "activeAndUpdated": sum(item["state"] == "Active"
                                and item["lastUpdateStatus"] == "Successful"
                                for item in functions),
        "logGroupConfigured": sum(item["logGroupConfigured"] for item in functions),
        "functionUrls": sum(item["functionUrl"] is not None for item in functions),
        "publicFunctionUrls": sum((item["functionUrl"] or {}).get("authType") == "NONE"
                                  for item in functions),
        "functionsWithEventRuleReference": sum(bool(item["eventRuleNames"])
                                               for item in functions),
        "eventRuleReferences": sum(len(item["eventRuleNames"]) for item in functions),
        "uniqueReferencedRules": len(rules),
        "enabledReferencedRules": sum(item.get("state") == "ENABLED" for item in rules),
    }
    output = {
        "schemaVersion": "earthus.aws-runtime-inventory.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds")
        .replace("+00:00", "Z"),
        "scope": "READ_ONLY_NO_SECRET_VALUES",
        "region": REGION,
        "summary": summary,
        "localFunctionUnits": local,
        "functions": functions,
        "rulesReferencedByLambdaPolicies": rules,
        "permissionProbes": permission_probes,
        "unknown": [
            "EventBridge rules not referenced by a Lambda resource policy",
            "EventBridge target lists and target health",
            "CloudWatch invocation/error/throttle metrics and alarms",
            "CloudWatch log retention and last successful execution",
            "event source mappings, reserved/provisioned concurrency",
            "IAM role policies and secret values",
            "monthly Lambda/NAT/S3/CloudWatch cost",
        ],
    }
    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
