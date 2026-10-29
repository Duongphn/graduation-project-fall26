import { Router } from 'express';
import { CategoryController } from '../controllers/category.controller.js';

/** Public read-only list of active categories, in menu order, for listing forms and browse filters. */
export const categoriesRouter = Router();

categoriesRouter.get('/', new CategoryController().list);
