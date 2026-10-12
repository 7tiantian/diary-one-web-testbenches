# 09 · 云端处理 → 完整 Chapter

## 测什么

把 **08 本地轻处理半成品** + **测试员自己的百炼 Key** 跑完 X02，得到最终 **Chapter**（及 Aha）。

链路：

```text
08 zip (bundle.json + frames + local_semantic_route.json)
  → load_app_library_bundle 门禁
  → QwenChatCompletionsAdapter(api_key=你的Key)
  → run_x02 (V04.1 / S04–S12)
  → chapters[]
```

## 与 PRD

| 条款 | 本台怎么体现 |
|------|----------------|
| §19 云端算法 | 理解、分段、文案、Chapter/Aha |
| §19 第三方模型 | 仅吃最小 Evidence；不上传原片整库 |
| SYS02 | **产品**密钥只在自有服务；本台是**团队测试例外**，每人自带 Key、不落盘 |
| DAT01 / AI03 | 看 delivery / 可见章节是否可发布 |

## 前置

1. 先用 [08 台](../08_local_light_pipeline/) 做出 `diary_one_upload_bundle.zip`
2. 准备你的阿里云百炼 `DASHSCOPE_API_KEY`
3. 本机可 `import diary_one_ci`（`start.ps1` 已把 algorithm/src 加入 PYTHONPATH）

```powershell
cd E:\AI耳机\web测试台\09_cloud_processing_pipeline
.\start.ps1
# http://127.0.0.1:8809
```

## 输入 / 输出

| 输入 | 输出 |
|------|------|
| 08 半成品 zip | 可见 Chapters（title / story / media） |
| 个人 DASHSCOPE_API_KEY | Ahas、delivery_state、报告 JSON |

## 量化通过线

- `ok == true` 且 `chapterCount >= 1`（素材足够时）
- 章节字段含 title + story，可导入 02–07 分台
- 服务器 `_work/*/x02_result.json` **不含** API Key

## 不要用本台证明什么

- 正式构建包无密钥（那是发布门禁 / SYS02 审计）
- BFF 多用户配额与 OTP（另测质量栈）
