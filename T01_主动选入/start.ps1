# 启动 T01 · 主动选入
Set-Location $PSScriptRoot
Write-Host "Open http://127.0.0.1:8901" -ForegroundColor Cyan
python -m http.server 8901
