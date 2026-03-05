import Twilio from "twilio";
import fs from "fs";
import path from "path";
import https from "https";
import http from "http";

const accountSid = process.env.TWILIO_ACCOUNT_SID!;
const authToken = process.env.TWILIO_AUTH_TOKEN!;
const fromNumber = process.env.TWILIO_FROM_NUMBER!;

export const twilioClient = Twilio(accountSid, authToken);

export interface CreateCallOpts {
  to: string;
  webhookBaseUrl: string;
  sessionId: string;
}

export async function createOutboundCall(opts: CreateCallOpts) {
  const call = await twilioClient.calls.create({
    to: opts.to,
    from: fromNumber,
    url: `${opts.webhookBaseUrl}/twilio/voice?sessionId=${opts.sessionId}`,
    statusCallback: `${opts.webhookBaseUrl}/twilio/status?sessionId=${opts.sessionId}`,
    statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
    statusCallbackMethod: "POST",
    record: true,
    recordingStatusCallback: `${opts.webhookBaseUrl}/twilio/recording?sessionId=${opts.sessionId}`,
    recordingStatusCallbackMethod: "POST",
    machineDetection: "Enable",
    timeout: 30,
  });
  return call;
}

export async function downloadRecording(
  recordingUrl: string,
  sessionId: string,
): Promise<string> {
  const dir = path.resolve("recordings");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, `${sessionId}.mp3`);

  const mp3Url = recordingUrl.endsWith(".mp3")
    ? recordingUrl
    : `${recordingUrl}.mp3`;

  return new Promise((resolve, reject) => {
    const get = mp3Url.startsWith("https") ? https.get : http.get;

    const authHeader = Buffer.from(`${accountSid}:${authToken}`).toString(
      "base64",
    );

    get(
      mp3Url,
      { headers: { Authorization: `Basic ${authHeader}` } },
      (response) => {
        if (
          response.statusCode &&
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          const redirectGet = response.headers.location.startsWith("https")
            ? https.get
            : http.get;
          redirectGet(response.headers.location, (redirectRes) => {
            const ws = fs.createWriteStream(filePath);
            redirectRes.pipe(ws);
            ws.on("finish", () => resolve(filePath));
            ws.on("error", reject);
          }).on("error", reject);
          return;
        }

        const ws = fs.createWriteStream(filePath);
        response.pipe(ws);
        ws.on("finish", () => resolve(filePath));
        ws.on("error", reject);
      },
    ).on("error", reject);
  });
}
