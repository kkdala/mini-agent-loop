import {
	type AgentMessage,
	type AssistantMessage,
	createDemoContext,
	runMinimalAgentLoop,
} from "./minimal-agent-loop-core";
import { createOpenAICompatibleCallLLM } from "./openai-compatible-call-llm";

declare const process: {
	argv: string[];
};

async function runDemo(): Promise<void> {
	const context = createDemoContext();
	const callLLM = createOpenAICompatibleCallLLM();
	const userPrompt = getUserPrompt();
	const messages = await runMinimalAgentLoop({
		userPrompt,
		context,
		callLLM,
	});

	printConversation(messages);
}

runDemo().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
});

function getUserPrompt(): string {
	/* npm run demo -- "你的问题" 会进入 process.argv.slice(2), 如果不输入默认add 2 3 */
	return process.argv.slice(2).join(" ").trim() || "add 2 3";
}

function printConversation(messages: AgentMessage[]): void {
	/* 为了方便学习，这里把 Agent 过程打印成对话体，而不是原始 JSON */
	for (const message of messages) {
		if (message.role === "user") {
			console.log(`\nUser: ${message.content}`);
			continue;
		}

		if (message.role === "toolResult") {
			console.log(`Tool result from ${message.toolName}: ${message.content}`);
			continue;
		}

		printAssistantMessage(message);
	}
}

function printAssistantMessage(message: AssistantMessage): void {
	for (const part of message.content) {
		if (part.type === "text") {
			console.log(`Assistant: ${part.text}`);
			continue;
		}

		console.log(`Assistant calls tool: ${part.name}`);
		const argsText = formatArgs(part.args);
		if (argsText.length > 0) {
			console.log(`Tool arguments: ${argsText}`);
		}
	}
}

function formatArgs(args: Record<string, unknown>): string {
	return Object.entries(args)
		.map(([key, value]) => `${key}=${String(value)}`)
		.join(", ");
}
