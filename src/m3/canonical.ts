import { createHash, randomUUID } from "node:crypto";

import { contentHash, uuid, type ContentHash, type Uuid } from "../domain/common/ids.ts";
import { M3ContractError } from "./errors.ts";

export type M3CanonicalValue = null | boolean | number | string | readonly M3CanonicalValue[] | { readonly [key: string]: M3CanonicalValue };

/**
 * Frozen M3 JSON canonicalization. It is intentionally versioned separately
 * from M2 financial fingerprints: M3 hashes source/candidate representations,
 * never accounting effects.
 */
export function canonicalJson(value: M3CanonicalValue): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isSafeInteger(value)) {
      throw new M3ContractError("M3_CONTRACT_VIOLATION", "canonical JSON numbers must be finite safe integers", "M3_CANONICAL_NUMBER_INVALID");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as { readonly [key: string]: M3CanonicalValue };
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key]!)}`).join(",")}}`;
}

export function sha256Bytes(bytes: Uint8Array): ContentHash {
  return contentHash(createHash("sha256").update(bytes).digest("hex"));
}

export function sha256Canonical(value: M3CanonicalValue): { readonly canonical_preimage: string; readonly hash: ContentHash } {
  const canonical_preimage = canonicalJson(value);
  return Object.freeze({
    canonical_preimage,
    hash: contentHash(createHash("sha256").update(canonical_preimage, "utf8").digest("hex")),
  });
}

export function newM3Uuid(): Uuid { return uuid(randomUUID()); }

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}
