import Twilio from "twilio";

const VOICE = "Polly.Joanna-Neural" as const;

interface GatherOpts {
  text: string;
  actionUrl: string;
  timeout?: number;
  speechTimeout?: string;
  inputType?: string;
}

export function sayAndGather(opts: GatherOpts): string {
  const resp = new Twilio.twiml.VoiceResponse();
  const gather = resp.gather({
    input: (opts.inputType as any) ?? ["speech", "dtmf"],
    speechTimeout: opts.speechTimeout ?? "auto",
    timeout: opts.timeout ?? 6,
    action: opts.actionUrl,
    method: "POST",
  });
  gather.say({ voice: VOICE }, opts.text);
  resp.redirect({ method: "POST" }, opts.actionUrl);
  return resp.toString();
}

export function sayAndHangup(text: string): string {
  const resp = new Twilio.twiml.VoiceResponse();
  resp.say({ voice: VOICE }, text);
  resp.hangup();
  return resp.toString();
}

export function redirectTo(url: string): string {
  const resp = new Twilio.twiml.VoiceResponse();
  resp.redirect({ method: "POST" }, url);
  return resp.toString();
}
