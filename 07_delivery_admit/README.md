# 07 · 交付状态与准入（S12 / DAT01 / AI03）测试台

## 测什么
`delivery_state`、`_publish.publish_admit`、可见 outcome 是否一致；阻断是否被伪装成 Empty Day。

## 为何商用必测
- **DAT01** 原子准入；未知结构拒绝
- **AI03** 失败不包装成品；故障≠Empty Day
- **DIA02** 诚实无记忆允许；假空日禁止
- BFF `result_admit` 与 App `validatePreviewResult` 必须同口径

## 量化指标
| 指标 | 通过线 |
|------|--------|
| PIPELINE_BLOCKED 且 publish_admit=true | 次数 = 0 |
| mock_fallback 且质量模式 | 次数 = 0 |
| READY_* 且无可见记忆 | 需人工解释或判 FAIL |
| 合同字段齐全（schema/delivery） | 必须 |

## 启动
```bash
cd 07_delivery_admit
python -m http.server 5177
```
