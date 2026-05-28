param(
  [string]$Version = "1.0.0",
  [string]$Desc = "最终版"
)

$ProjectPath = Split-Path -Parent $PSScriptRoot
$SearchRoots = @(
  "$env:ProgramFiles\Tencent",
  "${env:ProgramFiles(x86)}\Tencent",
  "$env:LOCALAPPDATA\Tencent"
)
$Cli = $SearchRoots |
  Where-Object { Test-Path $_ } |
  ForEach-Object { Get-ChildItem -Path $_ -Recurse -Filter "cli.bat" -ErrorAction SilentlyContinue } |
  Select-Object -First 1 -ExpandProperty FullName
$InfoPath = Join-Path $ProjectPath "upload-result.json"

if (!(Test-Path $Cli)) {
  Write-Error "未找到微信开发者工具命令行 cli.bat"
  exit 1
}

& $Cli upload --project $ProjectPath --version $Version --desc $Desc --info-output $InfoPath --lang zh
