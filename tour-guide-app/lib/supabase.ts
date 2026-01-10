import { createClient } from '@supabase/supabase-js'

// In Next.js, variables must start with NEXT_PUBLIC_ to be used in the browser
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);