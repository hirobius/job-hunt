// GET /api/boards?src=dsjobs (&q=<term> for a search source): job boards whose feeds the browser
// can't read itself (RSS / JSON with no CORS headers). Fixed upstream URLs only; all behaviour is in
// src/feed/sources/boardsHandler.ts (tested there).
import { createBoardsHandler } from '../src/feed/sources/boardsHandler';

export const config = { runtime: 'edge' };

export default createBoardsHandler();
