import { handleApiRequest } from '../src/lib/resume-api';

/**
 * Cloudflare Worker. `run_worker_first: ["/api/*"]` in wrangler.jsonc routes
 * only the API here; every other path is served directly from the static assets.
 */
const worker = {
  fetch(request: Request): Response {
    return handleApiRequest(request);
  },
};

export default worker;
