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
