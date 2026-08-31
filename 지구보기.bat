@echo off
rem EARTHUS 2.0 지구를 브라우저로 연다. 서버가 꺼져 있으면 켠다.
cd /d "%~dp0"
powershell -NoProfile -Command "if(-not (Get-NetTCPConnection -LocalPort 8777 -State Listen -ErrorAction SilentlyContinue)){ Start-Process -WindowStyle Minimized node -ArgumentList 'tools\dev_static_server.mjs','8777'; Start-Sleep -Seconds 2 }"
start http://localhost:8777/v2/
