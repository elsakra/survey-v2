import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import {
  DraftIncompleteError,
  generateDraftFromPrompt,
  reviseDraft,
  type AiDraftCurrentInput,
} from "@/lib/survey/nl-draft";

const currentSchema = z.object({
  title: z.string(),
  context: z.string(),
  instructions: z.string(),
  max_duration_sec: z.number(),
  opening_sentence: z.string(),
  interviewer_name: z.string(),
  org_name: z.string(),
  tone_style: z.string(),
  pillars: z.array(
    z.object({
      question: z.string(),
      context: z.string(),
    }),
  ),
});

const promptCreate = z
  .string()
  .transform((s) => s.trim())
  .refine((s) => s.length >= 4, { message: "Describe your interview in a few words." });
const promptRevise = z
  .string()
  .transform((s) => s.trim())
  .refine((s) => s.length >= 4, { message: "Say what you want to change." });

const bodySchema = z.union([
  z.object({
    mode: z.literal("create"),
    prompt: promptCreate,
  }),
  z.object({
    mode: z.literal("revise"),
    prompt: promptRevise,
    current: currentSchema,
  }),
]);

export async function POST(request: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "AI draft generation requires OPENAI_API_KEY to be configured." },
        { status: 503 },
      );
    }

    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ") || "Invalid request";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const body = parsed.data;

    let normalized;
    if (body.mode === "create") {
      normalized = await generateDraftFromPrompt(body.prompt);
    } else {
      const c = body.current;
      const current: AiDraftCurrentInput = {
        title: c.title,
        context: c.context,
        instructions: c.instructions,
        max_duration_sec: c.max_duration_sec,
        opening_sentence: c.opening_sentence,
        interviewer_name: c.interviewer_name,
        org_name: c.org_name,
        tone_style: c.tone_style,
        pillars: c.pillars.map((p) => ({
          question: p.question,
          context: p.context ?? "",
        })),
      };
      normalized = await reviseDraft(current, body.prompt);
    }

    return NextResponse.json({
      draft: {
        title: normalized.title,
        context: normalized.context,
        pillars: normalized.pillars,
        instructions: normalized.instructions,
        max_duration_sec: normalized.max_duration_sec,
        opening_sentence: normalized.opening_sentence,
        interviewer_name: normalized.interviewer_name,
        org_name: normalized.org_name,
        tone_style: normalized.tone_style,
        pillars_json: normalized.pillars_json,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI draft failed";
    console.error("[ai-draft]", err);
    if (err instanceof DraftIncompleteError) {
      return NextResponse.json(
        { error: message, issues: err.issues },
        { status: 400 },
      );
    }
    if (message === "Missing OPENAI_API_KEY") {
      return NextResponse.json(
        { error: "AI draft generation requires OPENAI_API_KEY to be configured." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
