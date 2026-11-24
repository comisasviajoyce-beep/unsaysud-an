import {
  DishItem,
  StallOwnerAccount,
  StallAnalyticsData,
  MenuVersionSnapshot,
  UserSubscription,
  PaymentRecord,
  AdminPaymentSettings,
  AppNotification,
  AuditLogEntry,
  AdminSubscriptionSummary,
  SalesRecord,
  SalesItemEntry,
  SalesDashboardMetrics,
  SalesDateFilter,
  SubscriptionStatusResponse,
  TrialStatus,
  AdminMerchantRecord,
  AdminPlatformOverview,
  WebsiteVisitorAnalyticsData
} from '../types';
import { initialMenuDatabase, initialStallNotices, stallCredentials } from '../data/initialData';
import { getKv, setKv } from '../utils/offlineDb';

export interface MenuResponse {
  items: DishItem[];
  notices: Record<string, string>;
  stalls: {
    name: string;
    stallNo?: string;
    officialName?: string;
    zone: 'outside' | 'inside';
    hasRegisteredOwner?: boolean;
  }[];
  version?: number;
  fromOfflineCache?: boolean;
}

function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const method = (init.method || 'GET').toUpperCase();
  const headers = new Headers(init.headers || {});
  if (method !== 'GET' && method !== 'HEAD') {
    headers.set('X-Requested-With', 'XMLHttpRequest');
  }
  return fetch(input, {
    ...init,
    credentials: 'same-origin',
    headers
  });
}

export async function fetchMenuData(
  role?: 'customer' | 'merchant' | 'admin',
  stallName?: string
): Promise<MenuResponse> {
  const cacheKey = `menu_cache_${role || 'customer'}_${stallName || 'all'}`;
  try {
    const params = new URLSearchParams();
    if (role) params.set('role', role);
    if (stallName) params.set('stall', stallName);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await apiFetch(`/api/menu${qs}`);
    if (!res.ok) throw new Error('Failed to fetch from server');
    const data: MenuResponse = await res.json();
    await setKv(cacheKey, data);
    if (!role || role === 'customer') {
      await setKv('menu_cache_customer_all', data);
    }
    return data;
  } catch (err) {
    console.warn('API offline fallback to IndexedDB cache:', err);
    const cached =
      (await getKv<MenuResponse>(cacheKey)) ||
      (await getKv<MenuResponse>('menu_cache_customer_all'));
    if (cached && Array.isArray(cached.items)) {
      return { ...cached, fromOfflineCache: true };
    }
    try {
      const saved = localStorage.getItem('unsay_sudan_menu_database');
      if (saved) {
        return {
          items: JSON.parse(saved),
          notices: initialStallNotices,
          stalls: stallCredentials.map((s) => ({
            name: s.name,
            stallNo: s.stallNo,
            officialName: s.officialName,
            zone: s.zone
          })),
          fromOfflineCache: true
        };
      }
    } catch {}
    return {
      items: initialMenuDatabase,
      notices: initialStallNotices,
      stalls: stallCredentials.map((s) => ({
        name: s.name,
        stallNo: s.stallNo,
        officialName: s.officialName,
        zone: s.zone
      })),
      fromOfflineCache: true
    };
  }
}

export async function checkMenuVersionAPI(): Promise<number | null> {
  try {
    const res = await apiFetch('/api/menu/version');
    if (!res.ok) return null;
    const data = await res.json();
    return data.version || null;
  } catch {
    return null;
  }
}

export async function saveItemPhotoAPI(
  dishId: number,
  stallName: string,
  dataUrl: string | null,
  remove = false
): Promise<{ success: boolean; item?: DishItem; imageUrl?: string; error?: string; message?: string }> {
  try {
    const res = await apiFetch(`/api/menu/${dishId}/photo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stall: stallName,
        dataUrl,
        remove
      })
    });
    const result = await res.json();
    if (!res.ok) {
      return { success: false, error: result.error || 'Photo upload failed. Your previous photo was kept.' };
    }
    return {
      success: true,
      item: result.item,
      imageUrl: result.imageUrl,
      message: result.message
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "We couldn't save the new photo. Please try again."
    };
  }
}

export async function updateMenuItemAPI(
  dishId: number,
  stallName: string,
  updates: Partial<DishItem>
): Promise<{ success: boolean; item?: DishItem; error?: string; subscriptionExpired?: boolean; status?: number; networkError?: boolean }> {
  try {
    const res = await apiFetch(`/api/menu/${dishId}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stall: stallName, updates })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        success: false,
        error: data.error || 'Failed to update menu item',
        subscriptionExpired: Boolean(data.subscriptionExpired),
        status: res.status
      };
    }
    return { success: true, item: data.item };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Failed to update menu item',
      networkError: true
    };
  }
}

