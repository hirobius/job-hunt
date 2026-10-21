// HDS TabsContent is a tinted, padded card pulled up under its tab strip — right for in-page
// tabs, wrong for the app's top-level nav, where it indented every view 24px off the header's edge
// and nested each page in a surface. Top-level panels are bare (HDS gap, hds#819). In-page tabs that sit on the page (Discover's sections) use it too..
export const BARE_PANEL = {
  background: 'transparent',
  padding: 0,
  marginTop: 0,
  borderRadius: 0,
} as const;
