import { Schema, model, type InferSchemaType } from 'mongoose';

import { appendOnlyPlugin } from '../../infrastructure/database/schema-types.js';
import { actorTypes } from '../../shared/contracts/actor.js';
import { referenceKinds } from '../../shared/domain/enums.js';

// Like referenceSchema, but `id` is optional for collection-level actions
// (e.g. "category.reorder" changes many categories at once).
const auditTargetSchema = new Schema(
  {
    kind: { type: String, enum: referenceKinds, required: true },
    id: { type: Schema.Types.ObjectId },
  },
  { _id: false },
);

// Admin and system actions (moderation, identity review, disputes, withdrawals, locks).
// Append-only.
const auditLogSchema = new Schema(
  {
    actorType: { type: String, enum: actorTypes, required: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User' },
    // Dotted action name, e.g. "toy.reject", "user.lock", "dispute.resolve".
    action: { type: String, required: true, trim: true, match: /^[a-z_]+(\.[a-z_]+)+$/ },
    target: { type: auditTargetSchema, required: true },
    // Small before/after values or other context worth keeping.
    meta: { type: Schema.Types.Mixed },
    ipAddress: { type: String },
  },
  { collection: 'audit_logs', timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.plugin(appendOnlyPlugin);
auditLogSchema.index({ 'target.kind': 1, 'target.id': 1, createdAt: -1 }, { name: 'by_target' });
auditLogSchema.index({ actorId: 1, createdAt: -1 }, { name: 'by_actor' });
auditLogSchema.index({ action: 1, createdAt: -1 }, { name: 'by_action' });

export type AuditLog = InferSchemaType<typeof auditLogSchema>;
export const AuditLogModel = model('AuditLog', auditLogSchema);
