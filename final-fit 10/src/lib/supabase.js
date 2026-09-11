import { createClient } from '@supabase/supabase-js'
const runtime = window.FIT_TOGETHER_CONFIG || {}
const url = runtime.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL
const key = runtime.SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const configured = Boolean(url && key && url.includes('supabase') && !url.includes('PASTE_'))
export const isSupabaseConfigured = configured
export const supabase = configured ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null
