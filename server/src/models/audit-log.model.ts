import mongoose, { type Model, Schema } from 'mongoose';

/** A short summary stored with an entry (decision C1): primitives only, never personal data. */
export type AuditDetails = Record<string, string | number | boolean | null>;

const auditLogSchema = new Schema(
  {
    actor_id: { type: Schema.Types.ObjectId, ref: 'User' },
    action: { type: String, required: true },
    target_type: { type: String, required: true },
    target_id: { type: Schema.Types.ObjectId },
    // R04 3.23: the name of a deleted record, a reason, an old -> new setting value.
    details: { type: Schema.Types.Mixed },
    ip_address: { type: String },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } },
);

// Admin Audit Log screen (UC31): newest first, filtered by actor, action or target.
auditLogSchema.index({ created_at: -1 }, { name: 'audit_recent' });
auditLogSchema.index({ actor_id: 1, created_at: -1 }, { name: 'audit_by_actor' });
auditLogSchema.index({ action: 1, created_at: -1 }, { name: 'audit_by_action' });
auditLogSchema.index({ target_type: 1, target_id: 1, created_at: -1 }, { name: 'audit_by_target' });

// Append-only (R03 audit trail, GB-36): entries are never changed or deleted, not even by Admins.
const refuseChange = () => {
  throw new Error('audit_logs is append-only: entries cannot be updated or deleted.');
};
for (const operation of [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'replaceOne',
  'findOneAndReplace',
  'deleteOne',
  'deleteMany',
  'findOneAndDelete',
] as const) {
  auditLogSchema.pre(operation, refuseChange);
}
auditLogSchema.pre('save', function refuseResave() {
  if (!this.isNew) refuseChange();
});

export interface IAuditLog {
  _id: mongoose.Types.ObjectId;
  actor_id?: mongoose.Types.ObjectId;
  action: string;
  target_type: string;
  target_id?: mongoose.Types.ObjectId;
  details?: AuditDetails;
  ip_address?: string;
  created_at: Date;
}

export const AuditLog: Model<IAuditLog> =
  (mongoose.models.AuditLog as Model<IAuditLog>) ||
  mongoose.model<IAuditLog>('AuditLog', auditLogSchema);

export default AuditLog;
