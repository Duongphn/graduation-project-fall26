import type { AiAdvisorSettings } from '../config/ai.config.js';
import type { AdvisorSource } from '../constants/ai-advisor.js';
import type {
  AdvisorCatalogPort,
  AdvisorLlm,
  AdvisorUsageLogPort,
  LlmJsonRequest,
} from '../interfaces/ai-advisor.ports.js';
import {
  ANY_FILTER,
  type AdvisorAskInput,
  type AdvisorCategory,
  type AdvisorFilters,
  type AdvisorFiltersInput,
  type AdvisorListingType,
  type AdvisorReply,
  type AdvisorTokenUsage,
  type AdvisorToy,
  type AdvisorToyQuery,
  type AdvisorToyRecord,
} from '../types/ai-advisor.types.js';
import { serviceUnavailable, tooManyRequests } from '../utils/http-errors.js';
import { matchFaq } from './ai-advisor.faq.js';
import {
  ADVISE_JSON_SCHEMA,
  ADVISE_SYSTEM_PROMPT,
  ADVISOR_LIMITS,
  type AdvisorRelaxation,
  EXTRACT_JSON_SCHEMA,
  buildAdvisePrompt,
  buildExtractPrompt,
  buildExtractSystemPrompt,
  compactFilters,
  maskPersonalInfo,
  recentHistory,
  truncate,
} from './ai-advisor.prompts.js';

const MAX_AGE = 18;
const MAX_PRICE = 1_000_000_000;
const AREA_CHARS = 60;
const INTRO_CHARS = 400;
const LISTING_TYPES: readonly AdvisorListingType[] = ['any', 'rent', 'sell', 'donate'];
const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;

const REPLIES = Object.freeze({
  offTopic:
    'Mình là Robo, chỉ tư vấn chọn đồ chơi trên ToyFlow. Bạn cho mình biết bé mấy tuổi, thích gì, muốn thuê, mua hay nhận tặng và mức giá nhé!',
  noResult:
    'Hiện chưa có đồ chơi nào phù hợp trên ToyFlow. Bạn thử đổi độ tuổi, loại đồ chơi, hình thức hoặc mức giá nhé.',
  aiBusy: 'Trợ lý AI đang bận, mình gửi bạn các món phù hợp với bộ lọc hiện tại.',
  defaultIntro: 'Đây là các món mình thấy phù hợp với bé.',
  smallParts:
    'Lưu ý: bé dưới 3 tuổi, bố mẹ kiểm tra kỹ các chi tiết nhỏ có thể gây hóc trước khi cho bé chơi.',
  disabled: 'Trợ lý AI đang tạm tắt. Bạn vẫn có thể tìm đồ chơi trong mục Khám phá.',
});

const RELAXATION_REPLIES: Record<AdvisorRelaxation, string | null> = {
  none: null,
  price: 'Không có món nào đúng mức giá bạn đặt, mình gợi ý thêm các món ở mức giá khác.',
  category: 'Chưa có món đúng loại bạn tìm, mình gợi ý thêm các loại khác phù hợp.',
  price_and_category:
    'Chưa có món đúng loại và mức giá bạn đặt, mình gợi ý thêm các món khác phù hợp.',
};

const LISTING_LABELS: Record<AdvisorToy['listingType'], string> = {
  rent: 'cho thuê',
  sell: 'đang bán',
  donate: 'tặng miễn phí',
};

export const DEFAULT_ADVISOR_FILTERS: AdvisorFilters = Object.freeze({
  ageYears: null,
  category: ANY_FILTER,
  listingType: 'any',
  maxPrice: null,
  area: '',
});

/** 0h hôm nay theo giờ Việt Nam (UTC+7, không đổi giờ theo mùa). */
export const startOfVietnamDay = (now: Date): Date => {
  const local = new Date(now.getTime() + VIETNAM_OFFSET_MS);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - VIETNAM_OFFSET_MS);
};

// ---------- Làm sạch bộ lọc: kết quả AI và dữ liệu client luôn được kiểm tra lại ----------

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asAge = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_AGE
    ? value
    : null;

/** 0, số âm hoặc không phải số: không giới hạn giá. */
const asPrice = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.min(Math.round(value), MAX_PRICE)
    : null;

