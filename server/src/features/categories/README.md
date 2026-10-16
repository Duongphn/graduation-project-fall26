# categories

Toy categories (UC30, categories part).

- `GET /api/v1/categories`: ACTIVE categories in menu order (public).
- `/api/v1/admin/categories` (Admin): paginated list with `toyCount`/`canDelete` (limit defaults
  to 100), create, edit, hide/show, delete when unused, reorder. Every change writes an audit log
  (`category.create|update|hide|show|delete|reorder`) in the same transaction.

Rules:

- Names are unique ignoring case, not accents (`name_unique` collation `{ vi, 2 }`).
- The slug is derived on create and never changes on rename.
- The list is flat: `parentId` is not used (always `null`).
- A category with any toy (any status) cannot be deleted, only hidden.

## Delete race (for the toys feature)

`deleteCategory` first writes to the category document (`$inc: { __v: 1 }`), then counts toys,
then deletes. To close the race, the toys feature must, inside the transaction that creates a toy
or changes its `categoryId`, write to the same category document and require it to be ACTIVE:

```ts
const category = await CategoryModel.findOneAndUpdate(
  { _id: categoryId, status: 'ACTIVE' },
  { $inc: { __v: 1 } },
  { session },
);
if (!category) throw conflict('CATEGORY_NOT_AVAILABLE', 'Danh mục không còn được sử dụng.');
```

The two transactions then write the same document, so MongoDB aborts one with a write conflict
and `withTransaction` retries it with fresh data: either the delete sees the toy (409
`CATEGORY_IN_USE`), or the toy sees the category is gone or hidden. A plain read is not enough.
