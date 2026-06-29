# LNN Hub

The unified LNN Hub web app — where advertisers and the community manage advertising, sponsored content, and event/announcement submissions across LNN's publications in one place.

This repo began as a copy of the live **LNN Client Portal** and is being moved off Lovable onto our own infrastructure (Cloudflare + a Supabase project we own). The Content Hub will be folded in as a later milestone.

## Tech stack

- Vite + React 18 + TypeScript
- shadcn/ui + Tailwind CSS
- Supabase (Postgres, Auth, Storage, Edge Functions)

## Local development

Requires Node.js (or Bun) and a Supabase project.

```sh
npm install            # or: bun install
cp .env.example .env   # then fill in your Supabase project values
npm run dev            # or: bun run dev
```

The dev server runs at http://localhost:8080.

## Environment

See `.env.example`. The app reads `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_SUPABASE_PROJECT_ID`. Set `VITE_APP_BASE_URL` to the canonical domain (e.g. `https://client.lnn.co`) so external-facing links stay stable across deployments.

## Supabase

Database schema lives in `supabase/migrations/`; edge functions in `supabase/functions/`. Apply schema with the Supabase CLI (`supabase db push`) and deploy functions with `supabase functions deploy`.

## Migration status (off Lovable)

Moving off Lovable. Note: several edge functions still call Lovable gateway services at runtime — `ai.gateway.lovable.dev` (AI generation) and `connector-gateway.lovable.dev` (HubSpot, Slack) via a `LOVABLE_API_KEY`. These must be repointed to direct providers before/at cutover. See the migration plan for the full checklist.
