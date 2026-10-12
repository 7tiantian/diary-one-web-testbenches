# 08 · 本地算法轻处理（MobileCLIP 真链路）

## 测什么

端侧「手机 Evidence」合同（PRD §19 / PRI02），顺序与 App / `WINDOWS_MOBILECLIP_BFF` 一致：

1. **去重**（`original_sha256`）：会话内重复 + 历史账本已见 → 跳过，避免重复抽帧/上云  
   （对齐 `apps/mobile/src/pipeline/dedupeMedia.ts`）
2. **ffmpeg** 按 ~1s 抽**探针帧**（不是瞎定 3 帧）
3. **BFF MobileCLIP**（`POST /v1/evidence/semantic-analyze`，`probe_0…`）出 512-d 向量  
4. **语义门控 1 / 3 / 5 / 10**（对齐 App `semanticRouter` / MobileCLIP profile）
5. 选帧 letterbox **768×1024**，打成 **App Library Bundle V04** 半成品 zip  

本台**不**调用百炼、**不**产出 Chapter。

## 前置

```powershell
# 1) MobileCLIP BFF
cd E:\AI耳机\diary-one\services\bff
.\scripts\start-dev-lite.ps1
# 浏览器看 http://127.0.0.1:8790/health → mobileclip.available == true

# 2) 本台
cd E:\AI耳机\web测试台\08_local_light_pipeline
.\start.ps1
# http://127.0.0.1:8808
```

需要系统 **ffmpeg / ffprobe** 在 PATH。

## 输入 / 输出

| 输入 | 输出 |
|------|------|
| 一天照片+视频 | `diary_one_upload_bundle.zip`（V04 半成品） |
| BFF URL + token | 报告：探针数、门控档位、reasonCodes、routeHistogram |

## 量化通过线

- `mobileclipUsed == true`
- 每条视频有 `gate.targetFrameCount ∈ {1,3,5,10}` 与 reasonCodes
- zip 内有合法 `bundle.json`（可被 09 / `load_app_library_bundle` 吃）
- zip **无**原片视频

## 交给 09

下载 zip → 打开 [09 云端处理台](../09_cloud_processing_pipeline/) → **每人填自己的百炼 `DASHSCOPE_API_KEY`** → 跑完 X02 得 Chapter。

> 产品 SYS02：App/消费者构建不持供应商密钥。09 是**团队测试台**例外，密钥仅存请求内存、不落盘。
