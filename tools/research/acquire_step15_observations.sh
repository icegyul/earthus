#!/usr/bin/env bash
# STEP 15 — acquire NOAA GDP hourly QC observations (CC BY 4.0) for 2010-01-01..2020-12-31,
# four pre-registered regions with a 3° margin (a 72 h drift never exceeds ~2.5°), quarterly files.
# Raw files are written once and never modified; each request is logged with its query and UTC time.
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/data/research/step15/noaa-gdp-hourly-qc"
LOG="$OUT/acquisition-log.jsonl"
mkdir -p "$OUT"
BASE="https://erddap.aoml.noaa.gov/gdp/erddap/tabledap/drifter_hourly_qc.csv?ID%2Ctime%2Clatitude%2Clongitude%2Cve%2Cvn%2Cgap%2Cdrogue_lost_date%2Ctypebuoy"
declare -A S N W E
S[GS]=29; N[GS]=43; W[GS]=-78; E[GS]=-52
S[KE]=27; N[KE]=43; W[KE]=132; E[KE]=163
S[AG]=-43; N[AG]=-27; W[AG]=12; E[AG]=38
S[BM]=-43; N[BM]=-27; W[BM]=-63; E[BM]=-42
for year in $(seq 2010 2020); do
  for q in 1 2 3 4; do
    case $q in
      1) t0="$year-01-01T00:00:00Z"; t1="$year-04-03T12:00:00Z";;
      2) t0="$year-04-01T00:00:00Z"; t1="$year-07-03T12:00:00Z";;
      3) t0="$year-07-01T00:00:00Z"; t1="$year-10-03T12:00:00Z";;
      4) t0="$year-10-01T00:00:00Z"; t1="$((year+1))-01-03T12:00:00Z";;
    esac
    for r in GS KE AG BM; do
      f="$OUT/$r-$year-q$q.csv"
      if [ -s "$f" ]; then continue; fi
      url="$BASE&time%3E%3D$t0&time%3C%3D$t1&latitude%3E%3D${S[$r]}&latitude%3C%3D${N[$r]}&longitude%3E%3D${W[$r]}&longitude%3C%3D${E[$r]}"
      code=$(curl -s --retry 4 --retry-delay 20 --max-time 900 -o "$f.part" -w "%{http_code}" "$url")
      ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
      if [ "$code" = "200" ]; then
        mv "$f.part" "$f"; size=$(stat -c %s "$f"); sha=$(sha256sum "$f" | cut -d' ' -f1)
        echo "{\"file\":\"$(basename "$f")\",\"query\":\"$url\",\"retrievedAtUTC\":\"$ts\",\"httpStatus\":200,\"bytes\":$size,\"sha256\":\"$sha\"}" >> "$LOG"
        echo "$r $year q$q ok $size"
      elif [ "$code" = "404" ]; then
        # ERDDAP returns 404 when no rows match the query (no drifters in the box/period) — keep an explicit empty marker
        printf 'ID,time,latitude,longitude,ve,vn,gap,drogue_lost_date,typebuoy\n,UTC,degrees_north,degrees_east,m/s,m/s,seconds,UTC,\n' > "$f"; rm -f "$f.part"
        sha=$(sha256sum "$f" | cut -d' ' -f1)
        echo "{\"file\":\"$(basename "$f")\",\"query\":\"$url\",\"retrievedAtUTC\":\"$ts\",\"httpStatus\":404,\"note\":\"no matching rows; header-only file written\",\"bytes\":$(stat -c %s "$f"),\"sha256\":\"$sha\"}" >> "$LOG"
        echo "$r $year q$q empty(404)"
      else
        rm -f "$f.part"; echo "$r $year q$q FAILED http=$code"
        echo "{\"file\":\"$(basename "$f")\",\"query\":\"$url\",\"retrievedAtUTC\":\"$ts\",\"httpStatus\":$code,\"error\":true}" >> "$LOG"
      fi
    done
  done
done
echo "DONE $(ls "$OUT"/*.csv | wc -l) files"
