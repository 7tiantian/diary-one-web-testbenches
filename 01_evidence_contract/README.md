# 01 · Evidence 标准化合同测试台

## 测什么
iOS App 上传前的**最小 Evidence**是否符合商用合同：尺寸、帧数策略、`original_included=false`、不依赖 GPS/拍摄时间。

## 为何商用必测（PRD）
- **PRI02** 默认最小外发；不得上传整库 Raw
- **IMP03** 选入后走同一正式链路（账本→Evidence→后端）
- **SYS01** 输入快照可版本化
- handoff：照片 1 帧；视频按时长 Window；画布 768×1024 letterbox JPEG≈0.84

## 输入
- 本机选择若干照片 / 视频（浏览器本地处理，默认不上传外网）
- 或只测照片帧合同（视频抽帧需浏览器支持 / 可跳过）

## 怎么测
1. 打开本目录 `index.html`（推荐 `npx serve .` 或 `python -m http.server 5173`）
2. 选择素材 → 点「生成本地 Evidence 报告」
3. 看量化指标是否全绿
4. 导出 JSON 报告归档

## 输出
- 每资产：帧数、画布宽高、JPEG 约字节、是否声称上传原片
- 汇总通过/失败

## 量化指标（通过线）
| 指标 | 通过线 |
|------|--------|
| 照片证据帧数 | = 1 |
| 画布尺寸 | 宽=768 且 高=1024（容差 0） |
| original_included | 必须为 false |
| 单帧 JPEG | ≤ 900 KB（经验上限，可调） |
| 视频 Window 帧数（若测） | ≤10s:3；≤30s:4；≤90s:8；>90s:12（与研究 Profile 对齐，≠正式 Auto 9s 合同） |

## 启动
```bash
cd 01_evidence_contract
python -m http.server 5171
# 浏览器打开 http://127.0.0.1:5171
```
