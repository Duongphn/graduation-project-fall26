import { Schema, model, type InferSchemaType } from 'mongoose';

import { vietnameseNameCollation } from '../../infrastructure/database/schema-types.js';
import { visibilityStatuses } from '../../shared/domain/statuses.js';

const categorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true },
    parentId: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    description: { type: String, trim: true },
    status: { type: String, enum: visibilityStatuses, required: true, default: 'ACTIVE' },
    displayOrder: { type: Number, required: true, default: 0 },
  },
  { collection: 'categories', timestamps: true },
);

categorySchema.index({ slug: 1 }, { unique: true, name: 'slug_unique' });
categorySchema.index(
  { name: 1 },
  { unique: true, collation: vietnameseNameCollation, name: 'name_unique' },
);
categorySchema.index({ status: 1, displayOrder: 1 }, { name: 'menu_order' });

export type Category = InferSchemaType<typeof categorySchema>;
export const CategoryModel = model('Category', categorySchema);
