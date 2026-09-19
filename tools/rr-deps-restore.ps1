# 저장 인코딩: UTF-8 with BOM 필수 — BOM 없으면 Windows PowerShell 5.1 이 한글을 cp949 로 읽어 구문 오류가 난다(2026-09-20 실측).
# tools/rr-deps-restore.ps1 — services/research-runtime/.deps 를 새 클론에서 다시 만든다 (Windows PowerShell 5.1 호환).
#
# 정본: services/research-runtime/dependencies.lock.txt (40개 고정, parcels==3.1.4)
# 파이썬: 3.12 만. 로컬 .deps 는 cp312 win_amd64 바이너리다. 3.14 로는 numpy 가 import 되지 않는다(2026-09-20 실측).
# 잠금 머리말: "Python 3.12.14, Windows AMD64". 이 PC 의 3.12.x 면 된다(3.12.10 에서 80/80 통과 실측).
#
# 쓰기(저장소 루트에서):
#   powershell -ExecutionPolicy Bypass -File tools\rr-deps-restore.ps1
#   powershell -ExecutionPolicy Bypass -File tools\rr-deps-restore.ps1 -Force
#   powershell -ExecutionPolicy Bypass -File tools\rr-deps-restore.ps1 -Python "C:\Python312\python.exe"
# .deps.new / .deps.bak-* 는 현재 .gitignore(".deps/")에 걸리지 않는다 — ".deps*/" 로 넓힐 것을 권한다.
param(
  [switch]$Force,
  [string]$Python = ""
)
$ErrorActionPreference = "Stop"

function Fail([string]$msg) {
  Write-Host "rr-deps-restore: 실패 — $msg" -ForegroundColor Red
  exit 1
}

$Root = Split-Path -Parent $PSScriptRoot
$Svc  = Join-Path $Root "services\research-runtime"
$Lock = Join-Path $Svc "dependencies.lock.txt"
$Deps = Join-Path $Svc ".deps"
$Tmp  = Join-Path $Svc ".deps.new"

if (-not (Test-Path $Lock)) { Fail "잠금 파일이 없다: $Lock" }
if (-not (Select-String -Path $Lock -Pattern '^parcels==3\.1\.4$' -Quiet)) {
  Fail "잠금 파일에 parcels==3.1.4 고정이 없다 — 정본이 바뀌었는지 먼저 확인할 것"
}

# ── 파이썬 3.12 찾기 ─────────────────────────────────────────────
$pyExe = $null; $pyArgs = @()
$candidates = @()
if ($Python -ne "") { $candidates += ,@($Python) }
$candidates += ,@("py", "-3.12")
$candidates += ,@("python")
foreach ($c in $candidates) {
  $exe = $c[0]; $pre = @(); if ($c.Count -gt 1) { $pre = $c[1..($c.Count - 1)] }
  try {
    & $exe @pre -c "import sys; sys.exit(0 if sys.version_info[:2]==(3,12) else 1)" 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $pyExe = $exe; $pyArgs = $pre; break }
  } catch { }
}
if ($null -eq $pyExe) {
  Fail "Python 3.12 을 찾지 못했다. .deps 는 cp312 전용이다(3.14 불가). -Python <3.12 python.exe 경로> 로 지정할 것"
}
$ver = & $pyExe @pyArgs -c "import sys; print('%d.%d.%d' % sys.version_info[:3])"
Write-Host "rr-deps-restore: python = $pyExe $($pyArgs -join ' ') ($ver)"

# ── 기존 .deps ──────────────────────────────────────────────────
if ((Test-Path $Deps) -and ((Get-ChildItem -Force $Deps | Measure-Object).Count -gt 0) -and (-not $Force)) {
  Fail ".deps 가 이미 있다($Deps). 덮어쓰려면 -Force (기존 것은 .deps.bak-<시각> 으로 옮긴다)"
}

if (Test-Path $Tmp) { Remove-Item -Recurse -Force $Tmp -Confirm:$false }
Write-Host "rr-deps-restore: $Lock -> $Tmp 설치 (휠 우선 — asciitree 0.3.3 처럼 sdist 뿐인 패키지가 있을 수 있다)"
& $pyExe @pyArgs -m pip install --disable-pip-version-check --no-input --prefer-binary --target $Tmp -r $Lock
if ($LASTEXITCODE -ne 0) {
  if (Test-Path $Tmp) { Remove-Item -Recurse -Force $Tmp -Confirm:$false }
  Fail "pip 설치 실패. 흔한 원인: (1) 3.12 가 아님 (2) 이 플랫폼용 휠이 없는 버전 (3) 네트워크 차단. 기존 .deps 는 건드리지 않았다"
}

# ── 검증 ───────────────────────────────────────────────────────
$oldPP = $env:PYTHONPATH
$env:PYTHONPATH = "$Svc;$Tmp"
Push-Location $Svc
try {
  $got = & $pyExe @pyArgs -s -c "import parcels, numpy; print(parcels.__version__)"
  $rc = $LASTEXITCODE
} finally {
  Pop-Location
  $env:PYTHONPATH = $oldPP
}
if ($rc -ne 0) {
  Remove-Item -Recurse -Force $Tmp -Confirm:$false
  Fail "설치는 됐지만 parcels import 가 실패했다"
}
if (-not ("$got".Trim().StartsWith("3.1.4"))) {
  Remove-Item -Recurse -Force $Tmp -Confirm:$false
  Fail "parcels 버전이 3.1.4 가 아니다: $got"
}

# ── 교체 ───────────────────────────────────────────────────────
if (Test-Path $Deps) {
  $bak = Join-Path $Svc (".deps.bak-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
  Move-Item $Deps $bak
  Write-Host "rr-deps-restore: 기존 .deps -> $bak (확인 뒤 직접 지울 것)"
}
Move-Item $Tmp $Deps
$n = (Get-ChildItem -Directory (Join-Path $Deps "*.dist-info") | Measure-Object).Count
Write-Host "rr-deps-restore: 완료 — parcels $got, $n 패키지" -ForegroundColor Green
Write-Host 'Test: cd services\research-runtime; $env:PYTHONPATH = ".;.deps"; python -m unittest discover -s tests'
