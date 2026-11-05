// A live connection to one conversation on /api/chats, for any feature (ride chat today).
// UI-free: it keeps the messages, sends with retry, tracks read receipts and typing, and calls
// onChange with a snapshot whenever anything changes. See hop-platform/docs/API.md, "Chat".
//
// Delivery is long polling (GET /wait holds up to 10 s and returns the moment something changes), which
// works through the native HTTP plugin. Every message carries a client_id made here, so a send retried
// after a lost response is stored once. Unsent messages survive an app restart (localStorage).
import { APIError } from "../services/client";

export type ChatParticipant = { role: string; name: string; me: boolean; last_read_id: number; typing: boolean };
export type ChatServerMessage = {
  id: number;
  body: string;
  mine: boolean;
  system: boolean;
  sender_role: string;
  client_id: string | null;
  sent_at: string;
};
export type ChatView = {
  id: string;
  kind: string;
  ref: string;
  can_post: boolean;
  closed_reason?: string;
  last_message_id: number;
  unread: number;
  participants: ChatParticipant[];
  messages: ChatServerMessage[];
  has_more: boolean;
};
/** sending → sent → seen for your own messages; failed when it couldn't be sent (tap to retry). */
export type ChatStatus = "sending" | "sent" | "seen" | "failed";
export type ChatItem = {
  key: string;
  id?: number;
  body: string;
  mine: boolean;
  system: boolean;
  role: string;
  sentAt: string;
  status?: ChatStatus;
  /** Why a failed message wasn't accepted (for example, the chat closed). */
  error?: string;
};
export type ChatSnapshot = {
  loaded: boolean;
  /** The last connection attempt failed; messages may be out of date. */
  offline: boolean;
  error: string;
  items: ChatItem[];
  others: ChatParticipant[];
  typing: string[];
  canPost: boolean;
  closedReason: string;
  hasMore: boolean;
  /** Messages from others you haven't read yet. */
  unread: number;
};
type Requester = { request<T>(path: string, body?: unknown): Promise<T> };
type Pending = { clientId: string; body: string; sentAt: string; status: "sending" | "failed"; error?: string; rejected?: boolean };

