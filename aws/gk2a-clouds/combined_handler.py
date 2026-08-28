# -*- coding: utf-8 -*-
"""Drop-in scheduled entrypoint for existing gk2a-clouds Lambda.

Runs the proven legacy imagery pipeline first, then the truth-gated CTH pipeline.
CTH failure never destroys the existing cloud imagery result; the browser falls
back to the observed shell/imagery when manifest generation is unavailable.
"""
import json

from handler import handler as imagery_handler
from cth_pipeline import run as run_cth


def handler(event=None, context=None):
    event=event or {}
    imagery=imagery_handler(event,context)
    cth=None
    cth_error=None
    # Explicit diagnostic calls may opt out; normal EventBridge executions include CTH.
    if event.get('cth') is not False:
        try:
            cth=run_cth()
        except Exception as exc:  # fail soft because the existing real satellite imagery remains valid
            cth_error=str(exc)[:240]
            print('[gk2a-cth] fail-soft:',repr(exc))
    result={'ok':bool(imagery.get('ok')),'imagery':imagery,'cth':cth,'cthReady':bool(cth),'cthError':cth_error}
    return result


def lambda_handler(event=None,context=None):
    """Compatibility alias for deployments that use lambda_handler naming."""
    return handler(event,context)


if __name__=='__main__':
    print(json.dumps(handler(),ensure_ascii=False,indent=2))
