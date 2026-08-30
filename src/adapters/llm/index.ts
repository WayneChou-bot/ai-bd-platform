import { generateObject } from "ai";
import type { z } from "zod";
import type { LLMProvider, StructuredRequest, StructuredResponse } from "./types";
import { fenceUntrusted } from "./types";
import type { AppConfig } from "@/lib/config";

// ---------------------------------------------------------------------------
// Mock provider — DEMO mode. Returns registered fixtures per task name.
// ---------------------------------------------------------------------------

type FixtureResolver = (req: { task: string; prompt: string; untrusted?: string }) => unknown;

export class MockLLMProvider implements LLMProvider {
  readonly name = "mock";
  private resolvers = new Map<string, FixtureResolver>();

  register(task: string, resolver: FixtureResolver) {
    this.resolvers.set(task, resolver);
    return this;
  }

  async generateStructured<T extends z.ZodTypeAny>(req: StructuredRequest<T>): Promise<StructuredResponse<z.infer<T>>> {
    const resolver = this.resolvers.get(req.task);
    if (!resolver) throw new Error(`MockLLMProvider: no fixture registered for task "${req.task}"`);
    const data = req.schema.parse(resolver({ task: req.task, prompt: req.prompt, untrusted: req.untrusted }));
    return { data, model: "mock", usage: { input: 0, output: 0 } };
  }
}

// ---------------------------------------------------------------------------
// Vercel AI SDK provider — LIVE mode. One class, any vendor.
// ---------------------------------------------------------------------------

export class AISDKProvider implements LLMProvider {
  readonly name: string;
  constructor(private readonly cfg: AppConfig) {
    this.name = `${cfg.llmProvider}:${cfg.llmModel}`;
  }

  private async model() {
    switch (this.cfg.llmProvider) {
      case "openai": {
        const { openai } = await import("@ai-sdk/openai");
        return openai(this.cfg.llmModel);
      }
      case "anthropic": {
        const { anthropic } = await import("@ai-sdk/anthropic");
        return anthropic(this.cfg.llmModel);
      }
      case "google": {
        const { google } = await import("@ai-sdk/google");
        return google(this.cfg.llmModel);
      }
      default:
        throw new Error(`Unsupported provider "${this.cfg.llmProvider}" — set LLM_PROVIDER to exactly one of openai / anthropic / google (no "|", no quotes)`);
    }
  }

  async generateStructured<T extends z.ZodTypeAny>(req: StructuredRequest<T>): Promise<StructuredResponse<z.infer<T>>> {
    const model = await this.model();
    const prompt = req.untrusted ? `${req.prompt}\n\n${fenceUntrusted(req.untrusted)}` : req.prompt;
    // Strict structured outputs stay ON: the schema is rewritten into the
    // subset OpenAI accepts (see strict-schema.ts), and the reply is then
    // re-validated against the ORIGINAL schema — Zod remains the gate.
    const { strictify, stripNulls } = await import("./strict-schema");
    const result = await generateObject({
      model,
      schema: strictify(req.schema),
      system: req.system,
      prompt,
      temperature: req.temperature ?? 0.2,
    });
    return {
      data: req.schema.parse(stripNulls(result.object)) as z.infer<T>,
      model: this.cfg.llmModel,
      usage: { input: result.usage.inputTokens ?? 0, output: result.usage.outputTokens ?? 0 },
    };
  }
}

export function createLLMProvider(cfg: AppConfig, mock?: MockLLMProvider): LLMProvider {
  if (cfg.mode === "demo" || cfg.llmProvider === "mock") return mock ?? new MockLLMProvider();
  return new AISDKProvider(cfg);
}
