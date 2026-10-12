# 启动 T03 · 真链路
Set-Location $PSScriptRoot
Write-Host "Open http://127.0.0.1:8903" -ForegroundColor Cyan
python -m http.server 8903
