import { type GenerateContentParameters, GoogleGenAI, ThinkingLevel } from '@google/genai';

import type {
  AdvisorLlm,
  LlmJsonRequest,
  LlmJsonResult,
} from '../../interfaces/ai-advisor.ports.js';

interface GeminiResponseLike {
  text?: string | undefined;
  usageMetadata?:
    | {
        promptTokenCount?: number | undefined;
        candidatesTokenCount?: number | undefined;
        thoughtsTokenCount?: number | undefined;
      }
    | undefined;
}

/** Phần SDK được dùng; test truyền bản giả để kiểm tra timeout mà không gọi mạng. */
export interface GeminiModels {
  generateContent(params: GenerateContentParameters): Promise<GeminiResponseLike>;
}

export interface GeminiClientOptions {
  apiKey: string;
  modelName: string;
  /** null: không tự cắt, chờ tới khi Gemini trả lời hoặc báo lỗi. */
  timeoutMs: number | null;
  models?: GeminiModels;
}

/** Bọc SDK @google/genai: JSON theo schema, suy nghĩ mức LOW, timeout tuỳ chọn, đọc usageMetadata. */
export class GeminiAdvisorClient implements AdvisorLlm {
  private models: GeminiModels | null;

  public constructor(private readonly options: GeminiClientOptions) {
    this.models = options.models ?? null;
  }

  public get modelName(): string {
    return this.options.modelName;
  }

  public async generateJson(request: LlmJsonRequest): Promise<LlmJsonResult> {
    const models = this.getModels();
    const { timeoutMs } = this.options;
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    const call = models.generateContent({
      model: this.options.modelName,
      contents: request.prompt,
      config: {
        systemInstruction: request.systemInstruction,
        // Tối ưu token (mục 8.4): trả JSON theo schema, không có lời dẫn thừa.
        responseMimeType: 'application/json',
        responseJsonSchema: request.responseJsonSchema,
        // Tối ưu token (mục 8.5, 8.6): suy nghĩ mức thấp, trần tổng token đầu ra.
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        maxOutputTokens: request.maxOutputTokens,
        abortSignal: controller.signal,
      },
    });
    // Chỉ tự cắt khi GEMINI_TIMEOUT_MS có giá trị; mặc định chờ tới khi Gemini trả lời hoặc báo lỗi.
    const timeout =
      timeoutMs === null
        ? null
        : new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => {
              controller.abort();
              reject(new Error(`Gemini không phản hồi sau ${timeoutMs} ms.`));
            }, timeoutMs);
          });

    try {
      const response = await (timeout ? Promise.race([call, timeout]) : call);
      const usage = response.usageMetadata;
      return {
        text: response.text ?? '',
        usage: {
          input: usage?.promptTokenCount ?? 0,
          output: usage?.candidatesTokenCount ?? 0,
          thoughts: usage?.thoughtsTokenCount ?? 0,
        },
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private getModels(): GeminiModels {
    if (this.models) return this.models;
    if (!this.options.apiKey) {
      throw new Error('GEMINI_API_KEY chưa được cấu hình.');
    }
    this.models = new GoogleGenAI({
      apiKey: this.options.apiKey,
      // Không để SDK tự thử lại (mặc định 5 lần, chờ 1-2-4-8 giây khi gặp 429/5xx): lỗi như
      // 503 "high demand" phải về ngay để chuyển sang fallback, và log ghi đúng lỗi thật.
      httpOptions: { retryOptions: { attempts: 1 } },
    }).models;
    return this.models;
  }
}
