# RoleForge flame v2 (Adrian's pick, 2026-10-22)

No outline, blue only (3 shades), animated by path morphing. Design page:
https://claude.ai/artifact/AnQDAJ5xp7m5KUES6WdMfB

- `roleforge-flame-animated.svg`: three layers (outer, mid, core), each with an SMIL `<animate attributeName="d">`
  (1.6 s / 1.25 s / 0.95 s, out of step). Fills read `--rf-flame-1/2/3` with fallbacks #1e2efd / #4f6cff / #b9ccff.
- `roleforge-flame-static.svg`: frame 0 only (reduced motion, favicon source).
- `roleforge-flame-icon.svg`: frame 0 with literal hex fills (for icon rendering).
- `frames.json`: the 3 keyframes per layer (same path structure, so they morph).
viewBox 0 0 94 146. Delete this folder once BrandMark uses it.
