# 启动 T05 · 新批失败
Set-Location $PSScriptRoot
Write-Host "Open http://127.0.0.1:8905" -ForegroundColor Cyan
python -m http.server 8905
