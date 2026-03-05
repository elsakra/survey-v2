# survey-v2

Vapi-first conversational phone interview pipeline.

- Outbound call is created by Vapi directly.
- Voice defaults to ElevenLabs for realism.
- No DTMF/keypad flow (speech-only conversation).
- Results stored in Supabase (`campaigns`, `sessions`, `turns`, `recordings`, `transcripts`).

## Prerequisites

- Node.js >= 18
- pnpm
- ngrok account
- Vapi account + phone number ID
- OpenAI API key (LLM + Whisper STT)
- Supabase project

## Setup

```bash
# 1) Install ngrok CLI
brew install ngrok/ngrok/ngrok
ngrok config add-authtoken <YOUR_NGROK_AUTHTOKEN>

# 2) Install deps
pnpm i

# 3) Create .env
cp .env.example .env
```

Then fill these required values in `.env`:

| Variable | Purpose |
|---|---|
| `NGROK_AUTHTOKEN` | local tunnel for Vapi webhooks |
| `OPENAI_API_KEY` | interviewer/summary + Whisper transcription |
| `LLM_MODEL` | default `gpt-4o-mini` |
| `VAPI_PRIVATE_KEY` | create assistant + outbound call |
| `VAPI_PHONE_NUMBER_ID` | Vapi phone number ID used for outbound (fallback if `VAPI_FROM_NUMBER` not set) |
| `VAPI_FROM_NUMBER` | Preferred outbound caller E.164 number, e.g. `+12707976845` |
| `VAPI_WEBHOOK_SECRET` | optional webhook signature verification |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |

## Run Interview

```bash
pnpm interview --to "+15551234567" --pillars-file "./pillars.financial.short.json" --duration-sec 180
```

## Python One-Command Runner

```bash
python3 run_test.py
```

Default behavior:
- calls `+19018717753`
- uses `./pillars.pe.diligence.short.json`
- duration `180` sec
- sets title to `PE Due Diligence Interview (Clozd Style)` unless `--title` is provided

Useful overrides:

```bash
python3 run_test.py --to "+1XXXXXXXXXX" --duration-sec 240 --title "Financial Check-In"
python3 run_test.py --skip-install
```

## Clozd-Style Interviewing Principles

The active voice interviewer is configured to emulate expert qualitative interview behavior used in high-quality win/loss and due-diligence interviews:

- Story-first opening before structured drill-down.
- Adaptive topic ordering based on participant signal, not rigid script order.
- Open-ended, neutral questions with one question per turn.
- Relevance gating (skip deep dives on non-material topics).
- Recap-and-confirm checkpoints to validate understanding.
- Anti-rigidity guardrails to avoid repetitive over-probing.

## Pillars File Format

```json
{
  "title": "Short Financial Situation Interview",
  "pillars": [
    { "id": "p1", "question": "How would you describe your current financial situation month-to-month?" },
    { "id": "p2", "question": "What is the biggest source of financial stress or uncertainty for you right now?" },
    { "id": "p3", "question": "What changes have you made recently to manage spending, saving, or debt?" }
  ],
  "tone": { "style": "warm, respectful, non-judgmental, concise" },
  "constraints": { "prefer_quantification": true }
}
```

## End-to-End Flow

1. CLI creates campaign/session in Supabase.
2. Express server starts on localhost.
3. ngrok tunnel opens and exposes `/vapi/webhook`.
4. CLI creates a Vapi assistant (speech-only, conversational consent).
5. CLI starts outbound call via Vapi to `--to`.
6. Vapi sends webhook events for transcript/status/recording.
7. Server persists turn-level rows in `turns`.
8. On call end, CLI downloads recording, runs Whisper, stores `stt_final`.
9. CLI stores `turns` transcript + `plain_text`, generates summary, prints output.

## Output Printed in Terminal

- `session_id`
- call status + duration
- recording URL + local path
- interview summary
- DB row counts created
