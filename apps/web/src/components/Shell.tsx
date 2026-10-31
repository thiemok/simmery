import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { isApiError } from '../api/errors';
import { useMe } from '../api/queries';
import styles from './Shell.module.css';
import { Loading, Notice } from './states';
import { Wordmark } from './SunMark';

const primary = [
  { to: '/', label: 'Week', section: ['/week', '/cook'] },
  { to: '/recipes', label: 'Recipes', section: ['/recipes'] },
  { to: '/stats', label: 'Stats', section: ['/stats'] },
] as const;

const secondary = [
  { to: '/catalog', label: 'Catalog', section: ['/catalog'] },
  { to: '/profile', label: 'Taste profile', section: ['/profile'] },
] as const;

type NavItem = (typeof primary)[number] | (typeof secondary)[number];

function NavLinks({ items, className }: { items: readonly NavItem[]; className: string }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return items.map((item) => {
    const active = item.section.some((prefix) => pathname.startsWith(prefix));
    return (
      <Link
        key={item.to}
        to={item.to}
        className={className}
        data-active={active}
        aria-current={active ? 'page' : undefined}
      >
        {item.label}
      </Link>
    );
  });
}

function AccountMenu() {
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.account}>
      <button
        type="button"
        className="icon-btn"
        aria-label="Account menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        ☰
      </button>
      {open && (
        <div className={styles.menu}>
          {secondary.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={styles.menuItem}
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
          <form method="post" action="/auth/logout">
            <button type="submit" className={styles.menuItem}>
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/** Moves focus to the new page's heading after client-side navigation. */
function useFocusHeading(main: React.RefObject<HTMLElement | null>) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    main.current?.querySelector<HTMLElement>('h1')?.focus();
  }, [pathname, main]);
}

/** The signed-in layout: app bar, phone tab bar, and the desktop header nav (visual-identity R11). */
export function Shell() {
  const me = useMe();
  const main = useRef<HTMLElement>(null);
  useFocusHeading(main);

  return (
    <div className={styles.shell}>
      <header className={styles.appbar}>
        <Link to="/" className={styles.brand} aria-label="Simmery, this week">
          <Wordmark />
        </Link>
        <nav className={styles.desktopNav} aria-label="Main">
          <NavLinks items={[...primary, ...secondary]} className={styles.desktopLink} />
        </nav>
        <AccountMenu />
      </header>
      {isApiError(me.error, 503) && (
        <div className={styles.banner}>
          <Notice>The sign-in service is unreachable. Retrying…</Notice>
        </div>
      )}
      <main ref={main} className={styles.main}>
        {me.data ? <Outlet /> : <Loading label="Signing you in…" />}
      </main>
      <nav className={styles.tabs} aria-label="Sections">
        <NavLinks items={primary} className={styles.tab} />
      </nav>
    </div>
  );
}
