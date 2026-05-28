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
$QrPath = Join-Path $ProjectPath "preview-qrcode.png"

if (!(Test-Path $Cli)) {
  Write-Error "未找到微信开发者工具命令行 cli.bat"
  exit 1
}

& $Cli preview --project $ProjectPath --qr-format image --qr-output $QrPath --lang zh
