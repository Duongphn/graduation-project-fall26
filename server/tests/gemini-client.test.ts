import type { GenerateContentParameters } from '@google/genai';
import { describe, expect, it } from 'vitest';

import { GeminiAdvisorClient, type GeminiModels } from '../src/integrations/ai/gemini.client.js';

const REQUEST = {
  systemInstruction: 'system',
  prompt: 'prompt',
  responseJsonSchema: { type: 'object' },
  maxOutputTokens: 300,
};

describe('GeminiAdvisorClient', () => {
  it('asks for JSON with LOW thinking and reads usageMetadata', async () => {
    const seen: GenerateContentParameters[] = [];
    const models: GeminiModels = {
      generateContent: async (params) => {
        seen.push(params);
        return {
          text: '{"isToyRelated":true}',
          usageMetadata: {
            promptTokenCount: 420,
            candidatesTokenCount: 35,
            thoughtsTokenCount: 60,
          },
        };
      },
    };
    const client = new GeminiAdvisorClient({
      apiKey: '',
      modelName: 'gemini-x',
      timeoutMs: 1_000,
      models,
    });

    const result = await client.generateJson(REQUEST);

    expect(result).toEqual({
      text: '{"isToyRelated":true}',
      usage: { input: 420, output: 35, thoughts: 60 },
    });
    expect(seen[0]).toMatchObject({
      model: 'gemini-x',
      contents: 'prompt',
      config: {
        systemInstruction: 'system',
        responseMimeType: 'application/json',
        responseJsonSchema: { type: 'object' },
        thinkingConfig: { thinkingLevel: 'LOW' },
        maxOutputTokens: 300,
      },
    });
  });

  it('gives up and aborts the request after the timeout', async () => {
    let signal: AbortSignal | undefined;
    const models: GeminiModels = {
      generateContent: (params) => {
        signal = params.config?.abortSignal;
        return new Promise(() => undefined);
      },
    };
    const client = new GeminiAdvisorClient({
      apiKey: '',
      modelName: 'gemini-x',
      timeoutMs: 20,
      models,
    });

    await expect(client.generateJson(REQUEST)).rejects.toThrow('không phản hồi sau 20 ms');
    expect(signal?.aborted).toBe(true);
  });

  it('refuses to call Gemini without an API key', async () => {
    const client = new GeminiAdvisorClient({ apiKey: '', modelName: 'gemini-x', timeoutMs: 1_000 });

    await expect(client.generateJson(REQUEST)).rejects.toThrow('GEMINI_API_KEY');
  });
});
