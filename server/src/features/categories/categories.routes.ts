import { Router } from 'express';
import Category from './categories.model.js';

export interface CategoryDto {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
}

/** Public read-only list of active categories, in menu order, for listing forms and browse filters. */
export const categoriesRouter = Router();

categoriesRouter.get('/', async (_req, res, next) => {
  try {
    const categories = await Category.find({ status: { $regex: /^active$/i } })
      .sort({ displayOrder: 1, name: 1 })
      .lean();

    const items: CategoryDto[] = categories.map((category) => ({
      id: category._id.toString(),
      name: category.name,
      slug: category.slug,
      parentId: category.parent_id ? category.parent_id.toString() : null,
    }));

    res.status(200).json(items);
  } catch (err) {
    next(err);
  }
});
