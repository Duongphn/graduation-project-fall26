import { readFileSync } from 'node:fs';

import type { Model } from 'mongoose';
import { describe, expect, it } from 'vitest';

import type { IToy } from '../src/models/toy.model.js';
import { AtlasToyCatalogRepository } from '../src/repositories/atlas-toy-catalog.repository.js';

// R03 2.1.1 (1): the keyword search ignores Vietnamese accents ("nguoi nhen" finds "Người Nhện",
// "dua" finds "Đua"). Local MongoDB has no Atlas Search, so these tests check that the index
// definition folds the diacritics of every field the repository searches, on both the index and
// the query side. The index on Atlas must be re-created from the JSON file to take effect.

interface IndexAnalyzer {
  name: string;
  tokenizer: { type: string };
  tokenFilters?: Array<{ type: string }>;
}

interface IndexField {
  type: string;
  analyzer?: string;
  searchAnalyzer?: string;
  fields?: Record<string, IndexField>;
}

interface IndexDefinition {
  name: string;
  analyzer?: string;
  searchAnalyzer?: string;
  analyzers?: IndexAnalyzer[];
  mappings: { dynamic: boolean; fields: Record<string, IndexField> };
}

const definition = JSON.parse(
  readFileSync(new URL('../infra/atlas-search/toys-search-index.json', import.meta.url), 'utf8'),
) as IndexDefinition;

// icuFolding removes accents and strokes (đ -> d); asciiFolding does the same for Latin letters.
const FOLDING_FILTERS = ['icuFolding', 'asciiFolding'];

const foldsDiacritics = (analyzerName: string | undefined): boolean => {
  const analyzer = definition.analyzers?.find((item) => item.name === analyzerName);
  const filters = (analyzer?.tokenFilters ?? []).map((filter) => filter.type);
  return filters.includes('lowercase') && filters.some((type) => FOLDING_FILTERS.includes(type));
};

const fieldAt = (path: string): IndexField | undefined =>
  path
    .split('.')
    .reduce<IndexField | undefined>(
      (field, key) => (field ? field.fields?.[key] : definition.mappings.fields[key]),
      undefined,
    );

/** The text clauses of the $search stage that the repository sends for keyword `q`. */
async function textClausesFor(q: string): Promise<Array<{ query: string; path: string[] }>> {
  let pipeline: Array<Record<string, unknown>> = [];
  const toyModel = {
    aggregate: (stages: Array<Record<string, unknown>>) => {
      pipeline = stages;
      return { exec: async () => [{ metadata: [], data: [] }] };
    },
  } as unknown as Model<IToy>;
  await new AtlasToyCatalogRepository({ toyModel }).search({
    q,
    page: 1,
    limit: 12,
    sort: 'relevance',
  });
  const search = pipeline[0]?.$search as { compound: { must?: Array<{ text?: unknown }> } };
  return (search.compound.must ?? [])
    .map((clause) => clause.text as { query: string; path: string[] } | undefined)
    .filter((text) => text !== undefined);
}

describe('toys_search index: keyword search without Vietnamese accents (R03 2.1.1 (1))', () => {
  it('defines a custom analyzer that lowercases and folds diacritics', () => {
    expect(definition.name).toBe('toys_search');
    expect(foldsDiacritics(definition.analyzer)).toBe(true);
    expect(foldsDiacritics(definition.searchAnalyzer)).toBe(true);
  });

  it('folds every field the keyword search reads, when indexing and when querying', async () => {
    const [text, ...others] = await textClausesFor('nguoi nhen');
    expect(others).toEqual([]);
    expect(text?.query).toBe('nguoi nhen');
    expect(text?.path).toEqual(['title', 'description']);

    for (const path of text?.path ?? []) {
      const field = fieldAt(path);
      expect(field?.type, path).toBe('string');
      expect(foldsDiacritics(field?.analyzer), `${path} analyzer`).toBe(true);
      expect(foldsDiacritics(field?.searchAnalyzer), `${path} searchAnalyzer`).toBe(true);
    }
  });

  it('sends the keyword as typed, accents included', async () => {
    const [text] = await textClausesFor('Xe Đua người nhện');
    expect(text?.query).toBe('Xe Đua người nhện');
  });
});