/** Slug không thuộc danh mục đang hoạt động thì về 'any'. */
const asCategory = (value: unknown, slugs: ReadonlySet<string>): string =>
  typeof value === 'string' && slugs.has(value.trim()) ? value.trim() : ANY_FILTER;

const asListingType = (value: unknown): AdvisorListingType =>
  LISTING_TYPES.find((type) => type === value) ?? 'any';

const asArea = (value: unknown): string =>
  typeof value === 'string' ? truncate(maskPersonalInfo(value), AREA_CHARS) : '';

export const sanitizeFilters = (
  raw: AdvisorFiltersInput | undefined,
  slugs: ReadonlySet<string>,
): AdvisorFilters => ({
  ageYears: asAge(raw?.ageYears),
  category: asCategory(raw?.category, slugs),
  listingType: asListingType(raw?.listingType),
  maxPrice: asPrice(raw?.maxPrice),
  area: asArea(raw?.area),
});

/** US-02: giữ bộ lọc lượt trước, chỉ đổi các trường AI trích được từ câu vừa hỏi. */
export const mergeExtractedFilters = (
  current: AdvisorFilters,
  extracted: Record<string, unknown>,
  slugs: ReadonlySet<string>,
): AdvisorFilters => {
  const next = { ...current };
  const age = asAge(extracted.ageYears);
  if (age !== null) next.ageYears = age;
  if (extracted.category !== undefined) next.category = asCategory(extracted.category, slugs);
  if (extracted.listingType !== undefined) next.listingType = asListingType(extracted.listingType);
  if (extracted.maxPrice !== undefined) next.maxPrice = asPrice(extracted.maxPrice);
  if (extracted.area !== undefined) next.area = asArea(extracted.area);
  return next;
};

const parseJsonObject = (text: string): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed)) throw new Error('Gemini trả về JSON không phải object.');
  return parsed;
};

const fallbackReason = (toy: AdvisorToyRecord) =>
  `Dành cho bé ${toy.ageRange.minAge}–${toy.ageRange.maxAge} tuổi, ${LISTING_LABELS[toy.listingType]}.`;

const toAdvisorToy = (toy: AdvisorToyRecord, reason: string): AdvisorToy => ({
  id: toy.id,
  name: toy.title,
  listingType: toy.listingType,
  priceOrRate: toy.priceOrRate,
  condition: toy.condition,
  image: toy.image,
  reason: truncate(reason, ADVISOR_LIMITS.reasonChars),
});

/** BR-02, BR-03: chỉ giữ toyId nằm trong danh sách đã gửi cho AI, không trùng, tối đa 5 món. */
export const pickListedToys = (picks: unknown, toys: readonly AdvisorToyRecord[]): AdvisorToy[] => {
  if (!Array.isArray(picks)) return [];
  const listed = new Map(toys.map((toy) => [toy.id, toy]));
  const chosen = new Map<string, AdvisorToy>();
  for (const pick of picks) {
    if (chosen.size >= ADVISOR_LIMITS.maxToys) break;
    if (!isRecord(pick) || typeof pick.toyId !== 'string') continue;
    const toy = listed.get(pick.toyId.trim());
    if (!toy || chosen.has(toy.id)) continue;
    const reason =
      typeof pick.reason === 'string' && pick.reason.trim() ? pick.reason : fallbackReason(toy);
    chosen.set(toy.id, toAdvisorToy(toy, reason));
  }
  return [...chosen.values()];
};

export interface AiAdvisorDependencies {
  llm: AdvisorLlm;
  catalog: AdvisorCatalogPort;
  usageLog: AdvisorUsageLogPort;
  settings: AiAdvisorSettings;
  clock?: { now(): Date };
  logger?: Pick<Console, 'warn' | 'error'>;
}

interface TurnContext {
  userId: string;
  prompt: string;
  startedAt: number;
  usage: AdvisorTokenUsage;
}

/** Trợ lý AI tư vấn đồ chơi (POST /api/v1/ai/advisor). AI chỉ gợi ý, phụ huynh tự quyết định. */
export class AiAdvisorService {
  private readonly clock: { now(): Date };
  private readonly logger: Pick<Console, 'warn' | 'error'>;

  public constructor(private readonly deps: AiAdvisorDependencies) {
    this.clock = deps.clock ?? { now: () => new Date() };
    this.logger = deps.logger ?? console;
  }

  public get isEnabled(): boolean {
    return this.deps.settings.enabled;
  }

