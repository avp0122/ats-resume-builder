'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

/**
 * Renders a footer link only if the current user has the `'staff'` plan.
 *
 * Used to keep the `/jobs` link out of the footer for non-staff users
 * without forcing the Footer Server Component to read auth cookies (which
 * would force-dynamic every page on the site).
 *
 * Same pattern as `RefreshJobsButton` — polls `/api/me/staff` on mount
 * and renders nothing for non-staff. The server-side gate in
 * `app/jobs/page.tsx` is the security boundary; this is UX only.
 */
export default function StaffOnlyFooterLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  const [isStaff, setIsStaff] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/me/staff', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        setIsStaff(Boolean(d?.isStaff));
      })
      .catch(() => {
        if (cancelled) return;
        setIsStaff(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!isStaff) return null;

  return (
    <li>
      <Link href={href} className="text-white/70 hover:text-white transition">
        {label}
      </Link>
    </li>
  );
}
