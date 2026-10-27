import mongoose, { type ClientSession } from 'mongoose';

/**
 * Execute work inside a MongoDB session transaction.
 * session.withTransaction() retries transient transaction errors automatically.
 */
export async function withTransaction<T>(
  work: (session: ClientSession) => Promise<T>,
): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result as T;
  } finally {
    await session.endSession();
  }
}
