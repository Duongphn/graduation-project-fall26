import mongoose, { type Model, Schema } from 'mongoose';

const categorySchema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true },
    parent_id: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    description: { type: String },
    status: { type: String, required: true, default: 'active' },
    displayOrder: { type: Number, required: true, default: 0 },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } },
);

// Tạo các Index đồng bộ với Atlas
categorySchema.index({ slug: 1 }, { unique: true, name: 'slug_unique' });
categorySchema.index({ name: 1 }, { unique: true, name: 'name_unique' });
categorySchema.index({ status: 1, displayOrder: 1 }, { name: 'menu_order' });

export interface ICategory {
  name: string;
  slug: string;
  parent_id?: mongoose.Types.ObjectId | null;
  description?: string;
  status: string;
  displayOrder: number;
}

export const Category: Model<ICategory> =
  (mongoose.models.Category as Model<ICategory>) ||
  mongoose.model<ICategory>('Category', categorySchema);

export default Category;