export async function syncRestoredPhotosAPI(
  photos: { id: number; stall: string; imageUrl: string }[]
): Promise<{ success: boolean; updatedCount?: number }> {
  try {
    const res = await apiFetch('/api/menu/sync-photos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photos })
    });
    if (!res.ok) return { success: false };
    return await res.json();
  } catch (err) {
    console.warn('Failed to sync restored photos:', err);
    return { success: false };
  }
}

export async function addMenuItemAPI(
  stallName: string,
  item: Omit<DishItem, 'id' | 'clicks'>
): Promise<{ success: boolean; item?: DishItem; error?: string; subscriptionExpired?: boolean; status?: number; networkError?: boolean }> {
  try {
    const res = await apiFetch('/api/menu/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stall: stallName, item })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        success: false,
        error: data.error || 'Failed to create menu item',
        subscriptionExpired: Boolean(data.subscriptionExpired),
        status: res.status
      };
    }
    return { success: true, item: data.item };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Failed to create menu item',
      networkError: true
    };
  }
}

export interface ApiMutationResult {
  success: boolean;
  item?: DishItem;
  error?: string;
  subscriptionExpired?: boolean;
  status?: number;
  networkError?: boolean;
}

export async function toggleItemStockAPI(id: number, stallName: string): Promise<ApiMutationResult> {
  try {
    const res = await apiFetch(`/api/menu/${id}/toggle-stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stall: stallName })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        success: false,
        error: data.error || 'Failed to update stock availability',
        subscriptionExpired: Boolean(data.subscriptionExpired),
        status: res.status
      };
    }
    return { success: true, item: data.item };
  } catch (err: any) {
    console.warn('Failed to update stock via API:', err);
    return {
      success: false,
      error: err?.message || 'Network unavailable',
      networkError: true
    };
  }
}

export async function updateItemPriceAPI(id: number, delta: number, stallName: string): Promise<ApiMutationResult> {
  try {
    const res = await apiFetch(`/api/menu/${id}/price`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delta, stall: stallName })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        success: false,
        error: data.error || 'Failed to update item price',
        subscriptionExpired: Boolean(data.subscriptionExpired),
        status: res.status
      };
    }
    return { success: true, item: data.item };
  } catch (err: any) {
    console.warn('Failed to update price via API:', err);
    return {
      success: false,
      error: err?.message || 'Network unavailable',
      networkError: true
    };
  }
}

export async function saveStallNoticeAPI(stallName: string, notice: string): Promise<ApiMutationResult> {
  try {
    const res = await apiFetch('/api/stalls/notice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stall: stallName, notice })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        success: false,
        error: data.error || 'Failed to update stall notice',
        subscriptionExpired: Boolean(data.subscriptionExpired),
        status: res.status
      };
    }
    return { success: true };
  } catch (err: any) {
    console.warn('Failed to save notice via API:', err);
    return {
      success: false,
      error: err?.message || 'Network unavailable',
      networkError: true
    };
  }
}

export async function recordItemClickAPI(id: number): Promise<void> {
  try {
    await apiFetch(`/api/menu/${id}/click`, { method: 'POST' });
  } catch {
    // Non-blocking fire and forget
  }
}

export async function verifyStallLoginAPI(
  stall: string,
  pin: string
): Promise<{ success: boolean; owner?: StallOwnerAccount; error?: string }> {
  try {
    const res = await apiFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stall, pin })
    });
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error || 'Login failed' };
    return { success: true, owner: data.owner };
  } catch {
    return { success: false, error: 'Unable to verify credentials while offline.' };
  }
}

// ============================================================================
// STALL OWNER SESSION & AUTHENTICATION SERVICES
// ============================================================================

export async function fetchAuthSessionAPI(): Promise<{
  success: boolean;
  merchant: StallOwnerAccount | null;
  admin: { id: string; username: string; name: string; email: string } | null;
  superAdminRegistered: boolean;
}> {
  try {
    const res = await apiFetch('/api/auth/session');
    if (!res.ok) throw new Error('Failed to check session');
    const data = await res.json();
    await setKv('last_session_snapshot', {
      merchant: data.merchant || null,
      admin: data.admin || null,
      superAdminRegistered: Boolean(data.superAdminRegistered)
    });
    return {
      success: true,
      merchant: data.merchant || null,
      admin: data.admin || null,
      superAdminRegistered: Boolean(data.superAdminRegistered)
    };
  } catch {
    const cached = await getKv<{
      merchant: StallOwnerAccount | null;
      admin: { id: string; username: string; name: string; email: string } | null;
      superAdminRegistered: boolean;
    }>('last_session_snapshot');
    return {
      success: false,
      merchant: cached?.merchant || null,
      admin: cached?.admin || null,
      superAdminRegistered: Boolean(cached?.superAdminRegistered)
    };
  }
}

export async function logoutMerchantAPI(): Promise<void> {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  } catch {}
  const cached = await getKv<any>('last_session_snapshot');
  if (cached) {
    await setKv('last_session_snapshot', { ...cached, merchant: null });
  }
}

export async function registerStallOwnerAPI(data: {
  stallNo?: string;
  stallName: string;
  zone?: 'outside' | 'inside';
  ownerName: string;
  username: string;
  email: string;
  contactNumber?: string;
  password: string;
  pin?: string;
}): Promise<{ success: boolean; owner?: StallOwnerAccount; error?: string }> {
  try {
    const res = await apiFetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (!res.ok) {
      return { success: false, error: result.error || 'Registration failed.' };
    }
    return { success: true, owner: result.owner };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error during registration.' };
  }
}

export async function loginStallOwnerAPI(credentials: {
  identifier?: string;
  password?: string;
  stall?: string;
  pin?: string;
}): Promise<{ success: boolean; owner?: StallOwnerAccount; error?: string }> {
  try {
    const res = await apiFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    });
    const result = await res.json();
    if (!res.ok) {
      return { success: false, error: result.error || 'Login failed.' };
    }
    return { success: true, owner: result.owner };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error during login. Please reconnect to authenticate.' };
  }
}

export async function forgotPasswordAPI(data: {
  stallName: string;
  pin: string;
  newPassword: string;
}): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const res = await apiFetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (!res.ok) {
      return { success: false, error: result.error || 'Password reset failed.' };
    }
    return { success: true, message: result.message };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error during password reset.' };
  }
}

export async function updateProfileAPI(data: {
  stallName: string;
  currentPin?: string;
  currentPassword?: string;
  newOwnerName?: string;
  newContactNumber?: string;
  newPassword?: string;
  newPin?: string;
}): Promise<{ success: boolean; owner?: StallOwnerAccount; message?: string; error?: string }> {
  try {
    const res = await apiFetch('/api/auth/update-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (!res.ok) {
      return { success: false, error: result.error || 'Failed to update account settings.' };
    }
    return { success: true, owner: result.owner, message: result.message };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error during update.' };
  }
}

// ============================================================================
// REAL STALL VISITOR & MENU ITEM ANALYTICS SERVICES
// ============================================================================

export async function recordStallViewAPI(stallName: string, visitorId: string): Promise<boolean> {
  try {
    const res = await apiFetch('/api/analytics/stall-view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stallName, visitorId })
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function recordItemViewAPI(
  stallName: string,
  dishId: number,
  dishName: string,
  visitorId: string
): Promise<boolean> {
  try {
    const res = await apiFetch('/api/analytics/item-view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stallName, dishId, dishName, visitorId })
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function recordSiteVisitAPI(payload: {
  visitorId: string;
  sessionId: string;
  page: string;
  deviceType: 'Mobile' | 'Tablet' | 'Desktop';
  qrSource?: 'deeplink' | 'scanner' | null;
  qrStall?: string | null;
  isHeartbeat?: boolean;
}): Promise<boolean> {
  try {
    const res = await apiFetch('/api/analytics/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchStallAnalyticsAPI(stallName: string, period = '7days'): Promise<StallAnalyticsData | null> {
  const cacheKey = `analytics_cache_${stallName}_${period}`;
  try {
    const res = await apiFetch(`/api/analytics/${encodeURIComponent(stallName)}?period=${period}`);
    if (!res.ok) throw new Error('Failed to fetch analytics');
    const data: StallAnalyticsData = await res.json();
    await setKv(cacheKey, data);
    return data;
  } catch (err) {
    const cached = await getKv<StallAnalyticsData>(cacheKey);
    if (cached) return cached;
    console.warn('Analytics fetch error:', err);
    return null;
  }
}

// ============================================================================
// PERMANENT OWNER IMAGE PROTECTION & SAFE MENU MANAGEMENT
// ============================================================================

export async function deleteMenuItemSafelyAPI(
  dishId: number,
  stallName: string,
  deleteImagePermanently = false
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const res = await apiFetch(`/api/menu/${dishId}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stall: stallName, deleteImagePermanently })
    });
    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || 'Failed to remove menu item' };
    }
    return { success: true, message: data.message };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to remove menu item' };
  }
}

