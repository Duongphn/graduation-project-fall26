import type {
  AdvisorLlm,
  LlmJsonRequest,
  LlmJsonResult,
  LlmUsage,
} from '../../src/interfaces/ai-advisor.ports.js';

type FakeReply = Record<string, unknown> | string | Error;

/** Gemini giả cho test: trả lần lượt các câu trả lời đã xếp hàng và ghi lại mọi request. */
export class FakeAdvisorLlm implements AdvisorLlm {
  public readonly modelName = 'fake-gemini';
  public readonly requests: LlmJsonRequest[] = [];
  private readonly replies: FakeReply[];

  public constructor(
    replies: FakeReply[] = [],
    private readonly usage: LlmUsage = { input: 100, output: 20, thoughts: 10 },
  ) {
    this.replies = [...replies];
  }

  public get calls(): number {
    return this.requests.length;
  }

  public async generateJson(request: LlmJsonRequest): Promise<LlmJsonResult> {
    this.requests.push(request);
    const reply = this.replies.shift();
    if (reply === undefined) throw new Error('FakeAdvisorLlm: không còn câu trả lời nào.');
    if (reply instanceof Error) throw reply;
    return {
      text: typeof reply === 'string' ? reply : JSON.stringify(reply),
      usage: { ...this.usage },
    };
  }
}
