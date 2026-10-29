import type { StoryPeriodSeconds, StoryPrivacy, StoryTarget } from "../telegram/client";

const DB_NAME = "storyExtensionScheduler";
const DB_VERSION = 1;
const STORE_NAME = "scheduledStories";

export type ScheduledStoryStatus = "pending" | "publishing" | "published" | "failed";
export type ScheduledStoryFailureReason = "session" | "other";

export interface ScheduledStory {
  id: string;
  file: Blob;
  fileName: string;
  fileType: string;
  caption: string;
  privacy: StoryPrivacy;
  allowUserIds?: string[];
  blockUserIds?: string[];
  pinned?: boolean;
  noforwards?: boolean;
  /** Real video size/duration, measured when scheduling (the service worker has no <video> to measure with). */
  video?: { duration: number; width: number; height: number };
  /** How many times a temporary failure (no network, Telegram unreachable) was already retried automatically. */
  attempts?: number;
  targets: StoryTarget[];
  period?: StoryPeriodSeconds;
  /** Unix ms — when background.ts should publish this. */
  scheduledFor: number;
  status: ScheduledStoryStatus;
  /** Set once status is "failed", cleared on a fresh schedule/retry. */
  lastError: string | null;
  /** "session" drives a distinct "log in again" prompt instead of a generic retry. */
  failureReason: ScheduledStoryFailureReason | null;
  createdAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const request = fn(tx.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function addScheduledStory(
  entry: Omit<ScheduledStory, "id" | "status" | "lastError" | "failureReason" | "createdAt">,
): Promise<ScheduledStory> {
  const full: ScheduledStory = {
    ...entry,
    id: crypto.randomUUID(),
    status: "pending",
    lastError: null,
    failureReason: null,
    createdAt: Date.now(),
  };
  await withStore("readwrite", (store) => store.add(full));
  return full;
}

/** Pending or failed-for-a-fixable-reason entries — used to warn before login is lost, and to size the "log in to keep these working" prompt. */
export async function getActionableScheduledStoryCount(): Promise<number> {
  const all = await getAllScheduledStories();
  return all.filter((s) => s.status === "pending" || s.status === "failed").length;
}

export async function getAllScheduledStories(): Promise<ScheduledStory[]> {
  const all = await withStore<ScheduledStory[]>("readonly", (store) => store.getAll());
  return all.sort((a, b) => a.scheduledFor - b.scheduledFor);
}

export async function getScheduledStory(id: string): Promise<ScheduledStory | undefined> {
  return withStore("readonly", (store) => store.get(id));
}

export async function updateScheduledStory(id: string, patch: Partial<ScheduledStory>): Promise<void> {
  const existing = await getScheduledStory(id);
  if (!existing) return;
  await withStore("readwrite", (store) => store.put({ ...existing, ...patch, id }));
}

export async function deleteScheduledStory(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
}
