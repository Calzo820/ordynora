import { io } from "socket.io-client";
import { API_URL, getAuthToken } from "./api";

const seenEvents = new Map();
const MAX_SEEN = 600;
let audioContext = null;

function rememberEvent(eventName, payload = {}) {
  const key = payload.eventId || `${eventName}:${payload.orderId || payload.tableId || "global"}:${payload.updatedAt || payload.createdAt || payload.requestedAt || ""}`;
  if (!key) return true;
  if (seenEvents.has(key)) return false;
  seenEvents.set(key, Date.now());
  if (seenEvents.size > MAX_SEEN) {
    const oldest = [...seenEvents.entries()].sort((a, b) => a[1] - b[1]).slice(0, 100);
    oldest.forEach(([oldKey]) => seenEvents.delete(oldKey));
  }
  return true;
}

function dispatchSocketStatus(detail) {
  window.dispatchEvent(new CustomEvent("ordynora:socket-status", { detail }));
}

export function createRestaurantSocket(options = {}) {
  const token = getAuthToken();
  const socket = io(API_URL, {
    transports: ["websocket", "polling"],
    withCredentials: true,
    auth: token ? { token } : undefined,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 7000,
    randomizationFactor: 0.5,
    timeout: 12000,
    autoConnect: true,
    ...options,
  });

  socket.onAny((eventName, payload) => {
    if (payload && typeof payload === "object" && !rememberEvent(eventName, payload)) {
      socket.emit("client-duplicate-dropped", { eventName, eventId: payload.eventId });
    }
  });

  socket.on("connect_error", (error) => dispatchSocketStatus({ status: "recovering", message: error?.message || "Realtime in riconnessione" }));
  socket.io.on("reconnect", () => dispatchSocketStatus({ status: "connected", message: "Realtime riconnesso" }));
  socket.io.on("reconnect_attempt", (attempt) => {
    const latestToken = getAuthToken();
    socket.auth = latestToken ? { token: latestToken } : {};
    dispatchSocketStatus({ status: "recovering", message: `Realtime riconnessione ${attempt}` });
  });
  socket.on("disconnect", (reason) => dispatchSocketStatus({ status: reason === "io client disconnect" ? "offline" : "recovering", message: "Realtime disconnesso" }));
  socket.on("connect", () => dispatchSocketStatus({ status: "connected", message: "Realtime attivo" }));
  socket.on("server-health", (payload) => dispatchSocketStatus({ status: payload?.ok ? "connected" : "recovering", message: payload?.message || "Stato server aggiornato" }));

  return socket;
}

export function subscribeSocketStatus(callback) {
  const handler = (event) => callback(event.detail || { status: "unknown" });
  window.addEventListener("ordynora:socket-status", handler);
  return () => window.removeEventListener("ordynora:socket-status", handler);
}

export function playOrderSound() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return Promise.resolve();
    audioContext ||= new AudioContextClass();

    const play = () => {
      const now = audioContext.currentTime;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, now);
      oscillator.frequency.exponentialRampToValueAtTime(660, now + 0.18);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.22, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.24);
    };

    if (audioContext.state === "suspended") {
      return audioContext.resume().then(play).catch(() => {});
    }
    play();
  } catch {
    // L'audio non deve mai bloccare l'operatività di cucina o bar.
  }
  return Promise.resolve();
}
