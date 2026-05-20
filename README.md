# cc-taskboard

Claude Code Agent 任务看板 — 实时可视化多 Agent 任务执行。

当 Claude Code 指派多个 Agent 协作完成任务时，看板显示：
- 哪个 Agent（数字员工）负责哪个 Task
- 任务状态（Pending / In Progress / Done）
- Agent 派发关系（谁派发了谁）

## 安装

**Step 1：注册 MCP Server**

```bash
claude mcp add cc-taskboard --command "npx -y cc-taskboard"
```

**Step 2：安装 Hook**（自动修改 Claude Code settings.json）

```bash
npx cc-taskboard install-hook
```

重启 Claude Code 后生效。

## 使用

Claude Code 里输入：

```
/board
```

自动打开浏览器看板。任务状态实时更新。

也可以用 MCP 工具：

- `get_board_url` — 获取看板 URL
- `get_tasks` — 获取当前任务列表 (JSON)
- `clear_history` — 清空历史记录

## 开发

```bash
git clone https://github.com/YOUR_USERNAME/cc-taskboard
cd cc-taskboard
npm install
npm run dev   # 启动 MCP server
```

## 技术栈

- **MCP SDK**: `@modelcontextprotocol/sdk`
- **DB**: `better-sqlite3` (WAL 模式)
- **实时**: WebSocket (`ws`)
- **Web UI**: 内嵌单页 HTML（无外部依赖）
- **Hook**: TypeScript via `tsx`

## Spike 验证结果

Claude Code PostToolUse hook payload 包含：
- `session_id` — 当前 Agent 的会话 ID ✅
- `tool_name` — 工具名称
- `tool_input` + `tool_response` — 完整输入输出

Agent 派发关系通过 `Agent` 工具的 hook 捕获。

## License

MIT