  /** Lỗi 503 khi Admin tắt trợ lý (US-08). */
  public disabledError() {
    return serviceUnavailable('AI_ADVISOR_DISABLED', REPLIES.disabled);
  }

  public async ask(input: AdvisorAskInput): Promise<AdvisorReply> {
    if (!this.isEnabled) throw this.disabledError();

    const message = maskPersonalInfo(input.message.trim());
    const categories = await this.deps.catalog.listActiveCategories();
    const slugs = new Set(categories.map((category) => category.slug));
    let filters = sanitizeFilters(input.filters, slugs);
    const turn: TurnContext = {
      userId: input.userId,
      prompt: message || `[Bộ lọc] ${compactFilters(filters)}`,
      startedAt: Date.now(),
      usage: { input: 0, output: 0, thoughts: 0, calls: 0 },
    };

    // 1. FAQ: trả lời ngay, không gọi Gemini, không tính lượt (US-03, BR-08, mục 8.7).
    if (!input.filtersFromButtons) {
      const answer = matchFaq(message);
      if (answer) return this.finish(turn, 'faq', answer, filters);
    }

    // 2. Giới hạn lượt hỏi mỗi ngày (BR-08).
    const used = await this.deps.usageLog.countSince(
      input.userId,
      startOfVietnamDay(this.clock.now()),
    );
    if (used >= this.deps.settings.dailyLimit) {
      throw tooManyRequests(
        'AI_DAILY_LIMIT',
        `Bạn đã dùng hết ${this.deps.settings.dailyLimit} lượt hỏi trợ lý AI hôm nay. Hẹn bạn ngày mai nhé!`,
      );
    }

    // 3. Lần gọi 1: trích bộ lọc. Bỏ qua khi chọn bằng nút bấm (US-04, mục 8.7).
    let aiFailed = false;
    if (!input.filtersFromButtons) {
      try {
        const extracted = await this.callJson(turn, {
          systemInstruction: buildExtractSystemPrompt([...slugs]),
          prompt: buildExtractPrompt({ message, filters, history: recentHistory(input.history) }),
          responseJsonSchema: EXTRACT_JSON_SCHEMA,
          maxOutputTokens: ADVISOR_LIMITS.extractMaxOutputTokens,
        });
        if (extracted.isToyRelated === false) {
          return this.finish(turn, 'off_topic', REPLIES.offTopic, filters);
        }
        if (extracted.isToyRelated !== true) throw new Error('Thiếu isToyRelated.');
        filters = mergeExtractedFilters(filters, extracted, slugs);
      } catch (error) {
        aiFailed = true;
        this.warn('trích bộ lọc', error);
      }
    }

    // 4. Tìm trong MongoDB trước (mục 8.1), nới bộ lọc nếu cần (BR-07).
    const { toys, relaxation } = await this.searchWithRelaxation(filters, input.userId, categories);
    if (toys.length === 0) {
      // Không có món nào: trả lời mẫu, KHÔNG gọi Gemini lần hai.
      return aiFailed
        ? this.finish(turn, 'fallback', `${REPLIES.aiBusy}\n${REPLIES.noResult}`, filters)
        : this.finish(turn, 'no_result', REPLIES.noResult, filters);
    }
    if (aiFailed) return this.fallback(turn, filters, toys, relaxation);

    // 5. Lần gọi 2: tư vấn trên tối đa 5 món đã tìm được.
    try {
      const advice = await this.callJson(turn, {
        systemInstruction: ADVISE_SYSTEM_PROMPT,
        prompt: buildAdvisePrompt({ message, filters, toys, relaxation }),
        responseJsonSchema: ADVISE_JSON_SCHEMA,
        maxOutputTokens: ADVISOR_LIMITS.adviseMaxOutputTokens,
      });
      const picked = pickListedToys(advice.picks, toys);
      if (picked.length === 0) throw new Error('AI không chọn món nào trong danh sách.');
      const intro =
        typeof advice.intro === 'string' && advice.intro.trim()
          ? truncate(advice.intro, INTRO_CHARS)
          : REPLIES.defaultIntro;
      return this.finish(
        turn,
        'ai',
        this.composeReply(intro, filters, relaxation, picked),
        filters,
        picked,
      );
    } catch (error) {
      this.warn('tư vấn', error);
      return this.fallback(turn, filters, toys, relaxation);
    }
  }

