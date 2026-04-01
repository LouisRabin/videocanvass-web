# Deployment and operations

## Environments

Maintain separate Supabase projects (or Postgres instances) for **development**, **staging**, and **production**. Use different anon keys and never ship the **service role** key to the browser.

## Database

1. Run migrations from `supabase/migrations/` against the target database.
2. Enable **Point-in-time recovery** and periodic backup verification on production.
3. After schema changes, re-test RLS policies with a non-owner test account.

## Auth

- Use Supabase Auth email/password (or wire SSO later). Keep **confirm email** enabled in production unless you have a controlled invite flow.
- Rate-limit login at the edge (Cloudflare, API gateway) to reduce credential stuffing.

## Storage

- Bucket **case-attachments** is private; the app uses short-lived **signed URLs** for viewing images.
- Define max upload size and allowed MIME types in product policy; enforce in UI and optionally in an Edge Function.

## Monitoring

- Add error tracking (e.g. Sentry) to the frontend for production builds.
- Monitor Supabase dashboard for auth errors, database CPU, and storage egress.

## Security review

- Treat `casePermissions.ts` as UX only; **RLS** is the source of truth for data access.
- Rotate API keys if exposed; use `.env.local` locally and host-provided secrets in CI/production.

## Rate limiting

- Implement limits on login, geocode proxy, and uploads at your reverse proxy or serverless edge; the SPA alone cannot enforce server-side quotas.
