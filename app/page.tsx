/**
 * App entry only (no marketing site in this repo). `/` sends users to the dashboard
 * or sign-in; the public landing page lives in a separate deployment.
 */
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  } else {
    redirect("/auth/login");
  }
}
