# 启动 T02 · 时间与重复
Set-Location $PSScriptRoot
Write-Host "Open http://127.0.0.1:8902" -ForegroundColor Cyan
python -m http.server 8902
