# Resend + Camera Canvass domain (`cameracanvass.com`)

Use **Resend** as the outbound mail path for **Supabase Auth** (password reset, signup confirmation, magic links, etc.) so messages come from your domain instead of Supabase’s default sender.

Official references: [Resend ↔ Supabase](https://resend.com/docs/send-with-supabase-smtp), [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

## 1. Resend — verify the domain

1. In [Resend](https://resend.com) → **Domains** → **Add domain** → `cameracanvass.com`.
2. Add the DNS records Resend shows (usually **SPF**, **DKIM**, and sometimes **MX** for receiving — you only need what they ask for *sending*).
3. Wait until the domain shows **Verified**.

## 2. Resend — API key for SMTP

1. **API Keys** → create a key (e.g. “Supabase Auth production”).
2. Store it only in **Supabase** (hosted) or in a secret used by **local** `supabase start` (see below). Never commit keys to git.

## 3. Hosted Supabase — enable custom SMTP

1. Open your project → **Project Settings** → **Authentication** (or **Auth** in older UI).
2. Find **SMTP Settings** / **Custom SMTP** and enable it.
3. Use Resend’s values:

   | Field | Value |
   |--------|--------|
   | Host | `smtp.resend.com` |
   | Port | `465` (SSL) — or `587` with TLS if your UI only offers STARTTLS |
   | Username | `resend` |
   | Password | Your Resend **API key** |

4. **Sender email:** an address on your verified domain, e.g. `noreply@cameracanvass.com` (must be allowed in Resend for that domain).
5. **Sender name:** e.g. `Camera Canvass`.
6. Save. New auth emails should go through Resend.

**Rate limits:** With custom SMTP, Supabase raises the default auth-email cap (you’re no longer limited to the tiny built-in quota). You can still tune limits under **Authentication → Rate limits** if needed.

## 4. URLs that still must match your *app* host

SMTP only changes **who sends** mail. **Links inside** emails still use **Site URL** and **Redirect URLs** in **Authentication → URL configuration** (e.g. your Vercel app at `https://…vercel.app` or `https://app.cameracanvass.com` if you point the app there).

- If the **web app** stays on Vercel’s hostname, keep those URLs as today and only change the **sender** to `@cameracanvass.com`.
- If you later serve the SPA from `https://cameracanvass.com` or `https://app.cameracanvass.com`, update **Site URL** and **Redirect URLs** accordingly (and optional `VITE_VC_SITE_URL` in the build).

## 5. Local `supabase start` (optional)

To send real mail from local Auth, uncomment and fill **`[auth.email.smtp]`** in [`supabase/config.toml`](../supabase/config.toml) (see the Resend example block). Set `RESEND_API_KEY` in your environment before `supabase start`, or use `env(RESEND_API_KEY)` in `config.toml` if your CLI loads it.

## 6. Email HTML template

Branded reset mail lives in [`supabase/templates/recovery.html`](../supabase/templates/recovery.html). After changing copy, paste into the hosted **Reset password** template or rely on `config.toml` for local.
