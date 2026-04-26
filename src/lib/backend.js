import { supabaseAdapter } from './backends/supabase-adapter.js';
import { laravelAdapter } from './backends/laravel-adapter.js';

// Support runtime overrides for testing (window._VITE_BACKEND_TYPE)
const mode = (typeof window !== 'undefined' && window._VITE_BACKEND_TYPE) 
    || import.meta.env.VITE_BACKEND_TYPE 
    || import.meta.env.VITE_BACKEND_MODE 
    || 'supabase';

const selectedAdapter = mode === 'laravel' ? laravelAdapter : supabaseAdapter;

// Add a helper for testing to verify which adapter is active
selectedAdapter._type = mode;

export const backend = selectedAdapter;
