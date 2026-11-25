import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Language, 
  ZoneFilter, 
  CategoryFilter,
  SortOption, 
  DishItem, 
  TrayItem, 
  StallCredential,
  StallOwnerAccount,
  AppPage,
  AppNotification
} from './types';
import { 
  translations, 
  initialMenuDatabase, 
  initialStallNotices, 
  stallCredentials 
} from './data/initialData';
import { 
  fetchMenuData, 
  checkMenuVersionAPI,
  toggleItemStockAPI, 
  updateItemPriceAPI, 
  updateMenuItemAPI,
  saveStallNoticeAPI, 
  recordItemClickAPI,
  recordStallViewAPI,
  recordItemViewAPI,
  recordSiteVisitAPI,
  syncRestoredPhotosAPI,
  deleteMenuItemSafelyAPI,
  restoreArchivedDishAPI,
  fetchNotificationsAPI,
  markNotificationsReadAPI,
  fetchAuthSessionAPI,
  logoutMerchantAPI,
  adminLogoutAPI
} from './services/api';
import { syncManager } from './services/syncManager';
import { getKv, setKv } from './utils/offlineDb';
import { getAnonymousVisitorId } from './utils/visitorId';
import { getDishDisplayImage } from './utils/imageHelper';

function getAnalyticsSessionId(): string {
  const key = 'unsay_sudan_tab_session_id';
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const generated = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    sessionStorage.setItem(key, generated);
    return generated;
  } catch {
    return `sess_${Date.now()}`;
  }
}

function detectVisitorDeviceType(): 'Mobile' | 'Tablet' | 'Desktop' {
  if (typeof navigator === 'undefined') return 'Desktop';
  const ua = navigator.userAgent || '';
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) {
    return 'Tablet';
  }
  if (/Mobi|Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    return 'Mobile';
  }
  if (typeof window !== 'undefined' && window.innerWidth < 768) {
    return 'Mobile';
  }
  return 'Desktop';
}

// ============================================================================
// Stall Owner Image Preservation Vault (Multi-layer Safety & Self-Healing)
// ============================================================================
const OWNER_IMAGE_VAULT_KEY = 'unsay_sudan_owner_image_vault';

interface VaultEntry {
  id: number;
  stall: string;
  name: string;
  imageUrl: string;
  updatedAt: number;
}

