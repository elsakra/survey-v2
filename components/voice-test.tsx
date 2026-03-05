"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface Message {
  role: "assistant" | "user";
  content: string;
}

export function VoiceTest({ campaignId }: { campaignId: string }) {
  const [status, setStatus] = useState<"idle" | "connecting" | "active" | "ended">("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const vapiRef = useRef<any>(null);

  const addMessage = useCallback((role: "assistant" | "user", content: string) => {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === role) {
        return [...prev.slice(0, -1), { role, content: last.content + " " + content }];
      }
      return [...prev, { role, content }];
    });
  }, []);

  async function startTest() {
    setError(null);
    setStatus("connecting");
    setMessages([]);

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/assistant`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? "Failed to create assistant");
      }
      const { assistantId } = await res.json();

      const { default: Vapi } = await import("@vapi-ai/web");
      const vapi = new Vapi(process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY!);
      vapiRef.current = vapi;

      vapi.on("speech-start", () => {});
      vapi.on("speech-end", () => {});
      vapi.on("message", (msg: any) => {
        if (msg.type === "transcript" && msg.transcriptType === "final") {
          addMessage(msg.role === "assistant" ? "assistant" : "user", msg.transcript);
        }
      });
      vapi.on("call-start", () => setStatus("active"));
      vapi.on("call-end", () => setStatus("ended"));
      vapi.on("error", (e: any) => {
        console.error("Vapi error:", e);
        setError(e?.message ?? "Call error");
        setStatus("ended");
      });

      await vapi.start(assistantId);
    } catch (e: any) {
      setError(e.message);
      setStatus("idle");
    }
  }

  function stopTest() {
    vapiRef.current?.stop();
    setStatus("ended");
  }

  useEffect(() => {
    return () => {
      vapiRef.current?.stop();
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        {status === "idle" || status === "ended" ? (
          <button
            onClick={startTest}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            {status === "ended" ? "Test Again" : "Start Test Conversation"}
          </button>
        ) : status === "connecting" ? (
          <button disabled className="px-4 py-2 bg-gray-200 text-gray-500 text-sm font-medium rounded-lg">
            Connecting...
          </button>
        ) : (
          <button
            onClick={stopTest}
            className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
          >
            End Conversation
          </button>
        )}

        {status === "active" && (
          <span className="flex items-center gap-2 text-sm text-green-600">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            Live
          </span>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>
      )}

      {messages.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
          {messages.map((m, i) => (
            <div key={i} className="px-4 py-3 flex gap-3">
              <span
                className={`text-xs font-medium uppercase w-16 shrink-0 mt-0.5 ${
                  m.role === "assistant" ? "text-blue-600" : "text-gray-500"
                }`}
              >
                {m.role === "assistant" ? "AI" : "You"}
              </span>
              <p className="text-sm text-gray-700">{m.content}</p>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400">
        Uses your desktop microphone. Make sure to allow microphone access when prompted.
      </p>
    </div>
  );
}
