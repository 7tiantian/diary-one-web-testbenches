# 启动 T10 · 原片删除
Set-Location $PSScriptRoot
Write-Host "Open http://127.0.0.1:8910" -ForegroundColor Cyan
python -m http.server 8910
