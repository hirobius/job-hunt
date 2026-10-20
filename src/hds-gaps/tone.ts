// Secondary text colour for non-Text elements (#133). On `Text`, use `tone="secondary"` (HDS 0.26, hds#655).
// Pass as `style={SECONDARY}` on a plain span or p.
export const SECONDARY = { color: 'var(--semantic-color-content-secondary)' } as const;

// Destructive menu item colour: HDS Menu.Item has no danger tone yet.
export const DANGER = { color: 'var(--semantic-color-feedback-error)' } as const;
