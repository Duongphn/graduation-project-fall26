import type { Model } from 'mongoose';
import { describe, expect, it } from 'vitest';

import type { ToySearchQuery } from '../src/interfaces/toy-catalog.ports.js';
import type { IToy } from '../src/models/toy.model.js';
import { AtlasToyCatalogRepository } from '../src/repositories/atlas-toy-catalog.repository.js';

// Local MongoDB has no Atlas Search: these tests read the $search stage the repository builds and
// apply its filter clauses to sample toys with a small evaluator of the operators it uses.

type Clause = Record<string, unknown>;

/** The $search stage of the pipeline that `search` sends for `query`. */
async function searchStageFor(
  query: Partial<ToySearchQuery>,
): Promise<{ index: string; compound: Clause }> {
  let pipeline: Array<Record<string, unknown>> = [];
  const toyModel = {
    aggregate: (stages: Array<Record<string, unknown>>) => {
      pipeline = stages;
      return { exec: async () => [{ metadata: [], data: [] }] };
    },
  } as unknown as Model<IToy>;
  await new AtlasToyCatalogRepository({ toyModel }).search({
    page: 1,
    limit: 12,
    sort: 'newest',
    ...query,
  });
  return pipeline[0]?.$search as { index: string; compound: Clause };
}

type SampleToy = { status: string; ageRange: { minAge: number; maxAge: number } };

const valueAt = (toy: SampleToy, path: string): unknown =>
  path.split('.').reduce<unknown>((value, key) => (value as Record<string, unknown>)?.[key], toy);

/** Whether `toy` matches a clause made of compound, range and equals (the operators used here). */
function matches(toy: SampleToy, clause: Clause): boolean {
  if (clause.compound) {
    const {
      filter = [],
      must = [],
      should = [],
      minimumShouldMatch = 0,
    } = clause.compound as {
      filter?: Clause[];
      must?: Clause[];
      should?: Clause[];
      minimumShouldMatch?: number;
    };
    return (
      [...filter, ...must].every((inner) => matches(toy, inner)) &&
      should.filter((inner) => matches(toy, inner)).length >= minimumShouldMatch
    );
  }
  if (clause.range) {
    const { path, gt, gte, lt, lte } = clause.range as {
      path: string;
      gt?: number;
      gte?: number;
      lt?: number;
      lte?: number;
    };
    const value = valueAt(toy, path) as number;
    return (
      (gt === undefined || value > gt) &&
      (gte === undefined || value >= gte) &&
      (lt === undefined || value < lt) &&
      (lte === undefined || value <= lte)
    );
  }
  if (clause.equals) {
    const { path, value } = clause.equals as { path: string; value: unknown };
    return valueAt(toy, path) === value;
  }
  throw new Error(`operator not handled by the test: ${Object.keys(clause).join(', ')}`);
}

const sample = (minAge: number, maxAge: number): SampleToy => ({
  status: 'active',
  ageRange: { minAge, maxAge },
});

// The R03 S3 age groups (decision S3, 17/11) and toys of each group, plus toys across groups.
const TOYS: Record<string, SampleToy> = {
  '0-1': sample(0, 1),
  '1-3': sample(1, 3),
  '3-6': sample(3, 6),
  '6-12': sample(6, 12),
  '12+': sample(12, 99),
  '2-4': sample(2, 4),
  'age 3 only': sample(3, 3),
  'age 6 only': sample(6, 6),
};

async function titlesFor(query: Partial<ToySearchQuery>): Promise<string[]> {
  const stage = await searchStageFor(query);
  return Object.entries(TOYS)
    .filter(([, toy]) => matches(toy, { compound: stage.compound }))
    .map(([title]) => title)
    .sort();
}

describe('AtlasToyCatalogRepository age filter (half-open groups, R03 S3)', () => {
  it('does not mix adjacent age groups', async () => {
    expect(await titlesFor({ ageMin: 6, ageMax: 12 })).toEqual(['6-12', 'age 6 only']);
    expect(await titlesFor({ ageMin: 3, ageMax: 6 })).toEqual(['2-4', '3-6', 'age 3 only']);
    expect(await titlesFor({ ageMin: 1, ageMax: 3 })).toEqual(['1-3', '2-4']);
    expect(await titlesFor({ ageMin: 0, ageMax: 1 })).toEqual(['0-1']);
    expect(await titlesFor({ ageMin: 12, ageMax: 99 })).toEqual(['12+']);
  });

  it('treats a query for one age as that year of age', async () => {
    expect(await titlesFor({ ageMin: 3, ageMax: 3 })).toEqual(['2-4', '3-6', 'age 3 only']);
    expect(await titlesFor({ ageMin: 6, ageMax: 6 })).toEqual(['6-12', 'age 6 only']);
  });

  it('accepts one bound only', async () => {
    expect(await titlesFor({ ageMin: 6 })).toEqual(['12+', '6-12', 'age 6 only']);
    expect(await titlesFor({ ageMax: 3 })).toEqual(['0-1', '1-3', '2-4']);
  });

  it('keeps the other filters and the toys_search index', async () => {
    const stage = await searchStageFor({ ageMin: 6, ageMax: 12, type: 'rent' });
    expect(stage.index).toBe('toys_search');
    expect(stage.compound.filter).toEqual(
      expect.arrayContaining([
        { equals: { path: 'status', value: 'active' } },
        { equals: { path: 'listingType', value: 'rent' } },
      ]),
    );
  });
});
