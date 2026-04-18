import type { CSSProperties } from 'react'

/**
 * VideoCanvass “liquid glass” design language (map toolbar is the reference).
 *
 * - Primary chrome slabs → `vcLiquidGlassPanel` (map / dock; saturated blue glass).
 * - Nested chips on those slabs → `vcLiquidGlassPanelNestedLight` (brighter frost so interiors don’t stack muddy).
 * - App shell header → `vcLiquidGlassAppHeader` (neutral slate glass; pairs with page backdrop).
 * - Long lists / dense forms → nest `vcLiquidGlassInnerSurface` inside a panel for readability.
 * - Light labels on blue glass → `vcGlassFgMutedOnPanel`; icons/buttons on glass → `vcGlassFgOnPanel`.
 */

const VC_LIQUID_GLASS_BLUR = 'blur(22px) saturate(1.45)'

/** Core blue glass used for map toolbars, wide dock pills, and app shell header. */
export const vcLiquidGlassPanel: CSSProperties = {
  background: 'linear-gradient(160deg, rgba(44, 74, 128, 0.5) 0%, rgba(26, 44, 78, 0.48) 45%, rgba(18, 32, 58, 0.52) 100%)',
  backdropFilter: VC_LIQUID_GLASS_BLUR,
  WebkitBackdropFilter: VC_LIQUID_GLASS_BLUR,
  border: '1px solid rgba(255,255,255,0.28)',
  boxShadow: '0 10px 36px rgba(6, 16, 42, 0.38), inset 0 1px 0 rgba(255,255,255,0.2)',
}

/** HUD tiles on raw map (narrow ☰, track legend): darker, higher-opacity fill. */
export const vcLiquidGlassPanelOnMapBackdrop: CSSProperties = {
  ...vcLiquidGlassPanel,
  background:
    'linear-gradient(160deg, rgba(8, 20, 46, 0.94) 0%, rgba(4, 12, 30, 0.96) 45%, rgba(2, 6, 18, 0.98) 100%)',
  border: '1px solid rgba(255,255,255,0.34)',
  boxShadow: '0 18px 56px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255,255,255,0.09)',
}

/** Compact floating toolbar: same recipe, slightly lighter shadow. */
export const vcLiquidGlassPanelDense: CSSProperties = {
  ...vcLiquidGlassPanel,
  boxShadow: '0 8px 28px rgba(6, 16, 42, 0.34), inset 0 1px 0 rgba(255,255,255,0.18)',
}

/**
 * Brighter blue glass for small controls nested on `vcLiquidGlassPanel` (e.g. track step chip in the selection pill).
 * Same blur language; higher-luminance stops so double-layer chrome stays airy, not a dark band.
 */
export const vcLiquidGlassPanelNestedLight: CSSProperties = {
  background:
    'linear-gradient(160deg, rgba(255, 255, 255, 0.26) 0%, rgba(150, 184, 232, 0.44) 28%, rgba(118, 156, 214, 0.42) 55%, rgba(98, 136, 196, 0.46) 100%)',
  backdropFilter: VC_LIQUID_GLASS_BLUR,
  WebkitBackdropFilter: VC_LIQUID_GLASS_BLUR,
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.48), 0 2px 12px rgba(6, 16, 42, 0.14)',
}

export const vcGlassFgOnPanel = '#f8fafc'
export const vcGlassFgMutedOnPanel = 'rgba(226, 232, 240, 0.9)'
export const vcGlassFgDarkReadable = '#0f172a'

/** Secondary copy on frosted content cards (e.g. case descriptions in the list). */
export const vcGlassFgSecondaryOnContent = '#475569'

/** Compact metadata on frosted cards (status line, counts); strong contrast at small sizes. */
export const vcGlassFgMetaOnContent = '#334155'

/** Inputs on blue glass (geocode search, auth). Merge with base field border/radius. */
export const vcGlassFieldOnPanel: CSSProperties = {
  background: 'rgba(255,255,255,0.94)',
  borderColor: 'rgba(255,255,255,0.45)',
  color: vcGlassFgDarkReadable,
}

export const vcGlassSuggestionRow: CSSProperties = {
  border: '1px solid rgba(255,255,255,0.22)',
  background: 'rgba(255,255,255,0.96)',
  color: vcGlassFgDarkReadable,
}

