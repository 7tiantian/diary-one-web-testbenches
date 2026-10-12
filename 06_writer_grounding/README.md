# 06 · Writer 有据文案（S11 / AI01 / AI03）测试台

## 测什么
标题/AI Story 是否空泛、是否有编纂、是否像「生活片段」套话；Chapter 句数与 Aha 字数。

## 为何商用必测
- **AI01/AI03**：不合格不用通用套话填充
- handoff：Chapter 1–2 句；Aha ≤24 字；Writer 一次为主，不抽卡重写
- iOS Diary 卡上用户第一眼看到标题+一句故事

## 量化指标
| 指标 | 通过线 |
|------|--------|
| 人工「可保留」率 | ≥ 80% |
| 人工「编纂」条数 | = 0 |
| 套话命中条数（规则辅助） | 建议 = 0 |
| Aha >24 字 | = 0 |

## 启动
```bash
cd 06_writer_grounding
python -m http.server 5176
```
