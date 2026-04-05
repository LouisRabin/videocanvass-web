import { useEffect, type MutableRefObject, type RefObject } from 'react'

type UseMapPaneOutsideDismissArgs = {
  mapPaneShowsNow: () => boolean
  mapToolsDockRef: RefObject<HTMLDivElement | null>
  caseMapDetailOverlayRef: RefObject<HTMLDivElement | null>
  /** Wide map drawer seam tab (outside overlay when collapsed). */
  mapDrawerSeamToggleRef?: RefObject<HTMLDivElement | null>
  /** Collapsed wide map tools expand tab (over map). */
  mapToolbarExpandToggleRef?: RefObject<HTMLDivElement | null>
  narrowMapAddressRef: RefObject<HTMLDivElement | null>
  /** Narrow: bottom floating mode + track strip (outside address ref). */
  narrowMapBottomChromeRef?: RefObject<HTMLDivElement | null>
  mapPaneShellRef: RefObject<HTMLDivElement | null>
  addrSearchInputRef: RefObject<HTMLInputElement | null>
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

function containsNode(ref: RefObject<HTMLElement | null>, target: Node) {
  return !!ref.current?.contains(target)
}

export function useMapPaneOutsideDismiss(args: UseMapPaneOutsideDismissArgs) {
  const {
    mapPaneShowsNow,
    mapToolsDockRef,
    caseMapDetailOverlayRef,
    mapDrawerSeamToggleRef,
    mapToolbarExpandToggleRef,
    narrowMapAddressRef,
    narrowMapBottomChromeRef,
    mapPaneShellRef,
    addrSearchInputRef,
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
    // Single source of truth for "interactive zones" that should never trigger outside-dismiss.
    const isInsideInteractiveZone = (target: Node) => {
      return (
        containsNode(mapToolsDockRef as RefObject<HTMLElement | null>, target) ||
        containsNode(caseMapDetailOverlayRef as RefObject<HTMLElement | null>, target) ||
        (mapDrawerSeamToggleRef ? containsNode(mapDrawerSeamToggleRef as RefObject<HTMLElement | null>, target) : false) ||
        (mapToolbarExpandToggleRef ? containsNode(mapToolbarExpandToggleRef as RefObject<HTMLElement | null>, target) : false) ||
        containsNode(narrowMapAddressRef as RefObject<HTMLElement | null>, target) ||
        (narrowMapBottomChromeRef
          ? containsNode(narrowMapBottomChromeRef as RefObject<HTMLElement | null>, target)
          : false)
      )
    }

    const onMapPaneOutsideCapture = (e: Event) => {
      if (!mapPaneShowsNow()) return
      const t = e.target
      if (!(t instanceof Node)) return
      const eventPath = 'composedPath' in e ? e.composedPath() : null
      const targetNode = (eventPath?.find((node) => node instanceof Node) as Node | undefined) ?? t
      if (isInsideInteractiveZone(targetNode)) return

      const menuOpen = mapLeftToolDockOpenRef.current && !probativePlacementSessionRef.current
      const addrMapDismiss = addrAutocompleteEngagedRef.current && mapPaneShowsNow()
      if (!menuOpen && !addrMapDismiss) return

      const shell = mapPaneShellRef.current
      if (!shell?.contains(targetNode)) return
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
    mapDrawerSeamToggleRef,
    mapToolbarExpandToggleRef,
    narrowMapAddressRef,
    narrowMapBottomChromeRef,
    mapPaneShellRef,
    addrSearchInputRef,
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
