# AGENTS.md - Full Handoff for Future Agents

This file is the canonical operational/context handoff for agents working on `survey-v2`.
If behavior in code and this doc diverge, trust code first and update this file.

## 1) Product and Current Scope

`survey-v2` is a Vapi-first AI interview platform with:

- Web app (Next.js App Router) for:
  - auth
  - campaign creation/editing
  - browser-based test interview (Vapi Web SDK)
  - contact upload/management
  - launch/pause/resume/restart
  - transcript viewing
  - campaign cloning
- Async outbound calling and retries via Inngest
- Supabase Postgres as source of truth
- Vapi webhook ingestion into `turns`, `recordings`, and `transcripts`
- Legacy/parallel CLI path still exists for direct terminal-driven interviews

## 2) Tech Stack

- Next.js (`app/` router), React, TypeScript
- Supabase Auth + Postgres
- Vapi (assistant + outbound call + web SDK + webhooks)
- ElevenLabs voice via Vapi
- Inngest for queue/orchestration
- OpenAI Whisper for CLI post-call STT
- Tailwind CSS

## 3) Repo Map (Important Files)

### Core web API routes

- `app/api/campaigns/[campaignId]/assistant/route.ts`  
  Creates a Vapi assistant for browser test calls.
- `app/api/campaigns/[campaignId]/launch/route.ts`  
  Launches draft campaign and enqueues `campaign/launch` in Inngest.
- `app/api/campaigns/[campaignId]/status/route.ts`  
  Handles pause/resume/restart; resume/restart re-enqueue `campaign/launch`.
- `app/api/campaigns/[campaignId]/test-status/route.ts`  
  Marks test as completed/skipped for draft campaigns.
- `app/api/campaigns/[campaignId]/clone/route.ts`  
  Clones campaign into new draft.
- `app/api/vapi/webhook/route.ts`  
  Ingests Vapi events into DB (turns/recordings/transcripts/status).
- `app/api/inngest/route.ts`  
  Inngest serve endpoint for cloud mode + diagnostics mode.

### Inngest

- `lib/inngest/client.ts` - Inngest client
- `lib/inngest/functions/process-campaign.ts` - fanout (`campaign/launch`)
- `lib/inngest/functions/make-call.ts` - per-contact call execution/retry
- `lib/inngest/send-result.ts` - send ack parsing helper (extract event IDs)

### Vapi integration

- `lib/vapi.ts` - Web app Vapi helper functions (assistant + call + prompt)
- `src/providers/vapi.ts` - CLI Vapi helper functions (parallel logic)
- `components/voice-test.tsx` - browser live test + transcript rendering

### Campaign UI

- `app/dashboard/page.tsx` - campaign list (includes row-level clone action)
- `app/dashboard/[campaignId]/page.tsx` - campaign detail/review + launch
- `app/dashboard/[campaignId]/edit/page.tsx` - draft-only editing
- `app/dashboard/[campaignId]/contacts/page.tsx` - add/filter/manage contacts

### DB and schema

- `supabase/migrations/00001_init.sql`
- `supabase/migrations/00002_rename_raw_payload.sql`
- `supabase/migrations/00003_web_app.sql`
- `supabase/migrations/00004_campaign_test_and_interview_settings.sql`

## 4) Setup and Runtime Commands

- Install: `pnpm i`
- Web dev: `pnpm dev`
- Build: `pnpm build`
- Start prod: `pnpm start`
- DB push: `pnpm db:push`
- TS check: `pnpm typecheck`
- CLI interview: `pnpm interview --to "+1..." --pillars-file "./pillars....json" --duration-sec 180`
- Helper script: `python3 run_test.py`

## 5) Environment Variables

Reference template: `.env.example`

### Required

