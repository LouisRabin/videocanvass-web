# Supabase relational backend

When `VITE_VC_RELATIONAL_BACKEND=true`, the app uses normalized Postgres tables and Supabase Auth instead of the shared JSON document (`vc_app_state`).

## Schema overview

- **vc_organizations**, **vc_departments**, **vc_units** — directory groups. **vc_user_department_members** and **vc_user_unit_members** link `auth.users` to those groups.
- **vc_profiles** — one row per auth user (`id` = `auth.users.id`); display name, email, tax number. Created by trigger on signup.
- **vc_cases** — optional `organization_id`, `unit_id`. If `unit_id` is set, any user in **vc_user_unit_members** for that unit can **view** the case (see `vc_case_visible()`).
- **vc_case_collaborators** — per-case access; `role` is `viewer` (read-only) or `editor` (mutate case content).
- **vc_locations**, **vc_tracks**, **vc_track_points**, **vc_case_attachments** — case-scoped data; RLS uses `vc_case_visible` / `vc_case_editor`.
- **vc_audit_log** — append-only events (client inserts with `actor_user_id = auth.uid()`).
- **Storage bucket `case-attachments`** — private objects; path `{caseId}/{attachmentId}`; policies use `vc_case_visible` / `vc_case_editor` on the case id segment.

Apply [supabase/migrations/20260401120000_vc_relational_core.sql](../supabase/migrations/20260401120000_vc_relational_core.sql) via Supabase SQL editor or CLI (`supabase db push`).

## Auth trigger

The migration defines `vc_handle_new_user` on `auth.users` **AFTER INSERT**. If your Postgres version rejects `EXECUTE PROCEDURE`, replace with `EXECUTE FUNCTION` in the trigger definition.

## Realtime

Enable replication for the `vc_*` tables you want in the Realtime UI so other clients receive `postgres_changes` events.

## Collaborators

Invited users must already exist in **auth.users** (and thus **vc_profiles**). The UI currently expects collaborator ids to match profile ids (UUID strings).

## MFA (2FA)

With relational mode on, users can enroll **TOTP** under **Cases → Security / 2FA**. Enable MFA in Supabase **Authentication → Multi-factor** when you want it required or optional. Sign-in runs a TOTP challenge when the session must reach **AAL2**. Removing a verified factor requires an **AAL2** session (Supabase rule).

## From POC blob (`vc_app_state`) to relational

The legacy JSON workspace (`VITE_SHARED_WORKSPACE_ID` + `vc_app_state`) and relational tables are **separate**. Turning on **`VITE_VC_RELATIONAL_BACKEND=true`** does not import blob data. Plan either a one-time ETL/script or accept an empty relational dataset for new users. Keep **`VITE_VC_RELATIONAL_BACKEND`** and **`VITE_SHARED_WORKSPACE_ID`** aligned across web and Android builds as described in [DEPLOY_ENV_CHECKLIST.md](DEPLOY_ENV_CHECKLIST.md).
