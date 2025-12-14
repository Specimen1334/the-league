// apps/api/src/modules/marketplace/items.repo.ts
import { dbFile } from "../../db/index";

/**
 * Items / economy data access.
 *
 * Expected tables (for reference):
 *
 * items
 *  - id INTEGER PRIMARY KEY
 *  - name TEXT NOT NULL
 *  - category TEXT
 *  - description TEXT
 *  - base_cost INTEGER
 *  - tags_json TEXT
 *  - sprite_url TEXT
 *
 * season_items (optional, for shop / availability)
 *  - id INTEGER PRIMARY KEY
 *  - season_id INTEGER NOT NULL
 *  - item_id INTEGER NOT NULL
 *  - price INTEGER NOT NULL
 *  - is_enabled INTEGER NOT NULL DEFAULT 1
 */

export type ItemRow = {
  id: number;
  name: string;
  category: string | null;
  description: string | null;
  baseCost: number | null;
  tagsJson: string | null;
  spriteUrl: string | null;
};

export type SeasonItemRow = {
  id: number;
  seasonId: number;
  itemId: number;
  price: number;
  isEnabled: boolean;
};

const getItemByIdStmt = dbFile.prepare<[number]>(`
  SELECT
    id,
    name,
    category,
    description,
    base_cost AS baseCost,
    tags_json AS tagsJson,
    sprite_url AS spriteUrl
  FROM items
  WHERE id = ?
`);

const listAllItemsStmt = dbFile.prepare(`
  SELECT
    id,
    name,
    category,
    description,
    base_cost AS baseCost,
    tags_json AS tagsJson,
    sprite_url AS spriteUrl
  FROM items
  ORDER BY name ASC
`);

const listSeasonItemsStmt = dbFile.prepare<[number]>(`
  SELECT
    si.id        AS id,
    si.season_id AS seasonId,
    si.item_id   AS itemId,
    si.price     AS price,
    si.is_enabled AS isEnabled
  FROM season_items si
  WHERE si.season_id = ?
`);

export const itemsRepo = {
  getItemById(id: number): ItemRow | undefined {
    return getItemByIdStmt.get(id) as ItemRow | undefined;
  },

  listAllItems(): ItemRow[] {
    return listAllItemsStmt.all() as ItemRow[];
  },

  listSeasonItems(seasonId: number): SeasonItemRow[] {
    return listSeasonItemsStmt.all(seasonId) as SeasonItemRow[];
  }
};