export async function fetchStallPhotoVaultAPI(
  stallName: string
): Promise<{ success: boolean; protectedImages?: any[]; archivedDishes?: any[]; error?: string }> {
  try {
    const res = await apiFetch(`/api/menu/photo-vault/${encodeURIComponent(stallName)}`);
    if (!res.ok) throw new Error('Failed to fetch photo vault');
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to fetch stall photo vault' };
  }
}

export async function restoreArchivedDishAPI(
  archiveId: string,
  stallName: string
): Promise<{ success: boolean; item?: DishItem; error?: string }> {
  try {
    const res = await apiFetch('/api/menu/restore-dish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archiveId, stall: stallName })
    });
    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || 'Failed to restore archived dish' };
    }
    return { success: true, item: data.item };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to restore archived dish' };
  }
}

// ============================================================================
// PERMANENT BATCH SAVE, VERSION HISTORY & RESTORES
// ============================================================================

export async function saveMenuBatchAPI(
  stallName: string,
  items: DishItem[],
  deletedItemIds?: number[],
  summary?: string
): Promise<{ success: boolean; items?: DishItem[]; snapshot?: MenuVersionSnapshot; message?: string; error?: string }> {
  try {
    const res = await apiFetch('/api/menu/save-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stall: stallName,
        items,
        deletedItemIds,
        summary
      })
    });
    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || 'Failed to save menu changes' };
    }
    return {
      success: true,
      items: data.items,
      snapshot: data.snapshot,
      message: data.message || 'Changes saved successfully.'
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error saving menu changes' };
  }
}

