export interface Campaign {
  id: string;
  title: string | null;
  pillars_json: PillarsConfig;
  created_at: string;
}

export interface Session {
  id: string;
  campaign_id: string;
  to_number: string;
  call_sid: string | null;
  consent: boolean | null;
  status: SessionStatus;
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
}

export type SessionStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed"
  | "no_consent"
  | "no_answer";

export interface Turn {
  id: string;
  session_id: string;
  turn_index: number;
  speaker: "agent" | "participant";
  pillar_id: string | null;
  lens: string | null;
  phase: string | null;
  prompt_text: string | null;
  response_text: string | null;
  start_ms: number | null;
  end_ms: number | null;
  raw_event_payload: Record<string, unknown> | null;
  created_at: string;
}

export interface Recording {
  id: string;
  session_id: string;
  recording_sid: string | null;
  recording_url: string | null;
  duration_sec: number | null;
  downloaded_path: string | null;
  created_at: string;
}

export interface Transcript {
  id: string;
  session_id: string;
  type: "turns" | "stt_final" | "plain_text";
  content_json: Record<string, unknown>;
  provider: string | null;
  created_at: string;
}

export interface Pillar {
  id: string;
  question: string;
}

export interface PillarsConfig {
  title?: string;
  context?: string;
  interviewer_name?: string;
  org_name?: string;
  pillars: Pillar[];
  tone?: { style: string };
  constraints?: { prefer_quantification?: boolean };
}

export interface Database {
  public: {
    Tables: {
      campaigns: { Row: Campaign; Insert: Omit<Campaign, "id" | "created_at">; };
      sessions: { Row: Session; Insert: Omit<Session, "id" | "started_at">; };
      turns: { Row: Turn; Insert: Omit<Turn, "id" | "created_at">; };
      recordings: { Row: Recording; Insert: Omit<Recording, "id" | "created_at">; };
      transcripts: { Row: Transcript; Insert: Omit<Transcript, "id" | "created_at">; };
    };
  };
}
