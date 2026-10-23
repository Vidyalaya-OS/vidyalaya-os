"use client";

import { LogOut, Menu, Monitor, Moon, MoreHorizontal, Repeat, Sun, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Avatar, IconButton, cx } from "@/components/ui";
import { useTheme } from "@/lib/theme";

export type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; exact?: boolean };
export type NavGroup = { title?: string; items: NavItem[] };

function isActive(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** The frame around every signed-in screen: a sidebar on desktops, and on
 * phones and tablets a top bar, a bottom tab bar and a slide-out menu. */
export function AppShell({
  brand,
  groups,
  tabs,
  user,
  switchHref,
  onSignOut,
  banner,
  children,
}: {
  brand: { title: string; subtitle: string; initials?: string };
  groups: NavGroup[];
  tabs: NavItem[];
  user: { name: string; detail: string };
  switchHref?: string;
  onSignOut: () => void;
  banner?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const drawerRef = useRef<HTMLDialogElement>(null);
  const [lastPath, setLastPath] = useState(pathname);

  // Close the slide-out menu when the page changes.
  if (pathname !== lastPath) {
    setLastPath(pathname);
    if (drawer) setDrawer(false);
  }

  useEffect(() => {
    const el = drawerRef.current;
    if (!el) return;
    if (drawer && !el.open) el.showModal();
    if (!drawer && el.open) el.close();
  }, [drawer]);

  const flat = groups.flatMap((g) => g.items);
  const tabActive = tabs.some((t) => isActive(pathname, t));

  return (
    <div className="min-h-dvh lg:pl-72">
      <a href="#main" className="sr-only z-[70] rounded-lg bg-brand px-4 py-2 text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Skip to content</a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col border-r border-line bg-surface lg:flex print:hidden">
        <SidebarBody brand={brand} groups={groups} pathname={pathname} user={user} switchHref={switchHref} onSignOut={onSignOut} />
      </aside>

      {/* Phone and tablet top bar */}
      <header className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur-md lg:hidden print:hidden">
        <div className="flex h-14 items-center gap-2 px-2 sm:px-4">
          <IconButton label="Open menu" onClick={() => setDrawer(true)} aria-expanded={drawer}>
            <Menu aria-hidden />
          </IconButton>
          <Link href={flat[0]?.href ?? "/"} className="flex min-w-0 flex-1 items-center gap-2.5">
            <BrandMark initials={brand.initials ?? brand.title} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold leading-tight">{brand.title}</span>
              <span className="block truncate text-xs text-soft">{brand.subtitle}</span>
            </span>
          </Link>
          <ThemeButton />
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-7xl px-4 pb-28 pt-5 sm:px-6 sm:pt-7 lg:px-8 lg:pb-12 print:max-w-none print:p-0">
        {banner}
        <div key={pathname} className="animate-enter">{children}</div>
      </main>

      {/* Phone and tablet bottom tabs */}
      <nav aria-label="Main" className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/90 backdrop-blur-md lg:hidden print:hidden">
        <ul className="mx-auto grid max-w-xl" style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}>
          {tabs.map((t) => {
            const active = isActive(pathname, t);
            const Icon = t.icon;
            return (
              <li key={t.href}>
                <Link href={t.href} aria-current={active ? "page" : undefined}
                  className={cx("group flex h-16 flex-col items-center justify-center gap-1 text-[0.7rem] font-medium transition", active ? "text-brand" : "text-soft hover:text-ink")}>
                  <span className={cx("flex h-7 w-12 items-center justify-center rounded-full transition duration-200 group-active:scale-90", active && "bg-brand-soft")}>
                    <Icon className="size-5" />
                  </span>
                  <span className="max-w-full truncate px-1">{t.label}</span>
                </Link>
              </li>
            );
          })}
          <li>
            <button onClick={() => setDrawer(true)} className={cx("group flex h-16 w-full flex-col items-center justify-center gap-1 text-[0.7rem] font-medium transition", !tabActive ? "text-brand" : "text-soft hover:text-ink")}>
              <span className={cx("flex h-7 w-12 items-center justify-center rounded-full transition group-active:scale-90", !tabActive && "bg-brand-soft")}>
                <MoreHorizontal className="size-5" aria-hidden />
              </span>
              More
            </button>
          </li>
        </ul>
      </nav>

      {/* Slide-out menu */}
      <dialog
        ref={drawerRef}
        aria-label="Menu"
        onCancel={(e) => { e.preventDefault(); setDrawer(false); }}
        onClick={(e) => { if (e.target === drawerRef.current) setDrawer(false); }}
        className="m-0 h-dvh max-h-none w-[min(20rem,86vw)] max-w-none border-r border-line bg-surface p-0 text-ink backdrop:bg-slate-950/45 backdrop:backdrop-blur-[2px] open:animate-slide-in lg:hidden"
      >
        {drawer && (
          <div className="relative flex h-full flex-col">
            <IconButton label="Close menu" className="absolute right-2 top-3 z-10" onClick={() => setDrawer(false)}>
              <X aria-hidden />
            </IconButton>
            <SidebarBody brand={brand} groups={groups} pathname={pathname} user={user} switchHref={switchHref} onSignOut={onSignOut} />
          </div>
        )}
      </dialog>
    </div>
  );
}

function BrandMark({ initials }: { initials: string }) {
  const text = initials.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-violet-500 text-sm font-bold text-white shadow-sm shadow-brand/30">
      {text}
    </span>
  );
}

