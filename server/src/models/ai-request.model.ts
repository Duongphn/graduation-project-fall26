import mongoose, { type Model, Schema, type Types } from 'mongoose';

import {
  ADVISOR_SOURCES,
  AI_REQUEST_TYPES,
  type AdvisorSource,
  type AiRequestType,
} from '../constants/ai-advisor.js';

/** Token của một lượt hỏi, cộng dồn qua mọi lần gọi Gemini trong lượt đó. */
export interface AiTokenUsage {
  input: number;
  output: number;
  thoughts: number;
  calls: number;
}

export interface IAiRequest {
  user_id: Types.ObjectId;
  request_type: AiRequestType;
  status: AdvisorSource;
  prompt: string;
  response: string;
  token_usage: AiTokenUsage;
  latency_ms: number;
  /** Model Gemini đã gọi; trống khi lượt hỏi không gọi AI (FAQ). Không đặt tên `model`. */
  model_name?: string;
  createdAt: Date;
}

const tokenCount = () => ({ type: Number, required: true, default: 0, min: 0 });

const aiRequestSchema = new Schema<IAiRequest>(
  {
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    request_type: { type: String, required: true, enum: AI_REQUEST_TYPES },
    status: { type: String, required: true, enum: ADVISOR_SOURCES },
    prompt: { type: String, required: true },
    response: { type: String, required: true },
    token_usage: {
      input: tokenCount(),
      output: tokenCount(),
      thoughts: tokenCount(),
      calls: tokenCount(),
    },
    latency_ms: { type: Number, required: true, default: 0, min: 0 },
    model_name: { type: String },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false } },
);

// Đếm lượt hỏi trong ngày của một người (BR-08) và thống kê chi phí theo loại.
aiRequestSchema.index(
  { user_id: 1, request_type: 1, createdAt: -1 },
  { name: 'user_type_created' },
);

export const AiRequest: Model<IAiRequest> =
  (mongoose.models.AiRequest as Model<IAiRequest>) ||
  mongoose.model<IAiRequest>('AiRequest', aiRequestSchema);
