/**
 * Centralized API client for Voice Function.
 */

export const API_BASE = import.meta.env.VITE_API_BASE || '';

/**
 * Wrapper around fetch that prepends API_BASE to the path.
 */
export async function apiFetch(path, options = {}) {
    const url = `${API_BASE}${path}`;
    return fetch(url, {
        ...options,
        headers: {
            ...(options.headers || {}),
        },
    });
}

/**
 * Convenience: JSON POST request.
 */
export async function apiPost(path, body) {
    return apiFetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

/**
 * Convenience: JSON GET request.
 */
export async function apiGet(path) {
    return apiFetch(path);
}
