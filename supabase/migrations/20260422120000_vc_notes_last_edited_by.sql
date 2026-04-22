-- Last user who edited free-text notes (addresses + tracking steps).
ALTER TABLE public.vc_locations
  ADD COLUMN IF NOT EXISTS notes_last_edited_by_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL;

ALTER TABLE public.vc_track_points
  ADD COLUMN IF NOT EXISTS notes_last_edited_by_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.vc_locations.notes_last_edited_by_user_id IS 'User who last changed address notes text';
COMMENT ON COLUMN public.vc_track_points.notes_last_edited_by_user_id IS 'User who last changed track step notes text';
