import { useCallback, useEffect, useMemo, useState } from 'react'
import MapGL, { Layer, NavigationControl, Source } from 'react-map-gl/maplibre'
import type { FeatureCollection } from 'geojson'
import { Layout } from './Layout'
import { CARTO_VOYAGER_STYLE } from './addressesMapLibreHelpers'
import { relationalBackendEnabled } from '../lib/backendMode'
import { supabase } from '../lib/supabase'
import {
  vcGlassFgDarkReadable,
  vcGlassFgMutedOnPanel,
  vcGlassHeaderBtn,
  vcGlassHeaderBtnPrimary,
  vcLiquidGlassInnerSurface,
} from '../lib/vcLiquidGlass'

type GlobalRow = {
  id: string
  source_location_id: string
  source_case_id: string
  organization_id: string | null
  address_fingerprint: string
  lat: number
  lon: number
  canvass_status: string
  has_cameras: boolean
  updated_at_ms: number
}

export function GlobalCanvassAdminPage(props: { onBack: () => void }) {
  const [rows, setRows] = useState<GlobalRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!relationalBackendEnabled() || !supabase) {
      setError('Relational backend not enabled.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const { data, error: qe } = await supabase
      .from('vc_global_canvass_results')
      .select('*')
      .order('updated_at_ms', { ascending: false })
      .limit(1000)
    setLoading(false)
    if (qe) {
      setError(qe.message)
      setRows([])
      return
    }
    setRows((data ?? []) as GlobalRow[])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const globalHeatmapFc = useMemo((): FeatureCollection | null => {
    if (!rows.length) return null
    return {
      type: 'FeatureCollection',
      features: rows.map((r) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
        properties: { weight: 1 },
      })),
    }
  }, [rows])

  const mapInitialViewState = useMemo(() => {
    if (!rows.length) return { longitude: -98.5795, latitude: 39.8283, zoom: 3 }
    let minLat = rows[0]!.lat
    let maxLat = minLat
    let minLon = rows[0]!.lon
    let maxLon = minLon
    for (const r of rows) {
      minLat = Math.min(minLat, r.lat)
      maxLat = Math.max(maxLat, r.lat)
      minLon = Math.min(minLon, r.lon)
      maxLon = Math.max(maxLon, r.lon)
    }
    const lat = (minLat + maxLat) / 2
    const lon = (minLon + maxLon) / 2
    const span = Math.max(maxLat - minLat, maxLon - minLon)
    const zoom = span < 0.02 ? 14 : span < 0.15 ? 11 : span < 1 ? 8 : 5
    return { longitude: lon, latitude: lat, zoom }
  }, [rows])

  const exportCsv = useCallback(() => {
    const header = [
      'address_fingerprint',
      'lat',
      'lon',
      'canvass_status',
      'has_cameras',
      'source_case_id',
      'source_location_id',
      'updated_at_ms',
    ]
    const lines = [
      header.join(','),
      ...rows.map((r) =>
        [
          JSON.stringify(r.address_fingerprint),
          r.lat,
          r.lon,
          JSON.stringify(r.canvass_status),
          r.has_cameras,
          JSON.stringify(r.source_case_id),
          JSON.stringify(r.source_location_id),
          r.updated_at_ms,
        ].join(','),
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `global-canvass-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }, [rows])

  return (
    <Layout
      title="Global canvass results"
      subtitle="Administrator view — canvass outcome and camera flag only (no notes)."
      right={
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button type="button" style={vcGlassHeaderBtn} onClick={() => void load()} disabled={loading}>
            Refresh
          </button>
          <button type="button" style={vcGlassHeaderBtn} onClick={exportCsv} disabled={!rows.length}>
            Export CSV
          </button>
          <button type="button" style={vcGlassHeaderBtnPrimary} onClick={props.onBack}>
            Back to cases
          </button>
        </div>
      }
    >
      {error ? (
        <div style={{ color: '#b91c1c', marginBottom: 12 }}>
          {error}
          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 8 }}>
            Ensure your profile has <code>app_role = &apos;admin&apos;</code> in <code>vc_profiles</code> and the migration has been applied.
          </div>
        </div>
      ) : null}
      {loading ? (
        <div style={{ color: vcGlassFgMutedOnPanel }}>Loading…</div>
      ) : (
        <div
          style={{
            overflow: 'auto',
            ...vcLiquidGlassInnerSurface,
            borderRadius: 12,
            maxHeight: 'min(70vh, 720px)',
            color: vcGlassFgDarkReadable,
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'rgba(203, 213, 225, 0.35)', textAlign: 'left' }}>
                <th style={th}>Address key</th>
                <th style={th}>Status</th>
                <th style={th}>Cameras</th>
                <th style={th}>Lat</th>
                <th style={th}>Lon</th>
                <th style={th}>Case</th>
                <th style={th}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                  <td style={td}>{r.address_fingerprint}</td>
                  <td style={td}>{r.canvass_status}</td>
                  <td style={td}>{r.has_cameras ? 'yes' : 'no'}</td>
                  <td style={td}>{r.lat.toFixed(5)}</td>
                  <td style={td}>{r.lon.toFixed(5)}</td>
                  <td style={td}>
                    <code style={{ fontSize: 11 }}>{r.source_case_id}</code>
                  </td>
                  <td style={td}>{new Date(r.updated_at_ms).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && !error ? <div style={{ padding: 16, color: '#64748b' }}>No rows yet.</div> : null}
        </div>
      )}
      {globalHeatmapFc ? (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8, color: vcGlassFgMutedOnPanel }}>
            Visit density (global submissions)
          </div>
          <div
            style={{
              height: 'min(420px, 55vh)',
              minHeight: 240,
              borderRadius: 12,
              border: '1px solid #e5e7eb',
              overflow: 'hidden',
              background: '#e5e7eb',
            }}
          >
            <MapGL
              key={`${rows.length}:${rows[0]?.id ?? ''}`}
              initialViewState={mapInitialViewState}
              mapStyle={CARTO_VOYAGER_STYLE}
              style={{ width: '100%', height: '100%' }}
            >
              <NavigationControl position="top-left" showCompass={false} />
              <Source id="global-visit-heat" type="geojson" data={globalHeatmapFc}>
                <Layer
                  id="global-visit-heat-layer"
                  type="heatmap"
                  paint={{
                    'heatmap-weight': ['get', 'weight'],
                    'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 9, 0.5, 14, 1.1],
                    'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 9, 14, 14, 26],
                    'heatmap-opacity': 0.5,
                    'heatmap-color': [
                      'interpolate',
                      ['linear'],
                      ['heatmap-density'],
                      0,
                      'rgba(59,130,246,0)',
                      0.35,
                      'rgba(59,130,246,0.35)',
                      0.65,
                      'rgba(234,179,8,0.45)',
                      1,
                      'rgba(220,38,38,0.55)',
                    ],
                  }}
                />
              </Source>
            </MapGL>
          </div>
        </div>
      ) : null}
    </Layout>
  )
}

const th: React.CSSProperties = { padding: '10px 12px', fontWeight: 800, whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '8px 12px', verticalAlign: 'top', wordBreak: 'break-word' }

