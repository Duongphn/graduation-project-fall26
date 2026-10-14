# MongoDB Atlas Search Index: `toys_search`

This directory contains the index definition for MongoDB Atlas Search used by UC05 (Toy Search and Detail).

## Overview

The `toys_search` index combines full-text search, exact filtering, range filtering, and geospatial queries within a single compound Atlas Search aggregation stage (`$search`), eliminating the need for external search engines.

- **Target Database**: Configured via `MONGODB_URI` (e.g. `toyflow`).
- **Target Collection**: `toys`
- **Index Name**: `toys_search` (must match verbatim).

## Field Mappings

| Field | Type | Purpose |
| --- | --- | --- |
| `title` | `string` (lucene.standard) | Full-text keyword matching on toy name. |
| `description` | `string` (lucene.standard) | Full-text keyword matching on listing description. |
| `status` | `token` | Exact filtering for active listings (`active`). |
| `listingType` | `token` | Exact filtering by listing type (`rent` or `sell`). |
| `categoryId` | `objectId` | Exact filtering by category ID. |
| `ageRange.minAge` | `number` | Numeric range queries for suitable age overlap. |
| `ageRange.maxAge` | `number` | Numeric range queries for suitable age overlap. |
| `priceOrRate` | `number` | Numeric range queries for rent rate or sell price. |
| `location` | `geo` (Point) | Geospatial filtering (`geoWithin`) and distance sorting (`near`). |

## Deployment Instructions

### Option 1: MongoDB Atlas UI

1. Log in to [MongoDB Atlas](https://cloud.mongodb.com/).
2. Navigate to your cluster -> **Atlas Search**.
3. Click **Create Search Index**.
4. Choose **JSON Editor** and click **Next**.
5. Select your database and the `toys` collection.
6. Set the **Index Name** to `toys_search`.
7. Paste the contents of [`toys-search-index.json`](./toys-search-index.json) into the editor.
8. Click **Next** -> **Create Search Index**.
9. Wait for the index status to change to **Active** (typically 1-2 minutes).

### Option 2: Atlas CLI

```bash
atlas clusters search indexes create \
  --clusterName <YOUR_CLUSTER_NAME> \
  --file server/infra/atlas-search/toys-search-index.json
```

## Prerequisites & Schema Dependencies

Before creating this search index, ensure the `toys` collection schema from UC04 is deployed. Documents in the collection must store:
- `status`: `'active'` (or `'pending'`, `'hidden'`).
- `listingType`: `'rent'` or `'sell'`.
- `categoryId`: `ObjectId`.
- `ageRange`: `{ minAge: number, maxAge: number }`.
- `priceOrRate`: `number`.
- `location`: GeoJSON Point `{ type: 'Point', coordinates: [lng, lat] }` when location is provided.

## Local Development & Non-Atlas Environments

> [!IMPORTANT]
> Local standalone MongoDB instances (or Community Edition) do not support the `$search` aggregation pipeline operator natively.
> In environments without Atlas Search, calls to `$search` will fail. The backend intentionally does not fall back to an unbounded collection scan to maintain architectural integrity and performance predictability; instead, it returns a standard HTTP 500 error (`ATLAS_SEARCH_UNAVAILABLE` / `SEARCH_EXECUTION_ERROR`).
> For local development, connect to a free MongoDB Atlas M0 cluster or configure an Atlas Local environment via Docker.
