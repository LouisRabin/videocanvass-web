import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useTargetMode } from '../../lib/targetMode'
import { ProductTour } from './ProductTour'
import { getTourSteps, type TourScope } from './tourSteps'
import { tourCaseDoneKey, tourCasesDoneKey, writeTourFlag } from './tourStorage'

type TourContextValue = {
  startTour: (scope: TourScope) => void
  /** True while the overlay is open */
  tourOpen: boolean
}

const TourContext = createContext<TourContextValue | null>(null)

export function TourProvider(props: { children: ReactNode }) {
  const targetMode = useTargetMode()
  const [scope, setScope] = useState<TourScope | null>(null)

  const steps = useMemo(() => (scope ? getTourSteps(scope, targetMode) : []), [scope, targetMode])

  const close = useCallback(() => setScope(null), [])

  const onComplete = useCallback(
    (dontShowAgain: boolean) => {
      if (dontShowAgain && scope) {
        const key = scope === 'cases' ? tourCasesDoneKey(targetMode) : tourCaseDoneKey(targetMode)
        writeTourFlag(key, true)
      }
      setScope(null)
    },
    [scope, targetMode],
  )

  const startTour = useCallback((s: TourScope) => setScope(s), [])

  const value = useMemo(() => ({ startTour, tourOpen: scope != null }), [startTour, scope])

  return (
    <TourContext.Provider value={value}>
      {props.children}
      {scope && steps.length > 0 ? (
        <ProductTour steps={steps} variant={targetMode} onClose={close} onComplete={onComplete} />
      ) : null}
    </TourContext.Provider>
  )
}

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext)
  if (!ctx) {
    return {
      startTour: () => {},
      tourOpen: false,
    }
  }
  return ctx
}