export async function fetchMenuVersionsAPI(
  stallName: string
): Promise<{ success: boolean; versions?: MenuVersionSnapshot[]; error?: string }> {
  try {
    const res = await apiFetch(`/api/menu/versions/${encodeURIComponent(stallName)}`);
    if (!res.ok) throw new Error('Failed to fetch versions');
    const data = await res.json();
    return { success: true, versions: data.versions };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to fetch version history' };
  }
}

export async function restoreMenuVersionAPI(
  stallName: string,
  versionId: string
): Promise<{ success: boolean; items?: DishItem[]; snapshot?: MenuVersionSnapshot; message?: string; error?: string }> {
  try {
    const res = await apiFetch('/api/menu/versions/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stall: stallName, versionId })
    });
    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || 'Failed to restore menu version' };
    }
    return {
      success: true,
      items: data.items,
      snapshot: data.snapshot,
      message: data.message || 'Version restored successfully.'
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error restoring version' };
  }
}

// ============================================================================
// SUBSCRIPTION, PAYMENT & SINGLE SUPER ADMIN API METHODS
// ============================================================================

export async function fetchSubscriptionSettingsAPI(): Promise<{
  success: boolean;
  settings?: AdminPaymentSettings;
  error?: string;
}> {
  try {
    const res = await apiFetch('/api/subscription/settings');
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error || 'Failed to fetch settings' };
    await setKv('sub_settings_cache', data.settings);
    return { success: true, settings: data.settings };
  } catch (err: any) {
    const cached = await getKv<AdminPaymentSettings>('sub_settings_cache');
    if (cached) return { success: true, settings: cached };
    return { success: false, error: err.message || 'Failed to connect to server' };
  }
}

