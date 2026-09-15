# Production checklist

Before treating this prototype as production-ready:

- Configure `SUPABASE_URL`, publishable browser key and server-side Netlify secrets through the deployment platform.
- Configure `GEMINI_API_KEY` server-side; never place it in `public/config.js`.
- Apply Supabase SQL in `supabase/MIGRATION-ORDER.md` order and inspect grants/RLS in the target project.
- Replace prototype university verification with institution-backed verification.
- Review storage bucket policies for `post-media` and use signed URLs if the community is private.
- Add rate limits/abuse controls to posting, messaging, friend requests, challenge creation and AI requests.
- Add observability for failed RPCs, calendar fetch failures, realtime disconnects and Gemini 4xx/5xx responses.
- Run `npm run check` in CI before deployment.
- Keep Strava disabled until its OAuth credentials, callback URLs and privacy policy are deliberately configured.
