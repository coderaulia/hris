import { invokeEdgeFunction } from './core.js';

export async function normalizeAuthCallback({ currentUrl, next, type }) {
    return invokeEdgeFunction('auth-callbacks', {
        current_url: currentUrl,
        next,
        type,
    });
}
