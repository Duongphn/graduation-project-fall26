import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Dispute } from '../src/models/index.js';
import { toAdminDisputeDto, toDisputeDto } from '../src/services/dispute.mapper.js';
import { resetDatabase, startReplSet, stopReplSet } from './helpers/replset.js';

describe('Dispute model', () => {
  beforeAll(async () => {
    await startReplSet();
    await Dispute.syncIndexes();
  });

  afterAll(async () => {
    await stopReplSet();
  });

  beforeEach(async () => {
    await resetDatabase();
    await Dispute.syncIndexes();
  });

  const base = () => ({
    orderType: 'rental_order',
    orderId: new mongoose.Types.ObjectId(),
    claimantId: new mongoose.Types.ObjectId(),
    respondentId: new mongoose.Types.ObjectId(),
    claimantRole: 'owner' as const,
    reason: 'DAMAGED_ON_RETURN',
    description: 'Toy came back with a broken wheel',
    evidencePhotos: [{ url: 'https://x/a.jpg', publicId: 'a' }],
  });

  it('keeps one dispute per order, even after it is resolved', async () => {
    const first = base();
    await Dispute.create({ ...first, code: 'DSP-1', status: 'resolved' });
    await expect(Dispute.create({ ...first, code: 'DSP-2' })).rejects.toMatchObject({ code: 11000 });
  });

  it('hides the platform share from the parties', async () => {
    const doc = await Dispute.create({
      ...base(),
      code: 'DSP-3',
      status: 'resolved',
      resolution: {
        verdict: 'PARTIAL',
        compensation: 10,
        reason: 'x'.repeat(30),
        resolvedAt: new Date(),
        payout: { renter: 1, owner: 2, platform: 3 },
      },
    });
    const dto = toDisputeDto(doc, doc.claimantId.toString());
    expect(dto.resolution?.payout).toEqual({ renter: 1, owner: 2 });
    expect(toAdminDisputeDto(doc).resolution?.payout).toEqual({ renter: 1, owner: 2, platform: 3 });
  });

  it('maps the response deadline', async () => {
    const dueAt = new Date('2026-11-20T00:00:00Z');
    const doc = await Dispute.create({ ...base(), code: 'DSP-4', timer: { dueAt } });
    expect(toDisputeDto(doc, doc.claimantId.toString()).responseDueAt).toEqual(dueAt);
  });
});
