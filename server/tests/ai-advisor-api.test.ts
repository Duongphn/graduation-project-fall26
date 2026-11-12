import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import type { AiAdvisorSettings } from '../src/config/ai.config.js';
import { env } from '../src/config/env.js';
import { AiRequest } from '../src/models/ai-request.model.js';
import { Category } from '../src/models/category.model.js';
import { Toy } from '../src/models/toy.model.js';
import { FakeAdvisorLlm } from './support/fake-advisor-llm.js';
import { newId, useTestDatabase } from './support/test-database.js';

useTestDatabase();

const asker = newId();
const owner = newId();
const auth = (userId = asker.toString(), role: 'USER' | 'ADMIN' = 'USER') => ({
  Authorization: `Bearer ${jwt.sign({ userId, role }, env.jwtAccessSecret)}`,
});

const ENABLED: Partial<AiAdvisorSettings> = { enabled: true, dailyLimit: 20 };
const appWith = (llm: FakeAdvisorLlm, settings: Partial<AiAdvisorSettings> = ENABLED) =>
  createApp({ advisorLlm: llm, aiAdvisorSettings: settings });

let buildingId: string;
let matchingIds: string[] = [];
// Chỉ 5 món mới nhất được gửi cho AI; món tạo sau cùng luôn nằm trong danh sách.
const newestId = () => matchingIds[matchingIds.length - 1];

const baseToy = () => ({
  ownerId: owner,
  description: 'Bộ đồ chơi còn đầy đủ chi tiết, đã vệ sinh sạch sẽ.',
  condition: 'Tốt (70–89%)',
  listingType: 'rent',
  priceOrRate: 50_000,
  status: 'active',
  ageRange: { minAge: 3, maxAge: 6 },
  images: [{ url: 'https://img.test/cover.jpg', publicId: 'toyflow/cover' }],
});

beforeAll(async () => {
  const [building, dolls] = await Category.create([
    { name: 'Lắp ráp & xếp hình', slug: 'lap-rap-xep-hinh', status: 'ACTIVE' },
    { name: 'Búp bê & thú bông', slug: 'bup-be-thu-bong', status: 'active' },
  ]);
  buildingId = building!._id.toString();

  const matching = await Toy.create(
    Array.from({ length: 6 }, (_, index) => ({
      ...baseToy(),
      categoryId: building!._id,
      title: `Bộ xếp hình ${index + 1}`,
    })),
  );
  matchingIds = matching.map((item) => item._id.toString());

  // Không được gợi ý: chưa duyệt, đã ẩn, tin của chính người hỏi, quá giá, sai danh mục.
  await Toy.create([
    { ...baseToy(), categoryId: building!._id, title: 'Chờ duyệt', status: 'pending' },
    { ...baseToy(), categoryId: building!._id, title: 'Đã ẩn', status: 'hidden' },
    { ...baseToy(), categoryId: building!._id, title: 'Tin của tôi', ownerId: asker },
    { ...baseToy(), categoryId: building!._id, title: 'Quá giá', priceOrRate: 500_000 },
    { ...baseToy(), categoryId: dolls!._id, title: 'Búp bê' },
  ]);

  // Tạo sau cùng nên đứng đầu kết quả mới nhất: tin bán được gợi ý, đồ tặng thì không bao giờ.
  await Toy.create([
    {
      ...baseToy(),
      categoryId: building!._id,
      title: 'Bộ xếp hình đang bán',
      listingType: 'sell',
      priceOrRate: 120_000,
    },
    {
      ...baseToy(),
      categoryId: building!._id,
      title: 'Đồ tặng',
      listingType: 'donate',
      priceOrRate: 0,
    },
  ]);
});

beforeEach(async () => {
  await AiRequest.deleteMany({});
});

const EXTRACTED = {
  isToyRelated: true,
  ageYears: 4,
  category: 'lap-rap-xep-hinh',
  listingType: 'rent',
  maxPrice: 150_000,
};

