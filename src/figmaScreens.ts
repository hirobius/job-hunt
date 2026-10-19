// The Figma screen map (#197): each main screen's frame in the Figma file, the route that opens
// it and the source files that render it. Plain links, not Code Connect (that needs a Figma
// Organization plan). Docs: docs/figma/README.md. Shots: docs/figma/<shot>-{1440,390}.png.

export const FIGMA_FILE_URL = 'https://www.figma.com/design/mJgRxGXwbd4j9jj96qpdFI';

export interface FigmaScreen {
  id: string;
  title: string;
  /** Hash route that opens the screen; `tab` is what `parseHash` reads from it. */
  route: string;
  tab: string;
  /** Repo-relative file + its default-exported component. */
  sources: { file: string; component: string }[];
  /** Frame in the Figma file, "page:node". */
  nodeId: string;
  /** Shot basename under docs/figma/. */
  shot: string;
}

export const FIGMA_SCREENS: FigmaScreen[] = [
  {
    id: 'today',
    title: 'Today',
    route: '#/today',
    tab: 'today',
    sources: [{ file: 'src/TodayView.tsx', component: 'TodayView' }],
    nodeId: '1:2',
    shot: 'today',
  },
  {
    id: 'pipeline',
    title: 'Pipeline',
    route: '#/queue',
    tab: 'queue',
    sources: [
      { file: 'src/TrackerView.tsx', component: 'TrackerView' },
      { file: 'src/JobsTable.tsx', component: 'JobsTable' },
      { file: 'src/JobListCard.tsx', component: 'JobListCard' },
    ],
    nodeId: '1:10',
    shot: 'pipeline',
  },
  {
    id: 'job-page',
    title: 'Job page',
    route: '#/queue/sample',
    tab: 'queue',
    sources: [{ file: 'src/JobPage.tsx', component: 'JobPage' }],
    nodeId: '1:18',
    shot: 'job-page',
  },
  {
    id: 'discover',
    title: 'Discover (Companies tab)',
    route: '#/discover',
    tab: 'discover',
    sources: [
      { file: 'src/DiscoverView.tsx', component: 'DiscoverView' },
      { file: 'src/TileGrid.tsx', component: 'TileGrid' },
    ],
    nodeId: '1:26',
    shot: 'discover',
  },
  {
    id: 'templates',
    title: 'Templates',
    route: '#/copy-deck/tpl-outreach',
    tab: 'copy-deck',
    sources: [
      { file: 'src/CopyDeckView.tsx', component: 'CopyDeckView' },
      { file: 'src/TemplateDetail.tsx', component: 'TemplateDetail' },
    ],
    nodeId: '1:34',
    shot: 'templates',
  },
];

export const figmaFileKey = (url: string): string | undefined =>
  /figma\.com\/(?:design|file)\/([0-9a-zA-Z]+)/.exec(url)?.[1];

export const frameUrl = (screen: FigmaScreen): string =>
  `${FIGMA_FILE_URL}?node-id=${screen.nodeId.replace(':', '-')}`;
