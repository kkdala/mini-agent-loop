/**
 * 一个最小 Agent loop。
 *
 * 核心流程：
 * 1. 把用户 prompt 放进上下文
 * 2. 把上下文和 tools 发给大模型
 * 3. 如果大模型返回 toolCall，就执行本地 tool
 * 4. 把 toolResult 放回上下文
 * 5. 再问大模型，直到它不再返回 toolCall
 */

export type TextPart = {
	type: "text";
	text: string;
};

export type ToolCallPart = {
	type: "toolCall";
	id: string;
	name: string;
	args: Record<string, unknown>;
};

export type UserMessage = {
	role: "user";
	content: string;
};

export type AssistantMessage = {
	role: "assistant";
	content: Array<TextPart | ToolCallPart>;
};

export type ToolResultMessage = {
	role: "toolResult";
	toolCallId: string;
	toolName: string;
	content: string;
	isError?: boolean;
};

export type AgentMessage = UserMessage | AssistantMessage | ToolResultMessage;

export type AgentTool = {
	name: string;
	description: string;
	/* 这里是给大模型看的参数说明，让它知道 toolCall 应该返回哪些参数 */
	parameters?: Record<string, unknown>;
	execute: (args: Record<string, unknown>) => Promise<string>;
};

export type AgentContext = {
	systemPrompt: string;
	messages: AgentMessage[];
	tools: AgentTool[];
};

export type CallLLM = (input: {
	systemPrompt: string;
	messages: AgentMessage[];
	tools: AgentTool[];
}) => Promise<AssistantMessage>;

export type RunAgentLoopInput = {
	userPrompt: string;
	context: AgentContext;
	callLLM: CallLLM;
	maxSteps?: number;
};

export async function runMinimalAgentLoop(input: RunAgentLoopInput): Promise<AgentMessage[]> {
	const { userPrompt, context, callLLM, maxSteps = 6 } = input;
	const newMessages: AgentMessage[] = [];

	/* 每一轮开始时，先把用户输入保存到上下文 */
	const userMessage: UserMessage = {
		role: "user",
		content: userPrompt,
	};

	context.messages.push(userMessage);
	newMessages.push(userMessage);

	for (let step = 1; step <= maxSteps; step++) {
		/* 问大模型下一步该做什么：直接回答，还是调用工具 */
		const assistantMessage = await callLLM({
			systemPrompt: context.systemPrompt,
			messages: context.messages,
			tools: context.tools,
		});

		context.messages.push(assistantMessage);
		newMessages.push(assistantMessage);

		const toolCalls = assistantMessage.content.filter(isToolCallPart);

		/* 没有 toolCall，说明这一轮 Agent 可以结束了 */
		if (toolCalls.length === 0) {
			return newMessages;
		}

		for (const toolCall of toolCalls) {
			/* 执行工具，并把 toolResult 放回上下文，然后继续问大模型 */
			const toolResultMessage = await runToolCall(toolCall, context.tools);

			context.messages.push(toolResultMessage);
			newMessages.push(toolResultMessage);
		}
	}

	throw new Error(`Agent stopped after ${maxSteps} steps to avoid an infinite loop.`);
}

function isToolCallPart(part: TextPart | ToolCallPart): part is ToolCallPart {
	return part.type === "toolCall";
}

async function runToolCall(
	toolCall: ToolCallPart,
	tools: AgentTool[],
): Promise<ToolResultMessage> {
	const tool = tools.find((candidate) => candidate.name === toolCall.name);

	if (!tool) {
		return {
			role: "toolResult",
			toolCallId: toolCall.id,
			toolName: toolCall.name,
			content: `Tool not found: ${toolCall.name}`,
			isError: true,
		};
	}

	try {
		const content = await tool.execute(toolCall.args);

		return {
			role: "toolResult",
			toolCallId: toolCall.id,
			toolName: toolCall.name,
			content,
		};
	} catch (error) {
		return {
			role: "toolResult",
			toolCallId: toolCall.id,
			toolName: toolCall.name,
			content: error instanceof Error ? error.message : String(error),
			isError: true,
		};
	}
}

/* 这是两个demo工具，echo打印工具和add加法工具 */ 
export const demoTools: AgentTool[] = [
	{
		name: "echo",
		description: "Return the text provided by the model.",
		parameters: {
			type: "object",
			properties: {
				text: {
					type: "string",
					description: "The text to return.",
				},
			},
			required: ["text"],
		},
		async execute(args) {
			return String(args.text ?? "");
		},
	},
	{
		name: "add",
		description: "Add two numbers.",
		parameters: {
			type: "object",
			properties: {
				a: {
					type: "number",
					description: "The first number.",
				},
				b: {
					type: "number",
					description: "The second number.",
				},
			},
			required: ["a", "b"],
		},
		async execute(args) {
			const a = Number(args.a);
			const b = Number(args.b);

			if (Number.isNaN(a) || Number.isNaN(b)) {
				throw new Error("Both a and b must be numbers.");
			}

			return String(a + b);
		},
	},
];

export function createDemoContext(): AgentContext {
	return {
		systemPrompt: "You are a minimal agent. Use tools when helpful.",
		messages: [],
		tools: demoTools,
	};
}
