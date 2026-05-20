import { useMemo } from 'react'

export function getTabDirection(previousTab, nextTab, orderedTabs = []) {
  const prevIndex = orderedTabs.indexOf(previousTab)
  const nextIndex = orderedTabs.indexOf(nextTab)
  if (prevIndex < 0 || nextIndex < 0 || prevIndex === nextIndex) return 0
  return nextIndex > prevIndex ? 1 : -1
}

export default function TabTransition({ tabKey, direction = 0, className = '', children }) {
  const panelClass = useMemo(() => {
    if (direction > 0) return 'tab-panel tab-panel--from-right'
    if (direction < 0) return 'tab-panel tab-panel--from-left'
    return 'tab-panel tab-panel--fade'
  }, [direction])

  if (children == null) return null

  return (
    <div className={['app-tab-stage', className].filter(Boolean).join(' ')}>
      <div key={tabKey} className={panelClass}>
        {children}
      </div>
    </div>
  )
}