export function getOwnerImageVault(): Record<string, VaultEntry> {
  try {
    const raw = localStorage.getItem(OWNER_IMAGE_VAULT_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveToOwnerImageVault(id: number, stall: string, name: string, imageUrl: string) {
  if (!imageUrl) return;
  // CRITICAL: Do NOT store representative demo images in the Owner Image Vault!
  if (imageUrl.includes('representative')) return;
  try {
    const vault = getOwnerImageVault();
    const entry: VaultEntry = { id, stall, name, imageUrl, updatedAt: Date.now() };
    vault[`id_${id}`] = entry;
    vault[`stall_name_${stall}_${name.toLowerCase()}`] = entry;
    localStorage.setItem(OWNER_IMAGE_VAULT_KEY, JSON.stringify(vault));
  } catch (err) {
    console.warn('Could not save to image vault:', err);
  }
}

export function removeFromOwnerImageVault(id: number, stall: string, name: string) {
  try {
    const vault = getOwnerImageVault();
    delete vault[`id_${id}`];
    delete vault[`stall_name_${stall}_${name.toLowerCase()}`];
    localStorage.setItem(OWNER_IMAGE_VAULT_KEY, JSON.stringify(vault));
  } catch {}
}

// Components
import { Header } from './components/Header';
import { BudgetSummaryBar } from './components/BudgetSummaryBar';
import { BottomNavBar } from './components/BottomNavBar';
import { MealDetailModal } from './components/MealDetailModal';
import { RouletteModal } from './components/RouletteModal';
import { MerchantAuthModal } from './components/MerchantAuthModal';
import { MerchantDashboard } from './components/MerchantDashboard';
import { OnboardingModal } from './components/OnboardingModal';
import { Toast } from './components/Toast';
import { SubscriptionPaywall } from './components/SubscriptionPaywall';
import { AdminSubscriptionDashboard } from './components/AdminSubscriptionDashboard';
import { NotificationPanel } from './components/NotificationPanel';
import { OfflineIndicator } from './components/OfflineIndicator';
import { QRScannerModal, resolveStallFromQrPayload } from './components/QRScannerModal';
import { StallQRModal } from './components/StallQRModal';

// Pages
import { HomePage } from './components/pages/HomePage';
import { ExplorePage } from './components/pages/ExplorePage';
import { StallsPage } from './components/pages/StallsPage';
import { TrayPage } from './components/pages/TrayPage';
import { OrdersPage } from './components/pages/OrdersPage';
import { HelpPage } from './components/pages/HelpPage';
import { StallPortalPage } from './components/pages/StallPortalPage';
import { FloatingFoodBackground } from './components/FoodDoodles';

export default function App() {
  // Page Navigation State (Separated multi-page architecture)
  const [currentPage, setCurrentPage] = useState<AppPage>('home');

  // Localization
  const [currentLang, setCurrentLang] = useState<Language>('bisaya');
  const t = translations[currentLang];

  // Core Budget State
  const [userBudget, setUserBudget] = useState<number>(50);

  // Filters State for Explore page
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentZone, setCurrentZone] = useState<ZoneFilter>('all');
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('All');
  const [currentSort, setCurrentSort] = useState<SortOption>('best-value');
  const [selectedStall, setSelectedStall] = useState<string | null>(null);
  const [withinBudgetOnly, setWithinBudgetOnly] = useState(true);
  const [availableOnly, setAvailableOnly] = useState(false);

  // Database State (persist overrides & merchant additions in localStorage + Image Vault)
  const [menuItems, setMenuItems] = useState<DishItem[]>(() => {
    try {
      const vault = getOwnerImageVault();
      const saved = localStorage.getItem('unsay_sudan_menu_database');
      const baseList: DishItem[] = saved ? JSON.parse(saved) : initialMenuDatabase;

      // Harvest any genuine owner image already present in localStorage into the vault
      baseList.forEach(item => {
        if (item.ownerUploadedImage) {
          saveToOwnerImageVault(item.id, item.stall, item.name, item.ownerUploadedImage);
        } else if (item.imageUrl && !item.imageUrl.includes('representative')) {
          saveToOwnerImageVault(item.id, item.stall, item.name, item.imageUrl);
        }
      });

      // Merge initial representative images if baseList lacks representativeImage
      const initialMap = new Map<number, DishItem>();
      initialMenuDatabase.forEach(i => initialMap.set(i.id, i));

      return baseList.map(item => {
        const initial = initialMap.get(item.id);
        const vaultEntry = vault[`id_${item.id}`] || vault[`stall_name_${item.stall}_${item.name.toLowerCase()}`];
        const ownerImg = item.ownerUploadedImage || (vaultEntry?.imageUrl) || (item.imageUrl && !item.imageUrl.includes('representative') ? item.imageUrl : undefined);
        const repImg = item.representativeImage || initial?.representativeImage;

        return {
          ...item,
          ownerUploadedImage: ownerImg,
          representativeImage: repImg,
          imageUrl: ownerImg || repImg || item.imageUrl
        };
      });
    } catch {
      return initialMenuDatabase;
    }
  });
  const [stallNotices, setStallNotices] = useState<Record<string, string>>(initialStallNotices);
  const [stallsList, setStallsList] = useState<StallCredential[]>(stallCredentials);
  const [merchantMenuItems, setMerchantMenuItems] = useState<DishItem[]>([]);
  const [merchantMenuLoaded, setMerchantMenuLoaded] = useState(false);
  const [merchantOwner, setMerchantOwner] = useState<StallOwnerAccount | null>(null);
  const [isQRScannerOpen, setIsQRScannerOpen] = useState(false);
  const [qrModalStall, setQrModalStall] = useState<string | null>(null);
  const deepLinkHandledRef = useRef(false);
  const initialVisitRecordedRef = useRef(false);
  const lastTrackedPageRef = useRef<AppPage | null>(null);

  // Persist menu items to IndexedDB and localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem('unsay_sudan_menu_database', JSON.stringify(menuItems));
      setKv('menu_items_snapshot', menuItems);
    } catch (e) {
      console.error('Failed to save menu items', e);
    }
  }, [menuItems]);

  // User Tray State (persist in localStorage)
  const [myTray, setMyTray] = useState<TrayItem[]>(() => {
    try {
      const saved = localStorage.getItem('unsay_sudan_tray');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Student Favorites (persist in localStorage)
  const [favorites, setFavorites] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem('unsay_sudan_favorites');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Modal visibility
  const [isRouletteOpen, setIsRouletteOpen] = useState(false);
  const [activeDetailDish, setActiveDetailDish] = useState<DishItem | null>(null);
  const [isMerchantAuthOpen, setIsMerchantAuthOpen] = useState(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);

  // Authenticated Stall Owner Mode (verified via HttpOnly cookie session)
  const [authenticatedStall, setAuthenticatedStall] = useState<string | null>(null);

  // Authenticated Platform Administrator Session (verified strictly via server HttpOnly cookie, never localStorage)
  const [adminUser, setAdminUser] = useState<{ username: string; name: string } | null>(null);

  // Clean up any legacy client-side admin session artifact & hydrate server session + offline IndexedDB state
  useEffect(() => {
    try {
      localStorage.removeItem('unsay_sudan_admin_session');
    } catch {}

    let active = true;

    (async () => {
      // 1. Hydrate user preferences & offline snapshots from IndexedDB
      try {
        const [cachedBudget, cachedTray, cachedFavs, cachedNotices, cachedStalls] = await Promise.all([
          getKv<number>('user_budget'),
          getKv<TrayItem[]>('user_tray'),
          getKv<number[]>('user_favorites'),
          getKv<Record<string, string>>('stall_notices'),
          getKv<StallCredential[]>('stalls_list')
        ]);
        if (!active) return;
        if (typeof cachedBudget === 'number' && cachedBudget >= 10 && cachedBudget <= 500) {
          setUserBudget(cachedBudget);
        }
        if (Array.isArray(cachedTray) && cachedTray.length > 0 && myTray.length === 0) {
          setMyTray(cachedTray);
        }
        if (Array.isArray(cachedFavs) && cachedFavs.length > 0 && favorites.length === 0) {
          setFavorites(cachedFavs);
        }
        if (cachedNotices && typeof cachedNotices === 'object') {
          setStallNotices(cachedNotices);
        }
        if (Array.isArray(cachedStalls) && cachedStalls.length > 0) {
          setStallsList(cachedStalls);
        }
      } catch {}

      // 2. Verify active authenticated sessions from backend HttpOnly cookies
      const session = await fetchAuthSessionAPI();
      if (!active) return;
      if (session.merchant) {
        setAuthenticatedStall(session.merchant.stallName);
        setMerchantOwner(session.merchant);
      }
      if (session.admin) {
        setAdminUser(session.admin);
      }
    })();

    const unsubSync = syncManager.onSynced((count) => {
      showToast(`Synced ${count} offline change${count > 1 ? 's' : ''} to server!`);
      syncMenuRef.current?.(true);
    });

    return () => {
      active = false;
      unsubSync();
    };
  }, []);

  // Notifications State
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  // Periodic notification fetch
  useEffect(() => {
    let isMounted = true;
    const loadNotifs = async () => {
      const recipient = adminUser ? 'admin' : (authenticatedStall || 'all');
      const res = await fetchNotificationsAPI(recipient);
      if (isMounted && res.success && res.notifications) {
        setNotifications(res.notifications);
      }
    };

    loadNotifs();
    const interval = setInterval(loadNotifs, 5000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [adminUser, authenticatedStall]);

  // Toast Notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Disguised tap secret counter for merchant access
  const [secretTapCount, setSecretTapCount] = useState(0);
  const secretTapTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync menu ref for offline reconnect trigger
  const syncMenuRef = useRef<((force?: boolean) => void) | null>(null);

  // Initial Data Fetch & Real-time Live Synchronization with Server
  useEffect(() => {
    let isMounted = true;
    let lastKnownVersion: number | null = null;

    async function syncMenu(force = false) {
      try {
        if (!force && lastKnownVersion !== null) {
          const remoteVersion = await checkMenuVersionAPI();
          if (remoteVersion !== null && remoteVersion === lastKnownVersion) {
            return;
          }
        }

        const data = await fetchMenuData('customer');
        if (!isMounted) return;

        if (data.version) {
          lastKnownVersion = data.version;
        }

        if (Array.isArray(data.stalls)) {
          const baseMap = new Map(stallCredentials.map(s => [s.name, s]));
          const mergedStalls: StallCredential[] = data.stalls.map(srv => {
            const existing = baseMap.get(srv.name);
            return {
              name: srv.name,
              stallNo: srv.stallNo || existing?.stallNo,
              officialName: srv.officialName || existing?.officialName,
              zone: srv.zone || existing?.zone || 'inside',
              pin: '',
              hasRegisteredOwner: srv.hasRegisteredOwner,
              isActive: srv.isActive,
              isPubliclyVisible: srv.isActive,
              subscriptionStatus: srv.subscriptionStatus,
              trialStatus: srv.trialStatus,
              isTrial: srv.isTrial,
              isSubscribed: srv.isSubscribed
            };
          });
          setStallsList(mergedStalls);
          setKv('stalls_list', mergedStalls);
        }

        if (authenticatedStall) {
          const mData = await fetchMenuData('merchant', authenticatedStall);
          if (isMounted && Array.isArray(mData.items)) {
            setMerchantMenuItems(mData.items);
            setMerchantMenuLoaded(true);
          }
        } else if (isMounted) {
          setMerchantMenuLoaded(false);
          setMerchantMenuItems([]);
        }

        if (data.items && data.items.length > 0) {
          const vault = getOwnerImageVault();
          const restoredForBackend: { id: number; stall: string; imageUrl: string }[] = [];

          setMenuItems(prevItems => {
            const merged = data.items.map(serverItem => {
              const prev = prevItems.find(p => p.id === serverItem.id);
              const vaultEntry = vault[`id_${serverItem.id}`] || vault[`stall_name_${serverItem.stall}_${serverItem.name.toLowerCase()}`];

              let ownerImg = serverItem.ownerUploadedImage;
              let repImg = serverItem.representativeImage || (prev ? prev.representativeImage : undefined);

              // CRITICAL DATA-SAFETY RULE: NEVER drop an owner-uploaded photo!
              // If server currently lacks owner image, check local state or vault: PRESERVE!
              if (!ownerImg) {
                if (prev && prev.ownerUploadedImage) {
                  ownerImg = prev.ownerUploadedImage;
                } else if (vaultEntry && vaultEntry.imageUrl) {
                  ownerImg = vaultEntry.imageUrl;
                } else if (prev && prev.imageUrl && !prev.imageUrl.includes('representative')) {
                  ownerImg = prev.imageUrl;
                }

                if (ownerImg) {
                  restoredForBackend.push({
                    id: serverItem.id,
                    stall: serverItem.stall,
                    imageUrl: ownerImg
                  });
                }
              } else {
                saveToOwnerImageVault(serverItem.id, serverItem.stall, serverItem.name, ownerImg);
              }

              const finalImageUrl = ownerImg || repImg || serverItem.imageUrl;

              return {
                ...serverItem,
                ownerUploadedImage: ownerImg,
                representativeImage: repImg,
                imageUrl: finalImageUrl,
                hidden: serverItem.hidden !== undefined ? serverItem.hidden : (prev ? prev.hidden : false)
              };
            });

            return merged;
          });

          // Proactively push any restored images to backend database so it persists across refreshes
          if (restoredForBackend.length > 0) {
            syncRestoredPhotosAPI(restoredForBackend);
          }
        }
        if (data.notices) {
          setStallNotices(data.notices);
          setKv('stall_notices', data.notices);
        }
      } catch (err) {
        console.warn('Background menu sync error:', err);
      }
    }

    syncMenuRef.current = syncMenu;

    // Immediate initial load
    syncMenu(true);

    // Periodic live sync every 4 seconds to guarantee real-time updates across student/owner views
    const interval = setInterval(() => {
      syncMenu(false);
    }, 4000);

    // Immediate sync when tab/window gains focus
    const onFocus = () => syncMenu(false);
    window.addEventListener('focus', onFocus);

    return () => {
      syncMenuRef.current = null;
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [authenticatedStall]);

  // Handle ?stall=... QR deep links & initial website visitor analytics
  useEffect(() => {
    if (deepLinkHandledRef.current || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const stallParam = params.get('stall') || params.get('s');
    const visitorId = getAnonymousVisitorId();
    const sessionId = getAnalyticsSessionId();
    const deviceType = detectVisitorDeviceType();

    if (!stallParam) {
      deepLinkHandledRef.current = true;
      if (!initialVisitRecordedRef.current) {
        initialVisitRecordedRef.current = true;
        lastTrackedPageRef.current = currentPage;
        recordSiteVisitAPI({
          visitorId,
          sessionId,
          page: currentPage,
          deviceType
        });
      }
      return;
    }

    const matched = resolveStallFromQrPayload(stallParam, stallsList);
    if (matched) {
      deepLinkHandledRef.current = true;
      setSelectedStall(matched.name);
      setCurrentPage('stalls');
      recordStallViewAPI(matched.name, visitorId);
      if (!initialVisitRecordedRef.current) {
        initialVisitRecordedRef.current = true;
        lastTrackedPageRef.current = 'stalls';
        recordSiteVisitAPI({
          visitorId,
          sessionId,
          page: 'stalls',
          deviceType,
          qrSource: 'deeplink',
          qrStall: matched.name
        });
      }
      try {
        window.history.replaceState({}, '', window.location.pathname);
      } catch {}
    }
  }, [stallsList, currentPage]);

  // Track subsequent page navigation & periodic active visitor heartbeat
  useEffect(() => {
    if (!initialVisitRecordedRef.current) return;
    if (lastTrackedPageRef.current === currentPage) return;
    lastTrackedPageRef.current = currentPage;
    recordSiteVisitAPI({
      visitorId: getAnonymousVisitorId(),
      sessionId: getAnalyticsSessionId(),
      page: currentPage,
      deviceType: detectVisitorDeviceType()
    });
  }, [currentPage]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const heartbeatInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        recordSiteVisitAPI({
          visitorId: getAnonymousVisitorId(),
          sessionId: getAnalyticsSessionId(),
          page: lastTrackedPageRef.current || currentPage,
          deviceType: detectVisitorDeviceType(),
          isHeartbeat: true
        });
      }
    }, 45000);
    return () => clearInterval(heartbeatInterval);
  }, []);

  // Keep Active Dish Detail Modal in sync when item details or photo change
  useEffect(() => {
    if (activeDetailDish) {
      const current = menuItems.find(m => m.id === activeDetailDish.id);
      if (
        current && 
        (current.imageUrl !== activeDetailDish.imageUrl || 
         current.price !== activeDetailDish.price || 
         current.available !== activeDetailDish.available || 
         current.name !== activeDetailDish.name)
      ) {
        setActiveDetailDish(current);
      }
    }
  }, [menuItems, activeDetailDish]);

  // Check if first-time user for Onboarding Guide
  useEffect(() => {
    try {
      const hasCompleted = localStorage.getItem('unsay_sudan_onboarding_completed');
      if (!hasCompleted) {
        setIsOnboardingOpen(true);
      }
    } catch (e) {
      console.error('Failed to load onboarding status', e);
    }
  }, []);

  const handleCloseOnboarding = () => {
    setIsOnboardingOpen(false);
    try {
      localStorage.setItem('unsay_sudan_onboarding_completed', 'true');
    } catch (e) {
      console.error('Failed to save onboarding status', e);
    }
  };

  // Save Tray to localStorage & IndexedDB
  useEffect(() => {
    try {
      localStorage.setItem('unsay_sudan_tray', JSON.stringify(myTray));
      setKv('user_tray', myTray);
    } catch (e) {
      console.error('Failed to save tray', e);
    }
  }, [myTray]);

  const showToast = (msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 2500);
  };

  // Secret Disguised Tap Handler (5 taps unlocks Merchant Auth)
  const handleSecretTap = () => {
    setSecretTapCount(prev => {
      const next = prev + 1;
      if (secretTapTimerRef.current) clearTimeout(secretTapTimerRef.current);
      secretTapTimerRef.current = setTimeout(() => {
        setSecretTapCount(0);
      }, 2500);

      if (next >= 5) {
        setIsMerchantAuthOpen(true);
        return 0;
      }
      return next;
    });
  };

  // Navigation handler
  const handleNavigate = (page: AppPage) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Toggle Student Favorite Dish
  const handleToggleFavorite = (dishId: number) => {
    setFavorites(prev => {
      const exists = prev.includes(dishId);
      const next = exists ? prev.filter(id => id !== dishId) : [...prev, dishId];
      try {
        localStorage.setItem('unsay_sudan_favorites', JSON.stringify(next));
        setKv('user_favorites', next);
      } catch (e) {
        console.error('Failed to save favorites', e);
      }
      showToast(exists ? 'Removed from favorites' : 'Saved to favorites ❤️');
      return next;
    });
  };

  // Filtered & Sorted Dishes for Explore Page
  const filteredDishes = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    const matches = menuItems.filter((dish) => {
      if (selectedStall && dish.stall !== selectedStall) return false;
      if (selectedCategory !== 'All' && dish.category !== selectedCategory) return false;
      if (withinBudgetOnly && dish.price > userBudget) return false;
      if (availableOnly && !dish.available) return false;
      if (currentZone !== 'all' && dish.zone !== currentZone) return false;

      if (q) {
        const matchName = dish.name.toLowerCase().includes(q);
        const matchStall = dish.stall.toLowerCase().includes(q);
        const matchItems = dish.items.toLowerCase().includes(q);
        const matchCat = dish.category.toLowerCase().includes(q);
        if (!matchName && !matchStall && !matchItems && !matchCat) return false;
      }

      return true;
    });

    return matches.sort((a, b) => {
      if (currentSort === 'best-value') {
        const aFits = a.price <= userBudget;
        const bFits = b.price <= userBudget;
        if (aFits && !bFits) return -1;
        if (!aFits && bFits) return 1;
        if (aFits && bFits) return b.price - a.price;
        return a.price - b.price;
      }
      if (currentSort === 'cheapest') {
        return a.price - b.price;
      }
      if (currentSort === 'priciest') {
        return b.price - a.price;
      }
      if (currentSort === 'popular') {
        return (b.clicks || 0) - (a.clicks || 0);
      }
      if (currentSort === 'name') {
        return a.name.localeCompare(b.name);
      }
      return 0;
    });
  }, [menuItems, userBudget, currentZone, selectedCategory, searchQuery, selectedStall, currentSort, withinBudgetOnly, availableOnly]);

  // Tray Actions
  const handleQuickAdd = (dish: DishItem) => {
    recordItemClickAPI(dish.id);
    
    setMenuItems(prev =>
      prev.map(item => item.id === dish.id ? { ...item, clicks: (item.clicks || 0) + 1 } : item)
    );

    const displayImage = getDishDisplayImage(dish);
    const newTrayItem: TrayItem = {
      trayId: `${dish.id}-${Date.now()}-${Math.random()}`,
      dishId: dish.id,
      name: dish.name,
      stall: dish.stall,
      basePrice: dish.price,
      totalWithAddons: dish.price,
      customAddons: [],
      imageUrl: displayImage.url || dish.imageUrl
    };

    setMyTray(prev => [...prev, newTrayItem]);
    showToast(t.toastTrayAdded);
  };

  const handleAddToTrayFromModal = (
    dish: DishItem, 
    addons: { name: string; price: number }[], 
    total: number,
    selectedVariant?: string
  ) => {
    recordItemClickAPI(dish.id);

    setMenuItems(prev =>
      prev.map(item => item.id === dish.id ? { ...item, clicks: (item.clicks || 0) + 1 } : item)
    );

    const addonsCost = addons.reduce((sum, a) => sum + a.price, 0);
    const displayImage = getDishDisplayImage(dish);
    const newTrayItem: TrayItem = {
      trayId: `${dish.id}-${Date.now()}-${Math.random()}`,
      dishId: dish.id,
      name: selectedVariant ? `${dish.name} (${selectedVariant})` : dish.name,
      stall: dish.stall,
      basePrice: total - addonsCost,
      totalWithAddons: total,
      customAddons: addons,
      imageUrl: displayImage.url || dish.imageUrl,
      selectedVariant: selectedVariant
    };

    setMyTray(prev => [...prev, newTrayItem]);
    setActiveDetailDish(null);
    showToast(t.toastTrayAdded);
  };

  const handleRemoveFromTray = (trayId: string) => {
    setMyTray(prev => prev.filter(item => item.trayId !== trayId));
    showToast('Item removed from tray');
  };

  const handleClearTray = () => {
    setMyTray([]);
    showToast('Tray cleared');
  };

  // User Budget Setter (Enforces ₱10 min and ₱500 max)
  const handleBudgetChange = (val: number) => {
    const clamped = Math.min(500, Math.max(10, val));
    setUserBudget(clamped);
    setKv('user_budget', clamped);
  };

  const handleCopyTray = async () => {
    if (myTray.length === 0) return;

    let note = "🍱 UNIVERSITY CAFETERIA ORDER LIST:\n\n";
    let grandTotal = 0;

    myTray.forEach((item, idx) => {
      note += `${idx + 1}. [${item.stall}]\n   • ${item.name} (₱${item.totalWithAddons})\n`;
      if (item.customAddons.length > 0) {
        note += `   • Add-ons: ${item.customAddons.map(a => a.name).join(', ')}\n`;
      }
      note += "\n";
      grandTotal += item.totalWithAddons;
    });

    note += `TOTAL BUDGET: ₱${grandTotal}\nGenerated via Unsay-Sud-an App`;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(note);
      } else {
        const ta = document.createElement('textarea');
        ta.value = note;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      showToast(t.toastCopied);
    } catch {
      showToast('Could not access clipboard');
    }
  };

  // Merchant Actions (with automatic offline queueing when disconnected & rollback on 401/403)
  const handleToggleStock = async (dishId: number): Promise<boolean> => {
    if (!authenticatedStall) return false;

    const existing = merchantMenuItems.find(m => m.id === dishId) || menuItems.find(m => m.id === dishId);
    if (!existing) return false;
    const prevAvailable = existing.available;

    const setAvailableFn = (val: boolean) => (list: DishItem[]) =>
      list.map(item => (item.id === dishId ? { ...item, available: val } : item));

    setMenuItems(setAvailableFn(!prevAvailable));
    setMerchantMenuItems(setAvailableFn(!prevAvailable));

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await syncManager.enqueue('toggle_stock', { id: dishId, stall: authenticatedStall }, authenticatedStall);
      showToast('Updated offline — queued to sync automatically');
      return true;
    }

    const res = await toggleItemStockAPI(dishId, authenticatedStall);
    if (res.success && res.item) {
      const serverItem = res.item;
      const syncFn = (list: DishItem[]) => list.map(item => (item.id === dishId ? { ...item, ...serverItem } : item));
      setMenuItems(syncFn);
      setMerchantMenuItems(syncFn);
      showToast(`${serverItem.name} is now ${serverItem.available ? 'Available' : 'Sold Out'}`);
      return true;
    }

    if (res.networkError || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      await syncManager.enqueue('toggle_stock', { id: dishId, stall: authenticatedStall }, authenticatedStall);
      showToast('Updated offline — queued to sync automatically');
      return true;
    }

    // Server rejected (e.g., expired subscription / unauthorized) -> revert UI
    setMenuItems(setAvailableFn(prevAvailable));
    setMerchantMenuItems(setAvailableFn(prevAvailable));
    showToast(res.error || 'Failed to update stock availability');
    return false;
  };

  const handleOpenDetailDish = (dish: DishItem) => {
    setActiveDetailDish(dish);
    if (dish && dish.stall) {
      const vid = getAnonymousVisitorId();
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        syncManager.enqueue('item_view', { stallName: dish.stall, dishId: dish.id, dishName: dish.name, visitorId: vid });
      } else {
        recordItemViewAPI(dish.stall, dish.id, dish.name, vid);
      }
    }
  };

  const handleUpdatePrice = async (dishId: number, delta: number) => {
    if (!authenticatedStall) return;

    const existing = merchantMenuItems.find(m => m.id === dishId) || menuItems.find(m => m.id === dishId);
    if (!existing) return;
    const prevPrice = existing.price;
    const nextPrice = Math.max(5, prevPrice + delta);

    const setPriceFn = (val: number) => (list: DishItem[]) =>
      list.map(item => (item.id === dishId ? { ...item, price: val } : item));

    setMenuItems(setPriceFn(nextPrice));
    setMerchantMenuItems(setPriceFn(nextPrice));

    // Sync any instance of this dish in student tray immediately
    setMyTray(prev => prev.map(tItem => {
      if (tItem.dishId === dishId) {
        const addonsSum = (tItem.customAddons || []).reduce((s, a) => s + a.price, 0);
        return {
          ...tItem,
          basePrice: nextPrice,
          totalWithAddons: nextPrice + addonsSum
        };
      }
      return tItem;
    }));

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await syncManager.enqueue('update_price', { id: dishId, delta, stall: authenticatedStall }, authenticatedStall);
      showToast('Price updated offline — queued to sync automatically');
      return;
    }

    const res = await updateItemPriceAPI(dishId, delta, authenticatedStall);
    if (res.success && res.item) {
      const serverPrice = res.item.price;
      setMenuItems(setPriceFn(serverPrice));
      setMerchantMenuItems(setPriceFn(serverPrice));
      showToast(`Price updated to ₱${serverPrice}`);
      return;
    }

    if (res.networkError || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      await syncManager.enqueue('update_price', { id: dishId, delta, stall: authenticatedStall }, authenticatedStall);
      showToast('Price updated offline — queued to sync automatically');
      return;
    }

    // Server rejected -> revert UI and tray
    setMenuItems(setPriceFn(prevPrice));
    setMerchantMenuItems(setPriceFn(prevPrice));
    setMyTray(prev => prev.map(tItem => {
      if (tItem.dishId === dishId) {
        const addonsSum = (tItem.customAddons || []).reduce((s, a) => s + a.price, 0);
        return {
          ...tItem,
          basePrice: prevPrice,
          totalWithAddons: prevPrice + addonsSum
        };
      }
      return tItem;
    }));
    showToast(res.error || 'Failed to update price');
  };

  const handleSaveNotice = async (notice: string) => {
    if (!authenticatedStall) return;
    const prevNotice = stallNotices[authenticatedStall] || '';
    setStallNotices(prev => {
      const next = { ...prev, [authenticatedStall]: notice };
      setKv('stall_notices', next);
      return next;
    });
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await syncManager.enqueue('save_notice', { stall: authenticatedStall, notice }, authenticatedStall);
      showToast(`Notice saved offline for ${authenticatedStall} — queued to sync!`);
      return;
    }
    const res = await saveStallNoticeAPI(authenticatedStall, notice);
    if (res.success) {
      showToast(`Broadcast notice updated for ${authenticatedStall}!`);
    } else if (res.networkError || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      await syncManager.enqueue('save_notice', { stall: authenticatedStall, notice }, authenticatedStall);
      showToast(`Notice queued for ${authenticatedStall}!`);
    } else {
      setStallNotices(prev => {
        const next = { ...prev, [authenticatedStall]: prevNotice };
        setKv('stall_notices', next);
        return next;
      });
      showToast(res.error || 'Failed to update stall notice.');
    }
  };

  const handleAddItem = (newItem: Omit<DishItem, 'id' | 'clicks'>) => {
    const newId = Math.max(...menuItems.map(m => m.id), ...merchantMenuItems.map(m => m.id), 0) + 1;
    const created: DishItem = {
      ...newItem,
      id: (newItem as DishItem).id || newId,
      clicks: 0
    };
    if (created.imageUrl) {
      saveToOwnerImageVault(created.id, created.stall, created.name, created.imageUrl);
    }
    setMenuItems(prev => [created, ...prev.filter(m => m.id !== created.id)]);
    setMerchantMenuItems(prev => [created, ...prev.filter(m => m.id !== created.id)]);
    showToast(`Added ${created.name} to ${created.stall} menu!`);
  };

  const handleUpdateItem = (dishId: number, updates: Partial<DishItem>) => {
    const updateFn = (list: DishItem[]) =>
      list.map(item => {
        if (item.id === dishId) {
          const updated = { ...item, ...updates };
          if (updates.imageUrl) {
            saveToOwnerImageVault(updated.id, updated.stall, updated.name, updates.imageUrl);
          } else if (updates.imageUrl === null) {
            removeFromOwnerImageVault(updated.id, updated.stall, updated.name);
          }
          return updated;
        }
        return item;
      });

    setMenuItems(updateFn);
    setMerchantMenuItems(updateFn);

    // Synchronize Tray with updated price, name, or photo URL
    if (updates.price !== undefined || updates.name || updates.imageUrl !== undefined) {
      setMyTray(prev => prev.map(tItem => {
        if (tItem.dishId === dishId) {
          const newBase = updates.price !== undefined ? updates.price : tItem.basePrice;
          const addonsSum = (tItem.customAddons || []).reduce((s, a) => s + a.price, 0);
          return {
            ...tItem,
            name: updates.name || tItem.name,
            basePrice: newBase,
            totalWithAddons: newBase + addonsSum,
            imageUrl: updates.imageUrl !== undefined ? updates.imageUrl : tItem.imageUrl
          };
        }
        return tItem;
      }));
    }

    showToast('Menu updated successfully.');
  };

  const handleToggleHideItem = async (dishId: number): Promise<boolean> => {
    if (!authenticatedStall) return false;
    const existing = merchantMenuItems.find(m => m.id === dishId) || menuItems.find(m => m.id === dishId);
    if (!existing) return false;
    const prevHidden = Boolean(existing.hidden);
    const nextHidden = !prevHidden;

    const setHiddenFn = (val: boolean) => (list: DishItem[]) =>
      list.map(item => (item.id === dishId ? { ...item, hidden: val } : item));

    setMenuItems(setHiddenFn(nextHidden));
    setMerchantMenuItems(setHiddenFn(nextHidden));

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await syncManager.enqueue(
        'update_item',
        { dishId, stall: authenticatedStall, updates: { hidden: nextHidden } },
        authenticatedStall
      );
      showToast('Visibility updated offline — queued to sync automatically');
      return true;
    }

    const res = await updateMenuItemAPI(dishId, authenticatedStall, { hidden: nextHidden });
    if (res.success && res.item) {
      const serverItem = res.item;
      const syncFn = (list: DishItem[]) => list.map(item => (item.id === dishId ? { ...item, ...serverItem } : item));
      setMenuItems(syncFn);
      setMerchantMenuItems(syncFn);
      showToast(
        nextHidden
          ? `${serverItem.name} is now hidden from students.`
          : `${serverItem.name} is now visible to students.`
      );
      return true;
    }

    if (res.networkError || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      await syncManager.enqueue(
        'update_item',
        { dishId, stall: authenticatedStall, updates: { hidden: nextHidden } },
        authenticatedStall
      );
      showToast('Visibility updated offline — queued to sync automatically');
      return true;
    }

    setMenuItems(setHiddenFn(prevHidden));
    setMerchantMenuItems(setHiddenFn(prevHidden));
    showToast(res.error || 'Failed to update item visibility');
    return false;
  };

  const handleDeleteItem = async (dishId: number, deleteImagePermanently = false): Promise<boolean> => {
    if (!authenticatedStall) return false;
    const target = merchantMenuItems.find(m => m.id === dishId) || menuItems.find(m => m.id === dishId);
    if (!target) return false;

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await syncManager.enqueue('delete_item', {
        dishId,
        stall: authenticatedStall,
        deleteImagePermanently
      }, authenticatedStall);
      if (deleteImagePermanently) {
        removeFromOwnerImageVault(target.id, target.stall, target.name);
      }
      setMenuItems(prev => prev.filter(m => m.id !== dishId));
      setMerchantMenuItems(prev => prev.filter(m => m.id !== dishId));
      setMyTray(prev => prev.filter(t => t.dishId !== dishId));
      showToast(`Removed ${target.name} offline — queued to sync.`);
      return true;
    }

    // Call server to safely archive and protect owner image
    const result = await deleteMenuItemSafelyAPI(dishId, authenticatedStall, deleteImagePermanently);
    if (!result.success) {
      showToast(result.error || 'Failed to remove menu item');
      return false;
    }

    // If explicit permanent deletion was selected by owner, remove from local vault as well
    if (deleteImagePermanently) {
      removeFromOwnerImageVault(target.id, target.stall, target.name);
    }

    // Remove from active menu state
    setMenuItems(prev => prev.filter(m => m.id !== dishId));
    setMerchantMenuItems(prev => prev.filter(m => m.id !== dishId));
    // Remove from user tray if present
    setMyTray(prev => prev.filter(t => t.dishId !== dishId));

    showToast(
      deleteImagePermanently
        ? `Removed ${target.name}. Image permanently erased.`
        : `Removed ${target.name}. Photo preserved safely in Stall Photo Vault.`
    );
    return true;
  };

  const handleRestoreItem = async (archiveId: string): Promise<boolean> => {
    if (!authenticatedStall) return false;
    const result = await restoreArchivedDishAPI(archiveId, authenticatedStall);
    if (!result.success || !result.item) {
      showToast(result.error || 'Failed to restore archived dish');
      return false;
    }

    const restored = result.item;
    if (restored.ownerUploadedImage) {
      saveToOwnerImageVault(restored.id, restored.stall, restored.name, restored.ownerUploadedImage);
    }
    setMenuItems(prev => [restored, ...prev.filter(m => m.id !== restored.id)]);
    setMerchantMenuItems(prev => [restored, ...prev.filter(m => m.id !== restored.id)]);
    showToast(`Restored "${restored.name}" with original protected photo!`);
    return true;
  };

  const handleMenuBatchSaved = (updatedStallItems: DishItem[]) => {
    if (!authenticatedStall) return;
    setMerchantMenuItems(updatedStallItems);
    setMenuItems(prev => {
      const rest = prev.filter(m => m.stall !== authenticatedStall);
      const combined = [...rest, ...updatedStallItems];
      try {
        localStorage.setItem('unsay_sudan_menu_database', JSON.stringify(combined));
        setKv('menu_items_snapshot', combined);
      } catch {}
      return combined;
    });

    updatedStallItems.forEach(item => {
      if (item.ownerUploadedImage) {
        saveToOwnerImageVault(item.id, item.stall, item.name, item.ownerUploadedImage);
      }
    });

    showToast('Changes saved successfully.');
  };

  const totalTrayCost = myTray.reduce((acc, curr) => acc + curr.totalWithAddons, 0);
  const stallsListNames = stallsList.map(s => s.name);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FFF5EC] via-[#FFF9F3] to-[#FFFDF9] text-stone-900 flex flex-col font-sans selection:bg-orange-200 selection:text-orange-950 relative overflow-x-hidden">
      {/* Decorative Subtle Food Doodles Floating in Canvas Margins */}
      <FloatingFoodBackground />
      
      {/* Offline Mode Indicator Banner */}
      <OfflineIndicator onReconnected={() => syncMenuRef.current?.(true)} />

      {/* 1. Header with Clear Navigation */}
      <Header
        currentPage={currentPage}
        onNavigate={handleNavigate}
        currentLang={currentLang}
        onLanguageChange={setCurrentLang}
        trayCount={myTray.length}
        onOpenMerchantAuth={() => setIsMerchantAuthOpen(true)}
        t={t}
        isMerchantActive={!!authenticatedStall}
        activeStallName={authenticatedStall}
        onLogoutMerchant={async () => {
          await logoutMerchantAPI();
          setAuthenticatedStall(null);
          setMerchantOwner(null);
          setMerchantMenuItems([]);
          setMerchantMenuLoaded(false);
          showToast('Merchant session locked. Returned to Student mode.');
        }}
        onSecretTap={handleSecretTap}
        unreadNotificationsCount={notifications.filter(n => !n.isRead).length}
        onOpenNotifications={() => setIsNotificationsOpen(true)}
        isAdminActive={!!adminUser}
        onLogoutAdmin={async () => {
          await adminLogoutAPI();
          setAdminUser(null);
          showToast('Administrator session ended.');
          handleNavigate('home');
        }}
        onOpenQRScanner={() => setIsQRScannerOpen(true)}
      />

      {/* 2. Persistent, Compact Budget Bar (Obvious budget, spent, remaining) */}
      {!authenticatedStall && !adminUser && currentPage !== 'portal' && currentPage !== 'admin' && currentPage !== 'subscription' && (
        <BudgetSummaryBar
          budget={userBudget}
          spent={totalTrayCost}
          trayCount={myTray.length}
          onBudgetChange={handleBudgetChange}
          onNavigate={handleNavigate}
          currentPage={currentPage}
        />
      )}

      {/* 3. Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-7 relative z-10">
        
        {currentPage === 'portal' && (
          <StallPortalPage
            authenticatedStall={authenticatedStall}
            currentOwner={merchantOwner}
            onAuthenticate={(stallName, owner) => {
              setAuthenticatedStall(stallName);
              if (owner) setMerchantOwner(owner);
              setMerchantMenuLoaded(false);
              syncMenuRef.current?.(true);
              showToast(`Welcome, ${stallName}! Stall dashboard unlocked.`);
            }}
            onUpdateOwner={(updated) => setMerchantOwner(updated)}
            onLogout={() => {
              setAuthenticatedStall(null);
              setMerchantOwner(null);
              setMerchantMenuItems([]);
              setMerchantMenuLoaded(false);
              showToast('Stall portal locked.');
            }}
            items={
              merchantMenuLoaded
                ? merchantMenuItems
                : menuItems.filter(m => !authenticatedStall || m.stall === authenticatedStall)
            }
            stallNotices={stallNotices}
            onSaveNotice={handleSaveNotice}
            onToggleStock={handleToggleStock}
            onUpdatePrice={handleUpdatePrice}
            onAddItem={handleAddItem}
            onUpdateItem={handleUpdateItem}
            onToggleHideItem={handleToggleHideItem}
            onDeleteItem={handleDeleteItem}
            onRestoreItem={handleRestoreItem}
            onBatchSaved={handleMenuBatchSaved}
            stalls={stallsList}
            onNavigate={handleNavigate}
            onOpenStallQR={(stallName) => setQrModalStall(stallName)}
            t={t}
          />
        )}

        {currentPage === 'home' && (
          <HomePage
            budget={userBudget}
            onBudgetChange={handleBudgetChange}
            dishes={menuItems}
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
            onQuickAdd={handleQuickAdd}
            onOpenDetail={handleOpenDetailDish}
            onOpenRoulette={() => setIsRouletteOpen(true)}
            onNavigate={handleNavigate}
            onToggleFavorite={handleToggleFavorite}
            favorites={favorites}
            totalStalls={stallsList.length}
            onOpenQRScanner={() => setIsQRScannerOpen(true)}
            t={t}
          />
        )}

        {currentPage === 'explore' && (
          <ExplorePage
            dishes={filteredDishes}
            userBudget={userBudget}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
            currentZone={currentZone}
            onZoneChange={setCurrentZone}
            selectedStall={selectedStall}
            onSelectStall={setSelectedStall}
            stallsList={stallsListNames}
            currentSort={currentSort}
            onSortChange={setCurrentSort}
            availableOnly={availableOnly}
            onToggleAvailableOnly={() => setAvailableOnly(prev => !prev)}
            withinBudgetOnly={withinBudgetOnly}
            onToggleWithinBudgetOnly={() => setWithinBudgetOnly(prev => !prev)}
            onResetFilters={() => {
              setSearchQuery('');
              setSelectedCategory('All');
              setSelectedStall(null);
              setCurrentZone('all');
              setAvailableOnly(false);
              setWithinBudgetOnly(true);
              setCurrentSort('best-value');
              showToast('Filters reset to default');
            }}
            onQuickAdd={handleQuickAdd}
            onOpenDetail={handleOpenDetailDish}
            onOpenRoulette={() => setIsRouletteOpen(true)}
            onToggleFavorite={handleToggleFavorite}
            favorites={favorites}
            t={t}
          />
        )}

        {currentPage === 'stalls' && (
          <StallsPage
            stalls={stallsList}
            allDishes={menuItems}
            selectedStall={selectedStall}
            onSelectStall={(stall) => {
              setSelectedStall(stall);
              if (stall) {
                showToast(`Showing menu for ${stall}`);
                const vid = getAnonymousVisitorId();
                if (typeof navigator !== 'undefined' && !navigator.onLine) {
                  syncManager.enqueue('stall_view', { stallName: stall, visitorId: vid });
                } else {
                  recordStallViewAPI(stall, vid);
                }
              }
            }}
            stallNotices={stallNotices}
            userBudget={userBudget}
            onQuickAdd={handleQuickAdd}
            onOpenDetail={handleOpenDetailDish}
            onToggleFavorite={handleToggleFavorite}
            favorites={favorites}
            onOpenQRScanner={() => setIsQRScannerOpen(true)}
            onOpenStallQR={(stallName) => setQrModalStall(stallName)}
            t={t}
          />
        )}

        {currentPage === 'tray' && (
          <TrayPage
            tray={myTray}
            userBudget={userBudget}
            onRemoveItem={handleRemoveFromTray}
            onClearTray={handleClearTray}
            onCopyTray={handleCopyTray}
            onNavigate={handleNavigate}
            t={t}
          />
        )}

        {currentPage === 'orders' && (
          <OrdersPage
            tray={myTray}
            userBudget={userBudget}
            onNavigate={handleNavigate}
            onClearTray={handleClearTray}
          />
        )}

        {currentPage === 'subscription' && (
          <SubscriptionPaywall
            stallName={authenticatedStall || undefined}
            stalls={stallsList}
            onRefreshStatus={() => syncMenuRef.current?.(true)}
            onPaymentSubmitted={() => {
              showToast('Payment submitted! Awaiting administrator verification.');
            }}
            onNavigate={handleNavigate}
            showBackToPortal={!!authenticatedStall}
          />
        )}

        {currentPage === 'admin' && (
          <AdminSubscriptionDashboard
            adminUser={adminUser}
            onLoginSuccess={(admin) => {
              setAdminUser(admin);
              showToast(`Administrator session verified. Welcome, ${admin.name}!`);
            }}
            onLogout={async () => {
              await adminLogoutAPI();
              setAdminUser(null);
              showToast('Admin logged out.');
              handleNavigate('home');
            }}
            onNavigate={handleNavigate}
          />
        )}

        {currentPage === 'help' && (
          <HelpPage
            onOpenOnboarding={() => setIsOnboardingOpen(true)}
            onOpenMerchantAuth={() => setIsMerchantAuthOpen(true)}
            onShowToast={showToast}
          />
        )}

      </main>

      {/* Footer (Desktop clean reference) */}
      <footer className="border-t border-[#F0EBE1] bg-[#FFFDF9] py-6 text-center text-xs text-stone-500 pb-20 md:pb-6">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-display">
            <span className="font-black text-stone-900">unsaysud-an</span>
            <span className="text-orange-600 font-bold">tech</span>
            <span>•</span>
            <span>USTP CDO Campus Cafeteria</span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 text-stone-500">
            <button onClick={() => handleNavigate('home')} className="hover:text-orange-600">Home</button>
            <button onClick={() => handleNavigate('explore')} className="hover:text-orange-600">Explore</button>
            <button onClick={() => handleNavigate('stalls')} className="hover:text-orange-600">Stalls</button>
            <button onClick={() => handleNavigate('tray')} className="hover:text-orange-600">Tray</button>
            <button onClick={() => handleNavigate('orders')} className="hover:text-orange-600">Orders</button>
            <button onClick={() => handleNavigate('subscription')} className="hover:text-orange-600 font-bold">Subscription</button>
            <button onClick={() => handleNavigate('portal')} className="hover:text-orange-600 font-bold">Stall Portal</button>
            <button onClick={() => handleNavigate('admin')} className="hover:text-purple-600 font-bold">Admin</button>
            <button onClick={() => handleNavigate('help')} className="hover:text-orange-600">Help & FAQ</button>
          </div>

          <div className="text-[11px] text-stone-400">
            USTP CDO Cafeteria meal guide & budget matcher.
          </div>
        </div>
      </footer>

      {/* Mobile Bottom Navigation */}
      <BottomNavBar
        currentPage={currentPage}
        onNavigate={handleNavigate}
        trayCount={myTray.length}
      />

      {/* Item Detail / Addon Customizer Modal */}
      <MealDetailModal
        dish={activeDetailDish}
        budget={userBudget}
        onClose={() => setActiveDetailDish(null)}
        onAddToTray={handleAddToTrayFromModal}
        t={t}
      />

      {/* Roulette "Surprise Me!" Modal */}
      <RouletteModal
        isOpen={isRouletteOpen}
        onClose={() => setIsRouletteOpen(false)}
        allDishes={menuItems}
        userBudget={userBudget}
        onSelectDish={handleOpenDetailDish}
        onQuickAdd={handleQuickAdd}
        onAdjustBudget={(newBudget) => {
          handleBudgetChange(newBudget);
          showToast(`Budget updated to ₱${newBudget}`);
        }}
        onSelectCategory={(cat) => {
          setSelectedCategory(cat);
          handleNavigate('explore');
        }}
        t={t}
      />

      {/* Onboarding Interactive Guide Modal */}
      <OnboardingModal
        isOpen={isOnboardingOpen}
        onClose={handleCloseOnboarding}
        onApplyBudgetPreset={(budgetVal: number) => {
          handleBudgetChange(budgetVal);
          showToast(`Budget set to ₱${budgetVal}`);
        }}
      />

      {/* Merchant PIN Keypad Modal */}
      <MerchantAuthModal
        isOpen={isMerchantAuthOpen}
        onClose={() => setIsMerchantAuthOpen(false)}
        stalls={stallsList}
        onLoginSuccess={(stallName, owner) => {
          setAuthenticatedStall(stallName);
          if (owner) setMerchantOwner(owner);
          setIsMerchantAuthOpen(false);
          handleNavigate('portal');
          syncMenuRef.current?.(true);
          showToast(`Welcome, ${stallName}! Management mode activated.`);
        }}
        onOpenFullPortal={() => {
          setIsMerchantAuthOpen(false);
          handleNavigate('portal');
        }}
      />

      {/* Offline Stall QR Scanner Modal */}
      <QRScannerModal
        isOpen={isQRScannerOpen}
        onClose={() => setIsQRScannerOpen(false)}
        stalls={stallsList}
        onStallResolved={(stallName) => {
          setSelectedStall(stallName);
          handleNavigate('stalls');
          const vid = getAnonymousVisitorId();
          if (typeof navigator !== 'undefined' && !navigator.onLine) {
            syncManager.enqueue('stall_view', { stallName, visitorId: vid });
          } else {
            recordStallViewAPI(stallName, vid);
            recordSiteVisitAPI({
              visitorId: vid,
              sessionId: getAnalyticsSessionId(),
              page: 'stalls',
              deviceType: detectVisitorDeviceType(),
              qrSource: 'scanner',
              qrStall: stallName
            });
          }
          showToast(`Loaded menu for ${stallName}`);
        }}
      />

      {/* Offline Stall QR Generator Modal */}
      <StallQRModal
        isOpen={Boolean(qrModalStall)}
        onClose={() => setQrModalStall(null)}
        stallName={qrModalStall}
      />

      {/* In-App Notifications Drawer Panel */}
      <NotificationPanel
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        notifications={notifications}
        onMarkRead={async (id, markAll) => {
          const recipient = adminUser ? 'admin' : (authenticatedStall || 'all');
          await markNotificationsReadAPI(recipient, id, markAll);
          setNotifications(prev =>
            prev.map(n => (markAll || n.id === id ? { ...n, isRead: true } : n))
          );
        }}
        onNavigate={(page) => {
          setIsNotificationsOpen(false);
          handleNavigate(page);
        }}
        title={
          adminUser
            ? "Admin System Notifications"
            : (authenticatedStall
                ? `${authenticatedStall} Notifications`
                : "Cafeteria Notifications")
        }
      />

      {/* Toast Notification Alert */}
      <Toast message={toastMessage} />

    </div>
  );
}
