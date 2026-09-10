window.__FIT_CONFIG__ = {
  SUPABASE_URL: 'https://aymsmrdsvxyyjhlafuiz.supabase.co',
  SUPABASE_ANON_KEY: '',
  FIT_STRAVA_CLIENT_ID: ''
};
// src/lib/supabase.js reads window.FIT_TOGETHER_CONFIG with keys SUPABASE_URL /
// SUPABASE_PUBLISHABLE_KEY (or SUPABASE_KEY) — mirror the config here under
// those names so the app can actually pick it up.
window.FIT_TOGETHER_CONFIG = {
  SUPABASE_URL: window.__FIT_CONFIG__.SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY: window.__FIT_CONFIG__.SUPABASE_ANON_KEY
};
window.__FIT_STRAVA_CLIENT_ID = window.__FIT_CONFIG__.FIT_STRAVA_CLIENT_ID;
