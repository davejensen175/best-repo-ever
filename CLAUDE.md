@AGENTS.md

# NextRoom project notes

- Product spec: `docs/spec.md`. Build status and next steps: the "Status" section of `README.md`.
- Stack: Next.js 16 App Router (middleware is `src/proxy.ts`; `params`, `searchParams` and `cookies()` are async),
  Tailwind v4, shadcn/ui components in `src/components/ui`, Supabase (Postgres, Auth, Storage).
- Schema and row-level security live in `supabase/migrations`. Every table has RLS; the app only uses the
  anon key plus the user's session, never the service-role key.
- Server actions in `src/app/dashboard/actions.ts` return `{ error }` instead of throwing, so messages reach the UI.
- Checks: `npm run typecheck`, `npm run lint`, `npm run build`, then `npm run test:e2e` against a local
  Supabase stack (`npx supabase start`, then apply the migrations).
