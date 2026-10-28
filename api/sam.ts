// GET /api/sam?naics=332322,541511&state=WA: the Contracts track's SAM.gov source (#275). The key
// stays here (SAM_GOV_API_KEY, Vercel → Settings → Environment Variables); without it every call
// answers 503 with the variable's name and where to set it. All behaviour is in
// src/contracts/samHandler.ts (tested there).
import { createSamHandler } from '../src/contracts/samHandler';

export const config = { runtime: 'edge' };

export default createSamHandler({ getKey: () => process.env.SAM_GOV_API_KEY });
