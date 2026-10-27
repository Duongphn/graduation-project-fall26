import { Types, type ClientSession } from 'mongoose';

import { Toy } from '../models/toy.model.js';
import { Category } from '../models/category.model.js';
import type { CategoryStatus } from '../validations/category-admin.validation.js';

// The only file of the feature that touches the database.

export interface CategoryRecord {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  description?: string | null;
  displayOrder: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CategoryListFilter {
  status?: CategoryStatus;
  // RegExp source (already safe) matched case-insensitively on name and description.
  textPattern?: string;
}

// Vietnamese alphabetical order for the name tie-break of the lists.
const VIETNAMESE_ORDER = { locale: 'vi' } as const;
const MENU_SORT = { displayOrder: 1, name: 1, _id: 1 } as const;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Develop's data may store the status in another case ('ACTIVE'). */
const statusFilter = (status: string) => ({ $regex: `^${status}$`, $options: 'i' });

const listFilter = ({ status, textPattern }: CategoryListFilter) => ({
  ...(status ? { status: statusFilter(status) } : {}),
  ...(textPattern
    ? {
        $or: [
          { name: { $regex: textPattern, $options: 'i' } },
          { description: { $regex: textPattern, $options: 'i' } },
        ],
      }
    : {}),
});

export const categoriesRepository = {
  findById(id: string, session?: ClientSession): Promise<CategoryRecord | null> {
    return Category.findById(id)
      .session(session ?? null)
      .lean<CategoryRecord>()
      .exec();
  },

  // True when another category has the same name, compared case-insensitively
  // ("Lắp ráp" = "LẮP RÁP"; "Lap rap" is a different name).
  async existsByName(name: string, excludeId?: string, session?: ClientSession): Promise<boolean> {
    const found = await Category.exists({
      name: { $regex: `^${escapeRegExp(name)}$`, $options: 'i' },
      ...(excludeId ? { _id: { $ne: new Types.ObjectId(excludeId) } } : {}),
    }).session(session ?? null);
    return found !== null;
  },

  async list(
    filter: CategoryListFilter,
    paging: { skip: number; limit: number },
  ): Promise<{ items: CategoryRecord[]; total: number }> {
    const query = listFilter(filter);
    const [items, total] = await Promise.all([
      Category.find(query)
        .sort(MENU_SORT)
        .collation(VIETNAMESE_ORDER)
        .skip(paging.skip)
        .limit(paging.limit)
        .lean<CategoryRecord[]>()
        .exec(),
      Category.countDocuments(query),
    ]);
    return { items, total };
  },

  // Every category in menu order (for reordering).
  listAll(session: ClientSession): Promise<CategoryRecord[]> {
    return Category.find({})
      .sort(MENU_SORT)
      .collation(VIETNAMESE_ORDER)
      .session(session)
      .lean<CategoryRecord[]>()
      .exec();
  },

  // Toys per category (every status) with ONE aggregation.
  async countToys(ids: Types.ObjectId[], session?: ClientSession): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (ids.length === 0) return counts;
    const rows = await Toy.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { categoryId: { $in: ids } } },
      { $group: { _id: '$categoryId', count: { $sum: 1 } } },
    ]).session(session ?? null);
    for (const row of rows) counts.set(String(row._id), row.count);
    return counts;
  },

  async isSlugTaken(slug: string, session: ClientSession): Promise<boolean> {
    return (await Category.exists({ slug }).session(session)) !== null;
  },

  async maxDisplayOrder(session: ClientSession): Promise<number> {
    const last = await Category.findOne({}, { displayOrder: 1 })
      .sort({ displayOrder: -1 })
      .session(session)
      .lean<{ displayOrder: number }>()
      .exec();
    return last?.displayOrder ?? 0;
  },

  async create(
    data: { name: string; slug: string; displayOrder: number; description?: string },
    session: ClientSession,
  ): Promise<CategoryRecord> {
    const [created] = await Category.create([{ ...data, status: 'active' }], { session });
    if (!created) throw new Error('Category was not created.');
    return created.toObject() as unknown as CategoryRecord;
  },

  update(
    id: string,
    changes: { set: Record<string, unknown>; unset: string[] },
    session: ClientSession,
  ): Promise<CategoryRecord | null> {
    return Category.findByIdAndUpdate(
      id,
      {
        ...(Object.keys(changes.set).length > 0 ? { $set: changes.set } : {}),
        ...(changes.unset.length > 0
          ? { $unset: Object.fromEntries(changes.unset.map((field) => [field, 1])) }
          : {}),
      },
      { new: true, runValidators: true, session },
    )
      .lean<CategoryRecord>()
      .exec();
  },

  // Conditional status change: matches only while the category still has the expected status.
  changeStatus(
    id: string,
    from: string,
    to: CategoryStatus,
    session: ClientSession,
  ): Promise<CategoryRecord | null> {
    return Category.findOneAndUpdate(
      { _id: id, status: from },
      { $set: { status: to } },
      { new: true, session },
    )
      .lean<CategoryRecord>()
      .exec();
  },

  /**
   * Writes to the category document inside the transaction (bumps __v) and returns it, or null
   * when it does not exist. A toy transaction that touched the same category (see README) now
   * write-conflicts with this one, so a toy can never be saved on a deleted category.
   */
  lockForDelete(id: string, session: ClientSession): Promise<CategoryRecord | null> {
    return Category.findOneAndUpdate({ _id: id }, { $inc: { __v: 1 } }, { new: true, session })
      .lean<CategoryRecord>()
      .exec();
  },

  async deleteById(id: string, session: ClientSession): Promise<boolean> {
    const result = await Category.deleteOne({ _id: id }, { session });
    return result.deletedCount === 1;
  },

  async setDisplayOrders(
    orders: Array<{ id: Types.ObjectId; displayOrder: number }>,
    session: ClientSession,
  ): Promise<void> {
    if (orders.length === 0) return;
    await Category.bulkWrite(
      orders.map(({ id, displayOrder }) => ({
        updateOne: { filter: { _id: id }, update: { $set: { displayOrder } } },
      })),
      { session, ordered: false },
    );
  },
};
