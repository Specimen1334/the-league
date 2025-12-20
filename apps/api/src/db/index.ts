// apps/api/src/db/index.ts
import Database from "better-sqlite3";

const DB_PATH = process.env.THE_LEAGUE_DB_PATH || "./the-league.db";

export const dbFile = new Database(DB_PATH);

// Ensure schema exists on startup
initializeSchema();

function initializeSchema() {
  // Enforce foreign key constraints
  dbFile.pragma("foreign_keys = ON");

  // Better default durability/perf for local dev + prod-like behavior
  dbFile.pragma("journal_mode = WAL");

  //
  // Core auth tables
  //
  dbFile.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT,
      email TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      settings_json TEXT
    );
  `);

  // Minimal, forward-only schema evolution: add new nullable columns if missing.
  ensureColumn("users", "disabled_at", "ALTER TABLE users ADD COLUMN disabled_at TEXT NULL;");

  dbFile.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  //
  // Leagues & seasons
  //
  dbFile.exec(`
    CREATE TABLE IF NOT EXISTS leagues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      logo_url TEXT,
      visibility TEXT NOT NULL DEFAULT 'public', -- public | private | hidden
      owner_user_id INTEGER NOT NULL,
      sport TEXT,
      password_hash TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Minimal evolutions: soft-archive leagues
  ensureColumn("leagues", "archived_at", "ALTER TABLE leagues ADD COLUMN archived_at TEXT NULL;");

  dbFile.exec(`
    CREATE TABLE IF NOT EXISTS seasons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      league_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL,          -- Signup | Drafting | Active | Playoffs | Completed | Archived
      format_type TEXT NOT NULL,     -- RoundRobin | Swiss | SingleElim | DoubleElim | GroupsPlayoffs | Hybrid
      starts_at TEXT,
      ends_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
    );
  `);

  // Minimal evolutions: soft-archive seasons
  ensureColumn("seasons", "archived_at", "ALTER TABLE seasons ADD COLUMN archived_at TEXT NULL;");

  // ✅ REQUIRED BY seasons.repo.ts (fixes your current crash)
  dbFile.exec(`
    CREATE TABLE IF NOT EXISTS season_settings (
      season_id INTEGER PRIMARY KEY,
      settings_json TEXT NOT NULL,
      FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE
    );
  `);

  dbFile.exec(`
    CREATE TABLE IF NOT EXISTS league_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      league_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL,              -- member | commissioner | co-commissioner etc.
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (league_id, user_id),
      FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  //
  // Teams & roster
  //
  dbFile.exec(`
    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      league_id INTEGER NOT NULL,
      season_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,          -- owner
      manager_user_id INTEGER,           -- explicit manager override (optional)
      name TEXT NOT NULL,
      logo_url TEXT,
      bio TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
      FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (manager_user_id) REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  ensureColumn("teams", "archived_at", "ALTER TABLE teams ADD COLUMN archived_at TEXT NULL;");
  // Economy (minimal, required for marketplace/shop correctness)
  ensureColumn("teams", "balance", "ALTER TABLE teams ADD COLUMN balance INTEGER NOT NULL DEFAULT 0;");


  dbFile.exec(`
    CREATE TABLE IF NOT EXISTS team_roster (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER NOT NULL,
      pokemon_id INTEGER NOT NULL,
      pokemon_instance_id INTEGER,
      species_name TEXT,
      nickname TEXT,
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
    );
  `);

  // Prevent accidental duplicate roster entries for a team.
  // Draft picks and free agency both rely on (team_id, pokemon_id) being unique.
  dbFile.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_team_roster_team_pokemon
      ON team_roster(team_id, pokemon_id);
  `);

  dbFile.exec(`
    CREATE TABLE IF NOT EXISTS team_items (
      team_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      name TEXT,
      category TEXT,
      quantity INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (team_id, item_id),
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
    );
  `);

  //
  // Matches & lineups
  //
  dbFile.exec(`
    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      league_id INTEGER NOT NULL,
      season_id INTEGER NOT NULL,
      round INTEGER,
      team_a_id INTEGER,
      team_b_id INTEGER,
      scheduled_at TEXT,
      status TEXT NOT NULL,            -- Scheduled | InProgress | AwaitingResult | Completed | Voided | UnderReview
      winner_team_id INTEGER,
      score_team_a INTEGER,
      score_team_b INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
      FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE,
      FOREIGN KEY (team_a_id) REFERENCES teams(id) ON DELETE SET NULL,
      FOREIGN KEY (team_b_id) REFERENCES teams(id) ON DELETE SET NULL
    );
  `);

  dbFile.exec(`
    CREATE TABLE IF NOT EXISTS lineups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      season_id INTEGER NOT NULL,
      team_id INTEGER NOT NULL,
      round INTEGER NOT NULL,
      status TEXT NOT NULL,             -- Draft | Locked | Final
      pokemon_ids_json TEXT NOT NULL,   -- JSON array of pokemon_instance_ids or similar
      validation_json TEXT,             -- JSON with validation info, errors, etc.
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (team_id, round),
      FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE,
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
    );
  `);

  dbFile.exec(`
    CREATE TABLE IF NOT EXISTS match_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id INTEGER NOT NULL,
      submitted_by_team_id INTEGER,
      submitted_by_user_id INTEGER,
      status TEXT NOT NULL,             -- PendingReview | Confirmed | Rejected | RejectedByOpponent, etc.
      score_team_a INTEGER,
      score_team_b INTEGER,
      winner_team_id INTEGER,
      game_breakdown_json TEXT,         -- JSON blob, per-game scores, notes
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
      FOREIGN KEY (submitted_by_team_id) REFERENCES teams(id) ON DELETE SET NULL,
      FOREIGN KEY (submitted_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (winner_team_id) REFERENCES teams(id) ON DELETE SET NULL
    );
  `);

  dbFile.exec(`
    CREATE TABLE IF NOT EXISTS match_result_votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      result_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      vote TEXT NOT NULL,               -- e.g. approve | reject | needs_changes
      comment TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (result_id) REFERENCES match_results(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  //
  // Draft
  //
  dbFile.exec(`
    CREATE TABLE IF NOT EXISTS draft_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      season_id INTEGER NOT NULL,
      status TEXT NOT NULL,              -- Pending | Active | Completed | Cancelled
      type TEXT NOT NULL,                -- e.g. Snake, Auction, etc.
      round_count INTEGER,               -- nullable: default session uses NULL
      pick_timer_seconds INTEGER,
      starts_at TEXT,
      config_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE
    );
  `);

  dbFile.exec(`
    CREATE TABLE IF NOT EXISTS draft_participants (
      season_id INTEGER NOT NULL,
      team_id INTEGER NOT NULL,
      position INTEGER NOT NULL,
      is_ready INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (season_id, team_id),
      FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE,
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
    );
  `);

  dbFile.exec(`
    CREATE TABLE IF NOT EXISTS draft_picks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      season_id INTEGER NOT NULL,
      team_id INTEGER NOT NULL,
      round INTEGER NOT NULL,
      pick_in_round INTEGER NOT NULL,
      overall_pick_number INTEGER NOT NULL,
      pokemon_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE,
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
    );
  `);

  // Draft integrity: prevent duplicate picks for the same Pokémon within a season,
  // and prevent two rows claiming the same overall pick number.
  dbFile.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_draft_picks_season_pokemon
      ON draft_picks(season_id, pokemon_id);
  `);
  dbFile.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_draft_picks_season_overall
      ON draft_picks(season_id, overall_pick_number);
  `);

  dbFile.exec(`
    CREATE TABLE IF NOT EXISTS draft_watchlist (
      season_id INTEGER NOT NULL,
      team_id INTEGER NOT NULL,
      pokemon_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (season_id, team_id, pokemon_id),
      FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE,
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
    );
  `);

  //
  // Marketplace
  //
  dbFile.exec(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT,
      base_cost INTEGER,
      sprite_url TEXT,
      tags_json TEXT
    );
  `);

  dbFile.exec(`
    CREATE TABLE IF NOT EXISTS season_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      season_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      price INTEGER NOT NULL,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      UNIQUE (season_id, item_id),
      FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE,
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
    );
  `);

  dbFile.exec(`
    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      season_id INTEGER NOT NULL,
      from_team_id INTEGER NOT NULL,
      to_team_id INTEGER NOT NULL,
      status TEXT NOT NULL,             -- Open | Accepted | Rejected | Cancelled | Expired
      message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT,
      last_message_at TEXT,
      FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE,
      FOREIGN KEY (from_team_id) REFERENCES teams(id) ON DELETE CASCADE,
      FOREIGN KEY (to_team_id) REFERENCES teams(id) ON DELETE CASCADE
    );
  `);

  dbFile.exec(`
    CREATE TABLE IF NOT EXISTS trade_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trade_id INTEGER NOT NULL,
      side TEXT NOT NULL,               -- from | to
      asset_type TEXT NOT NULL,         -- pokemon | item | currency
      item_id INTEGER,
      pokemon_instance_id INTEGER,
      quantity INTEGER,
      currency_amount INTEGER,
      FOREIGN KEY (trade_id) REFERENCES trades(id) ON DELETE CASCADE
    );
  `);

  //
  // Marketplace transactions (audit log)
  //
  dbFile.exec(`
    CREATE TABLE IF NOT EXISTS marketplace_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      season_id INTEGER NOT NULL,
      team_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      summary TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE,
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
    );
  `);

  //
  // Inbox / notifications
  //
  dbFile.exec(`
    CREATE TABLE IF NOT EXISTS inbox_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      to_user_id INTEGER NOT NULL,
      from_user_id INTEGER,
      from_system INTEGER NOT NULL DEFAULT 0,
      category TEXT NOT NULL,
      type TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      payload_json TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      is_archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      read_at TEXT,
      archived_at TEXT,
      related_league_id INTEGER,
      related_season_id INTEGER,
      related_match_id INTEGER,
      FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (related_league_id) REFERENCES leagues(id) ON DELETE SET NULL,
      FOREIGN KEY (related_season_id) REFERENCES seasons(id) ON DELETE SET NULL,
      FOREIGN KEY (related_match_id) REFERENCES matches(id) ON DELETE SET NULL
    );
  `);

  //
  // Pokedex / balance console
  //
  dbFile.exec(`
    CREATE TABLE IF NOT EXISTS pokedex_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dex_number INTEGER NOT NULL,
      form_name TEXT,
      name TEXT NOT NULL,
      base_cost INTEGER,
      override_cost INTEGER,
      sprite_url TEXT,
      base_stats_json TEXT,
      roles_json TEXT,
      tags_json TEXT,
      types_json TEXT
    );
  `);

  // Minimal evolutions: stable identity + import metadata + draft whitelist flags
  ensureColumn(
    "pokedex_entries",
    "species_key",
    "ALTER TABLE pokedex_entries ADD COLUMN species_key TEXT NULL;"
  );
  ensureColumn(
    "pokedex_entries",
    "form_key",
    "ALTER TABLE pokedex_entries ADD COLUMN form_key TEXT NULL;"
  );
  ensureColumn(
    "pokedex_entries",
    "form_key_norm",
    "ALTER TABLE pokedex_entries ADD COLUMN form_key_norm TEXT NOT NULL DEFAULT '';"
  );
  ensureColumn(
    "pokedex_entries",
    "is_draftable_default",
    "ALTER TABLE pokedex_entries ADD COLUMN is_draftable_default INTEGER NOT NULL DEFAULT 0;"
  );
  ensureColumn(
    "pokedex_entries",
    "is_battle_only_form",
    "ALTER TABLE pokedex_entries ADD COLUMN is_battle_only_form INTEGER NOT NULL DEFAULT 0;"
  );
  ensureColumn(
    "pokedex_entries",
    "is_archived",
    "ALTER TABLE pokedex_entries ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;"
  );
  ensureColumn(
    "pokedex_entries",
    "imported_at",
    "ALTER TABLE pokedex_entries ADD COLUMN imported_at TEXT NULL;"
  );
  ensureColumn(
    "pokedex_entries",
    "source_tag",
    "ALTER TABLE pokedex_entries ADD COLUMN source_tag TEXT NULL;"
  );

  dbFile.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_pokedex_entries_species_form_norm
     ON pokedex_entries(species_key, form_key_norm);`
  );

  // Dex detail tables (PBS import)
  dbFile.exec(`
    CREATE TABLE IF NOT EXISTS dex_moves (
      key TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT,
      category TEXT,
      power INTEGER,
      accuracy INTEGER,
      pp INTEGER,
      priority INTEGER,
      target TEXT,
      function_code TEXT,
      effect_chance INTEGER,
      flags TEXT,
      description TEXT
    );
  `);

  dbFile.exec(`
    CREATE TABLE IF NOT EXISTS dex_abilities (
      key TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT
    );
  `);

  dbFile.exec(`
    CREATE TABLE IF NOT EXISTS dex_items (
      key TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      pocket TEXT,
      flags TEXT
    );
  `);

  dbFile.exec(`
    CREATE TABLE IF NOT EXISTS dex_types (
      key TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      damage_relations_json TEXT NOT NULL
    );
  `);

  dbFile.exec(`
    CREATE TABLE IF NOT EXISTS dex_natures (
      key TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      increased_stat TEXT,
      decreased_stat TEXT,
      description TEXT
    );
  `);

  dbFile.exec(`
    CREATE TABLE IF NOT EXISTS dex_pokemon_abilities (
      pokemon_id INTEGER NOT NULL,
      slot TEXT NOT NULL, -- ability1 | ability2 | hidden
      ability_key TEXT NOT NULL,
      PRIMARY KEY (pokemon_id, slot),
      FOREIGN KEY (pokemon_id) REFERENCES pokedex_entries(id) ON DELETE CASCADE,
      FOREIGN KEY (ability_key) REFERENCES dex_abilities(key) ON DELETE CASCADE
    );
  `);

  dbFile.exec(`
    CREATE TABLE IF NOT EXISTS dex_pokemon_evolutions (
      from_pokemon_id INTEGER NOT NULL,
      to_pokemon_id INTEGER NOT NULL,
      method TEXT NOT NULL,
      param TEXT,
      PRIMARY KEY (from_pokemon_id, to_pokemon_id, method, param),
      FOREIGN KEY (from_pokemon_id) REFERENCES pokedex_entries(id) ON DELETE CASCADE,
      FOREIGN KEY (to_pokemon_id) REFERENCES pokedex_entries(id) ON DELETE CASCADE
    );
  `);

  dbFile.exec(`
    CREATE TABLE IF NOT EXISTS dex_pokemon_learnsets (
      pokemon_id INTEGER PRIMARY KEY,
      level_up_json TEXT NOT NULL,
      egg_moves_json TEXT NOT NULL,
      tutor_moves_json TEXT NOT NULL,
      FOREIGN KEY (pokemon_id) REFERENCES pokedex_entries(id) ON DELETE CASCADE
    );
  `);

  dbFile.exec(`
    CREATE TABLE IF NOT EXISTS pokedex_season_overrides (
      pokemon_id INTEGER NOT NULL,
      league_id INTEGER,
      season_id INTEGER NOT NULL,
      is_banned INTEGER NOT NULL DEFAULT 0,
      override_cost INTEGER,
      PRIMARY KEY (season_id, pokemon_id),
      FOREIGN KEY (pokemon_id) REFERENCES pokedex_entries(id) ON DELETE CASCADE,
      FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
      FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE
    );
  `);

  dbFile.exec(`
    CREATE TABLE IF NOT EXISTS pokedex_votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      league_id INTEGER,
      season_id INTEGER,
      pokemon_id INTEGER NOT NULL,
      vote_type TEXT NOT NULL,          -- 'ban' | 'unban' | 'cost'
      target_cost INTEGER,
      reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE SET NULL,
      FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE,
      FOREIGN KEY (pokemon_id) REFERENCES pokedex_entries(id) ON DELETE CASCADE
    );
  `);

  //
  // Feature flags
  //
  dbFile.exec(`
    CREATE TABLE IF NOT EXISTS feature_flags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL,
      scope TEXT NOT NULL,            -- global | league | season
      enabled INTEGER NOT NULL DEFAULT 0,
      league_id INTEGER,
      season_id INTEGER,
      UNIQUE (key, scope, league_id, season_id),
      FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
      FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE
    );
  `);
}

function ensureColumn(table: string, column: string, ddl: string) {
  const cols = dbFile
    .prepare(`PRAGMA table_info(${table});`)
    .all()
    .map((r: any) => String(r.name));
  if (!cols.includes(column)) {
    dbFile.exec(ddl);
  }
}
