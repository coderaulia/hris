const API_URL = import.meta.env.VITE_LARAVEL_API_URL || 'http://localhost:8000/api/v1';

function getToken() {
    return localStorage.getItem('laravel_token');
}

async function fetchApi(endpoint, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...options.headers,
    };

    const token = getToken();
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers,
    });

    if (!response.ok) {
        let errorData;
        try {
            errorData = await response.json();
        } catch {
            errorData = { message: response.statusText };
        }
        throw new Error(errorData.message || 'API request failed');
    }

    // Handle 204 No Content
    if (response.status === 204) return null;

    return response.json();
}

export const laravelAdapter = {
    auth: {
        signIn: async (email, password) => {
            try {
                const data = await fetchApi('/auth/login', {
                    method: 'POST',
                    body: JSON.stringify({ email, password })
                });
                localStorage.setItem('laravel_token', data.token);
                return { data: { session: { access_token: data.token, user: data.user } }, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        signOut: async () => {
            try {
                await fetchApi('/auth/logout', { method: 'POST' });
                localStorage.removeItem('laravel_token');
                return { error: null };
            } catch (error) {
                return { error };
            }
        },
        getSession: async () => {
            try {
                const data = await fetchApi('/auth/me');
                return { data: { session: { user: data.data } }, error: null };
            } catch (error) {
                return { data: { session: null }, error: null }; // no session
            }
        },
        onAuthStateChange: (callback) => {
            // Stub for compatibility. Laravel handles auth via token so realtime state change isn't broadcasted natively
            // In a real SPA, we trigger the callback manually when login/logout happens
            return { data: { subscription: { unsubscribe: () => {} } } };
        }
    },
    employees: {
        list: async () => {
            try {
                const data = await fetchApi('/employees');
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        get: async (id) => {
            try {
                const data = await fetchApi(`/employees/${id}`);
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        create: async (payload) => {
            try {
                const data = await fetchApi('/employees', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        update: async (id, payload) => {
            try {
                const data = await fetchApi(`/employees/${id}`, {
                    method: 'PUT',
                    body: JSON.stringify(payload)
                });
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        delete: async (id) => {
            try {
                await fetchApi(`/employees/${id}`, { method: 'DELETE' });
                return { error: null };
            } catch (error) {
                return { error };
            }
        }
    }
};
