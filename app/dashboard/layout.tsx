import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  return (
    <div className="min-h-screen bg-[var(--color-surface)]">
      <nav className="sticky top-0 z-20 border-b border-[var(--color-border-subtle)] bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="text-base font-semibold tracking-tight text-[var(--color-text-primary)]">
              Survey Studio
            </Link>
            <span className="hidden text-xs font-medium text-[var(--color-text-muted)] sm:inline">
              AI interview campaigns
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-[var(--color-text-secondary)] md:inline">{user.email}</span>
            <form action="/auth/signout" method="POST">
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <div className="space-y-6">
          {children}
        </div>
      </main>
      <footer className="mx-auto max-w-6xl px-4 pb-8 text-xs text-[var(--color-text-muted)] sm:px-6 lg:px-8">
        Built for fast, high-signal interview research.
      </footer>
    </div>
  );
}
