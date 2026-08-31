#!/usr/bin/env python3
"""Build a non-production global low-LOD cloud artifact from live NOAA GFS."""

import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / 'aws' / 'gfs-cloud-global-low'


def load_handler():
    os.environ.setdefault('CACHE_BUCKET', 'LOCAL_BUILD_NO_UPLOAD')
    os.environ.setdefault('CACHE_REGION', 'us-east-2')
    os.environ.setdefault('AWS_DEFAULT_REGION', 'us-east-2')
    os.environ.setdefault('AWS_EC2_METADATA_DISABLED', 'true')
    sys.path.insert(0, str(SOURCE_DIR))
    spec = importlib.util.spec_from_file_location(
        'earthus_gfs_global_low_handler', SOURCE_DIR / 'handler.py'
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output-dir', required=True)
    args = parser.parse_args()
    output = Path(args.output_dir).resolve()
    output.mkdir(parents=True, exist_ok=True)

    handler = load_handler()
    run_time, source_url, raw = handler.fetch_latest()
    fields, latitudes, longitudes, shape, decoder = handler.decode_messages(raw)
    payload, metadata = handler.build_global_layers(fields, latitudes, longitudes, shape)
    manifest = handler.build_manifest(
        run_time, source_url, payload, metadata, decoder
    )
    manifest['sourceByteLength'] = len(raw)
    manifest['sourceSha256'] = hashlib.sha256(raw).hexdigest()
    manifest['densitySha256'] = hashlib.sha256(payload).hexdigest()
    manifest['production'] = False
    manifest['artifactState'] = 'LOCAL_GENERATED_FROM_LIVE_NOAA_SOURCE'
    manifest['deploymentEvidence'] = None
    (output / 'density-bands.u8').write_bytes(payload)
    (output / 'manifest.json').write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + '\n',
        encoding='utf-8',
    )
    print(json.dumps({
        'outputDir': str(output),
        'validAt': manifest['cloudState']['validAt'],
        'sourceUrl': source_url,
        'dimensions': manifest['dimensions'],
        'byteLength': manifest['byteLength'],
        'layers': manifest['layers'],
        'production': manifest['production'],
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()
