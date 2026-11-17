import type { Model } from 'mongoose';
import Category, { type ICategory } from '../models/category.model.js';
import type { CategoryDto } from '../types/category.types.js';

export class CategoryService {
  public constructor(private readonly categoryModel: Model<ICategory> = Category) {}

  /**
   * Danh mục đang hoạt động, theo thứ tự menu, cho form đăng tin và bộ lọc tìm kiếm.
   * Cùng thứ tự với danh sách của Admin (category-admin.repository.ts): displayOrder, rồi tên
   * theo thứ tự chữ cái tiếng Việt, rồi _id.
   */
  public async listActive(): Promise<CategoryDto[]> {
    const categories = await this.categoryModel
      .find({ status: { $regex: /^active$/i } })
      .sort({ displayOrder: 1, name: 1, _id: 1 })
      .collation({ locale: 'vi' })
      .lean();

    return categories.map((category) => ({
      id: category._id.toString(),
      name: category.name,
      slug: category.slug,
      parentId: category.parent_id ? category.parent_id.toString() : null,
    }));
  }
}
