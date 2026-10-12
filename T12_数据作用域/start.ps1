# 启动 T12 · 数据作用域
Set-Location $PSScriptRoot
Write-Host "Open http://127.0.0.1:8912" -ForegroundColor Cyan
python -m http.server 8912
