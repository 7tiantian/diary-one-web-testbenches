# 启动 T08 · 补记
Set-Location $PSScriptRoot
Write-Host "Open http://127.0.0.1:8908" -ForegroundColor Cyan
python -m http.server 8908
