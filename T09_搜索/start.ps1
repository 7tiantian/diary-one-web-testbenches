# 启动 T09 · 搜索
Set-Location $PSScriptRoot
Write-Host "Open http://127.0.0.1:8909" -ForegroundColor Cyan
python -m http.server 8909
