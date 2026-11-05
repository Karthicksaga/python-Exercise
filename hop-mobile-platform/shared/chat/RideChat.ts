// Rider ↔ Captain chat on the approved "chat" screen, backed by ChatSession. Draws real names,
// messages with sending/sent/seen/not-sent states, typing, and quick replies into the renderer's
// .chat area, and keeps an unread count on the trip screen's Message button.
import { api } from "../services/client";
import type { Ride } from "../services/contracts";
import { escape } from "../helpers";
import { notificationSound } from "../sounds";
import { ChatSession, type ChatItem, type ChatSnapshot } from "./ChatSession";

type Bridge = { read(): { screen: string }; notify(message: string): void };

const CHAT_STATUSES = ["accepted", "arrived", "in_progress"];
const QUICK = {
  rider: [["I’m at pickup", "I’m at the pickup."], ["On my way", "I’ll be there shortly."], ["2 minutes", "Please wait 2 minutes."]],
  captain: [["I’ve arrived", "I’ve arrived outside."], ["Hazard lights on", "Hazard lights are on."], ["In traffic", "Stuck in traffic, about 5 minutes."]],
} as const;

const clock = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
};

export class RideChat {
  private session?: ChatSession;
  private rideId = "";
  private opening = "";
  private openFailedAt = 0;
  private snap?: ChatSnapshot;
  private painted = "";
  private alerted = 0;
  private primed = false;

  constructor(
    private app: HTMLElement,
    private role: "rider" | "captain",
    private bridge: Bridge,
    private ride: () => Ride | undefined,
  ) {}

  /** Call on every render and state change. Opens chat once a captain accepts and closes it after the trip. */
  update() {
    const ride = this.ride();
    const screen = this.bridge.read().screen;
    const live = ride && CHAT_STATUSES.includes(ride.status) ? ride : undefined;
    if (live && live.id !== this.rideId && this.opening !== live.id && Date.now() - this.openFailedAt > 5000) void this.open(live.id);
    if (!live && this.session && screen !== "chat") this.close();
    if (this.session) {
      this.session.visible = screen === "chat";
      if (screen === "chat") this.session.markRead();
    }
    if (screen === "chat") this.paint();
    this.badge(ride);
  }

  /** Handles chat buttons. Returns true when the click was a chat action. */
  click(button: HTMLElement): boolean {
    const d = button.dataset;
    if (d.chatRetry) return this.session?.retry(d.chatRetry), true;
    if (d.chatDiscard) return this.session?.discard(d.chatDiscard), true;
    if (d.chatOlder !== undefined) {
      void this.session?.loadOlder().catch((e) => this.bridge.notify((e as Error).message));
      return true;
    }
    if (d.message) return this.send(d.message), true;
    return false;
  }

  /** The compose form was submitted. */
  submit() {
    const input = this.app.querySelector<HTMLInputElement>("#message-input");
    if (!input?.value.trim()) return;
    if (this.send(input.value)) input.value = "";
  }

  typing() {
    this.session?.typing();
  }

  /** Signed out or the app is closing. */
  close() {
    this.session?.stop();
    this.session = undefined;
    this.snap = undefined;
    this.rideId = "";
    this.painted = "";
  }

  private send(text: string): boolean {
    if (!this.session) {
      this.bridge.notify("Chat opens when a captain accepts the ride.");
      return false;
    }
    try {
      this.session.send(text);
      return true;
    } catch (error) {
      this.bridge.notify((error as Error).message);
      return false;
    }
  }

  private async open(rideId: string) {
    this.opening = rideId;
    try {
      const { id } = await api.request<{ id: string }>(`/api/rides/${encodeURIComponent(rideId)}/chat`, {});
      if (this.opening !== rideId) return;
      this.close();
      this.rideId = rideId;
      this.primed = false;
      this.session = new ChatSession(id, api, (snap) => this.changed(snap));
      this.session.visible = this.bridge.read().screen === "chat";
      this.session.start();
    } catch {
      this.openFailedAt = Date.now(); // tried again on a later update
    } finally {
      if (this.opening === rideId) this.opening = "";
    }
  }

  private changed(snap: ChatSnapshot) {
    this.snap = snap;
    // A new message from the other person while they aren't looking: chime and show it.
    const latest = [...snap.items].reverse().find((m) => !m.mine && !m.system && m.id);
    if (snap.loaded && !this.primed) {
      this.primed = true;
      this.alerted = latest?.id || 0;
    } else if (latest?.id && latest.id > this.alerted) {
      this.alerted = latest.id;
      if (this.bridge.read().screen !== "chat" || document.visibilityState === "hidden") {
        notificationSound();
        this.bridge.notify(`${this.otherName(snap)}: ${latest.body}`);
      }
    }
    if (this.bridge.read().screen === "chat") this.paint();
    this.badge(this.ride());
  }

  private otherName(snap = this.snap) {
    const other = snap?.others[0]?.name;
    if (other) return other;
    const ride = this.ride();
    return (this.role === "rider" ? ride?.driver_name : ride?.passenger_name || (ride as { rider_name?: string } | undefined)?.rider_name) || (this.role === "rider" ? "Your captain" : "Your rider");
  }

