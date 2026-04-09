import { supabase } from '../supabase.js';

function normalizeInvokeError(error, fallbackMessage) {
    if (!error) {
        return new Error(fallbackMessage);
    }

    if (error instanceof Error) {
        return error;
    }

    return new Error(String(error?.message || fallbackMessage));
}

export async function invokeEdgeFunction(name, payload = {}) {
    const { data, error } = await supabase.functions.invoke(name, {
        body: payload,
    });

    if (error) {
        throw normalizeInvokeError(error, `Failed to invoke edge function "${name}".`);
    }

    if (data?.ok === false && data?.error?.message) {
        const err = new Error(String(data.error.message));
        err.code = data.error.code || 'edge_function_error';
        err.details = data.error.details || null;
        throw err;
    }

    return data?.data ?? data;
}
