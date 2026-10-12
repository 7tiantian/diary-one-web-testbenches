# 启动 T11 · 分享
Set-Location $PSScriptRoot
Write-Host "Open http://127.0.0.1:8911" -ForegroundColor Cyan
python -m http.server 8911