  private async searchWithRelaxation(
    filters: AdvisorFilters,
    userId: string,
    categories: readonly AdvisorCategory[],
  ): Promise<{ toys: AdvisorToyRecord[]; relaxation: AdvisorRelaxation }> {
    const query: AdvisorToyQuery = {
      ageYears: filters.ageYears,
      categoryId: categories.find((category) => category.slug === filters.category)?.id ?? null,
      listingType: filters.listingType === 'any' ? null : filters.listingType,
      maxPrice: filters.maxPrice,
      excludeOwnerId: userId,
      limit: ADVISOR_LIMITS.maxToys,
    };
    const exact = await this.deps.catalog.searchToys(query);
    if (exact.length > 0) return { toys: exact, relaxation: 'none' };

    // Bỏ giá trước, rồi bỏ danh mục.
    if (query.maxPrice !== null) {
      const withoutPrice = await this.deps.catalog.searchToys({ ...query, maxPrice: null });
      if (withoutPrice.length > 0) return { toys: withoutPrice, relaxation: 'price' };
    }
    if (query.categoryId !== null) {
      const relaxed = await this.deps.catalog.searchToys({
        ...query,
        maxPrice: null,
        categoryId: null,
      });
      if (relaxed.length > 0) {
        return {
          toys: relaxed,
          relaxation: query.maxPrice !== null ? 'price_and_category' : 'category',
        };
      }
    }
    return { toys: [], relaxation: 'none' };
  }

  private composeReply(
    intro: string,
    filters: AdvisorFilters,
    relaxation: AdvisorRelaxation,
    toys: readonly AdvisorToy[],
  ): string {
    const lines = [intro];
    const relaxed = RELAXATION_REPLIES[relaxation];
    if (relaxed) lines.push(relaxed);
    // BR-05: luôn nhắc khi bé dưới 3 tuổi, không phụ thuộc AI có nhớ hay không.
    if (filters.ageYears !== null && filters.ageYears < 3 && toys.length > 0) {
      lines.push(REPLIES.smallParts);
    }
    if (filters.area) {
      lines.push(
        `Mình chưa lọc được theo khu vực (${filters.area}), bạn trao đổi với chủ đồ chơi về địa điểm giao nhận nhé.`,
      );
    }
    return lines.join('\n');
  }

  /** US-05: Gemini lỗi, quá thời gian hoặc trả JSON hỏng: trả kết quả tìm kiếm thường. */
  private fallback(
    turn: TurnContext,
    filters: AdvisorFilters,
    records: readonly AdvisorToyRecord[],
    relaxation: AdvisorRelaxation,
  ): Promise<AdvisorReply> {
    const toys = records.map((toy) => toAdvisorToy(toy, fallbackReason(toy)));
    return this.finish(
      turn,
      'fallback',
      this.composeReply(REPLIES.aiBusy, filters, relaxation, toys),
      filters,
      toys,
    );
  }

  private async callJson(
    turn: TurnContext,
    request: LlmJsonRequest,
  ): Promise<Record<string, unknown>> {
    turn.usage.calls += 1;
    const result = await this.deps.llm.generateJson(request);
    turn.usage.input += result.usage.input;
    turn.usage.output += result.usage.output;
    turn.usage.thoughts += result.usage.thoughts;
    return parseJsonObject(result.text);
  }

  /** US-07: mỗi lượt hỏi đúng 1 bản ghi AiRequest; lỗi ghi log không làm hỏng câu trả lời. */
  private async finish(
    turn: TurnContext,
    source: AdvisorSource,
    reply: string,
    filters: AdvisorFilters,
    toys: AdvisorToy[] = [],
  ): Promise<AdvisorReply> {
    try {
      await this.deps.usageLog.record({
        userId: turn.userId,
        status: source,
        prompt: turn.prompt,
        response: reply,
        tokenUsage: { ...turn.usage },
        latencyMs: Date.now() - turn.startedAt,
        modelName: turn.usage.calls > 0 ? this.deps.llm.modelName : undefined,
      });
    } catch (error) {
      this.logger.error('[ai-advisor] Không ghi được log AiRequest.', error);
    }
    return { reply, toys, filters, source };
  }

  private warn(step: string, error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    this.logger.warn(`[ai-advisor] Gemini lỗi ở bước ${step}, chuyển sang fallback: ${reason}`);
  }
}
