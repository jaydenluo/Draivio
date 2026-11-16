export function LayerVisibilityIcon({ visible }: { visible: boolean }) {
  return <svg className="layer-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" opacity={visible ? 1 : .55}>
    <path d="M3.5 12s3.1-5 8.5-5 8.5 5 8.5 5-3.1 5-8.5 5-8.5-5-8.5-5Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
    {!visible ? <path d="m5 5 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /> : null}
  </svg>
}

export function LayerLockIcon({ locked }: { locked: boolean }) {
  return <svg className="layer-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
    <rect x="5.5" y="10" width="13" height="10" rx="1.8" fill="none" stroke="currentColor" strokeWidth="1.7" />
    {locked ? <path d="M8.5 10V7.7a3.5 3.5 0 0 1 7 0V10" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /> : <path d="M8.5 10V7.8a3.5 3.5 0 0 1 6.3-2.1" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />}
    <circle cx="12" cy="14.8" r="1.1" fill="currentColor" />
    <path d="M12 15.8v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
}
