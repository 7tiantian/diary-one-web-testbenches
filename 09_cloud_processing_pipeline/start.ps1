# 09 Cloud Chapter bench — 08 zip + personal Bailian key → run_x02
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$env:PORT = if ($env:PORT) { $env:PORT } else { "8809" }
$algoSrc = "E:\AI耳机\diary-one\services\algorithm\algorithm\src"
if (-not (Test-Path $algoSrc)) {
  throw "找不到 diary_one_ci: $algoSrc"
}
$env:DIARY_ONE_ALGO_SRC = $algoSrc
$env:PYTHONPATH = "$algoSrc;$($env:PYTHONPATH)"

python -m pip install fastapi uvicorn python-multipart httpx -q
# X02 runtime deps commonly needed
python -m pip install pydantic -q

Write-Host "09 Cloud Chapter → http://127.0.0.1:$($env:PORT)" -ForegroundColor Green
Write-Host "ALGO_SRC=$algoSrc" -ForegroundColor Cyan
Write-Host "每人在页面填写自己的 DASHSCOPE_API_KEY（不落盘）" -ForegroundColor Yellow
python server.py
