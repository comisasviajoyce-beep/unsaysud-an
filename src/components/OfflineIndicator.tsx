import React, { useEffect, useState } from 'react';
import { WifiOff, Wifi, RefreshCw, CloudUpload } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { syncManager, SyncManagerState } from '../services/syncManager';

interface OfflineIndicatorProps {
  onReconnected?: () => void;
  isCachedMenu?: boolean;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({
  onReconnected
}) => {
  const isOnline = useOnlineStatus();
  const [wasOffline, setWasOffline] = useState(false);
  const [showBackOnlineToast, setShowBackOnlineToast] = useState(false);
  const [syncState, setSyncState] = useState<SyncManagerState>({
    pendingCount: 0,
    isSyncing: false,
    lastSyncAt: null,
    lastError: null
  });

  useEffect(() => {
    const unsub = syncManager.subscribe(setSyncState);
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!isOnline) {
      setWasOffline(true);
    } else if (wasOffline) {
      setShowBackOnlineToast(true);
      syncManager.flushSyncQueue().finally(() => {
        if (onReconnected) onReconnected();
      });
      const timer = setTimeout(() => {
        setShowBackOnlineToast(false);
        setWasOffline(false);
      }, 4500);
      return () => clearTimeout(timer);
    }
  }, [isOnline, wasOffline, onReconnected]);

  // Back online notification toast
  if (showBackOnlineToast) {
    return (
      <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 animate-bounce">
        <div className="flex items-center gap-2 rounded-2xl bg-emerald-600 text-white px-4 py-2 text-xs font-bold shadow-xl border border-emerald-400">
          <Wifi className="w-4 h-4" />
          <span>
            {syncState.isSyncing
              ? `Back online — Syncing ${syncState.pendingCount} offline change(s)...`
              : 'Back online — Menus & offline data synchronized'}
          </span>
        </div>
      </div>
    );
  }

  // Offline banner
  if (!isOnline) {
    return (
      <div className="bg-amber-600 text-white px-4 py-2 text-xs font-medium flex items-center justify-between gap-3 shadow-sm sticky top-0 z-40">
        <div className="flex items-center justify-between gap-2 max-w-5xl mx-auto w-full">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex items-center gap-1.5 shrink-0 font-black">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              <WifiOff className="w-3.5 h-3.5" />
              <span>Offline Mode:</span>
            </div>
            <span className="text-amber-50 truncate text-[11px] sm:text-xs">
              Using cached cafeteria menus, budget matcher, offline QR scanner & local storage.
            </span>
          </div>
          {syncState.pendingCount > 0 && (
            <span className="shrink-0 px-2 py-0.5 rounded-full bg-stone-900/80 text-amber-200 text-[10px] font-black">
              {syncState.pendingCount} pending sync
            </span>
          )}
        </div>
      </div>
    );
  }

  // Online + Actively syncing or pending offline changes
  if (syncState.isSyncing || syncState.pendingCount > 0) {
    return (
      <div className="bg-sky-600 text-white px-4 py-1.5 text-xs font-medium flex items-center justify-center gap-3 shadow-sm sticky top-0 z-40">
        <div className="flex items-center justify-between gap-3 max-w-5xl mx-auto w-full">
          <div className="flex items-center gap-2">
            {syncState.isSyncing ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CloudUpload className="w-3.5 h-3.5" />
            )}
            <span className="font-bold">
              {syncState.isSyncing
                ? `Syncing ${syncState.pendingCount} offline change(s) to server...`
                : `${syncState.pendingCount} offline change(s) ready to sync${syncState.lastError ? ` (${syncState.lastError})` : ''}`}
            </span>
          </div>
          {!syncState.isSyncing && (
            <button
              type="button"
              onClick={() => syncManager.flushSyncQueue()}
              className="px-2.5 py-0.5 rounded-lg bg-white text-sky-700 font-black text-[11px] hover:bg-sky-50 transition"
            >
              Sync Now
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
};
