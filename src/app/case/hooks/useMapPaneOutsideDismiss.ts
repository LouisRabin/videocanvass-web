import { useEffect, type MutableRefObject, type RefObject } from 'react'

type UseMapPaneOutsideDismissArgs = {
  mapPaneShowsNow: () => boolean
  mapToolsDockRef: RefObject<HTMLDivElement | null>
  caseMapDetailOverlayRef: RefObject<HTMLDivElement | null>
  wideAddrSearchRef: RefObject<HTMLDivElement | null>
  narrowMapAddressRef: RefObject<HTMLDivElement | null>
  mapPaneShellRef: RefObject<HTMLDivElement | null>
  addrSearchInputRef: RefObject<HTMLInputElement | null>
  isNarrowRef: MutableRefObject<boolean>
  mapLeftToolDockOpenRef: MutableRefObject<boolean>
  probativePlacementSessionRef: MutableRefObject<{ trackId: string } | null>
  addrAutocompleteEngagedRef: MutableRefObject<boolean>
  mapToolsDockIgnoreOutsideUntilRef: MutableRefObject<number>
  addrDismissIgnoreUntilRef: MutableRefObject<number>
  addrBlurClearRef: MutableRefObject<number | null>
  mapClearPendingTap: () => void
  closeMapToolsDock: () => void
  onDismissAddress: () => void
  addrDismissGraceMs: number
}

export function useMapPaneOutsideDismiss(args: UseMapPaneOutsideDismissArgs) {
  const {
    mapPaneShowsNow,
    mapToolsDockRef,
    caseMapDetailOverlayRef,
    wideAddrSearchRef,
    narrowMapAddressRef,
    mapPaneShellRef,
    addrSearchInputRef,
    isNarrowRef,
    mapLeftToolDockOpenRef,
    probativePlacementSessionRef,
    addrAutocompleteEngagedRef,
    mapToolsDockIgnoreOutsideUntilRef,
    addrDismissIgnoreUntilRef,
    addrBlurClearRef,
    mapClearPendingTap,
    closeMapToolsDock,
    onDismissAddress,
    addrDismissGraceMs,
  } = args

  useEffect(() => {
    const touchOpts: AddEventListenerOptions = { capture: true, passive: false }

    const onMapPaneOutsideCapture = (e: Event) => {
      if (!mapPaneShowsNow()) return
      const t = e.target
      if (!(t instanceof Node)) return
      if (mapToolsDockRef.current?.contains(t)) return
      if (caseMapDetailOverlayRef.current?.contains(t)) return
      if (wideAddrSearchRef.current?.contains(t)) return

      const menuOpen =
        isNarrowRef.current && mapLeftToolDockOpenRef.current && !probativePlacementSessionRef.current
      const addrMapDismiss = addrAutocompleteEngagedRef.current && mapPaneShowsNow()
      if (!menuOpen && !addrMapDismiss) return

      if (narrowMapAddressRef.current?.contains(t)) {
        if (menuOpen) {
          closeMapToolsDock()
          window.setTimeout(() => addrSearchInputRef.current?.focus(), 0)
        }
        return
      }

      const shell = mapPaneShellRef.current
      if (!shell?.contains(t)) return
      if (performance.now() < addrDismissIgnoreUntilRef.current) {
        mapClearPendingTap()
        e.preventDefault()
        e.stopPropagation()
        ;(e as Event & { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.()
        return
      }

      let consumed = false
      if (menuOpen && performance.now() >= mapToolsDockIgnoreOutsideUntilRef.current) {
        closeMapToolsDock()
        consumed = true
      }
      if (addrMapDismiss) {
        addrDismissIgnoreUntilRef.current = performance.now() + addrDismissGraceMs
        if (addrBlurClearRef.current) {
          clearTimeout(addrBlurClearRef.current)
          addrBlurClearRef.current = null
        }
        onDismissAddress()
        consumed = true
      }
      if (consumed) {
        mapClearPendingTap()
        e.preventDefault()
        e.stopPropagation()
        ;(e as Event & { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.()
      }
    }

    window.addEventListener('pointerdown', onMapPaneOutsideCapture, true)
    window.addEventListener('touchstart', onMapPaneOutsideCapture, touchOpts)
    return () => {
      window.removeEventListener('pointerdown', onMapPaneOutsideCapture, true)
      window.removeEventListener('touchstart', onMapPaneOutsideCapture, touchOpts)
    }
  }, [
    mapPaneShowsNow,
    mapToolsDockRef,
    caseMapDetailOverlayRef,
    wideAddrSearchRef,
    narrowMapAddressRef,
    mapPaneShellRef,
    addrSearchInputRef,
    isNarrowRef,
    mapLeftToolDockOpenRef,
    probativePlacementSessionRef,
    addrAutocompleteEngagedRef,
    mapToolsDockIgnoreOutsideUntilRef,
    addrDismissIgnoreUntilRef,
    addrBlurClearRef,
    mapClearPendingTap,
    closeMapToolsDock,
    onDismissAddress,
    addrDismissGraceMs,
  ])
}
