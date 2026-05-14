/**
 * Type definitions for Vanguard cards from vanguard-library-db.
 * Mirror schema dari cards.json di GitHub.
 */

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

export interface Card {
  enCardNo:   string;        // e.g. "DZ-BT12/001EN"
  setCode:    string;        // e.g. "DZ-BT12"
  cardNumber: string;        // e.g. "001"
  name:       string;
  unitType:   UnitType | null;
  nations:    string[];      // support dual-nation
  clan:       string[];
  races:      string[];
  grade:      number | null; // 0-10 (Grade 10 = Calamity)
  trigger:    TriggerType;
  rarity:     string | null; // "RRR", "RR", "R", "C", "SP", etc
  imageUrlEn: string | null;
}

/** Result wrapper for fetch operations. */
export interface FetchResult {
  cards: Card[];
  totalBytes: number;
  fetchTimeMs: number;
  parseTimeMs: number;
}

export interface CollectionEntry {
  id?: number;       // autoIncrement PK; undefined when creating
  cardCode: string;  // matches Card.enCardNo
  quantity: number;  // always >= 1
  location: string;  // free-form; "" = unspecified
}

export interface WishlistEntry {
  cardCode: string;  // primary key
}
