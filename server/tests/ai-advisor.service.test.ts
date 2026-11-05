import { describe, expect, it } from 'vitest';

import type { AiAdvisorSettings } from '../src/config/ai.config.js';
import type {
  AdvisorCatalogPort,
  AdvisorUsageLogPort,
} from '../src/interfaces/ai-advisor.ports.js';
import { ADVISE_SYSTEM_PROMPT } from '../src/services/ai-advisor.prompts.js';
import { AiAdvisorService, startOfVietnamDay } from '../src/services/ai-advisor.service.js';
import type {
  AdvisorAskInput,
  AdvisorCategory,
  AdvisorLogEntry,
  AdvisorToyQuery,
  AdvisorToyRecord,
} from '../src/types/ai-advisor.types.js';
import { AppError } from '../src/utils/app-error.js';
import { FakeAdvisorLlm } from './support/fake-advisor-llm.js';

const USER_ID = '66b000000000000000000001';

const CATEGORIES: AdvisorCategory[] = [
  { id: 'cat-building', slug: 'lap-rap-xep-hinh', name: 'Lắp ráp & xếp hình' },
  { id: 'cat-dolls', slug: 'bup-be-thu-bong', name: 'Búp bê & thú bông' },
];

type CatalogToy = AdvisorToyRecord & { categoryId: string };

const toy = (index: number, overrides: Partial<CatalogToy> = {}): CatalogToy => ({
  id: `66a00000000000000000000${index}`,
  title: `Đồ chơi ${index}`,
  description: 'Mô tả đồ chơi.',
  listingType: 'rent',
  priceOrRate: 50_000,
  condition: 'Tốt (70–89%)',
  ageRange: { minAge: 3, maxAge: 6 },
  image: `https://img.test/${index}.jpg`,
  categoryId: 'cat-building',
  ...overrides,
});

/** Catalog giả: lọc trong bộ nhớ giống truy vấn MongoDB và đếm số lần tìm. */
class FakeCatalog implements AdvisorCatalogPort {
  public readonly searches: AdvisorToyQuery[] = [];

  public constructor(private readonly toys: CatalogToy[]) {}

  public async listActiveCategories(): Promise<AdvisorCategory[]> {
    return CATEGORIES;
  }

  public async searchToys(query: AdvisorToyQuery): Promise<AdvisorToyRecord[]> {
    this.searches.push(query);
    return this.toys
      .filter(
        (item) =>
          (query.listingType === null || item.listingType === query.listingType) &&
          (query.categoryId === null || item.categoryId === query.categoryId) &&
          (query.maxPrice === null || item.priceOrRate <= query.maxPrice) &&
          (query.ageYears === null ||
            (item.ageRange.minAge <= query.ageYears && item.ageRange.maxAge >= query.ageYears)),
      )
      .slice(0, query.limit)
      .map(({ categoryId: _categoryId, ...record }) => record);
  }
}

class FakeUsageLog implements AdvisorUsageLogPort {
  public readonly entries: AdvisorLogEntry[] = [];
  public used = 0;
  public failOnRecord = false;

  public async countSince(): Promise<number> {
    return this.used;
  }

  public async record(entry: AdvisorLogEntry): Promise<void> {
    if (this.failOnRecord) throw new Error('Mất kết nối DB');
    this.entries.push(entry);
  }
}

const SETTINGS: AiAdvisorSettings = {
  enabled: true,
  modelName: 'fake-gemini',
  timeoutMs: 8_000,
  dailyLimit: 20,
};

const silentLogger = { warn: () => undefined, error: () => undefined };

const setup = (llm: FakeAdvisorLlm, toys: CatalogToy[] = [toy(1), toy(2), toy(3)]) => {
  const catalog = new FakeCatalog(toys);
  const usageLog = new FakeUsageLog();
  const service = new AiAdvisorService({
    llm,
    catalog,
    usageLog,
    settings: SETTINGS,
    logger: silentLogger,
  });
  return { service, catalog, usageLog };
};

const ask = (overrides: Partial<AdvisorAskInput> = {}): AdvisorAskInput => ({
  userId: USER_ID,
  message: 'Bé 4 tuổi thích xếp hình, muốn thuê dưới 150k',
  history: [],
  filtersFromButtons: false,
  ...overrides,
});

const EXTRACTED = {
  isToyRelated: true,
  ageYears: 4,
  category: 'lap-rap-xep-hinh',
  listingType: 'rent',
  maxPrice: 150_000,
};

