// ============================================================================
// IndexedDB Persistent Offline Storage & Sync Queue
// Provides reliable offline caching for menus, stalls, notices, student tray,
// favorites, cached merchant sales, and pending offline mutation sync queue.
// ============================================================================

const DB_NAME = 'unsay_sudan_offline_db';
const DB_VERSION = 1;
const STORE_KV = 'kv';
const STORE_QUEUE = 'sync_queue';

export type OfflineSyncActionType =
  | 'toggle_stock'
  | 'update_price'
  | 'update_item'
  | 'add_item'
  | 'delete_item'
  | 'save_batch'
  | 'save_notice'
  | 'save_sales'
  | 'stall_view'
  | 'item_view';

export interface OfflineSyncAction {
  id: string;
  clientMutationId: string;
  type: OfflineSyncActionType;
  stallName?: string;
  payload: any;
  createdAt: string;
  attempts: number;
  lastError?: string;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openOfflineDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_KV)) {
          db.createObjectStore(STORE_KV, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(STORE_QUEUE)) {
          const queueStore = db.createObjectStore(STORE_QUEUE, { keyPath: 'id' });
          queueStore.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

  return dbPromise;
}

export async function getKv<T = any>(key: string): Promise<T | null> {
  const db = await openOfflineDb();
  if (db) {
    try {
      const value = await new Promise<T | null>((resolve) => {
        const tx = db.transaction(STORE_KV, 'readonly');
        const store = tx.objectStore(STORE_KV);
        const req = store.get(key);
        req.onsuccess = () => {
          resolve(req.result ? (req.result.value as T) : null);
        };
        req.onerror = () => resolve(null);
      });
      if (value !== null) return value;
    } catch {}
  }

  try {
    const raw = localStorage.getItem(`unsay_idb_${key}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function setKv<T = any>(key: string, value: T): Promise<void> {
  try {
    localStorage.setItem(`unsay_idb_${key}`, JSON.stringify(value));
  } catch {}

  const db = await openOfflineDb();
  if (!db) return;

  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_KV, 'readwrite');
      const store = tx.objectStore(STORE_KV);
      store.put({ key, value, updatedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {}
}

function readFallbackQueue(): OfflineSyncAction[] {
  try {
    const raw = localStorage.getItem('unsay_idb_sync_queue');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeFallbackQueue(queue: OfflineSyncAction[]): void {
  try {
    localStorage.setItem('unsay_idb_sync_queue', JSON.stringify(queue));
  } catch {}
}

export async function getSyncQueue(): Promise<OfflineSyncAction[]> {
  const db = await openOfflineDb();
  if (db) {
    try {
      const items = await new Promise<OfflineSyncAction[]>((resolve) => {
        const tx = db.transaction(STORE_QUEUE, 'readonly');
        const store = tx.objectStore(STORE_QUEUE);
        const req = store.getAll();
        req.onsuccess = () => {
          const list: OfflineSyncAction[] = Array.isArray(req.result) ? req.result : [];
          list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          resolve(list);
        };
        req.onerror = () => resolve([]);
      });
      return items;
    } catch {}
  }
  return readFallbackQueue().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function enqueueSyncAction(
  type: OfflineSyncActionType,
  payload: any,
  stallName?: string
): Promise<OfflineSyncAction> {
  const id = `mut_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const action: OfflineSyncAction = {
    id,
    clientMutationId: id,
    type,
    stallName,
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0
  };

  const db = await openOfflineDb();
  if (db) {
    try {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_QUEUE, 'readwrite');
        tx.objectStore(STORE_QUEUE).put(action);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
      return action;
    } catch {}
  }

  const queue = readFallbackQueue();
  queue.push(action);
  writeFallbackQueue(queue);
  return action;
}

export async function updateSyncAction(action: OfflineSyncAction): Promise<void> {
  const db = await openOfflineDb();
  if (db) {
    try {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_QUEUE, 'readwrite');
        tx.objectStore(STORE_QUEUE).put(action);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
      return;
    } catch {}
  }

  const queue = readFallbackQueue().map(item => (item.id === action.id ? action : item));
  writeFallbackQueue(queue);
}

export async function removeSyncAction(id: string): Promise<void> {
  const db = await openOfflineDb();
  if (db) {
    try {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_QUEUE, 'readwrite');
        tx.objectStore(STORE_QUEUE).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
      return;
    } catch {}
  }

  const queue = readFallbackQueue().filter(item => item.id !== id);
  writeFallbackQueue(queue);
}

export async function clearSyncQueueForStall(stallName: string): Promise<void> {
  const queue = await getSyncQueue();
  for (const item of queue) {
    if (item.stallName === stallName) {
      await removeSyncAction(item.id);
    }
  }
}
