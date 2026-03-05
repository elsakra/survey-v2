# survey-v2

AI-conducted phone interview pipeline. Places an outbound call via Twilio, runs a PhD-quality adaptive interview using an LLM orchestrator, records the call, transcribes it with Whisper, and stores everything in Supabase.

## Prerequisites

- Node.js >= 18
- pnpm
- Twilio account with a phone number
- OpenAI API key
- Supabase project
- ngrok account (free tier works)

## Setup

```bash
# 1. Install dependencies
pnpm i

# 2. Configure environment
cp .env.example .env
# Edit .env with your credentials

# 3. Database is already set up in Supabase
# If you need to re-run migrations:
# Paste the SQL from supabase/migrations/00001_init.sql into the Supabase SQL editor
```

## Environment Variables

| Variable | Description |
|---|---|
| `TWILIO_ACCOUNT_SID` | Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token |
| `TWILIO_FROM_NUMBER` | Twilio phone number (E.164 format) |
| `NGROK_AUTHTOKEN` | ngrok auth token (optional but recommended) |
| `OPENAI_API_KEY` | OpenAI API key (used for LLM + Whisper) |
| `LLM_MODEL` | OpenAI model (default: `gpt-4o-mini`) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |

## Usage

```bash
pnpm interview --to "+15551234567" --pillars-file "./pillars.example.json" --duration-sec 420
```

### CLI Options

| Flag | Required | Description |
|---|---|---|
| `--to <phone>` | Yes | E.164 phone number to call |
| `--pillars-file <path>` | Yes | Path to pillars JSON file |
| `--duration-sec <n>` | No | Max interview duration (120-1800, default: 420) |
| `--title <text>` | No | Campaign title |

### Pillars File Format

```json
{
  "title": "Customer Discovery",
  "pillars": [
    { "id": "p1", "question": "Walk me through your end-to-end workflow." },
    { "id": "p2", "question": "Where does the process break most often?" },
    { "id": "p3", "question": "How do you decide between different approaches?" }
  ],
  "tone": { "style": "warm, crisp, professional" },
  "constraints": { "prefer_quantification": true }
}
```

## What Happens

1. Creates campaign + session in Supabase
2. Starts Express server on port 3456
3. Opens ngrok tunnel
4. Places outbound call via Twilio
5. Asks for recording consent
6. Runs warmup questions (role, context)
7. Interviews through each pillar with adaptive follow-ups
8. Uses an LLM assessor to track evidence coverage and avoid boredom
9. Wraps up with summary and "anything I missed?"
10. Downloads recording, transcribes with Whisper
11. Stores turns, recording, and 3 transcript types in Supabase
12. Prints session summary to terminal
13. Shuts down

## Database Schema

- **campaigns** — pillar config + metadata
- **sessions** — call tracking, consent, status
- **turns** — every agent/participant exchange with timestamps
- **recordings** — Twilio recording reference + local file path
- **transcripts** — structured turns, Whisper STT (word-level), plain text

## Architecture

```
CLI (interview.ts)
  → Express server (webhooks)
  → ngrok tunnel
  → Twilio outbound call
  → State machine: CONSENT → WARMUP → PILLAR_LOOP → WRAPUP → END
  → LLM assessor (evidence tracking) + interviewer (question generation)
  → Post-call: download recording → Whisper STT → store in Supabase
  → Print results → exit
```
