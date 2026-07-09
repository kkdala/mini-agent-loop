import type {
	AgentMessage,
	AgentTool,
	AssistantMessage,
	CallLLM,
	TextPart,
	ToolCallPart,
} from "./minimal-agent-loop-core";

declare const process: {
	env: Record<string, string | undefined>;
};

type ChatCompletionMessage = {
	role: "system" | "user" | "assistant" | "tool";
	content: string | null;
	tool_call_id?: string;
	tool_calls?: Array<{
		id: string;
		type: "function";
		function: {
			name: string;
			arguments: string;
		};
	}>;
};

type ChatCompletionResponse = {
	choices?: Array<{
		message?: {
			content?: string | null;
			tool_calls?: Array<{
				id?: string;
				function?: {
					name?: string;
					arguments?: string;
				};
			}>;
		};
	}>;
	error?: {
		message?: string;
	};
};

export function createOpenAICompatibleCallLLM(): CallLLM {
	/* 这里使用 DeepSeek 官方 API，key 放在环境变量 DEEPSEEK_API_KEY 中 */
	const apiKey = process.env.DEEPSEEK_API_KEY;
	const baseUrl = "https://api.deepseek.com";
	const model = "deepseek-v4-flash";
	/* 这里使用 你给的中转站的API，key 放在环境变量 DEEPSEEK_API_KEY 中 */
	// const apiKey = process.env.OPENAI_API_KEY;
	// const baseUrl = "https://gaccode.com/codex";
	// const model = "gpt-5.5";

	if (!apiKey) {
		throw new Error("Missing API_KEY.");
	}

	return async (input) => {
		/* 这里是真正请求大模型的地方 */
		const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				model,
				messages: toChatMessages(input.systemPrompt, input.messages),
				tools: toChatTools(input.tools),
				tool_choice: "auto",
			}),
		});

		const data = (await response.json()) as ChatCompletionResponse;

		if (!response.ok) {
			throw new Error(data.error?.message ?? `Model request failed with ${response.status}.`);
		}

		return toAssistantMessage(data);
	};
}

function toChatMessages(systemPrompt: string, messages: AgentMessage[]): ChatCompletionMessage[] {
	/* 大模型 API 需要把 systemPrompt 放在第一条 system message */
	return [
		{
			role: "system",
			content: systemPrompt,
		},
		...messages.map(toChatMessage),
	];
}

function toChatMessage(message: AgentMessage): ChatCompletionMessage {
	if (message.role === "user") {
		return {
			role: "user",
			content: message.content,
		};
	}

	if (message.role === "toolResult") {
		return {
			role: "tool",
			tool_call_id: message.toolCallId,
			content: message.content,
		};
	}

	const text = message.content
		.filter((part): part is TextPart => part.type === "text")
		.map((part) => part.text)
		.join("\n");
	const toolCalls = message.content.filter(
		(part): part is ToolCallPart => part.type === "toolCall",
	);

	return {
		role: "assistant",
		content: text.length > 0 ? text : null,
		tool_calls: toolCalls.map((toolCall) => ({
			id: toolCall.id,
			type: "function",
			function: {
				name: toolCall.name,
				arguments: JSON.stringify(toolCall.args),
			},
		})),
	};
}

function toChatTools(tools: AgentTool[]): Array<Record<string, unknown>> {
	/* 大模型只需要看到工具说明，不会收到本地 execute 函数 */
	return tools.map((tool) => ({
		type: "function",
		function: {
			name: tool.name,
			description: tool.description,
			parameters: tool.parameters ?? {
				type: "object",
				properties: {},
				additionalProperties: true,
			},
		},
	}));
}

function toAssistantMessage(data: ChatCompletionResponse): AssistantMessage {
	const message = data.choices?.[0]?.message;

	if (!message) {
		throw new Error("Model response did not include a message.");
	}

	const content: AssistantMessage["content"] = [];

	if (message.content) {
		content.push({
			type: "text",
			text: message.content,
		});
	}

	for (const toolCall of message.tool_calls ?? []) {
		const name = toolCall.function?.name;

		if (!name) {
			continue;
		}

		content.push({
			type: "toolCall",
			id: toolCall.id ?? createFallbackToolCallId(),
			name,
			/* OpenAI-compatible 接口里的工具参数是 JSON 字符串，这里要转成对象 */
			args: parseToolArguments(toolCall.function?.arguments),
		});
	}

	return {
		role: "assistant",
		content,
	};
}

function parseToolArguments(rawArguments: string | undefined): Record<string, unknown> {
	if (!rawArguments) {
		return {};
	}

	try {
		const parsed = JSON.parse(rawArguments) as unknown;
		return isRecord(parsed) ? parsed : {};
	} catch {
		return {};
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createFallbackToolCallId(): string {
	return `tool-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}
