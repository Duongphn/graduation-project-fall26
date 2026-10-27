export interface CategoryDto {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
}
