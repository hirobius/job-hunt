// Secondary text colour (#133). HDS's documented idiom until `Text` grows a tone prop (hds#655):
// pass as `style={SECONDARY}` on a caption or ui `Text`.
export const SECONDARY = { color: 'var(--semantic-color-content-secondary)' } as const;

// Destructive menu item colour: HDS Menu.Item has no danger tone yet.
export const DANGER = { color: 'var(--semantic-color-feedback-error)' } as const;
