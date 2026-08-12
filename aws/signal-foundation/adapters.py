# -*- coding: utf-8 -*-
"""기존 EARTHUS JSON 3종을 ``earth.signal.v1`` shadow batch로 바꾼다."""

from collections import Counter

from canonical import (convert_unit, make_envelope, parse_source_time, point_geometry,
                       stable_hash, supersedes_for, validate_envelope)


BATCH_SCHEMA = "earth.signal.batch.v1"
PROCESSOR_NAME = "earthus-signal-foundation"


def _processor(adapter, version):
    return {"name": PROCESSOR_NAME, "adapter": adapter, "version": version}


def _batch(adapter, version, input_meta, source_meta, signals, source_count, rejected=None,
           processed_at=None):
    rejected = rejected or []
    for signal in signals:
        errors = validate_envelope(signal)
        if errors:
            raise ValueError(f"{adapter} envelope 오류: {errors}")
    reasons = Counter(item.get("reason", "UNKNOWN") for item in rejected)
    return {
        "schemaVersion": BATCH_SCHEMA,
        "signalSchemaVersion": "earth.signal.v1",
        "adapter": _processor(adapter, version),
        "processedAt": processed_at,
        "input": input_meta,
        "source": source_meta,
        "sourceRecordCount": source_count,
        "canonicalRecordCount": len(signals),
        "rejectedCount": len(rejected),
        "rejectedByReason": dict(sorted(reasons.items())),
        "rejected": rejected[:100],
        "signals": signals,
    }


def _source(source_id, provider, dataset, *, url, terms, license_status, attribution,
            snapshot_generated_at=None, extra=None):
    out = {
        "sourceId": source_id, "provider": provider, "dataset": dataset,
        "url": url, "termsUrl": terms,
        "licenseStatus": license_status, "attribution": attribution,
        "snapshotGeneratedAt": snapshot_generated_at,
    }
    if extra:
        out.update(extra)
    return out


def adapt_kma_warning(doc, *, input_meta, processed_at, version="dev", previous=None):
    adapter = "kma-warning-v1"
    signals, rejected = [], []
    source_meta = _source(
        "kma.weather-warning.wrn-now-data",
        "Korea Meteorological Administration", "wrn_now_data",
        url="https://apihub.kma.go.kr/", terms="https://www.kogl.or.kr/",
        license_status="APPROVED_ATTRIBUTION",
        attribution="기상청 기상특보 (API허브)",
        snapshot_generated_at=doc.get("generated"))
    rows = [("ACTIVE", row) for row in doc.get("active", [])]
    rows += [("UPCOMING", row) for row in doc.get("upcoming", [])]
    for state, row in rows:
        region_id, kind = str(row.get("regionId") or ""), str(row.get("kind") or "")
        if not region_id or not kind:
            rejected.append({"reason": "PARSE_REJECTED", "source": row})
            continue
        issued, issued_err = parse_source_time(row.get("issuedKst"), "Asia/Seoul")
        effective, effective_err = parse_source_time(row.get("effectiveKst"), "Asia/Seoul")
        revision = str(row.get("issuedKst") or stable_hash(row))
        natural_key = f"{region_id}|{kind}|{row.get('effectiveKst') or ''}"
        # 기존 출력의 좌표는 특보구역 안 관측소 평균이며 경계가 아니다. 공식 polygon
        # mapping 전에는 Point로 승격하지 않고 REGION_UNMAPPED로 막는다.
        quality_reasons = ["REGION_UNMAPPED"]
        if issued_err:
            quality_reasons.append(issued_err)
        if effective_err:
            quality_reasons.append(effective_err)
        signal = make_envelope(
            provider="kma", dataset="weather-warning", natural_key=natural_key,
            revision=revision, signal_type="weather.warning", geometry=None,
            issued_at=issued, observed_at=None, valid_from=effective, valid_to=None,
            received_at=processed_at, source_timezone="Asia/Seoul",
            value=None, unit=None, source_value=row.get("level"), source_unit=None,
            missing_reason="REGION_UNMAPPED", source_crs="EPSG:4326",
            supersedes=supersedes_for(previous, natural_key, revision),
            source={**source_meta,
                    "representativePoint": point_geometry(row.get("lon"), row.get("lat")),
                    "spatialMeaning": "MEAN_OF_STATIONS_NOT_WARNING_BOUNDARY"},
            quality={"status": "UNKNOWN", "reasons": sorted(set(quality_reasons)),
                     "recordState": state, "levelRank": row.get("levelRank"), "n": 0},
            processor=_processor(adapter, version),
            source_time_raw={"issuedAt": row.get("issuedKst"),
                             "validFrom": row.get("effectiveKst")},
            time_precision={"issuedAt": "MINUTE", "observedAt": None,
                            "validFrom": "MINUTE", "validTo": None},
            region={"sourceRegionCode": region_id, "sourceRegionName": row.get("region"),
                    "canonicalRegionId": None, "mappingVersion": None,
                    "effectiveAt": None},
        )
        signals.append(signal)
    return _batch(adapter, version, input_meta, source_meta, signals, len(rows),
                  rejected, processed_at)


