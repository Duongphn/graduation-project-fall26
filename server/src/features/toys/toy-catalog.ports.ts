export interface ToySearchQuery {
  q?: string;
  type?: 'rent' | 'sell';
  ageMin?: number;
  ageMax?: number;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  page: number;
  limit: number;
  sort: 'relevance' | 'newest' | 'price_asc' | 'price_desc' | 'distance';
}

export interface ToyCardDto {
  id: string;
  title: string;
  primaryImage: { url: string; publicId: string } | null;
  listingType: 'rent' | 'sell';
  priceOrRate: number;
  depositPrice: number | null;
  category: {
    id: string;
    name: string;
    slug: string;
  };
  ageRange: {
    minAge: number;
    maxAge: number;
  };
  condition: string;
  location?: {
    type: string;
    coordinates: [number, number];
  } | null;
  createdAt: string;
}

export interface ToyDetailDto {
  id: string;
  title: string;
  description: string;
  images: Array<{ url: string; publicId: string }>;
  listingType: 'rent' | 'sell';
  priceOrRate: number;
  depositPrice: number | null;
  category: {
    id: string;
    name: string;
    slug: string;
  };
  ageRange: {
    minAge: number;
    maxAge: number;
  };
  condition: string;
  location?: {
    type: string;
    coordinates: [number, number];
  } | null;
  owner: {
    id: string;
    displayName: string;
  };
  createdAt: string;
  updatedAt: string;
}

export type SearchSuggestionFilter =
  'keyword' | 'category' | 'type' | 'ageRange' | 'priceRange' | 'area';

export type SearchSuggestionAction = 'remove' | 'widen' | 'increaseRadius';

export interface SearchSuggestion {
  filter: SearchSuggestionFilter;
  action: SearchSuggestionAction;
  message: string;
}

export interface ToySearchResult {
  items: ToyCardDto[];
  total: number;
  page: number;
  limit: number;
  suggestions: SearchSuggestion[];
}

export interface OccupiedRentalPeriod {
  startDate: string;
  endDate: string;
}

export interface ToyCatalogReadPort {
  search(query: ToySearchQuery): Promise<{ items: ToyCardDto[]; total: number }>;
  findActiveDetail(toyId: string): Promise<ToyDetailDto | null>;
  findAvailability(toyId: string, from: Date, toInclusive: Date): Promise<OccupiedRentalPeriod[]>;
}
