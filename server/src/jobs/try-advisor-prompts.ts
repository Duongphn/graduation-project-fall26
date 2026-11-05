// Chạy thử prompt của trợ lý AI với Gemini thật và in số token thực tế: `npm run ai:try-prompts`.
// Cần GEMINI_API_KEY trong server/.env. Không đụng tới MongoDB; không dùng trong test tự động.
import { aiConfig } from '../config/ai.config.js';
import { defaultCategories } from '../constants/default-categories.js';
import { GeminiAdvisorClient } from '../integrations/ai/gemini.client.js';
import type { LlmJsonRequest } from '../interfaces/ai-advisor.ports.js';
import {
  ADVISE_JSON_SCHEMA,
  ADVISE_SYSTEM_PROMPT,
  ADVISOR_LIMITS,
  EXTRACT_JSON_SCHEMA,
  buildAdvisePrompt,
  buildExtractPrompt,
  buildExtractSystemPrompt,
} from '../services/ai-advisor.prompts.js';
import type { AdvisorFilters, AdvisorToyRecord } from '../types/ai-advisor.types.js';

const NO_FILTERS: AdvisorFilters = {
  ageYears: null,
  category: 'any',
  listingType: 'any',
  maxPrice: null,
  area: '',
};

const SAMPLE_QUESTIONS: { message: string; filters: AdvisorFilters }[] = [
  { message: 'Bé 4 tuổi thích xếp hình, muốn thuê dưới 150k gần Cầu Giấy', filters: NO_FILTERS },
  { message: 'Con gái 2 tuổi nên chơi gì để phát triển vận động?', filters: NO_FILTERS },
  { message: 'Có xe điều khiển cho bé trai 7 tuổi không, mua tầm 300 nghìn', filters: NO_FILTERS },
  {
    message: 'rẻ hơn được không',
    filters: {
      ...NO_FILTERS,
      ageYears: 4,
      category: 'xep-hinh-lap-rap',
      listingType: 'rent',
      maxPrice: 150_000,
    },
  },
  { message: 'Thời tiết Hà Nội hôm nay thế nào?', filters: NO_FILTERS },
];

const description =
  'Bộ đồ chơi còn đầy đủ chi tiết, màu sắc tươi, đã vệ sinh sạch sẽ trước khi cho thuê. Phù hợp để bé chơi tại nhà cùng bố mẹ và phát triển tư duy.';

const SAMPLE_TOYS: AdvisorToyRecord[] = [
  ['Bộ xếp hình Duplo 60 chi tiết', 'rent', 40_000],
  ['Bộ lắp ráp gỗ thành phố', 'rent', 35_000],
  ['Xếp hình nam châm 48 miếng', 'rent', 50_000],
  ['Tháp xếp chồng cầu vồng', 'sell', 120_000],
  ['Bộ khối gỗ chữ cái', 'donate', 0],
].map(([title, listingType, priceOrRate], index) => ({
  id: `66a0000000000000000000a${index}`,
  title: String(title),
  description,
  listingType: listingType as AdvisorToyRecord['listingType'],
  priceOrRate: Number(priceOrRate),
  condition: 'Tốt (70–89%)',
  ageRange: { minAge: 3, maxAge: 6 },
  image: '',
}));

interface Row {
  call: 1 | 2;
  question: string;
  input: number;
  output: number;
  thoughts: number;
  ms: number;
  result: string;
}

const average = (rows: Row[], key: 'input' | 'output' | 'thoughts' | 'ms') =>
  rows.length > 0 ? Math.round(rows.reduce((sum, row) => sum + row[key], 0) / rows.length) : 0;

const run = async (): Promise<void> => {
  if (!aiConfig.geminiApiKey) {
    console.error('Thiếu GEMINI_API_KEY trong server/.env: bỏ qua chạy thử.');
    process.exitCode = 1;
    return;
  }
  const client = new GeminiAdvisorClient({
    apiKey: aiConfig.geminiApiKey,
    modelName: aiConfig.advisor.modelName,
    timeoutMs: aiConfig.advisor.timeoutMs,
  });
  const rows: Row[] = [];
  const call = async (kind: 1 | 2, question: string, request: LlmJsonRequest) => {
    const startedAt = Date.now();
    try {
      const { text, usage } = await client.generateJson(request);
      rows.push({
        call: kind,
        question: question.slice(0, 40),
        ...usage,
        ms: Date.now() - startedAt,
        result: text.slice(0, 120),
      });
    } catch (error) {
      console.error(
        `Lần gọi ${kind} lỗi ("${question}"):`,
        error instanceof Error ? error.message : error,
      );
    }
  };

  // Danh mục mẫu của repo (constants/default-categories.ts); DB thật có thể khác vài slug.
  const extractSystem = buildExtractSystemPrompt(
    defaultCategories.map((category) => category.slug),
  );
  for (const sample of SAMPLE_QUESTIONS) {
    await call(1, sample.message, {
      systemInstruction: extractSystem,
      prompt: buildExtractPrompt({ message: sample.message, filters: sample.filters, history: [] }),
      responseJsonSchema: EXTRACT_JSON_SCHEMA,
      maxOutputTokens: ADVISOR_LIMITS.extractMaxOutputTokens,
    });
  }

  const first = SAMPLE_QUESTIONS[0]!;
  await call(2, first.message, {
    systemInstruction: ADVISE_SYSTEM_PROMPT,
    prompt: buildAdvisePrompt({
      message: first.message,
      filters: {
        ...NO_FILTERS,
        ageYears: 4,
        category: 'xep-hinh-lap-rap',
        listingType: 'rent',
        maxPrice: 150_000,
        area: 'Cầu Giấy',
      },
      toys: SAMPLE_TOYS,
      relaxation: 'none',
    }),
    responseJsonSchema: ADVISE_JSON_SCHEMA,
    maxOutputTokens: ADVISOR_LIMITS.adviseMaxOutputTokens,
  });

  console.info(`Model: ${client.modelName}`);
  console.table(rows);
  for (const kind of [1, 2] as const) {
    const ofKind = rows.filter((row) => row.call === kind);
    console.info(
      `Trung bình lần gọi ${kind} (${ofKind.length} lượt): input ${average(ofKind, 'input')}, output ${average(ofKind, 'output')}, thoughts ${average(ofKind, 'thoughts')}, ${average(ofKind, 'ms')} ms`,
    );
  }
};

run().catch((error: unknown) => {
  console.error('Chạy thử prompt thất bại.', error);
  process.exit(1);
});