def adapt_kma_aws_temperature(doc, *, input_meta, processed_at, version="dev", previous=None):
    adapter = "kma-aws-temperature-v1"
    signals, rejected = [], []
    source_meta = _source(
        "kma.aws-1min.temperature",
        "Korea Meteorological Administration", "AWS 1-minute observations",
        url="https://apihub.kma.go.kr/", terms="https://www.kogl.or.kr/",
        license_status="APPROVED_ATTRIBUTION",
        attribution="기상청 방재기상관측 AWS 매분자료 (API허브)",
        snapshot_generated_at=doc.get("generated"))
    observed_raw = doc.get("observedKst")
    observed_at, time_error = parse_source_time(observed_raw, "Asia/Seoul")
    for row in doc.get("stations", []):
        station_id = str(row.get("id") or "")
        if not station_id:
            rejected.append({"reason": "PARSE_REJECTED", "source": row})
            continue
        value = row.get("ta")
        if value is not None:
            try:
                value = float(value)
            except (TypeError, ValueError):
                rejected.append({"reason": "PARSE_REJECTED", "stationId": station_id})
                continue
        natural_key = f"{station_id}|temperature|{observed_raw or ''}"
        revision = f"{observed_raw or 'unknown'}:{stable_hash({'ta': value, 'row': row}, 12)}"
        geometry = point_geometry(row.get("lon"), row.get("lat"))
        reasons = []
        if time_error:
            reasons.append(time_error)
        if geometry is None:
            reasons.append("SPATIAL_UNKNOWN")
        missing = "NOT_REPORTED" if value is None else None
        if missing:
            reasons.append(missing)
        signal = make_envelope(
            provider="kma", dataset="aws-1min-temperature", natural_key=natural_key,
            revision=revision, signal_type="weather.surface.temperature",
            geometry=geometry, issued_at=None, observed_at=observed_at,
            valid_from=observed_at, valid_to=None, received_at=processed_at,
            source_timezone="Asia/Seoul", value=value, unit="Cel",
            source_value=row.get("ta"), source_unit="Cel", missing_reason=missing,
            source_crs="EPSG:4326",
            vertical=({"reference": "MSL_M", "value": row.get("alt"), "unit": "m"}
                      if row.get("alt") is not None else None),
            supersedes=supersedes_for(previous, natural_key, revision),
            source=source_meta,
            quality={"status": "OK" if not reasons else "UNKNOWN", "reasons": reasons,
                     "n": 1 if value is not None else 0, "stationId": station_id,
                     "stationName": row.get("name")},
            processor=_processor(adapter, version),
            source_time_raw={"observedAt": observed_raw},
            time_precision={"issuedAt": None, "observedAt": "MINUTE",
                            "validFrom": "MINUTE", "validTo": None},
            region=None,
        )
        signals.append(signal)
    return _batch(adapter, version, input_meta, source_meta, signals,
                  len(doc.get("stations", [])), rejected, processed_at)


def adapt_tpw_grid(doc, *, input_meta, processed_at, version="dev", previous=None):
    adapter = "noaa-gfs-tpw-grid-v1"
    nx, ny = int(doc.get("nx") or 0), int(doc.get("ny") or 0)
    values = doc.get("tpw") or []
    if nx < 1 or ny < 1 or len(values) != nx * ny:
        raise ValueError(f"TPW shape 오류: {nx}x{ny}, values={len(values)}")
    issued_at, issued_error = parse_source_time(doc.get("issuedAt"))
    valid_at, valid_error = parse_source_time(doc.get("validAt") or doc.get("time"))
    signals = []
    source_unit = doc.get("unit") or "kg/m²"
    source_meta = _source(
        "noaa.ncep.gfs.pwat-0p25-f000",
        "NOAA/NCEP", "GFS 0.25 degree f000 · PWAT entire atmosphere",
        url=doc.get("providerUrl") or "https://www.nco.ncep.noaa.gov/pmb/products/gfs/",
        terms=doc.get("termsUrl") or "https://www.weather.gov/disclaimer",
        license_status=doc.get("licenseStatus") or "APPROVED_FREE",
        attribution=doc.get("attribution") or "NOAA/NCEP GFS · NOMADS",
        snapshot_generated_at=doc.get("generatedAt"))
    for iy in range(ny):
        lat = float(doc["lat0"]) + iy * float(doc["res"])
        for ix in range(nx):
            lon = float(doc["lon0"]) + ix * float(doc["res"])
            raw_value = values[iy * nx + ix]
            value, conversion = (convert_unit(raw_value, source_unit, "mm")
                                 if raw_value is not None else (None, None))
            missing = "NOT_REPORTED" if raw_value is None else None
            natural_key = f"{lon:.6f}|{lat:.6f}|tpw|{valid_at or doc.get('validAt') or ''}"
            revision = f"{issued_at or 'unknown'}:{stable_hash(raw_value, 12)}"
            reasons = [r for r in (issued_error, valid_error, missing) if r]
            signal = make_envelope(
                provider="noaa-ncep", dataset="gfs-0p25-pwat", natural_key=natural_key,
                revision=revision, signal_type="weather.total_column_water_vapour",
                geometry=point_geometry(lon, lat), issued_at=issued_at, observed_at=None,
                valid_from=valid_at, valid_to=None, received_at=processed_at,
                source_timezone="UTC", value=value, unit="mm", source_value=raw_value,
                source_unit=source_unit, conversion=conversion, missing_reason=missing,
                source_crs="EPSG:4326",
                supersedes=supersedes_for(previous, natural_key, revision),
                source=source_meta,
                quality={"status": "OK" if not reasons else "UNKNOWN", "reasons": reasons,
                         "n": 1 if raw_value is not None else 0,
                         "dataKind": doc.get("dataKind"), "gridResolutionDegrees": doc.get("res")},
                processor=_processor(adapter, version),
                source_time_raw={"issuedAt": doc.get("issuedAt"),
                                 "validFrom": doc.get("validAt") or doc.get("time")},
                time_precision={"issuedAt": "HOUR", "observedAt": None,
                                "validFrom": "HOUR", "validTo": None},
                region=None,
            )
            signals.append(signal)
    return _batch(adapter, version, input_meta, source_meta, signals, len(values), [],
                  processed_at)
