import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { ChatMessage } from "./types";

const quick = {
  rider: ["I'm here", "Please wait 2 min", "Call me", "Share exact pickup"],
  driver: ["On my way", "I've arrived", "Stuck in traffic", "Can't find you"],
};

// Private in-ride chat between rider and driver; polls while open.
export default function RideChat({ rideId, as, onClose, notify }: { rideId: string; as: "rider" | "driver"; onClose: () => void; notify: (s: string) => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const last = useRef(0);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const out = await api<{ messages: ChatMessage[] }>(`/api/rides/${rideId}/messages?after=${last.current}`);
      if (out.messages.length) {
        last.current = out.messages[out.messages.length - 1].id;
        setMessages((m) => [...m, ...out.messages.filter((x) => !m.some((y) => y.id === x.id))]);
      }
    } catch {
      /* ride may have just ended */
    }
  }, [rideId]);
  useEffect(() => {
    load();
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [load]);
  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const send = async (body: string) => {
    const clean = body.trim();
    if (!clean || sending) return;
    setSending(true);
    try {
      await api(`/api/rides/${rideId}/messages`, { body: clean });
      setText("");
      await load();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="chat" role="dialog" aria-label="Chat">
      <header>
        <strong>Chat with your {as === "rider" ? "driver" : "rider"}</strong>
        <button type="button" className="text-button" onClick={onClose} aria-label="Close chat">
          ✕
        </button>
      </header>
      <div className="chat-log" ref={box} aria-live="polite">
        {messages.length === 0 && <p className="muted">No messages yet. Say hello 👋</p>}
        {messages.map((m) => (
          <div key={m.id} className={"bubble" + (m.mine ? " mine" : "")}>
            {m.body}
            <small>{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small>
          </div>
        ))}
      </div>
      <div className="chips">
        {quick[as].map((q) => (
          <button key={q} type="button" className="chip" onClick={() => send(q)} disabled={sending}>
            {q}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <input value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder="Type a message" aria-label="Message" />
        <button type="submit" disabled={sending || !text.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