export async function fetchSubscriptionStatusAPI(stallName: string): Promise<SubscriptionStatusResponse> {
  const cacheKey = `sub_status_cache_${stallName}`;
  try {
    const res = await apiFetch(`/api/subscription/status/${encodeURIComponent(stallName)}`);
    const data = await res.json();
    if (!res.ok) {
      return {
        hasSubscription: false,
        status: 'None',
        trialStatus: 'Not Started',
        isTrial: false,
        isSubscribed: false,
        isExpired: true,
        daysRemaining: 0,
        serverTime: new Date().toISOString(),
        error: data.error
      };
    }
    await setKv(cacheKey, data);
    return data;
  } catch (err: any) {
    const cached = await getKv<SubscriptionStatusResponse>(cacheKey);
    if (cached) return cached;
    return {
      hasSubscription: false,
      status: 'None',
      trialStatus: 'Not Started',
      isTrial: false,
      isSubscribed: false,
      isExpired: true,
      daysRemaining: 0,
      serverTime: new Date().toISOString(),
      error: err.message || 'Failed to get subscription status'
    };
  }
}

export async function startFreeTrialAPI(stallName: string): Promise<{
  success: boolean;
  message?: string;
  trialStatus?: TrialStatus;
  trialStartDate?: string;
  trialEndDate?: string;
  trialDaysRemaining?: number;
  serverTime?: string;
  error?: string;
}> {
  try {
    const res = await apiFetch('/api/subscription/start-trial', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stallName })
    });
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error || 'Failed to start free trial' };
    return data;
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error starting trial' };
  }
}

export async function submitSubscriptionPaymentAPI(paymentData: {
  stallName: string;
  ownerId?: string;
  ownerName?: string;
  plan: 'weekly' | 'monthly';
  amount: number;
  paymentMethod: 'gcash' | 'bank' | 'qr';
  referenceNumber: string;
  paymentDate: string;
  proofImageDataUrl: string;
  notes?: string;
}): Promise<{ success: boolean; message?: string; payment?: PaymentRecord; error?: string }> {
  try {
    const res = await apiFetch('/api/subscription/submit-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(paymentData)
    });
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error || 'Payment submission failed' };
    return data;
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to submit payment' };
  }
}

export async function fetchStallPaymentsAPI(stallName: string): Promise<{
  success: boolean;
  payments?: PaymentRecord[];
  error?: string;
}> {
  try {
    const res = await apiFetch(`/api/subscription/payments/${encodeURIComponent(stallName)}`);
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error };
    return { success: true, payments: data.payments || [] };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function fetchNotificationsAPI(recipientId: string): Promise<{
  success: boolean;
  notifications?: AppNotification[];
  unreadCount?: number;
  error?: string;
}> {
  try {
    const res = await apiFetch(`/api/notifications/${encodeURIComponent(recipientId)}`);
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error };
    return {
      success: true,
      notifications: data.notifications || [],
      unreadCount: data.unreadCount || 0
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function markNotificationsReadAPI(
  recipientId: string,
  notificationId?: string,
  markAll = false
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await apiFetch('/api/notifications/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientId, notificationId, markAll })
    });
    const data = await res.json();
    return { success: data.success };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function fetchAdminStatusAPI(): Promise<{
  success: boolean;
  isRegistered: boolean;
  admin?: { id: string; username: string; name: string; email: string } | null;
  error?: string;
}> {
  try {
    const res = await apiFetch('/api/admin/status');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        success: false,
        isRegistered: false,
        admin: null,
        error: data.error || `Unable to verify Super Admin registration status (HTTP ${res.status}).`
      };
    }
    return {
      success: true,
      isRegistered: Boolean(data.isRegistered),
      admin: data.admin || null
    };
  } catch (err: any) {
    return {
      success: false,
      isRegistered: false,
      admin: null,
      error: err?.message || 'Unable to verify Super Admin registration status.'
    };
  }
}

export async function adminRegisterAPI(payload: {
  name: string;
  username: string;
  email: string;
  password: string;
  pin?: string;
}): Promise<{ success: boolean; message?: string; admin?: { username: string; name: string; email: string }; error?: string }> {
  try {
    const res = await apiFetch('/api/admin/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error || 'Super Admin registration failed' };
    return { success: true, message: data.message, admin: data.admin };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error during Super Admin registration' };
  }
}

export async function adminLoginAPI(credentials: {
  identifier?: string;
  password?: string;
  pin?: string;
}): Promise<{ success: boolean; admin?: { id: string; username: string; name: string; email: string }; error?: string }> {
  try {
    const res = await apiFetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    });
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error || 'Admin login failed' };
    return { success: true, admin: data.admin };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error during admin login' };
  }
}

