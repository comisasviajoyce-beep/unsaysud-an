export type Language = 'bisaya' | 'tagalog' | 'english';

export type AppPage = 'home' | 'explore' | 'stalls' | 'tray' | 'orders' | 'portal' | 'subscription' | 'admin' | 'help';

export type SubscriptionPlanType = 'weekly' | 'monthly' | 'trial';
export type SubscriptionStatus = 'ACTIVE' | 'PENDING' | 'EXPIRED' | 'SUSPENDED' | 'Active' | 'Pending' | 'Expired' | 'Suspended' | 'None';
export type TrialStatus = 'Not Started' | 'Trial Active' | 'Trial Expired' | 'Subscribed';
export type PaymentMethod = 'gcash' | 'bank' | 'qr';
export type PaymentStatus = 'Pending Verification' | 'Approved' | 'Rejected' | 'Expired';

export interface StallTrialRecord {
  stallName: string;
  ownerId?: string;
  trialStatus: TrialStatus;
  startDate: string | null;
  endDate: string | null;
  durationDays: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserSubscription {
  id: string;
  stallName: string;
  ownerId: string;
  plan: SubscriptionPlanType;
  status: SubscriptionStatus;
  startDate: string;
  expirationDate: string;
  nextDueDate: string;
  billingCycle: 'calendar_month' | 'weekly' | 'exact_30_days';
  lastPaymentId?: string;
  autoRenewReminder: boolean;
  isManuallyGranted?: boolean;
  manualGrantReason?: string;
  manualGrantExpiresAt?: string;
  isTrial?: boolean;
  trialStartDate?: string;
  trialEndDate?: string;
  trialStatus?: TrialStatus;
  isPaidSubscription?: boolean;
  updatedAt: string;
  createdAt: string;
}

export interface SubscriptionStatusResponse {
  hasSubscription: boolean;
  status: SubscriptionStatus;
  trialStatus: TrialStatus;
  isTrial: boolean;
  isSubscribed: boolean;
  trialStartDate?: string | null;
  trialEndDate?: string | null;
  trialDaysRemaining?: number;
  serverTime: string;
  subscription?: UserSubscription;
  pendingPayment?: PaymentRecord | null;
  isExpired: boolean;
  daysRemaining: number;
  stallName?: string;
  error?: string;
}

export interface PaymentRecord {
  id: string;
  stallName: string;
  ownerId: string;
  ownerName: string;
  plan: SubscriptionPlanType;
  amount: number;
  paymentMethod: PaymentMethod;
  referenceNumber: string;
  paymentDate: string;
  proofImageUrl: string;
  status: PaymentStatus;
  submittedAt: string;
  verifiedAt?: string;
  verifiedBy?: string;
  rejectionReason?: string;
  durationGrantedDays?: number;
  subscriptionExtendedTo?: string;
  notes?: string;
}

export interface AdminPaymentSettings {
  gcash: {
    accountName: string;
    accountNumber: string;
    instructions: string;
    isEnabled: boolean;
  };
  bank: {
    bankName: string;
    accountHolder: string;
    accountNumber: string;
    instructions: string;
    isEnabled: boolean;
  };
  qrCode: {
    imageUrl: string | null;
    instructions: string;
    isEnabled: boolean;
  };
  plans: {
    weekly: {
      price: number;
      durationDays: number;
      name: string;
      description: string;
      isEnabled: boolean;
    };
    monthly: {
      price: number;
      billingCycle: 'calendar_month' | 'exact_30_days';
      name: string;
      description: string;
      isEnabled: boolean;
    };
  };
  updatedAt: string;
  updatedBy: string;
}

export interface AppNotification {
  id: string;
  recipientType: 'stall' | 'admin' | 'all';
  recipientId: string;
  title: string;
  message: string;
  type: 'reminder_7d' | 'reminder_3d' | 'reminder_1d' | 'due_today' | 'expired' | 'payment_pending' | 'payment_approved' | 'payment_rejected' | 'access_granted' | 'access_revoked' | 'system';
  isRead: boolean;
  link?: string;
  createdAt: string;
  dedupKey?: string;
}

export interface AuditLogEntry {
  id: string;
  action: 'approve_payment' | 'reject_payment' | 'grant_manual_access' | 'revoke_manual_access' | 'suspend_stall' | 'update_settings' | 'update_plans';
  performedBy: string;
  targetStall: string;
  details: string;
  metadata?: Record<string, any>;
  timestamp: string;
}

export interface AdminSubscriptionSummary {
  totalSubscribers: number;
  activeSubscribers: number;
  weeklySubscribers: number;
  monthlySubscribers: number;
  expiredSubscribers: number;
  pendingPaymentsCount: number;
  approvedPaymentsCount: number;
  rejectedPaymentsCount: number;
  totalVerifiedRevenue: number;
}

export type ZoneFilter = 'all' | 'outside' | 'inside';

export type FoodCategory =
  | 'Rice Meals'
  | 'Snacks'
  | 'Drinks'
  | 'Desserts'
  | 'Street Food'
  | 'Bread & Pastries'
  | 'Dumplings'
  | 'Fruits'
  | 'Other';

export type CategoryFilter = 'All' | FoodCategory;
export type CategoryTag = CategoryFilter;

export type SortOption = 'best-value' | 'cheapest' | 'priciest' | 'popular' | 'name';

export interface DishItem {
  id: number;
  name: string;
  items: string;
  price: number;
  rating: number;
  stall: string;
  zone: 'outside' | 'inside';
  category: FoodCategory;
  tags: string[];
  available: boolean;
  cal: string;
  clicks: number;
  imageUrl?: string;
  ownerUploadedImage?: string;
  representativeImage?: string;
  imageId?: string;
  storageId?: string;
  uploadTimestamp?: number;
  isOwnerImageProtected?: boolean;
  isRepresentative?: boolean;
  priceOptions?: number[];
  sizeOptions?: { label: string; price: number }[];
  flavorOptions?: string[];
  hidden?: boolean;
}

export interface AddonOption {
  name: string;
  price: number;
  icon: string;
}

export interface TrayItem {
  trayId: string;
  dishId: number;
  name: string;
  stall: string;
  basePrice: number;
  totalWithAddons: number;
  customAddons: { name: string; price: number }[];
  imageUrl?: string;
  selectedVariant?: string;
}

export interface StallCredential {
  name: string;
  zone: 'outside' | 'inside';
  stallNo?: string;
  officialName?: string;
  hasRegisteredOwner?: boolean;
}

export interface TranslationDictionary {
  budgetPrompt: string;
  budgetSub: string;
  searchPlaceholder: string;
  surpriseBtn: string;
  allZone: string;
  outsideZone: string;
  insideZone: string;
  allPill: string;
  ricePill: string;
  drinksPill: string;
  snacksPill: string;
  fruitsPill: string;
  bakeryPill: string;
  campusLoc: string;
  liveOpen: string;
  combosFound: string;
  emptyMatch: string;
  changeLabel: string;
  exactChange: string;
  orderLocate: string;
  saveTray: string;
  trayHeading: string;
  trayEmpty: string;
  trayCost: string;
  clearTray: string;
  copyTray: string;
  rouletteTitle: string;
  rouletteSub: string;
  soldOutTag: string;
  availableTag: string;
  toastCopied: string;
  toastTrayAdded: string;
  merchantPortal: string;
  studentMode: string;
  logoutMerchant: string;
}

export interface StallOwnerAccount {
  id: string;
  stallName: string;
  stallNo: string;
  ownerName: string;
  username: string;
  email: string;
  contactNumber?: string;
  zone?: 'outside' | 'inside';
  accountStatus?: 'active' | 'suspended';
  createdAt: string;
  role?: 'merchant' | 'admin';
}

export interface AdminMerchantRecord extends StallOwnerAccount {
  subscriptionStatus: SubscriptionStatus;
  trialStatus: TrialStatus;
  expirationDate?: string | null;
}

export interface ViewsByDayItem {
  date: string;
  label: string;
  views: number;
  uniqueVisitors: number;
}

export interface PopularItemData {
  dishId: number;
  dishName: string;
  views: number;
}

export interface RecentActivityItem {
  id: string;
  type: 'stall_view' | 'item_view';
  description: string;
  timestamp: string;
  timeAgo: string;
}

export interface StallAnalyticsData {
  stallName: string;
  todayViews: number;
  uniqueVisitorsToday: number;
  thisWeekViews: number;
  thisMonthViews: number;
  totalViews: number;
  menuItemViewsCount: number;
  mostViewedItem: string | null;
  viewsByDay: ViewsByDayItem[];
  popularItems: PopularItemData[];
  recentActivity: RecentActivityItem[];
}

export interface ProtectedOwnerImageRecord {
  imageId: string;
  storageId: string;
  persistentImageUrl: string;
  menuId: number;
  stallName: string;
  stallNo: string;
  ownerId: string;
  dishName: string;
  dishCategory: string;
  dishPrice: number;
  uploadTimestamp: number;
  isProtected: boolean;
  active: boolean;
}

export interface ArchivedDishRecord {
  archiveId: string;
  dish: DishItem;
  archivedAt: number;
  archivedBy: string;
  preservedImageId?: string;
}

export interface MenuVersionSnapshot {
  versionId: string;
  stallName: string;
  timestamp: number;
  savedAt: string;
  itemCount: number;
  items: DishItem[];
  summary: string;
}

// ============================================================================
// Smart Sales Tracker Types (Option 1: Daily Summary & Option 2: Per-Item Tracker)
// ============================================================================
export type SalesRecordType = 'daily_summary' | 'itemized';

export interface SalesItemEntry {
  id: string;
  dishId?: number;
  foodName: string;
  quantitySold: number;
  sellingPrice: number;
  totalSales: number; // quantitySold * sellingPrice
  notes?: string;
}

export interface SalesRecord {
  id: string;
  stallName: string;
  recordType: SalesRecordType;
  date: string; // YYYY-MM-DD
  totalSales: number;
  totalExpenses: number;
  estimatedProfit: number; // totalSales - totalExpenses
  notes?: string;
  items?: SalesItemEntry[];
  totalItemsSold?: number; // Sum of quantities sold
  createdAt: string;
  updatedAt: string;
}

export type SalesDateFilter = 'today' | 'this_week' | 'this_month' | 'custom' | 'all';

export interface SalesDashboardMetrics {
  todayTotalSales: number;
  todayExpenses: number;
  todayEstimatedProfit: number;
  todayItemsSold: number;
  todayBestSellingItem: {
    name: string;
    quantity: number;
    totalSales: number;
  } | null;
  filterTotalSales: number;
  filterExpenses: number;
  filterEstimatedProfit: number;
  filterItemsSold: number;
  filterBestSellingItem: {
    name: string;
    quantity: number;
    totalSales: number;
  } | null;
  slowSellingItems: {
    name: string;
    quantity: number;
    totalSales: number;
    reason: string;
  }[];
  insufficientDataForSlowSelling: boolean;
}

// ============================================================================
// Super Admin Platform Overview & Website Visitor Analytics Types
// ============================================================================
export interface AdminStallDirectoryEntry {
  name: string;
  stallNo?: string;
  officialName?: string;
  zone: 'outside' | 'inside';
  isCustom: boolean;
  hasRegisteredOwner: boolean;
  ownerName?: string | null;
  ownerUsername?: string | null;
  accountStatus?: 'active' | 'suspended' | null;
  subscriptionStatus: string;
  trialStatus: string;
  isPubliclyVisible: boolean;
  totalDishes: number;
  availableDishes: number;
  soldOutDishes: number;
  hiddenDishes: number;
  ownerPhotosCount: number;
  notice?: string;
  stallViews: number;
}

export interface AdminPlatformStats {
  totalStalls: number;
  officialStalls: number;
  customStalls: number;
  registeredStalls: number;
  unclaimedStalls: number;
  totalMenuItems: number;
  availableItems: number;
  soldOutItems: number;
  hiddenItems: number;
  protectedOwnerImages: number;
  archivedDishes: number;
  activeNotices: number;
  totalSalesRecords: number;
  totalStallProfileViews: number;
  totalItemViews: number;
}

export interface AdminPlatformOverview {
  stats: AdminPlatformStats;
  stalls: AdminStallDirectoryEntry[];
  menus: DishItem[];
}

export interface VisitorDailyBucket {
  date: string;
  label: string;
  visits: number;
  uniqueVisitors: number;
  qrVisits: number;
}

export interface VisitorMonthlyBucket {
  month: string; // YYYY-MM
  label: string;
  visits: number;
  uniqueVisitors: number;
  qrVisits: number;
}

export interface WebsiteVisitorAnalyticsData {
  totalVisits: number;
  uniqueVisitors: number;
  newVisitors: number;
  returningVisitors: number;
  activeVisitors: number;
  todayVisits: number;
  thisMonthVisits: number;
  dailyVisits: VisitorDailyBucket[];
  monthlyVisits: VisitorMonthlyBucket[];
  mostVisitedPages: { page: string; visits: number; sharePercent: number }[];
  deviceTypes: {
    mobile: number;
    tablet: number;
    desktop: number;
  };
  qrVisits: {
    totalQrVisits: number;
    uniqueQrVisitors: number;
    bySource: { deeplink: number; scanner: number };
    topQrStalls: { stallName: string; visits: number }[];
  };
  recentVisits: {
    id: string;
    page: string;
    deviceType: 'Mobile' | 'Tablet' | 'Desktop';
    visitorType: 'New' | 'Returning';
    qrSource?: 'deeplink' | 'scanner' | null;
    qrStall?: string | null;
    timestamp: string;
  }[];
}

