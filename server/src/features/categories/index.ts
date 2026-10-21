// apiRouter.use('/categories', categoriesRouter);                       (public, develop)
// apiRouter.use('/admin/categories', authenticate, adminCategoriesRouter); (Admin)
export { categoriesRouter } from './categories.routes.js';
export { adminCategoriesRouter } from './categories.admin.routes.js';
