/**
 * Type definitions for Vanguard cards from vanguard-library-db.
 */

// ── Documentation-only enums (not used in Card interface) ────────────────────
// EN values only — JP equivalents are Japanese strings (ノーマルユニット, etc.)

export type UnitType =
  | "Normal Unit"
  | "G Unit"
  | "Normal Order"
  | "Set Order"
  | "Blitz Order"
  | "Trigger Order"
  | "Token"
  | "Ride Deck Crest"
  | "Others";

export type TriggerType =
  | "Critical"
  | "Draw"
  | "Heal"
  | "Front"
  | "Over"
  | "Sentinel"
  | null;

// ── Raw shapes from JSON (before normalization) ───────────────────────────────

export interface RawEnCard {
  enCardNo:   string;
  setCode:    string;
  cardNumber: string;
  name:       string;
  unitType:   string | null;
  nations:    string[];
  clan:       string[];
  races:      string[];
  grade:      number | null;
  trigger:    string | null;
  rarity:     string | null;
  imageUrlEn: string | null;
}

export interface RawJpCard {
  jpCardNo:   string;
  setCode:    string;
  cardNumber: string;
  nameJp:     string;
  unitType:   string | null;
  nations:    string[];
  clan:       string[];
  races:      string[];
  grade:      number | null;
  trigger:    string | null;
  rarity:     string | null;
  imageUrlJp: string | null;
}

// ── Unified Card shape (post-normalization) ───────────────────────────────────

export interface Card {
  cardNo:      string;        // enCardNo for EN, jpCardNo for JP
  displayName: string;        // name for EN, nameJp for JP
  imageUrl:    string | null; // imageUrlEn for EN, imageUrlJp for JP
  region:      "EN" | "JP";
  // identical fields in both schemas:
  setCode:    string;
  cardNumber: string;
  unitType:   string | null;  // Japanese string for JP (ノーマルユニット, etc.)
  nations:    string[];
  clan:       string[];
  races:      string[];
  grade:      number | null;
  trigger:    string | null;  // Japanese string for JP
  rarity:     string | null;
}

// ── Fetch result wrapper ──────────────────────────────────────────────────────

export interface FetchResult {
  cards:       Card[];
  totalBytes:  number;
  fetchTimeMs: number;
  parseTimeMs: number;
}

// ── Collection & Wishlist ─────────────────────────────────────────────────────

export interface CollectionEntry {
  id?:      number;            // autoIncrement PK; undefined when creating
  cardCode: string;            // matches Card.cardNo
  quantity: number;            // always >= 1
  location: string;            // free-form; "" = unspecified
  region:   "EN" | "JP";
}

export interface WishlistEntry {
  cardCode: string;            // matches Card.cardNo
  region:   "EN" | "JP";
}

// ── Settings ──────────────────────────────────────────────────────────────────

export interface Settings {
  region_preference:  "EN" | "JP" | "BOTH";
  last_active_region: "EN" | "JP";
  migration_version:  number;
}

// ── Version info from version.json ───────────────────────────────────────────

export interface VersionInfo {
  lastUpdate:   string;
  cardCount:    number;
  cardCountJp?: number;
  newSets:      string[];
  newSetsJp?:   string[];
}

// ── Cloud sync ────────────────────────────────────────────────────────────────

export interface AuthSession {
  token:     string;
  email:     string;
  expiresAt: number;
}

export interface SyncPayload {
  collection:       CollectionEntry[];
  wishlist:         WishlistEntry[];
  locations:        string[];
  last_modified_at: number;
  app_version?:     string;
  schema_version?:  number;
}

export interface SyncMeta {
  lastSyncedAt: number;
}

export interface ConflictEntry {
  cardCode: string;
  region:   "EN" | "JP";
  local:    CollectionEntry | null;
  remote:   CollectionEntry | null;
}
