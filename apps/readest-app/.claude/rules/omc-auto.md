## OMC 自动协作规则

你已安装 oh-my-claudecode（OMC），以下命令和 agent 已可用。在合适的时机**主动调用**它们，不需要等我手动输入。

### 自动触发的时机

| 场景 | 自动执行 |
|------|----------|
| 写完代码后 | `/ccg "review this diff"` — 三模型（Claude+Codex+Gemini）交叉审查 |
| 同一个 bug 修了 2 次还没通过测试 | `/team 2:codex "fix this"` — 起 2 个 Codex worker 并行修复 |
| 重构跨 3 个以上文件 | `/ccg "assess refactoring risk"` — 评估重构风险 |
| 需要写测试 | `/ccg "review test coverage for this change"` — 检查测试覆盖遗漏 |
| 遇到不确定的架构决策 | `/ccg "give me a second opinion on this approach"` |
| 大功能开发 | `/autopilot "your task description"` — 全自动执行 |

### 可用的 Agent（通过 /team 调用）

- **code-reviewer** — 审查代码
- **test-engineer** — 写测试
- **debugger** — 调试
- **architect** — 架构设计
- **security-reviewer** — 安全审查
- **qa-tester** — QA 测试

### 原则

- 不要犹豫用 `/ccg`，它成本很低但能有效避免盲区
- 遇到卡住的情况时优先 `/team 1:codex` 而不是反复自己试
- 我的工作时间很宝贵，自动化优先
