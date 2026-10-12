# 启动 T04 · 网络恢复
Set-Location $PSScriptRoot
Write-Host "Open http://127.0.0.1:8904" -ForegroundColor Cyan
python -m http.server 8904
