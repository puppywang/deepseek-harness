param(
  [Parameter(Mandatory = $true)]
  [string]$Target
)

$ErrorActionPreference = 'Stop'
Get-ChildItem Env: | Where-Object { $_.Name -match '^(npm|pnpm)_' } | ForEach-Object {
  Remove-Item -LiteralPath "Env:$($_.Name)" -ErrorAction SilentlyContinue
}
$env:CI = 'true'
$env:npm_config_confirm_modules_purge = 'false'
$env:npm_config_node_linker = 'hoisted'
$targetPath = [System.IO.Path]::GetFullPath($Target)

Write-Output "desktop runtime deploy target: $targetPath"
& pnpm.cmd --config.node-linker=hoisted --filter '@deepseek-ai/dsh' deploy $targetPath --prod --legacy
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
