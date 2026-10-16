import { Schema, type ClientSession, type MongooseQueryOrDocumentMiddleware } from 'mongoose';
import mongoose from 'mongoose';

import {
  cancellationReasons,
  handoverSteps,
  referenceKinds,
  timerActions,
} from '../../shared/domain/enums.js';
import { actorTypes } from '../../shared/contracts/actor.js';

const integerVnd = {
  validator: Number.isInteger,
  message: '{PATH} must be a whole number of VND.',
};

/** A required amount of money in whole VND (never negative). */
export const money = () => ({
  type: Number,
  required: true as const,
  min: 0,
  validate: integerVnd,
});

/** An optional amount of money in whole VND (never negative). */
export const optionalMoney = () => ({
  type: Number,
  min: 0,
  validate: integerVnd,
});

/** A `{ kind, id }` pointer to a document in another collection. */
export const referenceSchema = new Schema(
  {
    kind: { type: String, enum: referenceKinds, required: true },
    id: { type: Schema.Types.ObjectId, required: true },
  },
  { _id: false },
);

/**
 * Case-insensitive Vietnamese comparison for unique names: "Đồ chơi gỗ" and "đồ CHƠI gỗ" are
 * the same name, "Do choi go" is a different one. Queries that must use the index pass the
 * same collation.
 */
export const vietnameseNameCollation = { locale: 'vi', strength: 2 } as const;

/**
 * A private image uploaded to Cloudinary with the "authenticated" delivery type. Only the
 * server can build a (5-minute) link to it, with buildPrivateImageUrl in
 * infrastructure/storage/cloudinary.ts.
 */
export const privateImageSchema = new Schema(
  {
    publicId: { type: String, required: true, trim: true, maxlength: 300 },
    format: { type: String, required: true, trim: true, lowercase: true, maxlength: 5 },
  },
  { _id: false },
);

/** The deadline an order is waiting for. Unset when the step completes. */
export const timerSchema = new Schema(
  {
    action: { type: String, enum: timerActions, required: true },
    dueAt: { type: Date, required: true },
  },
  { _id: false },
);

/** Photo proof at one handover step (FE-07, GB-20). */
export const handoverSchema = new Schema(
  {
    step: { type: String, enum: handoverSteps, required: true },
    by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    photos: {
      type: [String],
      validate: {
        validator: (photos: string[]) => photos.length >= 1 && photos.length <= 10,
        message: 'A handover needs 1 to 10 photos.',
      },
    },
    note: { type: String, trim: true, maxlength: 1000 },
    at: { type: Date, required: true, default: Date.now },
  },
  { _id: false },
);

export const cancellationSchema = new Schema(
  {
    reason: { type: String, enum: cancellationReasons, required: true },
    actorType: { type: String, enum: actorTypes, required: true },
    by: { type: Schema.Types.ObjectId, ref: 'User' },
    note: { type: String, trim: true, maxlength: 1000 },
    at: { type: Date, required: true, default: Date.now },
  },
  { _id: false },
);

const writeOperations: MongooseQueryOrDocumentMiddleware[] = [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'findOneAndReplace',
  'findOneAndDelete',
  'replaceOne',
  'deleteOne',
  'deleteMany',
];

/**
 * Makes a collection append-only through Mongoose: documents can be inserted but never
 * updated or deleted (GB-31 for the ledger, GB-19 for the status history).
 */
export const appendOnlyPlugin = (schema: Schema): void => {
  const reject = (): never => {
    throw new Error('This collection is append-only.');
  };

  schema.pre(writeOperations, { document: false, query: true }, reject);
  schema.pre('deleteOne', { document: true, query: false }, reject);
  schema.pre('save', function rejectUpdate() {
    if (!this.isNew) {
      reject();
    }
  });
};

/** Runs `work` in a MongoDB transaction and retries it on transient errors. */
export const withTransaction = <T>(work: (session: ClientSession) => Promise<T>): Promise<T> =>
  mongoose.connection.transaction(work);
