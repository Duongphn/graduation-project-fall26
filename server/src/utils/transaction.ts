import mongoose, { type ClientSession } from 'mongoose';

/** Runs `work` in a MongoDB transaction and retries it on transient errors. */
export const withTransaction = <T>(work: (session: ClientSession) => Promise<T>): Promise<T> =>
  mongoose.connection.transaction(work);
