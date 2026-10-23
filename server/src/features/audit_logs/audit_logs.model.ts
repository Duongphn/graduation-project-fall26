import mongoose, { type Model, Schema } from 'mongoose';

const auditLogSchema = new Schema(
  {
    actor_id: { type: Schema.Types.ObjectId, ref: 'User' },
    action: { type: String, required: true },
    target_type: { type: String, required: true },
    target_id: { type: Schema.Types.ObjectId },
    ip_address: { type: String },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } },
);

export interface IAuditLog {
  _id: mongoose.Types.ObjectId;
  actor_id?: mongoose.Types.ObjectId;
  action: string;
  target_type: string;
  target_id?: mongoose.Types.ObjectId;
  ip_address?: string;
  created_at: Date;
}

export const AuditLog: Model<IAuditLog> =
  (mongoose.models.AuditLog as Model<IAuditLog>) ||
  mongoose.model<IAuditLog>('AuditLog', auditLogSchema);

export default AuditLog;
