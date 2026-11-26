import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Conversation } from '../src/models/conversation.model.js';
import { rebuildOnePerOrderIndex } from '../src/repositories/chat.repository.js';
import { resetDatabase, startReplSet, stopReplSet } from './helpers/replset.js';

const participants = () => [{ userId: new Types.ObjectId() }, { userId: new Types.ObjectId() }];
const listingChat = (key: string) => Conversation.create({ participants: participants(), listingKey: key });

describe('conversations index one_per_order', () => {
  beforeAll(async () => {
    await startReplSet();
  });

  afterAll(async () => {
    await stopReplSet();
  });

  beforeEach(async () => {
    await resetDatabase();
    await Conversation.syncIndexes();
  });

  it('lets many listing chats exist (no context, or context null) while each order keeps one chat', async () => {
    await listingChat('toy-a:user-1');
    await listingChat('toy-b:user-2');
    await Conversation.collection.insertOne({ participants: participants(), listingKey: 'toy-c:user-3', context: null });

    const order = { kind: 'RENTAL_ORDER', id: new Types.ObjectId() };
    await Conversation.create({ participants: participants(), context: order });
    await expect(Conversation.create({ participants: participants(), context: order })).rejects.toThrow(/E11000/);
  });

  it('rebuilds the index an older schema left without the partial filter, and is safe to run again', async () => {
    // The index as found on the shared database: unique on { null, null } for every listing chat
    await Conversation.collection.dropIndex('one_per_order');
    await Conversation.collection.createIndex(
      { 'context.kind': 1, 'context.id': 1 },
      { unique: true, name: 'one_per_order' },
    );
    await listingChat('toy-a:user-1');
    await expect(listingChat('toy-b:user-2')).rejects.toThrow(/E11000/);

    expect(await rebuildOnePerOrderIndex()).toEqual({ rebuilt: true });
    await expect(listingChat('toy-b:user-2')).resolves.toBeTruthy();

    const index = (await Conversation.collection.indexes()).find((i) => i.name === 'one_per_order');
    expect(index?.partialFilterExpression).toEqual({ 'context.id': { $exists: true } });
    expect(await rebuildOnePerOrderIndex()).toEqual({ rebuilt: false });
  });
});
