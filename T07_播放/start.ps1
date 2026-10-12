# 启动 T07 · 播放
Set-Location $PSScriptRoot
Write-Host "Open http://127.0.0.1:8907" -ForegroundColor Cyan
python -m http.server 8907
