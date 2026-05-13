'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * Top progress bar for instant navigation feedback.
 *
 * Shows a thin gradient bar across the top of the viewport whenever the
 * pathname is changing. We track this by intercepting clicks on internal
 * <Link> elements (start of navigation) and watching for `usePathname()`
 * changes to settle the bar (end of navigation).
 */
export default function RouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastKey = useRef(`${pathname}?${searchParams?.toString() ?? ''}`);

  // Start the bar on internal-link clicks so feedback is instantaneous.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('http') || href.startsWith('mailto:') || anchor.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      // Skip same-page anchors.
      if (href.startsWith('#')) return;
      start();
    };
    // Programmatic navigation (router.push from forms etc.) doesn't trigger
    // the click handler. Components fire this event before calling push so
    // the bar starts in the same frame as the action.
    const onProgrammatic = () => start();
    document.addEventListener('click', onClick);
    window.addEventListener('kairesume:nav-start', onProgrammatic);
    return () => {
      document.removeEventListener('click', onClick);
      window.removeEventListener('kairesume:nav-start', onProgrammatic);
    };
  }, []);

  // Settle the bar when the route actually changes.
  useEffect(() => {
    const key = `${pathname}?${searchParams?.toString() ?? ''}`;
    if (key !== lastKey.current) {
      lastKey.current = key;
      complete();
    }
  }, [pathname, searchParams]);

  function start() {
    if (visible) return;
    setVisible(true);
    setProgress(8);
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      setProgress((p) => {
        if (p >= 90) return p;
        // Decelerate as we get closer to 90%.
        const inc = Math.max(1, (90 - p) * 0.08);
        return Math.min(90, p + inc);
      });
    }, 120);
  }

  function complete() {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    setProgress(100);
    if (hideRef.current) clearTimeout(hideRef.current);
    hideRef.current = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 250);
  }

  return (
    <div
      aria-hidden
      className="fixed top-0 left-0 right-0 h-[3px] z-[60] pointer-events-none"
      style={{ opacity: visible ? 1 : 0, transition: 'opacity 200ms ease' }}
    >
      <div
        className="h-full bg-gradient-to-r from-fuchsia-500 via-indigo-500 to-sky-400 shadow-[0_0_12px_rgba(217,70,239,0.6)]"
        style={{
          width: `${progress}%`,
          transition: 'width 180ms ease-out',
        }}
      />
    </div>
  );
}
