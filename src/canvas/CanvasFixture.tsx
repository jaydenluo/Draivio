import { useId } from 'react'

/** Shared SVG content so the example participates in layers, masks and export. */
export function CanvasFixtureContent() {
  const id = `poster-${useId().replaceAll(':', '')}`
  return <>
    <defs>
      <linearGradient id={`${id}-sky`} x1="0" x2="0" y1="0" y2="1"><stop stopColor="#f4c47d" /><stop offset=".5" stopColor="#dd806d" /><stop offset="1" stopColor="#52717a" /></linearGradient>
      <linearGradient id={`${id}-hill`} x1="0" x2="1"><stop stopColor="#335b65" /><stop offset="1" stopColor="#1f394d" /></linearGradient>
      <filter id={`${id}-blur`} filterUnits="userSpaceOnUse" x="0" y="0" width="500" height="625"><feGaussianBlur stdDeviation="18" /></filter>
    </defs>
    <rect width="500" height="625" fill={`url(#${id}-sky)`} />
    <circle cx="372" cy="142" r="82" fill="#ffe5af" opacity=".72" filter={`url(#${id}-blur)`} />
    <circle cx="372" cy="142" r="42" fill="#ffe8b0" opacity=".9" />
    <path d="M0 414 Q110 330 218 409 T500 370 V625 H0Z" fill={`url(#${id}-hill)`} />
    <path d="M0 474 Q125 418 246 477 T500 448 V625 H0Z" fill="#1e3544" opacity=".84" />
    <path d="M74 625 L96 300 L116 300 L145 625Z" fill="#172832" />
    <path d="M105 350 L46 420 M109 380 L178 435 M100 332 L68 370 M118 354 L158 380" stroke="#172832" strokeWidth="13" strokeLinecap="round" />
    <path d="M305 625 L320 372 L337 372 L360 625Z" fill="#172832" />
    <path d="M327 415 L286 464 M332 440 L382 470 M326 398 L303 430 M340 420 L372 443" stroke="#172832" strokeWidth="11" strokeLinecap="round" />
    <text x="35" y="68" fill="#fff5df" fontSize="15" letterSpacing="5" fontFamily="sans-serif">SPRING / 04</text>
    <text x="34" y="550" fill="#fff5df" fontSize="39" fontWeight="700" fontFamily="sans-serif">慢一点，</text>
    <text x="34" y="592" fill="#fff5df" fontSize="39" fontWeight="700" fontFamily="sans-serif">去看晚霞。</text>
    <path d="M36 610 C80 604 109 615 155 607" stroke="#ff765f" strokeWidth="3" fill="none" strokeLinecap="round" />
  </>
}

export function CanvasFixture() {
  return <svg className="canvas-art" viewBox="0 0 500 625" role="img" aria-label="春日海报示例画布"><CanvasFixtureContent /></svg>
}
