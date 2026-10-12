# 08 Local light pipeline — MobileCLIP + 1/3/5/10 → V04 half-product
# Prerequisite: BFF Dev Lite with MobileCLIP on :8790
#   cd E:\AI耳机\diary-one\services\bff
#   .\scripts\start-dev-lite.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$env:PORT = if ($env:PORT) { $env:PORT } else { "8808" }
$env:DIARY_ONE_BFF_BASE_URL = if ($env:DIARY_ONE_BFF_BASE_URL) { $env:DIARY_ONE_BFF_BASE_URL } else { "http://127.0.0.1:8790" }
$env:DIARY_ONE_DEV_TOKEN = if ($env:DIARY_ONE_DEV_TOKEN) { $env:DIARY_ONE_DEV_TOKEN } else { "dev-token" }

python -m pip install fastapi uvicorn httpx python-multipart -q
Write-Host "08 Local MobileCLIP light → http://127.0.0.1:$($env:PORT)" -ForegroundColor Green
Write-Host "BFF: $($env:DIARY_ONE_BFF_BASE_URL)" -ForegroundColor Cyan
python server.py
