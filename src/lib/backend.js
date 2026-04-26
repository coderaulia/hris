import { supabaseAdapter } from './backends/supabase-adapter.js';
import { laravelAdapter } from './backends/laravel-adapter.js';

const mode = import.meta.env.VITE_BACKEND_MODE || 'supabase';

export const backend = mode === 'laravel' ? laravelAdapter : supabaseAdapter;
