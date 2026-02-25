import { createClient } from '@supabase/supabase-js';

// TODO: Replace with your Supabase project credentials
const SUPABASE_URL = 'https://uqypbmwoinrvnkbkjoef.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxeXBibXdvaW5ydm5rYmtqb2VmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5OTI2MjksImV4cCI6MjA4NzU2ODYyOX0.YuwjluDdb3r41_fO1bwHFpwvAx6w_kPAUyQrnGUBDjY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
