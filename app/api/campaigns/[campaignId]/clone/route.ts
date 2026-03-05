import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  try {
    const { campaignId } = await params;
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: source } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", campaignId)
      .eq("user_id", user.id)
      .single();

    if (!source) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const title = ((source.title ?? source.pillars_json?.title ?? "Untitled") + " (Copy)").slice(0, 200);

    const { data: clone, error } = await supabase
      .from("campaigns")
      .insert({
        title,
        pillars_json: source.pillars_json,
        instructions: source.instructions,
        calling_hours: source.calling_hours,
        max_duration_sec: source.max_duration_sec ?? 420,
        opening_sentence: source.opening_sentence,
        user_id: user.id,
        status: "draft",
      })
      .select("id")
      .single();

    if (error || !clone) {
      console.error("[clone] Insert failed:", error);
      return NextResponse.json(
        { error: "Failed to clone campaign" },
        { status: 500 },
      );
    }

    return NextResponse.json({ id: clone.id });
  } catch (err) {
    console.error("[clone] Unexpected error:", err);
    return NextResponse.json(
      { error: "Failed to clone campaign" },
      { status: 500 },
    );
  }
}