- `VAPI_PRIVATE_KEY`
- (`VAPI_PHONE_NUMBER_ID` or `VAPI_FROM_NUMBER`)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_VAPI_PUBLIC_KEY` (browser test)
- `INNGEST_EVENT_KEY`
- `INNGEST_SIGNING_KEY`
- `NEXT_PUBLIC_APP_URL`

### Optional but important

- `VAPI_WEBHOOK_SECRET`
- `NGROK_AUTHTOKEN` (CLI/local webhook tunnel)
- `OPENAI_API_KEY` (CLI summarization + Whisper flow)

### Vapi tuning (latency/quality profile)

- `VAPI_MODEL_PROVIDER` (default `groq`)
- `VAPI_MODEL_NAME` (default `openai/gpt-oss-120b`)
- `VAPI_MODEL_TEMPERATURE` (default `0.35`)
- `VAPI_VOICE_SPEED` (default `0.98`)
- `VAPI_VOICE_STABILITY` (default `0.5`)
- `VAPI_VOICE_SIMILARITY` (default `0.8`)
- `VAPI_WAIT_SECONDS` (default `0.6`)
- `VAPI_RESPONSE_DELAY_SECONDS` (default `0.35`)
- `VAPI_STOP_WORDS` (default `2`)
- `VAPI_STOP_VOICE_SECONDS` (default `0.2`)
- `VAPI_STOP_BACKOFF_SECONDS` (default `0.8`)

## 6) Data Model (High Level)

Primary tables:

- `campaigns`
- `contacts`
- `call_attempts`
- `sessions`
- `turns`
- `recordings`
- `transcripts`

Common transcript types used:

- `plain_text`
- `turns`
- `vapi_analysis`
- `stt_final` (CLI)
- `stt_diarized` (CLI)
- `call_metrics` (CLI)

Campaign config highlights:

- draft-editable fields include title/context/pillars/instructions/calling hours/max duration/opening sentence
- status lifecycle includes `draft`, `active`, `paused`
- test progression fields: `test_completed_at`, `test_skipped_at`

## 7) Main Runtime Flows

### A) Browser test interview

1. User opens campaign test page.
2. `VoiceTest` requests assistant via `/api/campaigns/[id]/assistant`.
3. Browser Vapi SDK starts call with assistant ID.
4. Live transcript renders interviewer + interviewee turns.
5. Ending/complete marks test status via `/api/campaigns/[id]/test-status`.

Important implementation notes:

- Prompt/system content is filtered from live transcript.
- Duplicate/incremental Vapi transcript updates are collapsed so one utterance does not render multiple growing lines.

### B) Launch campaign

1. Launch button POSTs `/api/campaigns/[id]/launch`.
2. Route validates ownership/status/pending contacts.
3. Sets campaign active, sends Inngest `campaign/launch`.
4. Launch now requires acknowledged `eventIds`; if missing/failure:
   - returns non-2xx
   - rolls campaign status back to draft
5. UI only shows success when `success === true` and `eventIds.length > 0`.

### C) Inngest queue execution

- `process-campaign` (`campaign/launch`) pulls pending contacts, marks queued, schedules `call/make` events.
- `make-call` enforces:
  - campaign status checks (active/paused)
  - calling-hour window
  - retries and exhaustion logic
  - Vapi assistant creation and outbound call
  - post-call status updates

### D) Vapi webhook ingestion

- `/api/vapi/webhook` verifies signature (if configured), extracts session/contact IDs.
- Persists turns, recording URL, end state.
- Stores normalized `plain_text` + `turns` transcript when call completes.

## 8) Inngest Observability and Debugging

### Quick checks

1. Hit diagnostics endpoint:
   - `GET /api/inngest?diagnostics=1`
   - expect keys + function count + function IDs
2. Launch/Resume response should include `eventIds`.
3. Verify those IDs/runs in Inngest dashboard.
4. Check Vercel logs for structured messages:
   - `[campaign launch] ...`
   - `[campaign status] ...`
   - `[inngest diagnostics] ...`

### Known failure mode solved recently

- "Campaign appears launched but no Inngest run visible."  
  Mitigation now in place:
  - strict enqueue acknowledgment requirement
  - rollback on ambiguous enqueue
  - inline launch error in UI

## 9) UX and Workflow Behavior (Current)

- Campaign list has right-side Clone action.
- After successful test call, UI offers "Continue to Contacts" and "Test Again".
- Contacts page includes CTA to continue to review/launch without back navigation.
- Draft campaigns are editable; launched campaigns are locked.
- Pause/Resume/Restart actions exist for active/paused campaigns.

## 10) Recent Critical Fixes (Behavioral)

- Fixed Vapi public/private key mismatch handling for browser tests.
- Fixed test call teardown reliability (`End Conversation` now deterministic).
- Fixed step progression (test complete/skip advances flow).
- Added campaign `max_duration_sec` and optional verbatim `opening_sentence`.
- Fixed transcript rendering to show both interviewer + interviewee with timestamps.
- Added pause/resume/restart and clone campaign.
- Hardened Inngest enqueue visibility in launch and resume paths.
- Added `/api/inngest?diagnostics=1`.
- Tuned Vapi defaults toward lower latency with strong instruction-following.
- Fixed live transcript duplicate incremental lines by collapsing same-turn growth updates.

## 11) Known Issues / Caveats

- `pnpm typecheck` may fail due to pre-existing generated `.next/types/routes...` duplicate declaration issues in this workspace; this is not tied to current feature logic.
- Vapi behavior varies by provider/model release; keep env-overridable tuning values instead of hardcoding one profile forever.
- If deploying to a new Vercel project/domain, ensure Supabase auth redirect settings include that domain.

## 12) Agent Guidelines for Future Changes

- Preserve strict launch/resume enqueue semantics (do not revert to "success without ack").
- Keep UI success tied to explicit backend acknowledgment (`eventIds`).
- Maintain transcript safety filters (no system prompt leakage in UI).
- Preserve dedupe/collapse logic for live transcript incremental updates.
- When touching Vapi params, change both `lib/vapi.ts` and `src/providers/vapi.ts` unless intentionally diverging web vs CLI.
- After substantial edits:
  - run lint checks on touched files
  - run typecheck if feasible (note known `.next` issue)
  - verify key user flows manually (test call, launch, resume)

## 13) Next Improvements (Backlog)

- Add run-status panel in UI (show latest enqueue event IDs and last Inngest error).
- Add alert/toast system replacing browser `alert()` patterns globally.
- Add integration tests for launch/resume failure rollbacks and event ID requirements.
- Add stronger reconciliation job for stuck contacts/sessions.
- Implement batch transcript analysis feature (currently placeholder).
