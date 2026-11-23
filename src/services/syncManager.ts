// ============================================================================
// Offline-to-Online Automatic Synchronization Manager
// Queues offline mutations safely in IndexedDB and replays them sequentially
// when network connectivity returns, avoiding race conditions & duplicates.
// ============================================================================

import {
  OfflineSyncAction,
  OfflineSyncActionType,
  enqueueSyncAction,
  getSyncQueue,
  removeSyncAction,
  updateSyncAction
} from '../utils/offlineDb';

export interface SyncManagerState {
  pendingCount: number;
  isSyncing: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
}

type SyncListener = (state: SyncManagerState) => void;
type SyncCompleteCallback = (syncedCount: number) => void;

class SyncManager {
  private state: SyncManagerState = {
    pendingCount: 0,
    isSyncing: false,
    lastSyncAt: null,
    lastError: null
  };
  private listeners = new Set<SyncListener>();
  private onCompleteCallbacks = new Set<SyncCompleteCallback>();
  private activeFlushPromise: Promise<number> | null = null;
  private initialized = false;

  init(): void {
    if (this.initialized || typeof window === 'undefined') return;
    this.initialized = true;

    this.refreshCount();
    window.addEventListener('online', () => {
      this.flushSyncQueue();
    });
  }

  subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    listener({ ...this.state });
    this.refreshCount();
    return () => {
      this.listeners.delete(listener);
    };
  }

  onSynced(cb: SyncCompleteCallback): () => void {
    this.onCompleteCallbacks.add(cb);
    return () => {
      this.onCompleteCallbacks.delete(cb);
    };
  }

  private emit(): void {
    const snapshot = { ...this.state };
    this.listeners.forEach((l) => l(snapshot));
  }

  async refreshCount(): Promise<number> {
    const queue = await getSyncQueue();
    this.state.pendingCount = queue.length;
    this.emit();
    return queue.length;
  }

  async enqueue(
    type: OfflineSyncActionType,
    payload: any,
    stallName?: string
  ): Promise<OfflineSyncAction> {
    const action = await enqueueSyncAction(type, payload, stallName);
    await this.refreshCount();
    return action;
  }

  private async postJson(url: string, body: any): Promise<Response> {
    return fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify(body)
    });
  }

  private async executeAction(action: OfflineSyncAction): Promise<'ok' | 'drop' | 'retry'> {
    try {
      let res: Response;
      switch (action.type) {
        case 'toggle_stock':
          res = await this.postJson(`/api/menu/${action.payload.id}/toggle-stock`, {
            stall: action.payload.stall
          });
          break;
        case 'update_price':
          res = await this.postJson(`/api/menu/${action.payload.id}/price`, {
            delta: action.payload.delta,
            stall: action.payload.stall
          });
          break;
        case 'update_item':
          res = await this.postJson(`/api/menu/${action.payload.dishId}/update`, {
            stall: action.payload.stall,
            updates: action.payload.updates
          });
          break;
        case 'add_item':
          res = await this.postJson('/api/menu/add', {
            stall: action.payload.stall,
            item: action.payload.item
          });
          break;
        case 'delete_item':
          res = await this.postJson(`/api/menu/${action.payload.dishId}/delete`, {
            stall: action.payload.stall,
            deleteImagePermanently: Boolean(action.payload.deleteImagePermanently)
          });
          break;
        case 'save_batch':
          res = await this.postJson('/api/menu/save-batch', {
            stall: action.payload.stall,
            items: action.payload.items,
            deletedItemIds: action.payload.deletedItemIds,
            summary: action.payload.summary || 'Offline sync batch'
          });
          break;
        case 'save_notice':
          res = await this.postJson('/api/stalls/notice', {
            stall: action.payload.stall,
            notice: action.payload.notice
          });
          break;
        case 'save_sales':
          res = await this.postJson('/api/sales', {
            ...action.payload,
            clientMutationId: action.clientMutationId
          });
          break;
        case 'stall_view':
          res = await this.postJson('/api/analytics/stall-view', action.payload);
          break;
        case 'item_view':
          res = await this.postJson('/api/analytics/item-view', action.payload);
          break;
        default:
          return 'drop';
      }

      if (res.ok) return 'ok';
      // 401/403 means session is missing or unauthorized for this stall; keep if merchant logs back in, unless 404/409
      if (res.status === 400 || res.status === 404 || res.status === 409) {
        return 'drop';
      }
      const errData = await res.json().catch(() => ({}));
      action.lastError = errData.error || `HTTP ${res.status}`;
      return 'retry';
    } catch (err: any) {
      action.lastError = err?.message || 'Network unavailable';
      return 'retry';
    }
  }

  async flushSyncQueue(): Promise<number> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await this.refreshCount();
      return 0;
    }

    if (this.activeFlushPromise) {
      return this.activeFlushPromise;
    }

    this.activeFlushPromise = (async () => {
      const queue = await getSyncQueue();
      if (queue.length === 0) {
        this.state.pendingCount = 0;
        this.emit();
        return 0;
      }

      this.state.isSyncing = true;
      this.state.lastError = null;
      this.emit();

      let syncedCount = 0;

      for (const action of queue) {
        const result = await this.executeAction(action);
        if (result === 'ok' || result === 'drop') {
          await removeSyncAction(action.id);
          if (result === 'ok') syncedCount++;
        } else {
          action.attempts += 1;
          await updateSyncAction(action);
          this.state.lastError = action.lastError || 'Sync paused until authenticated or online.';
          // Stop on network failure or auth issue to preserve sequence
          break;
        }
      }

      const remaining = await getSyncQueue();
      this.state.isSyncing = false;
      this.state.pendingCount = remaining.length;
      if (syncedCount > 0) {
        this.state.lastSyncAt = new Date().toISOString();
      }
      this.emit();

      if (syncedCount > 0) {
        this.onCompleteCallbacks.forEach((cb) => cb(syncedCount));
      }

      return syncedCount;
    })();

    try {
      return await this.activeFlushPromise;
    } finally {
      this.activeFlushPromise = null;
    }
  }
}

export const syncManager = new SyncManager();
