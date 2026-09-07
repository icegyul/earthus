#!/usr/bin/env bash
# STEP 54 — acquire NOAA GDP hourly QC observations (CC BY 4.0) for the preregistered EAC validation domain.
# Mechanism identical to STEP 15 (same ERDDAP tabledap endpoint, same seven fields, same quarterly layout, same 3 deg
# request margin around the registered box); only the region box and the period differ, both fixed by the STEP 53 lock.
# EAC box (STEP 53): 40S-25S / 150E-160E. Request margin +-3 deg: -43..-22 latitude, 147..163 longitude.
# Period (STEP 53): 2010-01-01T12:00:00Z .. 2015-12-31T12:00:00Z; quarters 2010q1..2015q4 plus 2016q1 so that a window
# starting on 2015-12-31 still has its full t0+72h coverage. Raw files are written once and never modified.
# This script performs NO scientific computation: no trajectory, endpoint, delta, Theta, bootstrap or comparison.
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/data/research/step54/noaa-gdp-hourly-qc"
LOG="$OUT/acquisition-log.jsonl"
mkdir -p "$OUT"
BASE="https://erddap.aoml.noaa.gov/gdp/erddap/tabledap/drifter_hourly_qc.csv?ID%2Ctime%2Clatitude%2Clongitude%2Cve%2Cvn%2Cgap%2Cdrogue_lost_date%2Ctypebuoy"
S=-43; N=-22; W=147; E=163
R=EAC
for year in $(seq 2010 2016); do
  for q in 1 2 3 4; do
    if [ "$year" = "2016" ] && [ "$q" != "1" ]; then continue; fi
    case $q in
      1) t0="$year-01-01T00:00:00Z"; t1="$year-04-03T12:00:00Z";;
      2) t0="$year-04-01T00:00:00Z"; t1="$year-07-03T12:00:00Z";;
      3) t0="$year-07-01T00:00:00Z"; t1="$year-10-03T12:00:00Z";;
      4) t0="$year-10-01T00:00:00Z"; t1="$((year+1))-01-03T12:00:00Z";;
    esac
    f="$OUT/$R-$year-q$q.csv"
    if [ -s "$f" ]; then echo "$R $year q$q reused"; continue; fi
    url="$BASE&time%3E%3D$t0&time%3C%3D$t1&latitude%3E%3D$S&latitude%3C%3D$N&longitude%3E%3D$W&longitude%3C%3D$E"
    code=$(curl -s --retry 4 --retry-delay 20 --max-time 900 -o "$f.part" -w "%{http_code}" "$url")
    ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    if [ "$code" = "200" ]; then
      mv "$f.part" "$f"; size=$(stat -c %s "$f"); sha=$(sha256sum "$f" | cut -d' ' -f1)
      echo "{\"file\":\"$(basename "$f")\",\"query\":\"$url\",\"retrievedAtUTC\":\"$ts\",\"httpStatus\":200,\"bytes\":$size,\"sha256\":\"$sha\"}" >> "$LOG"
      echo "$R $year q$q ok $size"
    elif [ "$code" = "404" ]; then
      # ERDDAP returns 404 when no rows match (no drifters in the box/period) — keep an explicit empty marker
      printf 'ID,time,latitude,longitude,ve,vn,gap,drogue_lost_date,typebuoy\n,UTC,degrees_north,degrees_east,m/s,m/s,seconds,UTC,\n' > "$f"; rm -f "$f.part"
      sha=$(sha256sum "$f" | cut -d' ' -f1)
      echo "{\"file\":\"$(basename "$f")\",\"query\":\"$url\",\"retrievedAtUTC\":\"$ts\",\"httpStatus\":404,\"note\":\"no matching rows; header-only file written\",\"bytes\":$(stat -c %s "$f"),\"sha256\":\"$sha\"}" >> "$LOG"
      echo "$R $year q$q empty(404)"
    else
      rm -f "$f.part"; echo "$R $year q$q FAILED http=$code"
      echo "{\"file\":\"$(basename "$f")\",\"query\":\"$url\",\"retrievedAtUTC\":\"$ts\",\"httpStatus\":$code,\"error\":true}" >> "$LOG"
    fi
  done
done
echo "DONE $(ls "$OUT"/*.csv 2>/dev/null | wc -l) files"
