param([int]$Port = 8788, [string]$DataDirectory = '')
$ErrorActionPreference = 'Stop'
$researchRepo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$researchService = Join-Path $researchRepo 'services\research-runtime'
$researchBundledPython = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
$researchPythonCommand = Get-Command python -ErrorAction SilentlyContinue
$researchPython = if ($researchPythonCommand) { $researchPythonCommand.Source } elseif (Test-Path -LiteralPath $researchBundledPython) { $researchBundledPython } else { throw 'Python 3.11 이상이 필요합니다.' }
$researchPreviousPythonPath = $env:PYTHONPATH
try {
    $researchDependencyPath = Join-Path $researchService '.deps'
    $env:PYTHONPATH = "$researchService;$researchDependencyPath" + $(if ($researchPreviousPythonPath) { ";$researchPreviousPythonPath" } else { '' })
    $researchArguments = @('-m', 'research_runtime.server', '--port', "$Port")
    if ($DataDirectory) { $researchArguments += @('--data-dir', $DataDirectory) }
    & $researchPython @researchArguments
    if ($LASTEXITCODE -ne 0) { throw "연구 서비스가 종료 코드 $LASTEXITCODE 로 종료되었습니다." }
} finally {
    $env:PYTHONPATH = $researchPreviousPythonPath
}