/**
 * Frosted content slab — cool slate tint, not paper white (login, cases, modals).
 */
export const vcLiquidGlassInnerSurface: CSSProperties = {
  background: 'linear-gradient(165deg, rgba(226, 232, 240, 0.5) 0%, rgba(203, 213, 225, 0.42) 100%)',
  backdropFilter: 'blur(14px) saturate(1.15)',
  WebkitBackdropFilter: 'blur(14px) saturate(1.15)',
  border: '1px solid rgba(148, 163, 184, 0.45)',
  boxShadow: '0 6px 28px rgba(15, 23, 42, 0.14), inset 0 1px 0 rgba(255,255,255,0.28)',
}

/** Inputs/selects on inner/content cards — slate frost, never pure white. */
export const vcGlassFieldOnContentSurface: CSSProperties = {
  background: 'rgba(226, 232, 240, 0.55)',
  border: '1px solid rgba(15, 23, 42, 0.1)',
  color: vcGlassFgDarkReadable,
}

/** Floating address search on saturated map blue — light fill so text/placeholder stay readable. */
export const vcGlassFieldFloatingMapSearch: CSSProperties = {
  background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.94) 0%, rgba(248, 250, 252, 0.9) 100%)',
  border: '1px solid rgba(255, 255, 255, 0.52)',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.55), 0 1px 10px rgba(15, 23, 42, 0.1)',
  color: vcGlassFgDarkReadable,
}

/** Sticky app header: slate-neutral glass (less blue than map `vcLiquidGlassPanel`). */
export const vcLiquidGlassAppHeader: CSSProperties = {
  background:
    'linear-gradient(165deg, rgba(88, 102, 122, 0.42) 0%, rgba(62, 76, 96, 0.48) 38%, rgba(48, 60, 78, 0.52) 72%, rgba(42, 54, 70, 0.54) 100%)',
  backdropFilter: VC_LIQUID_GLASS_BLUR,
  WebkitBackdropFilter: VC_LIQUID_GLASS_BLUR,
  borderRadius: 0,
  border: 'none',
  borderBottom: '1px solid rgba(255,255,255,0.12)',
  boxShadow: '0 6px 28px rgba(15, 23, 42, 0.2), inset 0 1px 0 rgba(255,255,255,0.14)',
}

/** Primary CTA on cool pages — slate-tinted, not white. */
export const vcGlassBtnPrimary: CSSProperties = {
  border: '1px solid rgba(15, 23, 42, 0.14)',
  borderRadius: 10,
  padding: '12px 14px',
  background: 'linear-gradient(180deg, rgba(226,232,240,0.95) 0%, rgba(203,213,225,0.9) 100%)',
  color: vcGlassFgDarkReadable,
  fontWeight: 800,
  cursor: 'pointer',
  boxShadow: '0 4px 14px rgba(15, 23, 42, 0.12)',
}

/** Secondary / ghost on inner surface. */
export const vcGlassBtnSecondary: CSSProperties = {
  border: '1px solid rgba(15, 23, 42, 0.12)',
  borderRadius: 10,
  padding: '10px 12px',
  background: 'rgba(203, 213, 225, 0.45)',
  color: vcGlassFgDarkReadable,
  fontWeight: 700,
  cursor: 'pointer',
}

/** Ghost actions on blue glass app header (Cases toolbar, etc.). */
export const vcGlassHeaderBtn: CSSProperties = {
  border: '1px solid rgba(255,255,255,0.28)',
  borderRadius: 10,
  padding: '8px 10px',
  background: 'rgba(255,255,255,0.12)',
  color: vcGlassFgOnPanel,
  fontWeight: 700,
  cursor: 'pointer',
}

export const vcGlassHeaderBtnPrimary: CSSProperties = {
  ...vcGlassHeaderBtn,
  background: 'rgba(226, 232, 240, 0.88)',
  color: vcGlassFgDarkReadable,
  borderColor: 'rgba(255,255,255,0.38)',
  fontWeight: 800,
}

/** Fill `Layout` `<main>` and center a card below the header (login, mock picker, etc.). */
export const vcAuthMainCenterWrap: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  minHeight: 0,
  boxSizing: 'border-box',
}
