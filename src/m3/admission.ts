import { M3ContractError } from "./errors.ts";

/**
 * Deployment-owned content admission configuration. M3 deliberately has no
 * embedded MIME allow-list or byte limit: those values are a security policy,
 * not financial-domain policy.
 */
export interface ArtifactAdmissionPolicy {
  readonly policy_ref: string;
  readonly allowed_content_types: readonly string[];
  readonly maximum_artifact_byte_size: number;
}

export interface ArtifactAdmissionInput {
  readonly declared_content_type?: string;
  readonly detected_content_type: string;
  readonly byte_size: number;
  readonly original_name?: string;
}

function isOpaqueName(value: string): boolean {
  return value.length > 0
    && !value.includes("/")
    && !value.includes("\\")
    && value !== "."
    && value !== ".."
    && !value.includes("\u0000");
}

/** Reject content before it becomes a canonical artifact. */
export function assertArtifactAdmitted(policy: ArtifactAdmissionPolicy, input: ArtifactAdmissionInput): void {
  if (policy.policy_ref.trim().length === 0
      || policy.maximum_artifact_byte_size <= 0
      || !Number.isSafeInteger(policy.maximum_artifact_byte_size)
      || policy.allowed_content_types.length === 0) {
    throw new M3ContractError("M3_ADMISSION_REJECTED", "server admission policy is incomplete", "M3_ADMISSION_POLICY_INVALID");
  }
  if (!Number.isSafeInteger(input.byte_size) || input.byte_size <= 0 || input.byte_size > policy.maximum_artifact_byte_size) {
    throw new M3ContractError("M3_ADMISSION_REJECTED", "artifact byte size is not permitted", "M3_ARTIFACT_SIZE_REJECTED");
  }
  if (input.detected_content_type.trim().length === 0 || !policy.allowed_content_types.includes(input.detected_content_type)) {
    throw new M3ContractError("M3_ADMISSION_REJECTED", "detected content type is not permitted", "M3_ARTIFACT_MIME_REJECTED");
  }
  if (input.declared_content_type !== undefined && input.declared_content_type !== input.detected_content_type) {
    throw new M3ContractError("M3_ADMISSION_REJECTED", "declared and detected content types differ", "M3_ARTIFACT_MIME_MISMATCH");
  }
  if (input.original_name !== undefined && !isOpaqueName(input.original_name)) {
    throw new M3ContractError("M3_ADMISSION_REJECTED", "artifact filename must not be a path or storage reference", "M3_ARTIFACT_NAME_REJECTED");
  }
}