describe('POST /api/v1/ai/advisor', () => {
  it('suggests at most 5 real, approved, available toys (case 1, US-01)', async () => {
    const llm = new FakeAdvisorLlm([
      EXTRACTED,
      {
        intro: 'Các bộ xếp hình hợp với bé 4 tuổi.',
        picks: [...matchingIds, '66a0000000000000000000ff'].map((toyId) => ({
          toyId,
          reason: 'Chi tiết to, hợp tay bé.',
        })),
      },
    ]);

    const res = await request(appWith(llm))
      .post('/api/v1/ai/advisor')
      .set(auth())
      .send({ message: 'Bé 4 tuổi thích xếp hình, muốn thuê dưới 150k gần Cầu Giấy' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data;
    expect(data.source).toBe('ai');
    expect(data.toys.length).toBeGreaterThan(0);
    expect(data.toys.length).toBeLessThanOrEqual(5);
    for (const item of data.toys) expect(matchingIds).toContain(item.id);
    expect(data.toys[0]).toMatchObject({
      listingType: 'rent',
      priceOrRate: 50_000,
      condition: 'Tốt (70–89%)',
      image: 'https://img.test/cover.jpg',
      reason: 'Chi tiết to, hợp tay bé.',
    });
    expect(data.filters).toMatchObject({
      ageYears: 4,
      category: 'lap-rap-xep-hinh',
      maxPrice: 150_000,
    });
    // Chỉ gửi tối đa 5 món cho AI (mục 8.1).
    const toyLines = (llm.requests[1]?.prompt ?? '')
      .split('\n')
      .filter((line) => / \| rent \| /.test(line));
    expect(toyLines).toHaveLength(5);
    expect(buildingId).toBeTruthy();
  });

  it('answers fee and deposit questions from the FAQ without Gemini (case 4)', async () => {
    const llm = new FakeAdvisorLlm();

    const res = await request(appWith(llm))
      .post('/api/v1/ai/advisor')
      .set(auth())
      .send({ message: 'Phí thuê và tiền cọc tính thế nào?' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ source: 'faq', toys: [] });
    expect(llm.calls).toBe(0);
  });

  it('refuses the 21st question of the day with 429 (case 9)', async () => {
    const yesterday = new Date(Date.now() - 36 * 60 * 60 * 1000);
    const log = (status: string, createdAt: Date) => ({
      user_id: asker,
      request_type: 'advisor',
      status,
      prompt: 'q',
      response: 'a',
      token_usage: { input: 0, output: 0, thoughts: 0, calls: 1 },
      latency_ms: 1,
      createdAt,
    });
    await AiRequest.collection.insertMany([
      ...Array.from({ length: 20 }, () => log('ai', new Date())),
      log('faq', new Date()),
    ]);
    const llm = new FakeAdvisorLlm([EXTRACTED]);

    const res = await request(appWith(llm))
      .post('/api/v1/ai/advisor')
      .set(auth())
      .send({ message: 'Bé 4 tuổi chơi gì?' });

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('AI_DAILY_LIMIT');
    expect(llm.calls).toBe(0);

    // Lượt của hôm qua không tính.
    await AiRequest.deleteMany({});
    await AiRequest.collection.insertMany(Array.from({ length: 20 }, () => log('ai', yesterday)));
    const fresh = await request(appWith(new FakeAdvisorLlm([{ isToyRelated: false }])))
      .post('/api/v1/ai/advisor')
      .set(auth())
      .send({ message: 'Hôm nay ăn gì?' });
    expect(fresh.status).toBe(200);
  });

  it.each([
    ['an empty message', { message: '   ' }],
    ['a message over 500 characters', { message: 'a'.repeat(501) }],
    ['history that is not an array', { message: 'Bé 4 tuổi', history: 'xin chào' }],
    [
      'history with an unknown role',
      { message: 'Bé 4 tuổi', history: [{ role: 'system', text: 'x' }] },
    ],
    ['a donate listing type', { message: 'Bé 4 tuổi', filters: { listingType: 'donate' } }],
  ])('rejects %s with 400 (case 10)', async (_label, body) => {
    const llm = new FakeAdvisorLlm();

    const res = await request(appWith(llm)).post('/api/v1/ai/advisor').set(auth()).send(body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(llm.calls).toBe(0);
  });

  it('accepts an empty message when filters come from buttons', async () => {
    const llm = new FakeAdvisorLlm([
      { intro: 'Ok.', picks: [{ toyId: newestId(), reason: 'Hợp tuổi.' }] },
    ]);

    const res = await request(appWith(llm))
      .post('/api/v1/ai/advisor')
      .set(auth())
      .send({
        message: '',
        filtersFromButtons: true,
        filters: { ageYears: 4, listingType: 'rent' },
      });

    expect(res.status).toBe(200);
    expect(res.body.data.source).toBe('ai');
    expect(llm.calls).toBe(1);
  });

  it('suggests only toys for rent or sale, never donated toys', async () => {
    // Gemini lỗi ở lần tư vấn: fallback trả nguyên danh sách tìm được trong DB.
    const llm = new FakeAdvisorLlm([new Error('503 UNAVAILABLE')]);

    const res = await request(appWith(llm))
      .post('/api/v1/ai/advisor')
      .set(auth())
      .send({ message: '', filtersFromButtons: true, filters: { ageYears: 4 } });

    expect(res.status).toBe(200);
    expect(res.body.data.source).toBe('fallback');
    const toys = res.body.data.toys as { name: string; listingType: string }[];
    expect(toys.map((toy) => toy.name)).toContain('Bộ xếp hình đang bán');
    expect(toys.map((toy) => toy.name)).not.toContain('Đồ tặng');
    for (const toy of toys) expect(['rent', 'sell']).toContain(toy.listingType);
  });

  it('requires a signed-in user (case 11)', async () => {
    const res = await request(appWith(new FakeAdvisorLlm()))
      .post('/api/v1/ai/advisor')
      .send({ message: 'Bé 4 tuổi chơi gì?' });

    expect(res.status).toBe(401);
  });

  it('is only for users, not admins', async () => {
    const res = await request(appWith(new FakeAdvisorLlm()))
      .post('/api/v1/ai/advisor')
      .set(auth(newId().toString(), 'ADMIN'))
      .send({ message: 'Bé 4 tuổi chơi gì?' });

    expect(res.status).toBe(403);
  });

  it('returns 503 when AI_ADVISOR_ENABLED is false, before checking sign-in (case 12)', async () => {
    const app = appWith(new FakeAdvisorLlm(), { enabled: false });

    const signedIn = await request(app)
      .post('/api/v1/ai/advisor')
      .set(auth())
      .send({ message: 'x' });
    const guest = await request(app).post('/api/v1/ai/advisor').send({ message: 'x' });

    expect(signedIn.status).toBe(503);
    expect(signedIn.body.error.code).toBe('AI_ADVISOR_DISABLED');
    expect(guest.status).toBe(503);
  });

  it('returns 200 with fallback results when Gemini fails (case 8)', async () => {
    const llm = new FakeAdvisorLlm([new Error('Gemini không phản hồi sau 8000 ms.')]);

    const res = await request(appWith(llm))
      .post('/api/v1/ai/advisor')
      .set(auth())
      .send({ message: 'Bé 4 tuổi thích xếp hình', filters: { listingType: 'rent' } });

    expect(res.status).toBe(200);
    expect(res.body.data.source).toBe('fallback');
    expect(res.body.data.toys.length).toBeGreaterThan(0);
  });

  it('writes exactly one AiRequest with token usage and status per question (case 14, US-07)', async () => {
    const llm = new FakeAdvisorLlm([
      EXTRACTED,
      { intro: 'Ok.', picks: [{ toyId: newestId(), reason: 'Hợp tuổi.' }] },
    ]);

    await request(appWith(llm))
      .post('/api/v1/ai/advisor')
      .set(auth())
      .send({ message: 'Bé 4 tuổi thích xếp hình' })
      .expect(200);

    const logs = await AiRequest.find({ user_id: asker }).lean();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      request_type: 'advisor',
      status: 'ai',
      prompt: 'Bé 4 tuổi thích xếp hình',
      token_usage: { input: 200, output: 40, thoughts: 20, calls: 2 },
      model_name: 'fake-gemini',
    });
    expect(logs[0]?.latency_ms).toBeGreaterThanOrEqual(0);
    expect(logs[0]?.response).toContain('Ok.');
  });
});
