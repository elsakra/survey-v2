import OpenAI from "openai";
import type { AssessorOutput } from "../orchestrator/state.js";

export interface LLMProvider {
  chat(systemPrompt: string, userMessage: string): Promise<string>;
  chatJson<T>(systemPrompt: string, userMessage: string): Promise<T>;
}

class OpenAIProvider implements LLMProvider {
  private client: OpenAI;
  private model: string;

  constructor() {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.model = process.env.LLM_MODEL ?? "gpt-4o-mini";
  }

  async chat(systemPrompt: string, userMessage: string): Promise<string> {
    const resp = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0.7,
      max_tokens: 300,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    });
    return resp.choices[0]?.message?.content?.trim() ?? "";
  }

  async chatJson<T>(systemPrompt: string, userMessage: string): Promise<T> {
    const resp = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0.1,
      max_tokens: 500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    });
    const raw = resp.choices[0]?.message?.content ?? "{}";
    return JSON.parse(raw) as T;
  }
}

let _provider: LLMProvider | null = null;

export function getLLM(): LLMProvider {
  if (!_provider) _provider = new OpenAIProvider();
  return _provider;
}

export async function runAssessor(
  systemPrompt: string,
  userMessage: string,
): Promise<AssessorOutput> {
  const llm = getLLM();
  try {
    return await llm.chatJson<AssessorOutput>(systemPrompt, userMessage);
  } catch (err) {
    console.error("[assessor] LLM call failed, using fallback:", err);
    return {
      coverage: { incident: 0, mechanism: 0, boundary: 0, quant: 0 },
      novelty_score: 0.5,
      boredom_risk: 0.3,
      next_action: "FOLLOWUP",
      recommended_lens: "Clarify",
      missing: ["incident", "mechanism", "boundary", "quant"],
    };
  }
}

export async function runInterviewer(
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  const llm = getLLM();
  try {
    return await llm.chat(systemPrompt, userMessage);
  } catch (err) {
    console.error("[interviewer] LLM call failed, using fallback:", err);
    return "Could you tell me a bit more about that?";
  }
}

export async function generateSummary(transcript: string): Promise<string> {
  const llm = getLLM();
  const system =
    "You are a research analyst. Summarize this interview transcript in 3-5 bullet points. Focus on key findings, specific examples mentioned, and any quantitative data. Be concise.";
  return llm.chat(system, transcript);
}