describe('AiAdvisorService', () => {
  it('drops picks whose toyId was not in the list sent to the AI (case 2, BR-02)', async () => {
    const llm = new FakeAdvisorLlm([
      EXTRACTED,
      {
        intro: 'Gợi ý cho bé.',
        picks: [
          { toyId: toy(1).id, reason: 'Hợp tuổi.' },
          { toyId: '66a0000000000000000000ff', reason: 'Món AI tự bịa.' },
          { toyId: toy(1).id, reason: 'Trùng.' },
          { toyId: toy(2).id, reason: 'Phát triển tư duy.' },
        ],
      },
    ]);
    const { service } = setup(llm);

    const result = await service.ask(ask());

    expect(result.source).toBe('ai');
    expect(result.toys.map((item) => item.id)).toEqual([toy(1).id, toy(2).id]);
    expect(result.toys[0]).toMatchObject({
      name: 'Đồ chơi 1',
      priceOrRate: 50_000,
      reason: 'Hợp tuổi.',
    });
  });

  it('turns a category outside the active list into "any" (case 3)', async () => {
    const llm = new FakeAdvisorLlm([
      { ...EXTRACTED, category: 'building' },
      { intro: 'Ok.', picks: [{ toyId: toy(1).id, reason: 'Hợp tuổi.' }] },
    ]);
    const { service, catalog } = setup(llm);

    const result = await service.ask(ask());

    expect(result.filters.category).toBe('any');
    expect(catalog.searches[0]?.categoryId).toBeNull();
  });

  it('answers off-topic questions without searching (case 5)', async () => {
    const llm = new FakeAdvisorLlm([{ isToyRelated: false }]);
    const { service, catalog, usageLog } = setup(llm);

    const result = await service.ask(ask({ message: 'Thời tiết Hà Nội hôm nay thế nào?' }));

    expect(result).toMatchObject({ source: 'off_topic', toys: [] });
    expect(catalog.searches).toHaveLength(0);
    expect(llm.calls).toBe(1);
    expect(usageLog.entries[0]?.status).toBe('off_topic');
  });

  it('relaxes price then category, and calls Gemini once when nothing matches (case 6, BR-07)', async () => {
    const llm = new FakeAdvisorLlm([EXTRACTED]);
    const { service, catalog } = setup(llm, [toy(1, { ageRange: { minAge: 10, maxAge: 14 } })]);

    const result = await service.ask(ask());

    expect(result).toMatchObject({ source: 'no_result', toys: [] });
    expect(llm.calls).toBe(1);
    expect(catalog.searches.map((query) => [query.maxPrice, query.categoryId])).toEqual([
      [150_000, 'cat-building'],
      [null, 'cat-building'],
      [null, null],
    ]);
  });

  it('suggests toys at other prices when only the price limit blocks them', async () => {
    const llm = new FakeAdvisorLlm([
      EXTRACTED,
      { intro: 'Có món hơi cao giá.', picks: [{ toyId: toy(1).id, reason: 'Hợp tuổi.' }] },
    ]);
    const { service } = setup(llm, [toy(1, { priceOrRate: 200_000 })]);

    const result = await service.ask(ask());

    expect(result.source).toBe('ai');
    expect(result.reply).toContain('mức giá khác');
    expect(result.filters.maxPrice).toBe(150_000);
  });

  it('calls Gemini exactly once, for the advice, when filters come from buttons (case 7)', async () => {
    const llm = new FakeAdvisorLlm([
      { intro: 'Ok.', picks: [{ toyId: toy(1).id, reason: 'Hợp tuổi.' }] },
    ]);
    const { service } = setup(llm);

    const result = await service.ask(
      ask({
        message: '',
        filtersFromButtons: true,
        filters: { ageYears: 4, listingType: 'rent', category: 'lap-rap-xep-hinh' },
      }),
    );

    expect(result.source).toBe('ai');
    expect(llm.calls).toBe(1);
    expect(llm.requests[0]?.systemInstruction).toBe(ADVISE_SYSTEM_PROMPT);
  });

  it.each([
    ['a timeout on the filter call', [new Error('Gemini không phản hồi sau 8000 ms.')]],
    ['broken JSON on the filter call', ['{"isToyRelated": tru']],
    ['an error on the advice call', [EXTRACTED, new Error('503 UNAVAILABLE')]],
    ['broken JSON on the advice call', [EXTRACTED, 'not json']],
    [
      'advice picking only unknown toys',
      [EXTRACTED, { intro: 'x', picks: [{ toyId: 'nope', reason: 'x' }] }],
    ],
  ])('falls back to plain search results on %s (case 8)', async (_label, replies) => {
    const llm = new FakeAdvisorLlm(replies as never[]);
    const { service, usageLog } = setup(llm);

    const result = await service.ask(ask());

    expect(result.source).toBe('fallback');
    expect(result.toys.length).toBeGreaterThan(0);
    expect(result.toys[0]?.reason).toContain('Dành cho bé 3–6 tuổi');
    expect(result.reply).toContain('Trợ lý AI đang bận');
    expect(usageLog.entries[0]?.status).toBe('fallback');
  });

  it('sends only the 2 latest messages, each at most 300 characters (case 13)', async () => {
    const llm = new FakeAdvisorLlm([
      EXTRACTED,
      { intro: 'Ok.', picks: [{ toyId: toy(1).id, reason: 'Hợp tuổi.' }] },
    ]);
    const { service } = setup(llm);
    const history = Array.from({ length: 10 }, (_, index) => ({
      role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
      text: `tin-${index} ${'x'.repeat(1_000)}`,
    }));

    await service.ask(ask({ history }));

    const chatLines = (llm.requests[0]?.prompt ?? '')
      .split('\n')
      .filter((line) => /^(user|assistant): /.test(line));
    expect(chatLines).toHaveLength(2);
    expect(chatLines[0]).toMatch(/^user: tin-8 /);
    expect(chatLines[1]).toMatch(/^assistant: tin-9 /);
    for (const line of chatLines) {
      expect(line.replace(/^(user|assistant): /, '').length).toBeLessThanOrEqual(300);
    }
    // Lần gọi tư vấn không gửi lịch sử.
    expect(llm.requests[1]?.prompt).not.toContain('tin-9');
  });

  it('keeps the previous filters and changes only what the parent just said (US-02)', async () => {
    const llm = new FakeAdvisorLlm([
      { isToyRelated: true, maxPrice: 100_000 },
      { intro: 'Ok.', picks: [{ toyId: toy(1).id, reason: 'Rẻ hơn.' }] },
    ]);
    const { service } = setup(llm);

    const result = await service.ask(
      ask({
        message: 'rẻ hơn được không',
        filters: {
          ageYears: 4,
          category: 'lap-rap-xep-hinh',
          listingType: 'rent',
          maxPrice: 150_000,
        },
      }),
    );

    expect(result.filters).toEqual({
      ageYears: 4,
      category: 'lap-rap-xep-hinh',
      listingType: 'rent',
      maxPrice: 100_000,
      area: '',
    });
    expect(llm.requests[0]?.prompt).toContain('"maxPrice":150000');
  });

  it('answers FAQ without Gemini, logs it as faq and still answers past the daily limit (US-03)', async () => {
    const llm = new FakeAdvisorLlm();
    const { service, usageLog } = setup(llm);
    usageLog.used = 20;

    const result = await service.ask(ask({ message: 'Tiền cọc được hoàn lại thế nào?' }));

    expect(result.source).toBe('faq');
    expect(result.reply).toContain('Tiền cọc');
    expect(llm.calls).toBe(0);
    expect(usageLog.entries[0]).toMatchObject({
      status: 'faq',
      tokenUsage: { input: 0, output: 0, thoughts: 0, calls: 0 },
    });
    expect(usageLog.entries[0]?.modelName).toBeUndefined();
  });

  it('refuses with 429 once the daily limit is used up (BR-08)', async () => {
    const llm = new FakeAdvisorLlm();
    const { service, usageLog } = setup(llm);
    usageLog.used = 20;

    const error = await service.ask(ask()).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ statusCode: 429, code: 'AI_DAILY_LIMIT' });
    expect(llm.calls).toBe(0);
  });

  it('warns about small parts for children under 3 (BR-05)', async () => {
    const llm = new FakeAdvisorLlm([
      { ...EXTRACTED, ageYears: 2, category: 'any', maxPrice: 0 },
      { intro: 'Ok.', picks: [{ toyId: toy(1).id, reason: 'Hợp tuổi.' }] },
    ]);
    const { service } = setup(llm, [toy(1, { ageRange: { minAge: 1, maxAge: 3 } })]);

    const result = await service.ask(ask({ message: 'Bé 2 tuổi nên chơi gì?' }));

    expect(result.source).toBe('ai');
    expect(result.reply).toContain('chi tiết nhỏ');
  });

  it('masks phone numbers and emails before calling Gemini (BR-09)', async () => {
    const llm = new FakeAdvisorLlm([{ isToyRelated: false }]);
    const { service, usageLog } = setup(llm);

    await service.ask(ask({ message: 'Gọi mình 0912 345 678 hoặc me@mail.com nhé' }));

    expect(llm.requests[0]?.prompt).not.toMatch(/0912|me@mail\.com/);
    expect(llm.requests[0]?.prompt).toContain('[SĐT]');
    expect(usageLog.entries[0]?.prompt).not.toContain('0912');
  });

  it('still answers when writing the AiRequest log fails', async () => {
    const llm = new FakeAdvisorLlm([{ isToyRelated: false }]);
    const { service, usageLog } = setup(llm);
    usageLog.failOnRecord = true;

    const result = await service.ask(ask({ message: 'Hôm nay ăn gì?' }));

    expect(result.source).toBe('off_topic');
  });

  it('refuses with 503 when the advisor is turned off (US-08)', async () => {
    const service = new AiAdvisorService({
      llm: new FakeAdvisorLlm(),
      catalog: new FakeCatalog([]),
      usageLog: new FakeUsageLog(),
      settings: { ...SETTINGS, enabled: false },
    });

    await expect(service.ask(ask())).rejects.toMatchObject({ statusCode: 503 });
  });
});

describe('startOfVietnamDay', () => {
  it('starts the day at midnight UTC+7', () => {
    expect(startOfVietnamDay(new Date('2026-11-04T16:59:00.000Z')).toISOString()).toBe(
      '2026-11-03T17:00:00.000Z',
    );
    expect(startOfVietnamDay(new Date('2026-11-04T17:00:00.000Z')).toISOString()).toBe(
      '2026-11-04T17:00:00.000Z',
    );
  });
});