export async function adminLogoutAPI(): Promise<void> {
  try {
    await apiFetch('/api/admin/logout', { method: 'POST' });
  } catch {}
  const cached = await getKv<any>('last_session_snapshot');
  if (cached) {
    await setKv('last_session_snapshot', { ...cached, admin: null });
  }
}

export async function fetchAdminSummaryAPI(): Promise<{
  success: boolean;
  summary?: AdminSubscriptionSummary;
  subscriptions?: UserSubscription[];
  recentPayments?: PaymentRecord[];
  settings?: AdminPaymentSettings;
  error?: string;
}> {
  try {
    const res = await apiFetch('/api/admin/summary');
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error };
    return data;
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function fetchAdminMerchantsAPI(): Promise<{
  success: boolean;
  merchants?: AdminMerchantRecord[];
  error?: string;
}> {
  try {
    const res = await apiFetch('/api/admin/merchants');
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error || 'Failed to load registered merchants' };
    return { success: true, merchants: data.merchants || [] };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function adminUpdateMerchantStatusAPI(
  merchantId: string,
  accountStatus: 'active' | 'suspended',
  reason?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const res = await apiFetch(`/api/admin/merchants/${encodeURIComponent(merchantId)}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: accountStatus, accountStatus, reason })
    });
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error || 'Failed to update merchant status' };
    return data;
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function fetchAdminVisitorAnalyticsAPI(): Promise<{
  success: boolean;
  analytics?: WebsiteVisitorAnalyticsData;
  error?: string;
}> {
  try {
    const res = await apiFetch('/api/admin/visitor-analytics');
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error || 'Failed to load visitor analytics' };
    return { success: true, analytics: data.analytics };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error loading visitor analytics' };
  }
}

export async function fetchAdminPlatformOverviewAPI(): Promise<{
  success: boolean;
  overview?: AdminPlatformOverview;
  error?: string;
}> {
  try {
    const res = await apiFetch('/api/admin/platform-overview');
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error || 'Failed to load platform overview' };
    return { success: true, overview: data.overview };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error loading platform overview' };
  }
}

export async function adminVerifyPaymentAPI(
  paymentId: string,
  action: 'approve' | 'reject',
  rejectionReason?: string,
  adminUsername?: string
): Promise<{ success: boolean; message?: string; payment?: PaymentRecord; subscription?: UserSubscription; error?: string }> {
  try {
    const res = await apiFetch(`/api/admin/payments/${paymentId}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, rejectionReason, adminUsername })
    });
    const responseText = await res.text();
    let data: any;
    try {
      data = responseText ? JSON.parse(responseText) : {};
    } catch {
      const preview = responseText.slice(0, 180).replace(/\\s+/g, ' ').trim();
      return {
        success: false,
        error: `Admin verification API returned non-JSON (HTTP ${res.status}). ${preview || 'Empty response'}`
      };
    }
    if (!res.ok) return { success: false, error: data.error || `Verification failed (HTTP ${res.status})` };
    return data;
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function adminManualAccessAPI(params: {
  stallName: string;
  action: 'grant' | 'renew' | 'suspend' | 'revoke';
  durationDays?: number;
  reason?: string;
  adminUsername?: string;
}): Promise<{ success: boolean; message?: string; subscription?: UserSubscription; error?: string }> {
  try {
    const res = await apiFetch('/api/admin/manual-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error || 'Manual access update failed' };
    return data;
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function adminUpdateSettingsAPI(
  settings: Partial<AdminPaymentSettings>,
  adminUsername?: string
): Promise<{ success: boolean; message?: string; settings?: AdminPaymentSettings; error?: string }> {
  try {
    const res = await apiFetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...settings, adminUsername })
    });
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error || 'Failed to update settings' };
    return data;
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function adminUploadQRCodeAPI(
  dataUrl: string,
  adminUsername?: string
): Promise<{ success: boolean; imageUrl?: string; message?: string; error?: string }> {
  try {
    const res = await apiFetch('/api/admin/qr-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataUrl, adminUsername })
    });
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error || 'Failed to upload QR code' };
    return data;
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function fetchAdminAuditLogsAPI(): Promise<{
  success: boolean;
  logs?: AuditLogEntry[];
  error?: string;
}> {
  try {
    const res = await apiFetch('/api/admin/audit-logs');
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error };
    return { success: true, logs: data.logs || [] };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ============================================================================
// SMART SALES TRACKER CLIENT API FUNCTIONS
// ============================================================================

export interface FetchSalesResponse {
  success: boolean;
  stallName?: string;
  records: SalesRecord[];
  totalCount?: number;
  metrics?: SalesDashboardMetrics;
  error?: string;
  fromOfflineCache?: boolean;
}

export async function fetchStallSalesAPI(
  stallName: string,
  filter: SalesDateFilter = 'all',
  startDate?: string,
  endDate?: string,
  recordType?: 'all' | 'daily_summary' | 'itemized'
): Promise<FetchSalesResponse> {
  const cacheKey = `sales_cache_${stallName}_${filter}_${recordType || 'all'}`;
  try {
    const params = new URLSearchParams();
    if (filter) params.set('filter', filter);
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (recordType && recordType !== 'all') params.set('recordType', recordType);

    const res = await apiFetch(`/api/sales/${encodeURIComponent(stallName)}?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to fetch sales records');
    }
    const result: FetchSalesResponse = {
      success: true,
      stallName: data.stallName,
      records: data.records || [],
      totalCount: data.totalCount || 0,
      metrics: data.metrics
    };
    await setKv(cacheKey, result);
    if (filter === 'all' || filter === 'this_week') {
      await setKv(`sales_cache_${stallName}_latest`, result);
    }
    return result;
  } catch (err: any) {
    const cached =
      (await getKv<FetchSalesResponse>(cacheKey)) ||
      (await getKv<FetchSalesResponse>(`sales_cache_${stallName}_latest`));
    if (cached) {
      return { ...cached, fromOfflineCache: true };
    }
    console.warn('Error fetching stall sales:', err);
    return {
      success: false,
      records: [],
      error: err.message || 'Failed to load sales records'
    };
  }
}

export interface SaveSalesRecordResult {
  success: boolean;
  record?: SalesRecord;
  duplicate?: boolean;
  existingId?: string;
  message?: string;
  error?: string;
  queuedOffline?: boolean;
}

export async function saveSalesRecordAPI(payload: {
  stallName: string;
  recordType: 'daily_summary' | 'itemized';
  date: string;
  totalSales: number;
  totalExpenses: number;
  notes?: string;
  items?: SalesItemEntry[];
  overrideDuplicate?: boolean;
  clientMutationId?: string;
}): Promise<SaveSalesRecordResult> {
  try {
    const res = await apiFetch('/api/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      return {
        success: false,
        duplicate: data.duplicate,
        existingId: data.existingId,
        message: data.message,
        error: data.error || 'Failed to save sales record'
      };
    }
    return {
      success: true,
      record: data.record,
      message: data.message
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Network error saving sales record'
    };
  }
}

export async function updateSalesRecordAPI(
  id: string,
  updates: Partial<SalesRecord>
): Promise<{ success: boolean; record?: SalesRecord; message?: string; error?: string }> {
  try {
    const res = await apiFetch(`/api/sales/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || 'Failed to update record' };
    }
    return { success: true, record: data.record, message: data.message };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error updating record' };
  }
}

export async function deleteSalesRecordAPI(
  id: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const res = await apiFetch(`/api/sales/${id}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || 'Failed to delete record' };
    }
    return { success: true, message: data.message };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error deleting record' };
  }
}
