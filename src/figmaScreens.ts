// The Figma screen map (#197): each main screen's frame in the Figma file, the route that opens
// it and the source files that render it. Plain links, not Code Connect (that needs a Figma
// Organization plan). Docs: docs/figma/README.md. Shots: docs/figma/<shot>-{1440,390}.png.

// "roleflame_working", pages Phone 390 (9:2) and Desktop 1440 (9:3): frames built 1:1 from code with HDS library instances.
export const FIGMA_FILE_URL =
  'https://www.figma.com/design/9VCvYGN0pz9faveIhSn6Kn/roleflame_working';

export interface FigmaScreen {
  id: string;
  title: string;
  /** Hash route that opens the screen; `tab` is what `parseHash` reads from it. */
  route: string;
  tab: string;
  /** Repo-relative file + its default-exported component. */
  sources: { file: string; component: string }[];
  /** Frames in the Figma file, "page:node": desktop (1440) and phone (390). */
  nodeId: string;
  phoneNodeId: string;
  /** Shot basename under docs/figma/. */
  shot: string;
}

export const FIGMA_SCREENS: FigmaScreen[] = [
  {
    id: 'pipeline',
    title: 'Pipeline',
    route: '#/apply',
    tab: 'apply',
    sources: [
      { file: 'src/TrackerView.tsx', component: 'TrackerView' },
      { file: 'src/JobRowList.tsx', component: 'JobRowList' },
    ],
    nodeId: '13:7940',
    phoneNodeId: '13:7611',
    shot: 'pipeline',
  },
  {
    id: 'job-page',
    title: 'Job page',
    route: '#/apply/sample',
    tab: 'apply',
    sources: [{ file: 'src/JobPage.tsx', component: 'JobPage' }],
    nodeId: '23:13239',
    phoneNodeId: '13:7047',
    shot: 'job-page',
  },
  {
    id: 'templates',
    // Templates became the Documents library (#227); the frame id and shot keep their names.
    title: 'Documents',
    // A dialog over the open tab since #471 slice 4.
    route: '#/find?documents=tpl-outreach',
    tab: 'find',
    sources: [
      { file: 'src/DocumentsView.tsx', component: 'DocumentsView' },
      { file: 'src/DocumentsLibrary.tsx', component: 'DocumentsLibrary' },
      { file: 'src/DocumentEditor.tsx', component: 'DocumentEditor' },
    ],
    nodeId: '14:7954',
    phoneNodeId: '14:7827',
    shot: 'templates',
  },
];

export const figmaFileKey = (url: string): string | undefined =>
  /figma\.com\/(?:design|file)\/([0-9a-zA-Z]+)/.exec(url)?.[1];

export const frameUrl = (screen: FigmaScreen, nodeId = screen.nodeId): string =>
  `${FIGMA_FILE_URL}?node-id=${nodeId.replace(':', '-')}`;
