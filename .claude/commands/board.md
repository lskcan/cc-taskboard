---
description: 打开 CC TaskBoard — Agent 任务可视化看板
---

通过 cc-taskboard MCP 工具获取看板 URL，然后在浏览器里打开。

步骤：
1. 调用 MCP 工具 `get_board_url` 获取当前看板地址
2. 根据系统平台用对应命令打开浏览器：
   - macOS: `open <url>`
   - Linux: `xdg-open <url>`
   - Windows: `start <url>`
3. 告诉用户看板已打开，URL 是多少

如果 MCP 工具不可用，说明 cc-taskboard MCP server 未启动，提示用户运行：
`claude mcp add cc-taskboard --command "npx cc-taskboard"`
