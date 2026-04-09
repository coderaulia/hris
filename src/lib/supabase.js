import { createClient } from '@supabase/supabase-js';
import { formatSupabaseEnvError, validateSupabaseEnv } from './env.js';

const validation = validateSupabaseEnv();
const SUPABASE_URL = validation.url;
const SUPABASE_ANON_KEY = validation.anonKey;
const SUPABASE_ENV_ERROR = formatSupabaseEnvError(validation);

function createInvalidSupabaseClient(message) {
    return new Proxy({}, {
        get() {
            throw new Error(message);
        },
    });
}

export function getSupabaseEnvValidation() {
    return validation;
}

export const supabase = validation.ok
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : createInvalidSupabaseClient(SUPABASE_ENV_ERROR);
