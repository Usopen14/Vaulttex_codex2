import { createHash, randomUUID } from "node:crypto";

import { contentHash, uuid, type ContentHash, type Uuid } from "../domain/common/ids.ts";
import { WendyDomainError } from "../domain/common/errors.ts";

type CanonicalValue = null | boolean | number | string | readonly CanonicalValue[] | { readonly [key: string]: CanonicalValue };

/**
 * A deliberately small RFC 8785-compatible serializer for this contract's JSON
 * values. Financial quantities are strings, never JSON numbers, so no binary
 * floating-point amount can enter a canonical preimage.
 */
export function canonicalJson(value: CanonicalValue): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isSafeInteger(value)) {
      throw new WendyDomainError("INVALID_SCHEMA", "canonical JSON numbers must be finite safe integers", { rule_id: "M2-CANON-001" });
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as { readonly [key: string]: CanonicalValue };
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key]!)}`).join(",")}}`;
}

export function sha256Canonical(value: CanonicalValue): { readonly canonical_preimage: string; readonly hash: ContentHash } {
  const canonical_preimage = canonicalJson(value);
  return Object.freeze({
    canonical_preimage,
    hash: contentHash(createHash("sha256").update(canonical_preimage, "utf8").digest("hex")),
  });
}

export function newM2Uuid(): Uuid {
  return uuid(randomUUID());
}

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}
