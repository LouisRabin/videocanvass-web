-- Distinguish map-placed vs imported coordinate steps (client map line styling + sync).
ALTER TABLE public.vc_track_points
  ADD COLUMN IF NOT EXISTS placement_source text NOT NULL DEFAULT 'map'
  CHECK (placement_source IN ('map', 'import'));

COMMENT ON COLUMN public.vc_track_points.placement_source IS 'map = subject tracking tap; import = spreadsheet/paste import';