const TYPING_EVERY = 3000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class ChatSession {
  private messages = new Map<number, ChatServerMessage>();
  private pending: Pending[] = [];
  private participants: ChatParticipant[] = [];
  private after = 0;
  private canPost = false;
  private closedReason = "";
  private hasMore = false;
  private loaded = false;
  private offline = false;
  private error = "";
  private running = false;
  private generation = 0;
  private readSent = 0;
  private typingSent = 0;
  private wasTyping = false;
  /** Set by the screen: true while the person can see the conversation, so arriving messages count as read. */
  visible = false;

  constructor(
    readonly id: string,
    private api: Requester,
    private onChange: (snapshot: ChatSnapshot) => void,
  ) {
    this.pending = this.restore();
  }

  start() {
    if (this.running) return;
    this.running = true;
    const generation = ++this.generation;
    document.addEventListener("visibilitychange", this.onVisibility);
    void this.run(generation);
  }

  stop() {
    this.running = false;
    this.generation++;
    document.removeEventListener("visibilitychange", this.onVisibility);
  }

  snapshot(): ChatSnapshot {
    const others = this.participants.filter((p) => !p.me);
    const seenUpTo = Math.max(0, ...others.map((p) => p.last_read_id));
    const myRead = Math.max(this.readSent, this.participants.find((p) => p.me)?.last_read_id || 0);
    let unread = 0;
    for (const m of this.messages.values()) if (!m.mine && !m.system && m.id > myRead) unread++;
    const items: ChatItem[] = [...this.messages.values()]
      .sort((a, b) => a.id - b.id)
      .map((m) => ({
        key: `m${m.id}`,
        id: m.id,
        body: m.body,
        mine: m.mine,
        system: m.system,
        role: m.sender_role,
        sentAt: m.sent_at,
        status: m.mine ? (m.id <= seenUpTo ? "seen" : "sent") : undefined,
      }));
    for (const p of this.pending)
      items.push({ key: `c${p.clientId}`, body: p.body, mine: true, system: false, role: "", sentAt: p.sentAt, status: p.status, error: p.error });
    return {
      loaded: this.loaded,
      offline: this.offline,
      error: this.error,
      items,
      others,
      typing: others.filter((p) => p.typing).map((p) => p.name),
      canPost: this.canPost,
      closedReason: this.closedReason,
      hasMore: this.hasMore,
      unread,
    };
  }

  /** Sends a message. It shows straight away as "sending" and becomes "sent" when the server stores it. */
  send(raw: string) {
    const body = raw.trim();
    if (!body) return;
    if (this.loaded && !this.canPost) throw new Error(this.closedReason || "This conversation is closed.");
    const item: Pending = { clientId: crypto.randomUUID(), body, sentAt: new Date().toISOString(), status: "sending" };
    this.pending.push(item);
    this.save();
    this.emit();
    void this.post(item);
  }

  /** Tries a failed message again, with the same client_id, so it can't be stored twice. */
  retry(clientId: string) {
    const item = this.pending.find((p) => p.clientId === clientId);
    if (!item || item.status === "sending") return;
    item.status = "sending";
    item.error = undefined;
    item.rejected = false;
    this.emit();
    void this.post(item);
  }

  /** Removes a message that couldn't be sent. */
  discard(clientId: string) {
    this.pending = this.pending.filter((p) => p.clientId !== clientId);
    this.save();
    this.emit();
  }

  /** Tells the others you're typing, at most every few seconds. */
  typing() {
    if (!this.canPost || Date.now() - this.typingSent < TYPING_EVERY) return;
    this.typingSent = Date.now();
    void this.api.request(`/api/chats/${this.id}/typing`, {}).catch(() => {});
  }

  /** Loads the page of messages before the oldest one shown. */
  async loadOlder() {
    const oldest = Math.min(...this.messages.keys());
    if (!Number.isFinite(oldest)) return;
    const view = await this.api.request<ChatView>(`/api/chats/${this.id}?before=${oldest}`);
    for (const m of view.messages) this.messages.set(m.id, m);
    this.hasMore = view.has_more;
    this.emit();
  }

  /** Marks everything shown as read, when the person can actually see it. */
  markRead() {
    if (!this.visible || document.visibilityState === "hidden") return;
    let newest = 0;
    for (const m of this.messages.values()) if (!m.mine && m.id > newest) newest = m.id;
    if (newest <= this.readSent) return;
    this.readSent = newest;
    void this.api.request(`/api/chats/${this.id}/read`, { message_id: newest }).catch(() => {
      this.readSent = 0; // try again next time
    });
  }

  private onVisibility = () => {
    if (document.visibilityState === "visible") this.markRead();
  };

  private async run(generation: number) {
    let backoff = 1000;
    while (this.running && generation === this.generation) {
      try {
        const path = this.loaded
          ? `/api/chats/${this.id}/wait?after=${this.after}&seen=${this.othersRead()}&typing=${this.wasTyping ? 1 : 0}&open=${this.canPost ? 1 : 0}`
          : `/api/chats/${this.id}`;
        const view = await this.api.request<ChatView>(path);
        if (generation !== this.generation) return;
        this.apply(view);
        backoff = 1000;
        if (this.offline) {
          this.offline = false;
          this.retryDropped();
        }
        this.error = "";
        this.emit();
      } catch (error) {
        if (generation !== this.generation) return;
        const status = error instanceof APIError ? error.status : 0;
        this.offline = status === 0 || status >= 500 || status === 429;
        this.error = (error as Error).message;
        this.emit();
        if (status === 404 || status === 401 || status === 403) return; // not ours, or signed out
        await sleep(backoff);
        backoff = Math.min(backoff * 2, 15000);
      }
    }
  }

  private apply(view: ChatView) {
    for (const m of view.messages) {
      this.messages.set(m.id, m);
      if (m.id > this.after) this.after = m.id;
      if (m.client_id) this.pending = this.pending.filter((p) => p.clientId !== m.client_id);
    }
    if (!this.loaded) {
      this.hasMore = view.has_more;
      this.after = Math.max(this.after, view.last_message_id);
      this.loaded = true;
      this.retryDropped();
    }
    this.participants = view.participants;
    this.wasTyping = view.participants.some((p) => !p.me && p.typing);
    this.canPost = view.can_post;
    this.closedReason = view.closed_reason || "";
    this.save();
    this.markRead();
  }

  private async post(item: Pending) {
    try {
      const m = await this.api.request<ChatServerMessage>(`/api/chats/${this.id}/messages`, { client_id: item.clientId, body: item.body });
      this.messages.set(m.id, m);
      if (m.id > this.after) this.after = m.id;
      this.pending = this.pending.filter((p) => p.clientId !== item.clientId);
      this.offline = false;
    } catch (error) {
      const status = error instanceof APIError ? error.status : 0;
      item.status = "failed";
      // 4xx: the server refused it (closed, too long); retrying won't help on its own.
      item.rejected = status >= 400 && status < 500 && status !== 429;
      item.error = item.rejected ? (error as Error).message : "Not sent";
      if (!item.rejected) this.offline = true;
    }
    this.save();
    this.emit();
  }

  /** After reconnecting, resend messages that failed only because the connection dropped. */
  private retryDropped() {
    for (const p of this.pending) if ((p.status === "failed" && !p.rejected) || p.status === "sending") this.retry(p.clientId);
  }

  private othersRead() {
    return Math.max(0, ...this.participants.filter((p) => !p.me).map((p) => p.last_read_id));
  }

  private emit() {
    this.onChange(this.snapshot());
  }

  private storageKey() {
    return `hop-chat-unsent:${this.id}`;
  }

  private save() {
    try {
      if (this.pending.length) localStorage.setItem(this.storageKey(), JSON.stringify(this.pending.map(({ clientId, body, sentAt }) => ({ clientId, body, sentAt }))));
      else localStorage.removeItem(this.storageKey());
    } catch {
      // Private mode or storage blocked: unsent messages just won't survive a restart.
    }
  }

  private restore(): Pending[] {
    try {
      const saved = JSON.parse(localStorage.getItem(this.storageKey()) || "[]");
      if (!Array.isArray(saved)) return [];
      return saved
        .filter((p) => typeof p?.clientId === "string" && typeof p?.body === "string")
        .map((p) => ({ clientId: p.clientId, body: p.body, sentAt: String(p.sentAt || new Date().toISOString()), status: "failed" as const, error: "Not sent" }));
    } catch {
      return [];
    }
  }
}
