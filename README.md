# Mini Agent Loop

这是一个最小可运行的 TypeScript Agent loop 学习项目。

它接入 DeepSeek 官方 API，并支持工具调用。当前文件夹只保留命令行 demo，不包含 HTTP API 服务。

## 文件说明

```text
minimal-agent-loop-core.ts
```

Agent loop 的核心逻辑。它负责保存上下文、调用大模型、执行工具、把工具结果放回上下文。

```text
openai-compatible-call-llm.ts
```

真实大模型调用层。这里使用 DeepSeek 官方 API：

```text
https://api.deepseek.com/chat/completions
```

API key 从环境变量读取：

```text
DEEPSEEK_API_KEY
```

```text
minimal-agent-loop-core-demo.ts
```

命令行 demo。它会直接运行一次完整 Agent loop，并把结果打印成对话体。

## 模型配置

这个项目固定使用：

```text
baseUrl: https://api.deepseek.com
model: deepseek-v4-flash
key: DEEPSEEK_API_KEY
```

设置 DeepSeek key：

```powershell
$env:DEEPSEEK_API_KEY = "你的 DeepSeek API Key"
```

## 运行 Demo

先进入目录：

```powershell
cd D:\工作文件\pi_agent_learn\Mini-agent-loop
```

运行 demo：

```powershell
npm run demo -- "帮我计算一下 997 + 10086" 
```

你会看到类似：

```text
User: ^帮我计算一下^ 997^ +^ 10086^
Assistant calls tool: add
Tool arguments: a=997, b=10086
Tool result from add: 11083
Assistant: 计算完成！

**997 + 10086 = 11083** ✅
```

如果不传 prompt：

```powershell
npm run demo
```

默认会运行：

```text
add 2 3
```

## 最小 Agent Loop 思路

核心主线是：

```text
user -> LLM -> toolCall -> toolResult -> LLM -> final answer
```

也就是：

```text
1. 用户输入 prompt
2. prompt 放入 context.messages
3. 把 systemPrompt + context.messages + tools 发给大模型
4. 大模型返回 assistant message
5. 如果 assistant message 里有 toolCall，就执行本地工具
6. 把 toolResult 放回 context.messages
7. 再次请求大模型
8. 如果没有 toolCall，就结束
```

## 目前内置工具

```text
echo
```

返回模型传入的文本。

```text
add
```

接收两个数字 `a` 和 `b`，返回相加结果。

## 注意事项

如果你在 Windows 系统环境变量里设置了 `DEEPSEEK_API_KEY`，已经打开的 PowerShell 可能读不到。

解决方法：

```text
关闭终端，重新打开
```

或者在当前 PowerShell 临时设置：

```powershell
$env:DEEPSEEK_API_KEY = "你的 DeepSeek API Key"
```
