import { execFileSync, spawn } from "child_process";

export interface NgrokTunnel {
  url: string;
  stop: () => Promise<void>;
}

export async function startNgrokCli(port: number): Promise<NgrokTunnel> {
  ensureNgrokInstalled();

  const proc = spawn("ngrok", ["http", String(port), "--log=stdout"], {
    stdio: "ignore",
  });

  const url = await waitForTunnelUrl();

  const stop = async () => {
    if (!proc.killed) {
      proc.kill("SIGTERM");
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (!proc.killed) {
        proc.kill("SIGKILL");
      }
    }
  };

  return { url, stop };
}

function ensureNgrokInstalled() {
  try {
    execFileSync("ngrok", ["version"], { stdio: "ignore" });
  } catch {
    throw new Error(
      "ngrok CLI is not installed. Install with: brew install ngrok/ngrok/ngrok",
    );
  }
}

async function waitForTunnelUrl(): Promise<string> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch("http://127.0.0.1:4040/api/tunnels");
      if (!res.ok) {
        await delay(400);
        continue;
      }
      const data = (await res.json()) as {
        tunnels?: Array<{ public_url?: string; proto?: string }>;
      };
      const httpsTunnel = data.tunnels?.find((t) => t.public_url?.startsWith("https://"));
      if (httpsTunnel?.public_url) return httpsTunnel.public_url;
      const anyTunnel = data.tunnels?.find((t) => Boolean(t.public_url));
      if (anyTunnel?.public_url) return anyTunnel.public_url;
    } catch {
      // ngrok api not ready yet
    }
    await delay(400);
  }
  throw new Error("Timed out waiting for ngrok tunnel URL.");
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
