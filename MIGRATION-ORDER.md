# Supabase migration order

Apply these SQL files once, in this order, against the same Supabase project:

1. `FINAL_MIGRATION.sql` — production baseline schema, RLS, core RPCs and grants.
2. `V2_SOCIAL_CHALLENGES.sql` — friends/groups/communities/challenges/leaderboards and V2 overrides.
3. `WORKOUT_LOGGING_REPAIR.sql` — secure workout mutation/history RPCs and the final simulated-health RPC override.
4. `PROTOTYPE_DEMO.sql` — explicitly demo-only university verification and capped prototype challenge-progress helper.

The files use `create or replace function` deliberately where later phases supersede earlier definitions. Do not reorder them.

For production, replace the prototype university verifier with a real verification workflow before enabling university-only access outside a demo environment.
