# EARTHUS Play 업로드 키 만들기 — PD 가 직접 한 번 돌린다 (2026-09-24, 지시서 Phase 1 PD 몫 1 · §3-6 · R6)
#
# 무엇: Google Play 에 AAB 를 올릴 때 서명하는 **업로드 키**를 만든다. 앱 서명 키(3개)는 Google 이 보관한다(Play App Signing).
#   업로드 키를 잃어도 Play Console 에서 재설정할 수 있지만 며칠이 걸린다 → 저장소 밖 두 곳에 백업한다.
# 어디에: 기본 %USERPROFILE%\.earthus-android\ (저장소 밖). git 저장소 안이면 멈춘다.
# 비밀번호: 화면에 보이지 않게 두 번 묻는다. keytool 에는 명령줄 인자가 아니라 환경변수로 넘긴다(프로세스 목록 노출 방지).
#   Gradle 이 읽을 수 있게 같은 폴더의 upload-keystore.properties 에만 적는다. 채팅·문서·커밋에 적지 않는다(HANDOVER §7).
# 출력: 업로드 키 SHA-256 지문(공개 정보 — assetlinks.json 에 들어간다).
#
# 쓰는 법 (PowerShell 5.1):
#   powershell -ExecutionPolicy Bypass -File apps\android-twa\tools\make-upload-key.ps1
#   powershell -ExecutionPolicy Bypass -File apps\android-twa\tools\make-upload-key.ps1 -OutDir 'E:\earthus-keys'
# 그 다음:
#   node apps\android-twa\tools\make-assetlinks.mjs --fp <아래 SHA-256> --out assetlinks.json

param(
    [string]$OutDir = (Join-Path $env:USERPROFILE '.earthus-android'),
    [string]$Alias = 'earthus-upload',
    [string]$CommonName = 'EARTHUS'
)

$ErrorActionPreference = 'Stop'

$jdk = $env:JAVA_HOME
if (-not $jdk) { $jdk = 'C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot' }
$keytool = Join-Path $jdk 'bin\keytool.exe'
if (-not (Test-Path $keytool)) { throw "keytool 이 없다: $keytool (JAVA_HOME 을 JDK 17 로)" }

$OutDir = [System.IO.Path]::GetFullPath($OutDir)

# 저장소 안이면 멈춘다 — 위로 올라가며 .git 을 찾는다(폴더를 만들기 전에 본다).
$probe = $OutDir
while ($probe) {
    if (Test-Path (Join-Path $probe '.git')) {
        throw "git 저장소 안이다: $probe — 키는 저장소 밖에 둔다(R6)"
    }
    $parent = Split-Path $probe -Parent
    if ($parent -eq $probe) { break }
    $probe = $parent
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$jks = Join-Path $OutDir 'earthus-upload.jks'
$props = Join-Path $OutDir 'upload-keystore.properties'
if ((Test-Path $jks) -or (Test-Path $props)) {
    throw "이미 있다: $jks — 덮어쓰지 않는다. 새로 만들려면 기존 파일을 백업한 뒤 옮긴다(지문이 바뀌면 assetlinks·Play 등록을 다시 해야 한다)."
}

function ConvertTo-Plain([System.Security.SecureString]$s) {
    $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}

$p1 = ConvertTo-Plain (Read-Host -AsSecureString '업로드 키 비밀번호(12자 이상)')
$p2 = ConvertTo-Plain (Read-Host -AsSecureString '한 번 더')
if ($p1 -ne $p2) { throw '두 비밀번호가 다르다' }
if ($p1.Length -lt 12) { throw '12자 이상으로' }
if ($p1.Contains("`n") -or $p1.Contains("`r")) { throw '줄바꿈은 쓸 수 없다' }
# (2026-09-24 적대 검수 추가) 인쇄 가능한 ASCII(영문·숫자·기호)만 받는다. app/build.gradle 은 properties 를
# Properties.load(InputStream) = ISO-8859-1 로 읽는데 이 스크립트는 UTF-8 로 쓴다. 한글 등이 섞이면 keytool 이 쓴
# 비밀번호와 Gradle 이 읽은 비밀번호가 달라져 'keystore password was incorrect' 로만 실패한다. 공백도 막는다
# (properties 는 값 앞 공백을 버린다).
if ($p1 -cmatch '[^\x21-\x7E]') { throw '영문·숫자·기호(ASCII)만 — 한글·공백은 쓸 수 없다(Gradle 이 properties 를 ISO-8859-1 로 읽는다)' }
$p2 = $null

$env:EARTHUS_UPLOAD_KS_PW = $p1
try {
    & $keytool -genkeypair -keystore $jks -storetype PKCS12 -alias $Alias `
        -keyalg RSA -keysize 4096 -validity 10000 `
        -dname "CN=$CommonName, C=KR" `
        -storepass:env EARTHUS_UPLOAD_KS_PW -keypass:env EARTHUS_UPLOAD_KS_PW
    if ($LASTEXITCODE -ne 0) { throw "keytool 실패 ($LASTEXITCODE)" }
    $list = & $keytool -list -v -keystore $jks -alias $Alias -storepass:env EARTHUS_UPLOAD_KS_PW
} finally {
    Remove-Item Env:\EARTHUS_UPLOAD_KS_PW -ErrorAction SilentlyContinue
}

# Gradle 이 읽는 파일(저장소 밖). properties 는 \ 를 이스케이프로 읽으므로 / 로 적는다.
# properties 형식에서 \ : = 는 값 안에서도 특별하다 — 비밀번호에 있으면 이스케이프한다.
$pwEsc = $p1 -replace '\\', '\\' -replace ':', '\:' -replace '=', '\='
$jksForProps = $jks -replace '\\', '/'
$lines = @(
    '# EARTHUS Play 업로드 키 — 저장소·채팅·문서에 넣지 말 것. 이 파일과 .jks 를 저장소 밖 두 곳에 백업한다.',
    "storeFile=$jksForProps",
    "storePassword=$pwEsc",
    "keyAlias=$Alias",
    "keyPassword=$pwEsc"
)
[System.IO.File]::WriteAllText($props, (($lines -join "`n") + "`n"), (New-Object System.Text.UTF8Encoding($false)))
$p1 = $null
$pwEsc = $null

$sha = ($list | Select-String -Pattern 'SHA256:\s*([0-9A-F:]+)').Matches | Select-Object -First 1
Write-Output ''
Write-Output "업로드 키: $jks"
Write-Output "Gradle 설정: $props"
Write-Output "업로드 키 SHA-256: $($sha.Groups[1].Value)"
Write-Output ''
Write-Output '다음:'
Write-Output '  1) 위 두 파일을 저장소 밖 두 곳(예: 암호화 USB + 비밀번호 관리자 첨부)에 백업한다.'
Write-Output "  2) node apps\android-twa\tools\make-assetlinks.mjs --fp $($sha.Groups[1].Value) --out assetlinks.json"
Write-Output "  3) 업로드용 빌드: `$env:EARTHUS_KEYSTORE_PROPS = '$props' 후 gradlew.bat bundleRelease (README.md)"