  private paint() {
    const chat = this.app.querySelector<HTMLElement>(".chat");
    if (!chat) return;
    const snap = this.snap;
    const name = this.otherName();
    const title = this.app.querySelector(".app-head h1");
    const heading = this.role === "rider" ? `${name} · your captain` : `${name} · your rider`;
    if (title && title.textContent !== heading) title.textContent = heading;

    let html = "";
    if (!this.ride() && !snap) html = `<p class="small muted">Chat is available during an active ride.</p>`;
    else if (!snap?.loaded) html = snap?.error && !snap.offline ? `<div class="notice-box" role="alert">${escape(snap.error)}</div>` : `<p class="small muted" role="status">Loading messages…</p>`;
    else {
      if (snap.hasMore) html += `<button type="button" class="text-button chat-older" data-chat-older>Show earlier messages</button>`;
      if (!snap.items.length) html += `<p class="small muted">Say hello. Only you and ${escape(name)} can see these messages.</p>`;
      html += snap.items.map((m) => this.bubble(m)).join("");
      if (snap.typing.length) html += `<div class="chat-typing" role="status">${escape(snap.typing[0])} is typing…</div>`;
      if (snap.offline) html += `<div class="chat-time" role="status">Reconnecting… messages will send when you’re back online.</div>`;
      if (!snap.canPost) html += `<div class="notice-box chat-closed" role="status">${escape(snap.closedReason || "This chat is closed.")}</div>`;
      else
        html += `<div class="product-row" style="margin-top:15px">${QUICK[this.role].map(([label, text]) => `<button class="product-chip" data-message="${escape(text)}">${escape(label)}</button>`).join("")}</div>`;
    }
    if (html !== this.painted || !chat.dataset.liveChat) {
      const scroller = this.scroller(chat);
      const nearBottom = !scroller || scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 120;
      const grew = (snap?.items.length || 0) > Number(chat.dataset.count || 0);
      chat.innerHTML = html;
      chat.dataset.liveChat = "1";
      chat.dataset.count = String(snap?.items.length || 0);
      chat.setAttribute("role", "log");
      chat.setAttribute("aria-live", "polite");
      this.painted = html;
      if (scroller && (nearBottom || grew)) scroller.scrollTop = scroller.scrollHeight;
    }
    const input = this.app.querySelector<HTMLInputElement>("#message-input");
    const sendButton = this.app.querySelector<HTMLButtonElement>("#chat-form button");
    const closed = !!snap?.loaded && !snap.canPost;
    if (input && input.disabled !== closed) {
      input.disabled = closed;
      input.placeholder = closed ? "Chat closed" : "Type a message…";
    }
    if (sendButton) {
      sendButton.disabled = closed;
      sendButton.setAttribute("aria-label", "Send message");
    }
  }

  private bubble(m: ChatItem) {
    if (m.system) return `<div class="chat-time">${escape(m.body)}</div>`;
    const bubble = `<div class="chat-bubble ${m.mine ? "mine" : "partner"}${m.status === "failed" ? " failed" : ""}" data-chat-key="${m.key}">${escape(m.body)}</div>`;
    if (!m.mine) return bubble;
    const time = clock(m.sentAt);
    switch (m.status) {
      case "sending":
        return bubble + `<div class="chat-meta">Sending…</div>`;
      case "failed": {
        const clientId = m.key.slice(1);
        return m.error && m.error !== "Not sent"
          ? bubble + `<button type="button" class="chat-meta failed" data-chat-discard="${escape(clientId)}">${escape(m.error)} · Remove</button>`
          : bubble + `<button type="button" class="chat-meta failed" data-chat-retry="${escape(clientId)}">Not sent · Tap to retry</button>`;
      }
      case "seen":
        return bubble + `<div class="chat-meta seen">${time} · Seen</div>`;
      default:
        return bubble + `<div class="chat-meta">${time} · Sent</div>`;
    }
  }

  /** Unread count on the trip screen's Message buttons. */
  private badge(ride: Ride | undefined) {
    const buttons = this.app.querySelectorAll<HTMLButtonElement>('[data-go="chat"]');
    if (!buttons.length) return;
    const unread = this.snap?.loaded ? this.snap.unread : Number((ride as { chat_unread?: number } | undefined)?.chat_unread || 0);
    buttons.forEach((button) => {
      let badge = button.querySelector<HTMLElement>(".chat-unread-badge");
      if (!unread) {
        badge?.remove();
        if (button.getAttribute("aria-label")?.startsWith("Message,")) button.removeAttribute("aria-label");
        return;
      }
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "chat-unread-badge";
        badge.setAttribute("aria-hidden", "true");
        button.append(badge);
      }
      const text = unread > 9 ? "9+" : String(unread);
      if (badge.textContent !== text) badge.textContent = text;
      button.setAttribute("aria-label", `Message, ${unread} unread`);
    });
  }

  private scroller(el: HTMLElement): HTMLElement | null {
    for (let node = el.parentElement; node; node = node.parentElement) {
      const overflow = getComputedStyle(node).overflowY;
      if ((overflow === "auto" || overflow === "scroll") && node.scrollHeight > node.clientHeight) return node;
    }
    return null;
  }
}
