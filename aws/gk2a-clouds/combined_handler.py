# -*- coding: utf-8 -*-
"""Drop-in scheduled entrypoint for existing gk2a-clouds Lambda.

Normal scheduled executions keep the proven imagery pipeline and then add truth-gated
CTH. Explicit cthOnly diagnostic calls bypass imagery completely so deployment
verification cannot accidentally trigger the full legacy satellite render workload.
"""
import json

from handler import handler as imagery_handler
from cth_pipeline_lcc import run as run_cth


def handler(event=None, context=None):
    event = event or {}

    if event.get('cthOnly') is True:
        try:
            cth = run_cth()
            return {
                'ok': True,
                'imagerySkipped': True,
                'cth': cth,
                'cthReady': True,
                'cthError': None,
            }
        except Exception as exc:  # diagnostic must report the real failure
            error = str(exc)[:240]
            print('[gk2a-cth] diagnostic failure:', repr(exc))
            return {
                'ok': False,
                'imagerySkipped': True,
                'cth': None,
                'cthReady': False,
                'cthError': error,
            }

    imagery = imagery_handler(event, context)
    cth = None
    cth_error = None
    if event.get('cth') is not False:
        try:
            cth = run_cth()
        except Exception as exc:
            cth_error = str(exc)[:240]
            print('[gk2a-cth] fail-soft:', repr(exc))

    return {
        'ok': bool(imagery.get('ok')),
        'imagery': imagery,
        'cth': cth,
        'cthReady': bool(cth),
        'cthError': cth_error,
    }


def lambda_handler(event=None, context=None):
    return handler(event, context)


if __name__ == '__main__':
    print(json.dumps(handler({'cthOnly': True}), ensure_ascii=False, indent=2))
