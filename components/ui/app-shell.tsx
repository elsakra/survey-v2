"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Input } from "./input";
import { Button } from "./button";
import { cn } from "@/lib/ui";

const primaryNav = [
  { href: "/dashboard", label: "Campaigns", glyph: "CA" },
  { href: "/dashboard/new", label: "New", glyph: "NW" },
];

const utilityNav = [
  { href: "/dashboard", label: "Activity", glyph: "AC" },
  { href: "/dashboard", label: "Help", glyph: "HP" },
];

export function AppShell({
  email,
  children,
}: {
  email: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[var(--color-surface)]">
      <div className="flex min-h-screen">
        <aside className="hidden w-16 shrink-0 border-r border-[var(--color-border)] bg-white lg:flex lg:flex-col lg:items-center lg:py-3">
          <Link
            href="/dashboard"
            className="mb-6 mt-1 inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-text-primary)] text-[11px] font-semibold tracking-wide text-white"
          >
            SV
          </Link>
          <nav className="flex flex-1 flex-col items-center gap-2">
            {primaryNav.map((item) => {
              const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href + item.label}
                  href={item.href}
                  className={cn(
                    "group relative inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] text-[10px] font-semibold tracking-wide transition-colors",
                    active
                      ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                      : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-text-primary)]",
                  )}
                  title={item.label}
                >
                  {item.glyph}
                  <span className="pointer-events-none absolute left-12 hidden whitespace-nowrap rounded-md bg-[var(--color-text-primary)] px-2 py-1 text-[11px] font-medium text-white shadow-sm group-hover:block">
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </nav>
          <div className="flex flex-col items-center gap-2">
            {utilityNav.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] text-[10px] font-semibold tracking-wide text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-text-primary)]"
                title={item.label}
              >
                {item.glyph}
              </Link>
            ))}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-white/90 backdrop-blur">
            <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-3 px-4 sm:px-6">
              <div className="w-full max-w-md">
                <Input placeholder="Search campaigns, contacts, transcripts..." className="h-9 bg-[var(--color-surface-subtle)]" />
              </div>
              <div className="ml-auto flex items-center gap-2">
                <span className="hidden text-sm text-[var(--color-text-secondary)] md:inline">{email}</span>
                <form action="/auth/signout" method="POST">
                  <Button type="submit" variant="ghost" size="sm">
                    Sign out
                  </Button>
                </form>
              </div>
            </div>
          </header>
          <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 sm:px-6 lg:py-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
