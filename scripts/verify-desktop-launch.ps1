param(
  [string]$Executable
)

$ErrorActionPreference = 'Stop'

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ([string]::IsNullOrWhiteSpace($Executable)) {
  $Executable = Join-Path $repositoryRoot 'dist\desktop\win-unpacked\deepseek-harness.exe'
}
$Executable = [System.IO.Path]::GetFullPath($Executable)
if (-not (Test-Path -LiteralPath $Executable -PathType Leaf)) {
  throw "packaged desktop executable not found: $Executable"
}

$smokeRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("dsh-desktop-launch-smoke-" + [guid]::NewGuid().ToString('N'))
$stdoutPath = Join-Path $smokeRoot 'stdout.log'
$stderrPath = Join-Path $smokeRoot 'stderr.log'
$executableDirectory = Split-Path -Parent $Executable
$previousDshHome = $env:DSH_HOME
$previousDisableUpdater = $env:DSH_DISABLE_AUTO_UPDATE
$previousRunAsNode = $env:ELECTRON_RUN_AS_NODE
$process = $null

New-Item -ItemType Directory -Path $smokeRoot -Force | Out-Null
$env:DSH_HOME = Join-Path $smokeRoot 'dsh-home'
$env:DSH_DISABLE_AUTO_UPDATE = '1'
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

try {
  $electronUserData = Join-Path $smokeRoot 'electron-user-data'
  $process = Start-Process -FilePath $Executable -ArgumentList @("--user-data-dir=$electronUserData") -WorkingDirectory $executableDirectory -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru -WindowStyle Hidden
  $readyUrl = $null
  for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
    Start-Sleep -Seconds 1
    if ($process.HasExited) {
      $stdout = if (Test-Path -LiteralPath $stdoutPath) { Get-Content -LiteralPath $stdoutPath -Raw } else { '' }
      $stderr = if (Test-Path -LiteralPath $stderrPath) { Get-Content -LiteralPath $stderrPath -Raw } else { '' }
      throw "packaged desktop exited before readiness (code=$($process.ExitCode))`nstdout:`n$stdout`nstderr:`n$stderr"
    }
    $stdout = if (Test-Path -LiteralPath $stdoutPath) { Get-Content -LiteralPath $stdoutPath -Raw } else { '' }
    $match = [regex]::Match($stdout, 'dsh web:\s+(http://127\.0\.0\.1:\d+)')
    if (-not $match.Success) { continue }
    $candidate = $match.Groups[1].Value
    try {
      $response = Invoke-WebRequest -Uri $candidate -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
        $readyUrl = $candidate
        break
      }
    } catch {
      # The URL can be logged a moment before the HTTP listener accepts it.
    }
  }
  if ($null -eq $readyUrl) {
    $stdout = if (Test-Path -LiteralPath $stdoutPath) { Get-Content -LiteralPath $stdoutPath -Raw } else { '' }
    $stderr = if (Test-Path -LiteralPath $stderrPath) { Get-Content -LiteralPath $stderrPath -Raw } else { '' }
    throw "packaged desktop did not become HTTP-ready within 20 seconds`nstdout:`n$stdout`nstderr:`n$stderr"
  }
  Write-Output "packaged desktop launch smoke: HTTP 200 from $readyUrl"
}
finally {
  if ($null -ne $process -and -not $process.HasExited -and $null -ne $process.Id) {
    & taskkill.exe /PID $process.Id /T /F | Out-Null
  }
  if ($null -eq $previousDshHome) { Remove-Item Env:DSH_HOME -ErrorAction SilentlyContinue } else { $env:DSH_HOME = $previousDshHome }
  if ($null -eq $previousDisableUpdater) { Remove-Item Env:DSH_DISABLE_AUTO_UPDATE -ErrorAction SilentlyContinue } else { $env:DSH_DISABLE_AUTO_UPDATE = $previousDisableUpdater }
  if ($null -eq $previousRunAsNode) { Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue } else { $env:ELECTRON_RUN_AS_NODE = $previousRunAsNode }
  if (Test-Path -LiteralPath $smokeRoot) { Remove-Item -LiteralPath $smokeRoot -Recurse -Force }
}
