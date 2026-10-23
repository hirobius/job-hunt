// The blob version that first carried each field (ADR 0008 + addenda). A cloud copy older than a
// field has no opinion on it: its empty value is "unknown", never "the user cleared it". Read by
// the refresh merge (keep this device's value) and the sync base (never a delete, #219).
export const FIELD_SINCE = {
  jobs: 1,
  copydeck: 3,
  triage: 3,
  targets: 5,
  filters: 5,
  evidence: 5,
  modes: 5,
  kit: 6,
  sweeps: 7,
  trash: 8,
  dreams: 9,
  documents: 10,
  mustInclude: 11,
} as const;

export type VersionedField = keyof typeof FIELD_SINCE;

/** Whether a blob read from `sourceV` carries `field`. */
export const carries = (sourceV: number, field: VersionedField) => sourceV >= FIELD_SINCE[field];
