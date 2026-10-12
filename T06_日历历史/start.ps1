# 启动 T06 · 日历历史
Set-Location $PSScriptRoot
Write-Host "Open http://127.0.0.1:8906" -ForegroundColor Cyan
python -m http.server 8906
