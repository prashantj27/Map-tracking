import { useEffect, useState } from 'react';

/**
 * Reactive CSS media-query hook. Returns whether the query currently matches and re-renders on
 * change (orientation flip, window resize, responsive-mode toggle). Client-only app, so
 * `window.matchMedia` is always available at first render.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    // Belt-and-suspenders: also re-check on resize. `setMatches` with an unchanged value is a
    // no-op (React bails on the re-render), so this only ever re-renders on a real breakpoint flip.
    window.addEventListener('resize', onChange);
    return () => {
      mql.removeEventListener('change', onChange);
      window.removeEventListener('resize', onChange);
    };
  }, [query]);

  return matches;
}

/** Mobile + tablet breakpoint (phones and tablets in portrait, incl. 12.9" iPad at 1024px). */
export const MOBILE_TABLET_QUERY = '(max-width: 1024px)';

/** True on phones/tablets where the compact touch-first UI (bottom sheet, collapsible panel,
 *  facility-type dropdown) applies. */
export function useIsMobileOrTablet(): boolean {
  return useMediaQuery(MOBILE_TABLET_QUERY);
}
