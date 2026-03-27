import { useMemo, useState } from 'react'
import { StoreProvider, useStore } from './lib/store'
import { CasesPage } from './app/CasesPage'
import { Layout } from './app/Layout'
import { CasePage } from './app/CasePage'

function App() {
  return (
    <StoreProvider>
      <Router />
    </StoreProvider>
  )
}

function Router() {
  const { data } = useStore()
  const [route, setRoute] = useState<{ name: 'cases' } | { name: 'case'; id: string }>({ name: 'cases' })

  const currentCase = useMemo(() => {
    if (route.name !== 'case') return null
    return data.cases.find((c) => c.id === route.id) ?? null
  }, [data.cases, route])

  if (route.name === 'cases') {
    return <CasesPage onOpenCase={(id) => setRoute({ name: 'case', id })} />
  }

  if (!currentCase) {
    return (
      <Layout
        title="Case not found"
        right={
          <button
            onClick={() => setRoute({ name: 'cases' })}
            style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '8px 10px', background: 'white' }}
          >
            Back
          </button>
        }
      >
        <div style={{ color: '#6b7280' }}>This case may have been deleted.</div>
      </Layout>
    )
  }

  return <CasePage caseId={currentCase.id} onBack={() => setRoute({ name: 'cases' })} />
}

export default App
