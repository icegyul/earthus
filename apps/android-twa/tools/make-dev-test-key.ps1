# EARTHUS 로컬 시험 키 만들기 (2026-09-24) — ADB 로 깔아 보는 시험 APK 서명용. **Play 에 올리는 키가 아니다.**
# Play 업로드 키는 make-upload-key.ps1 로 PD 가 따로 만든다.
#
# 만드는 것 (저장소 밖):
#   %USERPROFILE%\.earthus-android\earthus-dev-test.jks
#   %USERPROFILE%\.earthus-android\dev-keystore.properties   (storeFile / storePassword / keyAlias / keyPassword)
# 비밀번호는 무작위로 만들어 properties 파일에만 적는다. 화면에 찍지 않는다.
# 이미 있으면 덮어쓰지 않고 멈춘다(지문이 바뀌면 이미 올린 assetlinks 가 맞지 않게 된다).
#
# 쓰는 법: powershell -ExecutionPolicy Bypass -File apps\android-twa\tools\make-dev-test-key.ps1

$ErrorActionPreference = 'Stop'

$jdk = $env:JAVA_HOME
if (-not $jdk) { $jdk = 'C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot' }
$keytool = Join-Path $jdk 'bin\keytool.exe'
if (-not (Test-Path $keytool)) { throw "keytool 이 없다: $keytool (JAVA_HOME 확인)" }

$dir = Join-Path $env:USERPROFILE '.earthus-android'
$jks = Join-Path $dir 'earthus-dev-test.jks'
$props = Join-Path $dir 'dev-keystore.properties'
$alias = 'earthus-dev-test'

if ((Test-Path $jks) -or (Test-Path $props)) {
    Write-Output "이미 있다 — 덮어쓰지 않는다: $dir"
    exit 0
}
New-Item -ItemType Directory -Force -Path $dir | Out-Null

# 무작위 비밀번호 32자(영숫자). RNGCryptoServiceProvider — PS 5.1 에서도 된다.
$chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'.ToCharArray()
$bytes = New-Object byte[] 32
$rng = New-Object System.Security.Cryptography.RNGCryptoServiceProvider
$rng.GetBytes($bytes)
$pw = -join ($bytes | ForEach-Object { $chars[$_ % $chars.Length] })

# keytool 에 비밀번호를 명령줄 인자로 넘기지 않는다(프로세스 목록에 보인다) — 환경변수로 넘긴다.
$env:EARTHUS_DEV_KS_PW = $pw
try {
    & $keytool -genkeypair -v -keystore $jks -storetype PKCS12 -alias $alias `
        -keyalg RSA -keysize 2048 -validity 10000 `
        -dname 'CN=EARTHUS local test (not for Play), O=EARTHUS, C=KR' `
        -storepass:env EARTHUS_DEV_KS_PW -keypass:env EARTHUS_DEV_KS_PW | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "keytool 실패 ($LASTEXITCODE)" }
} finally {
    Remove-Item Env:\EARTHUS_DEV_KS_PW -ErrorAction SilentlyContinue
}

# Gradle 이 읽는 properties. 역슬래시는 / 로 바꿔 적는다(properties 에서 \ 는 이스케이프다).
$jksForProps = $jks -replace '\\', '/'
$lines = @(
    '# EARTHUS 로컬 시험 키 — Play 업로드 키 아님. 저장소에 넣지 말 것.',
    "storeFile=$jksForProps",
    "storePassword=$pw",
    "keyAlias=$alias",
    "keyPassword=$pw"
)
[System.IO.File]::WriteAllText($props, (($lines -join "`n") + "`n"), (New-Object System.Text.UTF8Encoding($false)))
$pw = $null

# 지문만 보여 준다(공개 정보 — assetlinks 에 들어간다).
$env:EARTHUS_DEV_KS_PW = (Get-Content $props | Where-Object { $_ -like 'storePassword=*' }) -replace '^storePassword=', ''
try {
    $out = & $keytool -list -v -keystore $jks -alias $alias -storepass:env EARTHUS_DEV_KS_PW
} finally {
    Remove-Item Env:\EARTHUS_DEV_KS_PW -ErrorAction SilentlyContinue
}
$sha = ($out | Select-String -Pattern 'SHA256:\s*([0-9A-F:]+)').Matches | Select-Object -First 1
Write-Output "만들었다: $jks"
Write-Output "시험 키 SHA-256: $($sha.Groups[1].Value)"
