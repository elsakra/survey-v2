import OpenAI from "openai";
import fs from "fs";
import { File as NodeFile } from "node:buffer";

if (!(globalThis as any).File) {
  (globalThis as any).File = NodeFile;
}

export interface STTSegment {
  start: number;
  end: number;
  text: string;
  words?: STTWord[];
}

export interface STTWord {
  word: string;
  start: number;
  end: number;
}

export interface STTResult {
  segments: STTSegment[];
  text: string;
  provider: string;
  model: string;
  duration?: number;
}

export interface STTProvider {
  transcribe(audioPath: string): Promise<STTResult>;
}

class WhisperProvider implements STTProvider {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async transcribe(audioPath: string): Promise<STTResult> {
    const file = fs.createReadStream(audioPath);

    const response = await this.client.audio.transcriptions.create({
      model: "whisper-1",
      file,
      response_format: "verbose_json",
      timestamp_granularities: ["word", "segment"],
    });

    const raw = response as any;

    const segments: STTSegment[] = (raw.segments ?? []).map((seg: any) => ({
      start: seg.start,
      end: seg.end,
      text: seg.text?.trim() ?? "",
      words: (raw.words ?? [])
        .filter((w: any) => w.start >= seg.start && w.end <= seg.end)
        .map((w: any) => ({
          word: w.word,
          start: w.start,
          end: w.end,
        })),
    }));

    if (segments.length === 0 && raw.words?.length) {
      segments.push({
        start: raw.words[0].start,
        end: raw.words[raw.words.length - 1].end,
        text: raw.text ?? "",
        words: raw.words.map((w: any) => ({
          word: w.word,
          start: w.start,
          end: w.end,
        })),
      });
    }

    return {
      segments,
      text: raw.text ?? "",
      provider: "whisper",
      model: "whisper-1",
      duration: raw.duration,
    };
  }
}

let _provider: STTProvider | null = null;

export function getSTT(): STTProvider {
  if (!_provider) _provider = new WhisperProvider();
  return _provider;
}