function SidebarBody({ brand, groups, pathname, user, switchHref, onSignOut }: {
  brand: { title: string; subtitle: string; initials?: string };
  groups: NavGroup[];
  pathname: string;
  user: { name: string; detail: string };
  switchHref?: string;
  onSignOut: () => void;
}) {
  return (
    <>
      <div className="flex items-center gap-3 px-5 pb-4 pt-5">
        <BrandMark initials={brand.initials ?? brand.title} />
        <div className="min-w-0 pr-8 lg:pr-0">
          <div className="truncate font-semibold leading-tight">{brand.title}</div>
          <div className="truncate text-xs text-soft">{brand.subtitle}</div>
        </div>
      </div>
      <nav aria-label="Sections" className="scrollbar-none flex-1 overflow-y-auto px-3 pb-4">
        {groups.map((g, gi) => (
          <div key={g.title ?? gi} className="mt-3 first:mt-0">
            {g.title && <div className="px-3 pb-1.5 pt-2 text-[0.7rem] font-semibold uppercase tracking-wider text-soft/80">{g.title}</div>}
            <ul className="space-y-0.5">
              {g.items.map((item) => {
                const active = isActive(pathname, item);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cx(
                        "group relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition duration-150",
                        active ? "bg-brand-soft text-brand" : "text-soft hover:bg-muted hover:text-ink",
                      )}
                    >
                      {active && <span className="absolute inset-y-2 left-0 w-1 animate-fade rounded-r-full bg-brand" aria-hidden />}
                      <Icon className="size-[1.15rem] shrink-0 transition-transform duration-200 group-hover:scale-110" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-line p-3">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <Avatar name={user.name} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{user.name}</div>
            <div className="truncate text-xs text-soft">{user.detail}</div>
          </div>
          <ThemeButton />
        </div>
        <div className="mt-1 grid grid-cols-2 gap-1">
          {switchHref ? (
            <Link href={switchHref} className="flex min-h-10 items-center justify-center gap-2 rounded-xl text-sm font-medium text-soft transition hover:bg-muted hover:text-ink">
              <Repeat className="size-4" aria-hidden /> Switch
            </Link>
          ) : <span />}
          <button onClick={onSignOut} className="flex min-h-10 items-center justify-center gap-2 rounded-xl text-sm font-medium text-soft transition hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/50 dark:hover:text-red-300">
            <LogOut className="size-4" aria-hidden /> Sign out
          </button>
        </div>
      </div>
    </>
  );
}

const NEXT_THEME = { system: "light", light: "dark", dark: "system" } as const;

export function ThemeButton() {
  const { choice, setChoice } = useTheme();
  const Icon = choice === "dark" ? Moon : choice === "light" ? Sun : Monitor;
  const label = `Theme: ${choice === "system" ? "same as device" : choice}. Change`;
  return (
    <IconButton label={label} onClick={() => setChoice(NEXT_THEME[choice])}>
      <Icon key={choice} className="animate-pop" aria-hidden />
    </IconButton>
  );
}
