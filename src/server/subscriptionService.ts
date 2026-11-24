import fs from "fs";
import path from "path";
import express from "express";
import { getDatabasePool } from "./config/database";
import {
  UserSubscription,
  PaymentRecord,
  AdminPaymentSettings,
  AppNotification,
  AuditLogEntry,
  AdminSubscriptionSummary,
  SubscriptionPlanType,
  PaymentMethod,
  TrialStatus,
  StallTrialRecord,
  StallOwnerAccount
} from "../types";
import {
  ADMIN_COOKIE_NAME,
  clearSessionCookie,
  createSingleSuperAdmin,
  getAdminSession,
  getMerchantSession,
  isSuperAdminRegistered,
  requireMerchant,
  requireSuperAdmin,
  setSessionCookie,
  signSessionToken,
  verifyCsrfForCookieMutation,
  verifySuperAdminCredentials
} from "./authMiddleware";

const DATA_DIR = path.join(process.cwd(), "data");
const PROOFS_DIR = path.join(process.cwd(), "public", "uploads", "proofs");
const ADMIN_ASSETS_DIR = path.join(process.cwd(), "public", "uploads", "admin");

const IS_VERCEL_RUNTIME =
  Boolean(process.env.VERCEL || process.env.VERCEL_ENV) ||
  process.cwd().startsWith("/var/task");

if (!IS_VERCEL_RUNTIME) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(PROOFS_DIR)) fs.mkdirSync(PROOFS_DIR, { recursive: true });
  if (!fs.existsSync(ADMIN_ASSETS_DIR)) fs.mkdirSync(ADMIN_ASSETS_DIR, { recursive: true });
}

const SUBSCRIPTIONS_FILE = path.join(DATA_DIR, "subscriptions.json");
const TRIALS_FILE = path.join(DATA_DIR, "stall_trials.json");
const PAYMENTS_FILE = path.join(DATA_DIR, "payments.json");
const NOTIFICATIONS_FILE = path.join(DATA_DIR, "notifications.json");
const SETTINGS_FILE = path.join(DATA_DIR, "admin_payment_settings.json");
const AUDIT_LOGS_FILE = path.join(DATA_DIR, "audit_logs.json");

// ============================================================================
// 1. DEFAULT SETTINGS & INITIAL SEEDING
// ============================================================================

const defaultSettings: AdminPaymentSettings = {
  gcash: {
    accountName: "USTP Cafeteria Admin (Finance Office)",
    accountNumber: "0917-882-9912",
    instructions: "Send exact amount via GCash Express Send. Save the receipt image and copy your 13-digit Reference No.",
    isEnabled: true
  },
  bank: {
    bankName: "Landbank of the Philippines (USTP CDO Campus)",
    accountHolder: "USTP CDO Cafeteria Management",
    accountNumber: "3401-2290-88",
    instructions: "Transfer via InstaPay or PESONet. In remarks, enter your Stall Number and Stall Name.",
    isEnabled: true
  },
  qrCode: {
    imageUrl: "/uploads/admin/official_qr.svg",
    instructions: "Scan using GCash, Maya, Landbank, or any QR Ph app. Verify that merchant shows USTP CDO CAFETERIA.",
    isEnabled: true
  },
  plans: {
    weekly: {
      price: 25,
      durationDays: 7,
      name: "Weekly Plan",
      description: "₱25 for 7 full calendar days of cafeteria portal access. Flexible and convenient.",
      isEnabled: true
    },
    monthly: {
      price: 100,
      billingCycle: "calendar_month",
      name: "Monthly Plan",
      description: "₱100 for one full month. Regular renewal deadline is the last day of the calendar month.",
      isEnabled: true
    }
  },
  updatedAt: new Date().toISOString(),
  updatedBy: "System Setup"
};

// ============================================================================
// 2. DISK PERSISTENCE HELPERS
// ============================================================================

function loadJsonFile<T>(filePath: string, defaultVal: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(content) as T;
    }
  } catch (err) {
    console.error(`Error loading ${filePath}:`, err);
  }
  try {
    fs.writeFileSync(filePath, JSON.stringify(defaultVal, null, 2), "utf-8");
  } catch (err) {
    console.error(`Error writing default ${filePath}:`, err);
  }
  return defaultVal;
}

function saveJsonFile(filePath: string, data: any) {
  // Vercel's /var/task filesystem is read-only and ephemeral. Do not attempt
  // to write JSON-backed runtime state there; persistent records must use a
  // database-backed store instead.
  if (IS_VERCEL_RUNTIME) return;

  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error(`Failed to save to ${filePath}:`, err);
  }
}

// Canonical Status Normalizer
export function normalizeSubscriptionStatus(status?: string): 'ACTIVE' | 'PENDING' | 'EXPIRED' | 'SUSPENDED' {
  if (!status) return 'EXPIRED';
  const upper = String(status).toUpperCase().trim();
  if (upper === 'ACTIVE') return 'ACTIVE';
  if (upper === 'PENDING') return 'PENDING';
  if (upper === 'SUSPENDED') return 'SUSPENDED';
  return 'EXPIRED';
}

// In-Memory Database Stores (Strictly backed by real disk state, no demo seeds)
let adminSettings: AdminPaymentSettings = loadJsonFile(SETTINGS_FILE, defaultSettings);

let subscriptionStoreInitialized = false;

/**
 * Payment configuration is stored as a single versioned JSON document in MySQL.
 * The in-memory value is only a per-instance cache; MySQL remains authoritative.
 */
export async function initializeSubscriptionDatabaseStore(): Promise<void> {
  if (subscriptionStoreInitialized) return;
  const pool = getDatabasePool();
  await pool.query(`CREATE TABLE IF NOT EXISTS app_settings (
    setting_key VARCHAR(100) NOT NULL PRIMARY KEY,
    setting_value JSON NOT NULL,
    updated_at VARCHAR(40) NOT NULL,
    updated_by VARCHAR(160) NOT NULL
  ) ENGINE=InnoDB`);
  const [rows] = await pool.query<any[]>(
    "SELECT setting_value FROM app_settings WHERE setting_key = ? LIMIT 1",
    ["admin_payment_settings"]
  );
  if (rows.length > 0) {
    const value = typeof rows[0].setting_value === "string"
      ? JSON.parse(rows[0].setting_value)
      : rows[0].setting_value;
    adminSettings = { ...defaultSettings, ...value };
  } else {
    const now = new Date().toISOString();
    await pool.execute(
      "INSERT INTO app_settings (setting_key, setting_value, updated_at, updated_by) VALUES (?, ?, ?, ?)",
      ["admin_payment_settings", JSON.stringify(adminSettings), now, adminSettings.updatedBy || "System Setup"]
    );
  }
  subscriptionStoreInitialized = true;
}

async function persistAdminSettings(): Promise<void> {
  const pool = getDatabasePool();
  await pool.execute(
    `INSERT INTO app_settings (setting_key, setting_value, updated_at, updated_by)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value),
       updated_at = VALUES(updated_at), updated_by = VALUES(updated_by)`,
    ["admin_payment_settings", JSON.stringify(adminSettings), adminSettings.updatedAt, adminSettings.updatedBy]
  );
}
let payments: PaymentRecord[] = loadJsonFile<PaymentRecord[]>(PAYMENTS_FILE, []).filter(
  p => !p.id.startsWith("pay_demo_")
);
let notifications: AppNotification[] = loadJsonFile<AppNotification[]>(NOTIFICATIONS_FILE, []).filter(
  n => n.id !== "notif_admin_init"
);
let auditLogs: AuditLogEntry[] = loadJsonFile<AuditLogEntry[]>(AUDIT_LOGS_FILE, []);
let subscriptions: UserSubscription[] = loadJsonFile<UserSubscription[]>(SUBSCRIPTIONS_FILE, []).map(s => ({
  ...s,
  status: normalizeSubscriptionStatus(s.status)
}));
let trials: StallTrialRecord[] = loadJsonFile<StallTrialRecord[]>(TRIALS_FILE, []);

export function ensureStallTrialInitialized(stallName: string, ownerId: string): StallTrialRecord {
  const existing = trials.find(t => t.stallName === stallName);
  if (existing) {
    if (!existing.ownerId || existing.ownerId.startsWith("cred_")) {
      existing.ownerId = ownerId;
      existing.updatedAt = new Date().toISOString();
      saveJsonFile(TRIALS_FILE, trials);
    }
    return existing;
  }
  const now = new Date().toISOString();
  const created: StallTrialRecord = {
    stallName,
    ownerId,
    trialStatus: "Not Started",
    startDate: null,
    endDate: null,
    durationDays: 14,
    createdAt: now,
    updatedAt: now
  };
  trials.push(created);
  saveJsonFile(TRIALS_FILE, trials);
  return created;
}

export function hasStallSubscriptionOrTrialRecord(stallName: string): boolean {
  return (
    subscriptions.some(s => s.stallName === stallName) ||
    trials.some(t => t.stallName === stallName)
  );
}

// ============================================================================
// 3. DATE UTILITIES & CALENDAR-MONTH MATH
// ============================================================================

export function computeNextExpiration(
  currentExpirationIso: string | undefined,
  plan: SubscriptionPlanType,
  billingCycle: "calendar_month" | "weekly" | "exact_30_days" = "calendar_month"
): { startDate: Date; expirationDate: Date; nextDueDate: Date } {
  const now = new Date();
  let baseDate = now;

  // If user pays before current subscription expires, extend from current expiration date!
  if (currentExpirationIso) {
    const currentExp = new Date(currentExpirationIso);
    if (currentExp.getTime() > now.getTime()) {
      baseDate = currentExp;
    }
  }

  let expDate: Date;

  if (plan === "weekly") {
    // Exactly 7 days (604,800,000 ms)
    expDate = new Date(baseDate.getTime() + 7 * 24 * 60 * 60 * 1000);
  } else {
    // Monthly Plan
    if (billingCycle === "calendar_month") {
      const year = baseDate.getFullYear();
      const month = baseDate.getMonth();
      const day = baseDate.getDate();

      // If baseDate is already at the last day of the month or near end, roll to next month's last day
      const lastDayOfCurrentMonth = new Date(year, month + 1, 0).getDate();
      if (day >= lastDayOfCurrentMonth - 3) {
        // Aligned to last day of next month at 23:59:59
        expDate = new Date(year, month + 2, 0, 23, 59, 59, 999);
      } else {
        // Aligned to last day of current month at 23:59:59
        expDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
      }
    } else {
      // Exact 30 days
      expDate = new Date(baseDate.getTime() + 30 * 24 * 60 * 60 * 1000);
    }
  }

  return {
    startDate: baseDate === now ? now : new Date(now),
    expirationDate: expDate,
    nextDueDate: expDate
  };
}

// ============================================================================
// 4. AUTOMATIC EXPIRATION CHECK & DUE-DATE NOTIFICATIONS SCHEDULER
// ============================================================================

export function checkAndExpireSubscriptionsAndSendReminders(): {
  expiredCount: number;
  remindersSent: number;
} {
  const now = Date.now();
  let expiredCount = 0;
  let remindersSent = 0;
  let subsModified = false;
  let notifsModified = false;

  subscriptions.forEach(sub => {
    const norm = normalizeSubscriptionStatus(sub.status);
    const expTime = new Date(sub.expirationDate).getTime();
    const diffMs = expTime - now;
    const diffDays = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
    const expDateStr = sub.expirationDate.split("T")[0];

    // Preserve administrative suspension
    if (norm === "SUSPENDED") {
      sub.status = "SUSPENDED";
      return;
    }

    // Preserve pending verification state
    if (norm === "PENDING") {
      sub.status = "PENDING";
      return;
    }

    // 1. Expiration check: If current time is past expiration, strictly expire!
    if (now >= expTime && norm === "ACTIVE") {
      sub.status = "EXPIRED";
      sub.updatedAt = new Date().toISOString();
      expiredCount++;
      subsModified = true;

      // Send Expired notification
      const dedupKey = `expired:${sub.id}:${expDateStr}`;
      if (!notifications.some(n => n.dedupKey === dedupKey)) {
        notifications.unshift({
          id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          recipientType: "stall",
          recipientId: sub.stallName,
          title: "Subscription Expired",
          message:
            "Your subscription has expired. Portal access is currently restricted. Please complete your payment and wait for verification to restore access.",
          type: "expired",
          isRead: false,
          link: "subscription",
          createdAt: new Date().toISOString(),
          dedupKey
        });
        remindersSent++;
        notifsModified = true;
      }
    }

    // 2. Due-Date Reminders for ACTIVE subscribers
    if (norm === "ACTIVE" && now < expTime) {
      sub.status = "ACTIVE";
      const planPrice = sub.plan === "weekly" ? adminSettings.plans.weekly.price : adminSettings.plans.monthly.price;

      // 7 Days Before (Monthly only)
      if (diffDays === 7 && sub.plan === "monthly") {
        const dedupKey = `remind_7d:${sub.id}:${expDateStr}`;
        if (!notifications.some(n => n.dedupKey === dedupKey)) {
          notifications.unshift({
            id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            recipientType: "stall",
            recipientId: sub.stallName,
            title: "Subscription Reminder (7 Days Left)",
            message: `Subscription Reminder: Your subscription will expire soon. Please prepare your ₱${planPrice} monthly payment to continue using the portal.`,
            type: "reminder_7d",
            isRead: false,
            link: "subscription",
            createdAt: new Date().toISOString(),
            dedupKey
          });
          remindersSent++;
          notifsModified = true;
        }
      }

      // 3 Days Before (Monthly)
      if (diffDays === 3 && sub.plan === "monthly") {
        const dedupKey = `remind_3d:${sub.id}:${expDateStr}`;
        if (!notifications.some(n => n.dedupKey === dedupKey)) {
          notifications.unshift({
            id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            recipientType: "stall",
            recipientId: sub.stallName,
            title: "Subscription Reminder (3 Days Left)",
            message: `Reminder: Your subscription is due in 3 days. Renew your plan to avoid losing access to the portal.`,
            type: "reminder_3d",
            isRead: false,
            link: "subscription",
            createdAt: new Date().toISOString(),
            dedupKey
          });
          remindersSent++;
          notifsModified = true;
        }
      }

      // 2 Days Before (Weekly)
      if (diffDays === 2 && sub.plan === "weekly") {
        const dedupKey = `remind_2d:${sub.id}:${expDateStr}`;
        if (!notifications.some(n => n.dedupKey === dedupKey)) {
          notifications.unshift({
            id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            recipientType: "stall",
            recipientId: sub.stallName,
            title: "Weekly Subscription Reminder (2 Days Left)",
            message: `Reminder: Your weekly subscription is due in 2 days. Renew your plan to maintain uninterrupted portal access.`,
            type: "reminder_3d",
            isRead: false,
            link: "subscription",
            createdAt: new Date().toISOString(),
            dedupKey
          });
          remindersSent++;
          notifsModified = true;
        }
      }

      // 1 Day Before
      if (diffDays === 1) {
        const dedupKey = `remind_1d:${sub.id}:${expDateStr}`;
        if (!notifications.some(n => n.dedupKey === dedupKey)) {
          notifications.unshift({
            id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            recipientType: "stall",
            recipientId: sub.stallName,
            title: "Final Subscription Reminder (Due Tomorrow)",
            message:
              "Final Reminder: Your subscription is due tomorrow. Please complete your payment before your access expires.",
            type: "reminder_1d",
            isRead: false,
            link: "subscription",
            createdAt: new Date().toISOString(),
            dedupKey
          });
          remindersSent++;
          notifsModified = true;
        }
      }

      // On Due Date (0 days left or due today)
      if (diffDays === 0) {
        const dedupKey = `remind_due_today:${sub.id}:${expDateStr}`;
        if (!notifications.some(n => n.dedupKey === dedupKey)) {
          notifications.unshift({
            id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            recipientType: "stall",
            recipientId: sub.stallName,
            title: "Payment Due Today!",
            message: "Payment Due Today! Please renew your subscription to maintain uninterrupted portal access.",
            type: "due_today",
            isRead: false,
            link: "subscription",
            createdAt: new Date().toISOString(),
            dedupKey
          });
          remindersSent++;
          notifsModified = true;
        }
      }
    }
  });

  // Check and update trials against server's Date.now()
  let trialsModified = false;
  trials.forEach(trial => {
    if (trial.startDate && trial.endDate) {
      const endMs = new Date(trial.endDate).getTime();
      const isPaid = subscriptions.some(
        s => s.stallName === trial.stallName &&
             normalizeSubscriptionStatus(s.status) === "ACTIVE" &&
             !s.isTrial &&
             new Date(s.expirationDate).getTime() > now
      );

      if (isPaid) {
        if (trial.trialStatus !== "Subscribed") {
          trial.trialStatus = "Subscribed";
          trial.updatedAt = new Date().toISOString();
          trialsModified = true;
        }
      } else if (now >= endMs) {
        if (trial.trialStatus !== "Trial Expired") {
          trial.trialStatus = "Trial Expired";
          trial.updatedAt = new Date().toISOString();
          trialsModified = true;

          // Notify stall owner of trial expiration
          const dedupKey = `trial_expired:${trial.stallName}:${trial.endDate.split("T")[0]}`;
          if (!notifications.some(n => n.dedupKey === dedupKey)) {
            notifications.unshift({
              id: `notif_${Date.now()}_trial_exp`,
              recipientType: "stall",
              recipientId: trial.stallName,
              title: "Free 14-Day Trial Expired",
              message:
                "Your Free 14-Day Trial has expired. Access to merchant portal features is locked. Please choose an official weekly or monthly subscription plan to restore full access.",
              type: "expired",
              isRead: false,
              link: "subscription",
              createdAt: new Date().toISOString(),
              dedupKey
            });
            notifsModified = true;
          }
        }
      } else if (trial.trialStatus !== "Trial Active") {
        trial.trialStatus = "Trial Active";
        trial.updatedAt = new Date().toISOString();
        trialsModified = true;
      }
    }
  });

  if (subsModified) saveJsonFile(SUBSCRIPTIONS_FILE, subscriptions);
  if (trialsModified) saveJsonFile(TRIALS_FILE, trials);
  if (notifsModified) saveJsonFile(NOTIFICATIONS_FILE, notifications);

  return { expiredCount, remindersSent };
}

// Run scheduler on boot and every 60 seconds
checkAndExpireSubscriptionsAndSendReminders();
setInterval(checkAndExpireSubscriptionsAndSendReminders, 60 * 1000);

// ============================================================================
// 5. SERVER-SIDE AUTHORITATIVE TRIAL & SUBSCRIPTION CALCULATOR
// ============================================================================

export function getStallSubscriptionAndTrialInfo(stallName: string) {
  checkAndExpireSubscriptionsAndSendReminders();

  const now = Date.now();
  const sub = subscriptions.find(s => s.stallName === stallName);
  let trial = trials.find(t => t.stallName === stallName);

  if (!trial) {
    trial = {
      stallName,
      ownerId: `cred_${stallName.split("—")[0].trim()}`,
      trialStatus: "Not Started",
      startDate: null,
      endDate: null,
      durationDays: 14,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    trials.push(trial);
    saveJsonFile(TRIALS_FILE, trials);
  }

  const normSubStatus = sub ? normalizeSubscriptionStatus(sub.status) : 'EXPIRED';

  // 1. Check if administrative suspension
  if (normSubStatus === 'SUSPENDED') {
    return {
      hasSubscription: true,
      status: 'SUSPENDED' as const,
      trialStatus: trial.trialStatus,
      isTrial: false,
      isSubscribed: false,
      trialStartDate: trial.startDate,
      trialEndDate: trial.endDate,
      trialDaysRemaining: 0,
      serverTime: new Date().toISOString(),
      isExpired: true,
      daysRemaining: 0,
      subscription: sub
    };
  }

  // 2. Check if pending verification
  if (normSubStatus === 'PENDING') {
    return {
      hasSubscription: true,
      status: 'PENDING' as const,
      trialStatus: trial.trialStatus,
      isTrial: false,
      isSubscribed: false,
      trialStartDate: trial.startDate,
      trialEndDate: trial.endDate,
      trialDaysRemaining: 0,
      serverTime: new Date().toISOString(),
      isExpired: true,
      daysRemaining: 0,
      subscription: sub
    };
  }

  // 3. Check if stall has an active verified paid subscription
  const isPaidActive = sub && normSubStatus === "ACTIVE" && !sub.isTrial && new Date(sub.expirationDate).getTime() > now;

  let trialStatus: TrialStatus = trial.trialStatus;
  let isTrial = false;
  let isSubscribed = false;
  let trialDaysRemaining = 0;

  if (isPaidActive) {
    trialStatus = "Subscribed";
    isSubscribed = true;
  } else if (trial.startDate && trial.endDate) {
    const endMs = new Date(trial.endDate).getTime();
    if (now < endMs) {
      trialStatus = "Trial Active";
      isTrial = true;
      trialDaysRemaining = Math.max(1, Math.ceil((endMs - now) / (1000 * 60 * 60 * 24)));
    } else {
      trialStatus = "Trial Expired";
      trialDaysRemaining = 0;
    }
  } else {
    trialStatus = "Not Started";
  }

  const expTime = sub ? new Date(sub.expirationDate).getTime() : 0;
  const daysRemaining = isPaidActive
    ? Math.max(0, Math.ceil((expTime - now) / (1000 * 60 * 60 * 24)))
    : (isTrial ? trialDaysRemaining : 0);

  const isExpired = !isPaidActive && !isTrial;
  const finalStatus: 'ACTIVE' | 'PENDING' | 'EXPIRED' | 'SUSPENDED' =
    (isPaidActive || isTrial) ? 'ACTIVE' : 'EXPIRED';

  return {
    hasSubscription: !!sub || isTrial || isPaidActive,
    status: finalStatus,
    trialStatus,
    isTrial,
    isSubscribed,
    trialStartDate: trial.startDate,
    trialEndDate: trial.endDate,
    trialDaysRemaining,
    serverTime: new Date().toISOString(),
    isExpired,
    daysRemaining,
    subscription: sub
  };
}

export function isStallSubscriptionActive(stallName: string): {
  active: boolean;
  status: 'ACTIVE' | 'PENDING' | 'EXPIRED' | 'SUSPENDED';
  reason?: string;
  subscription?: UserSubscription;
} {
  if (!stallName) return { active: false, status: 'EXPIRED', reason: "Stall identifier required" };

  const info = getStallSubscriptionAndTrialInfo(stallName);

  if (info.status === 'ACTIVE') {
    return { active: true, status: 'ACTIVE', subscription: info.subscription };
  }

  if (info.status === 'SUSPENDED') {
    return {
      active: false,
      status: 'SUSPENDED',
      reason: "Stall portal access and menu listings are suspended by the administrator.",
      subscription: info.subscription
    };
  }

  if (info.status === 'PENDING') {
    return {
      active: false,
      status: 'PENDING',
      reason: "Subscription payment proof has been submitted and is pending administrator verification.",
      subscription: info.subscription
    };
  }

  if (info.trialStatus === "Not Started") {
    return {
      active: false,
      status: 'EXPIRED',
      reason: "Your Free 14-Day Trial has not been activated yet. Please activate your Free 14-Day Trial to unlock merchant portal features.",
      subscription: info.subscription
    };
  }

  return {
    active: false,
    status: 'EXPIRED',
    reason: "Subscription has expired. Please submit renewal payment to unlock portal features.",
    subscription: info.subscription
  };
}

// ============================================================================
// 6. AUDIT LOGGING HELPER
// ============================================================================

export function logAuditAction(
  action: AuditLogEntry["action"],
  performedBy: string,
  targetStall: string,
  details: string,
  metadata?: Record<string, any>
) {
  const entry: AuditLogEntry = {
    id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    action,
    performedBy,
    targetStall,
    details,
    metadata,
    timestamp: new Date().toISOString()
  };
  auditLogs.unshift(entry);
  if (auditLogs.length > 500) {
    auditLogs = auditLogs.slice(0, 500);
  }
  saveJsonFile(AUDIT_LOGS_FILE, auditLogs);
}

// ============================================================================
// 7. SUBSCRIPTION API ROUTE REGISTRATION
// ============================================================================

export interface MerchantAdminHooks {
  getRegisteredOwners: () => StallOwnerAccount[];
  setOwnerStatus?: (ownerId: string, status: "active" | "suspended") => Promise<StallOwnerAccount | null> | StallOwnerAccount | null;
}

export function registerSubscriptionRoutes(app: express.Express, hooks?: MerchantAdminHooks) {
  // --------------------------------------------------------------------------
  // A. Public / Stall Owner Endpoints
  // --------------------------------------------------------------------------

  // 1. Get Payment Instructions & Plans
  app.get("/api/subscription/settings", (_req, res) => {
    res.json({
      success: true,
      settings: {
        gcash: adminSettings.gcash,
        bank: adminSettings.bank,
        qrCode: adminSettings.qrCode,
        plans: adminSettings.plans
      }
    });
  });

  // 2. Get Subscription & Trial Status for a Specific Stall (Requires authenticated Merchant for that stall OR Super Admin)
  app.get("/api/subscription/status/:stallName", (req, res) => {
    try {
      const stallName = decodeURIComponent(req.params.stallName);
      const merchantSession = getMerchantSession(req);
      const adminSession = getAdminSession(req);
      if (!adminSession && (!merchantSession || merchantSession.stallName !== stallName)) {
        return res.status(401).json({ error: "Merchant or administrator authentication required." });
      }

      const info = getStallSubscriptionAndTrialInfo(stallName);
      const pendingPayment = payments.find(
        p => p.stallName === stallName && p.status === "Pending Verification"
      );

      res.json({
        hasSubscription: info.hasSubscription,
        status: info.status,
        trialStatus: info.trialStatus,
        isTrial: info.isTrial,
        isSubscribed: info.isSubscribed,
        trialStartDate: info.trialStartDate,
        trialEndDate: info.trialEndDate,
        trialDaysRemaining: info.trialDaysRemaining,
        serverTime: info.serverTime,
        isExpired: info.isExpired,
        daysRemaining: info.daysRemaining,
        stallName,
        subscription: info.subscription || null,
        pendingPayment: pendingPayment || null
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to get subscription status" });
    }
  });

  // 2B. Start / Activate Free 14-Day Trial for Authenticated Stall Owner
  app.post("/api/subscription/start-trial", (req, res) => {
    try {
      const { stallName } = req.body;
      if (!stallName || typeof stallName !== "string") {
        return res.status(400).json({ error: "Stall name is required to activate the Free 14-Day Trial." });
      }

      const cleanStallName = stallName.trim();
      const session = requireMerchant(req, res, cleanStallName);
      if (!session) return;

      let trial = trials.find(t => t.stallName === cleanStallName);

      // Security check: NEVER allow restarting trial on refresh, logout, or clearing browser cache
      if (trial && trial.startDate) {
        const endMs = new Date(trial.endDate!).getTime();
        const now = Date.now();
        const trialDaysRemaining = Math.max(0, Math.ceil((endMs - now) / (1000 * 60 * 60 * 24)));
        const isExpired = now >= endMs;
        return res.status(400).json({
          error: isExpired 
            ? "Your Free 14-Day Trial has already expired and cannot be restarted. Please choose an official subscription plan below."
            : "Your Free 14-Day Trial is already active and cannot be restarted.",
          trialStatus: isExpired ? "Trial Expired" : "Trial Active",
          trialStartDate: trial.startDate,
          trialEndDate: trial.endDate,
          trialDaysRemaining,
          serverTime: new Date().toISOString()
        });
      }

      const now = new Date();
      const startDate = now.toISOString();
      const endDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();

      if (!trial) {
        trial = {
          stallName: cleanStallName,
          ownerId: `cred_${cleanStallName.split("—")[0].trim()}`,
          trialStatus: "Trial Active",
          startDate,
          endDate,
          durationDays: 14,
          createdAt: startDate,
          updatedAt: startDate
        };
        trials.push(trial);
      } else {
        trial.trialStatus = "Trial Active";
        trial.startDate = startDate;
        trial.endDate = endDate;
        trial.durationDays = 14;
        trial.updatedAt = startDate;
      }
      saveJsonFile(TRIALS_FILE, trials);

      // Update or create active subscription record
      let sub = subscriptions.find(s => s.stallName === cleanStallName);
      if (!sub) {
        sub = {
          id: `sub_trial_${cleanStallName.toLowerCase().replace(/[^a-z0-9]/g, "_")}`,
          stallName: cleanStallName,
          ownerId: `cred_${cleanStallName.split("—")[0].trim()}`,
          plan: "trial",
          status: "Active",
          isTrial: true,
          trialStartDate: startDate,
          trialEndDate: endDate,
          trialStatus: "Trial Active",
          startDate,
          expirationDate: endDate,
          nextDueDate: endDate,
          billingCycle: "weekly",
          autoRenewReminder: true,
          updatedAt: startDate,
          createdAt: startDate
        };
        subscriptions.push(sub);
      } else {
        sub.status = "Active";
        sub.isTrial = true;
        sub.trialStartDate = startDate;
        sub.trialEndDate = endDate;
        sub.trialStatus = "Trial Active";
        sub.startDate = startDate;
        sub.expirationDate = endDate;
        sub.nextDueDate = endDate;
        sub.updatedAt = startDate;
      }
      saveJsonFile(SUBSCRIPTIONS_FILE, subscriptions);

      // Notify stall owner
      notifications.unshift({
        id: `notif_${Date.now()}_trial_welcome`,
        recipientType: "stall",
        recipientId: cleanStallName,
        title: "Free 14-Day Trial Activated!",
        message: `Welcome to your Free 14-Day Trial! You now have unrestricted access to manage menu dishes, update prices, upload protected photos, and track daily sales until ${new Date(endDate).toLocaleDateString()}.`,
        type: "access_granted",
        isRead: false,
        link: "portal",
        createdAt: startDate
      });
      saveJsonFile(NOTIFICATIONS_FILE, notifications);

      logAuditAction(
        "grant_manual_access",
        "System Auto-Enrollment",
        cleanStallName,
        `Activated Free 14-Day Trial for ${cleanStallName} ending ${endDate}`,
        { durationDays: 14, trialEndDate: endDate }
      );

      return res.json({
        success: true,
        message: "Free 14-Day Trial activated successfully! You now have 14 days of full access to all stall-owner portal features.",
        trialStatus: "Trial Active",
        trialStartDate: startDate,
        trialEndDate: endDate,
        trialDaysRemaining: 14,
        serverTime: now.toISOString()
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to start free trial." });
    }
  });

  // 3. Submit Payment for Verification (Requires authenticated Merchant matching stallName)
  app.post("/api/subscription/submit-payment", (req, res) => {
    try {
      const {
        stallName,
        ownerId,
        ownerName,
        plan,
        amount,
        paymentMethod,
        referenceNumber,
        paymentDate,
        proofImageDataUrl,
        notes
      } = req.body;

      if (!stallName || !plan || !amount || !paymentMethod || !referenceNumber || !proofImageDataUrl) {
        return res.status(400).json({
          error: "All fields are required (stall, plan, amount, payment method, reference number, and receipt photo)."
        });
      }

      const session = requireMerchant(req, res, String(stallName).trim());
      if (!session) return;

      const cleanRef = String(referenceNumber).trim();
      if (cleanRef.length < 4) {
        return res.status(400).json({ error: "Please enter a valid payment reference number." });
      }

      // Check for duplicate reference number among approved payments
      const duplicateApproved = payments.find(
        p => p.referenceNumber.toLowerCase() === cleanRef.toLowerCase() && p.status === "Approved"
      );
      if (duplicateApproved) {
        return res.status(400).json({
          error: "This reference number has already been verified and used for a subscription."
        });
      }

      // Save proof photo to disk
      let proofUrl = "/uploads/admin/official_qr.svg";
      if (typeof proofImageDataUrl === "string" && proofImageDataUrl.startsWith("data:image/")) {
        const matches = proofImageDataUrl.match(/^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/i);
        if (!matches) {
          return res.status(400).json({ error: "Invalid receipt photo format (JPG, PNG, WEBP allowed)." });
        }
        let ext = matches[1].toLowerCase();
        if (ext === "jpeg") ext = "jpg";
        const buffer = Buffer.from(matches[2], "base64");
        if (buffer.length > 12 * 1024 * 1024) {
          return res.status(400).json({ error: "Receipt photo exceeds 12MB limit." });
        }

        const stallSlug = stallName.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_");
        const filename = `proof_${stallSlug}_${Date.now()}.${ext}`;
        const filePath = path.join(PROOFS_DIR, filename);
        fs.writeFileSync(filePath, buffer);
        proofUrl = `/uploads/proofs/${filename}`;
      } else if (typeof proofImageDataUrl === "string" && proofImageDataUrl.startsWith("/uploads/")) {
        proofUrl = proofImageDataUrl;
      }

      const newPayment: PaymentRecord = {
        id: `pay_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        stallName,
        ownerId: ownerId || `cred_${stallName.split("—")[0].trim()}`,
        ownerName: ownerName || `${stallName} Staff`,
        plan: plan as SubscriptionPlanType,
        amount: Number(amount),
        paymentMethod: paymentMethod as PaymentMethod,
        referenceNumber: cleanRef,
        paymentDate: paymentDate || new Date().toISOString().split("T")[0],
        proofImageUrl: proofUrl,
        status: "Pending Verification",
        submittedAt: new Date().toISOString(),
        notes: notes ? String(notes).trim() : undefined
      };

      payments.unshift(newPayment);
      saveJsonFile(PAYMENTS_FILE, payments);

      // Create Admin Notification
      notifications.unshift({
        id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        recipientType: "admin",
        recipientId: "admin",
        title: "New Payment Pending Verification",
        message: `Payment of ₱${newPayment.amount} submitted by ${stallName} via ${paymentMethod.toUpperCase()} (Ref: ${cleanRef}). Please review and verify.`,
        type: "payment_pending",
        isRead: false,
        link: "admin",
        createdAt: new Date().toISOString()
      });
      saveJsonFile(NOTIFICATIONS_FILE, notifications);

      res.json({
        success: true,
        message:
          "Payment proof submitted successfully! Your receipt is now Pending Verification by the administrator. Portal access will be activated upon approval.",
        payment: newPayment
      });
    } catch (err: any) {
      console.error("Payment submission error:", err);
      res.status(500).json({ error: err.message || "Failed to submit payment proof." });
    }
  });

  // 4. Get Payment History for a Stall (Authenticated Merchant or Super Admin)
  app.get("/api/subscription/payments/:stallName", (req, res) => {
    try {
      const stallName = decodeURIComponent(req.params.stallName);
      const merchantSession = getMerchantSession(req);
      const adminSession = getAdminSession(req);
      if (!adminSession && (!merchantSession || merchantSession.stallName !== stallName)) {
        return res.status(401).json({ error: "Authentication required to view stall payment records." });
      }

      const list = payments.filter(p => p.stallName === stallName);
      res.json({ success: true, payments: list });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to get payments" });
    }
  });

  // 5. In-App Notifications for a recipient (Stall or Admin)
  app.get("/api/notifications/:recipientId", (req, res) => {
    try {
      const recipientId = decodeURIComponent(req.params.recipientId);
      const merchantSession = getMerchantSession(req);
      const adminSession = getAdminSession(req);

      if (recipientId === "admin" && !adminSession) {
        return res.status(401).json({ error: "Super Admin authentication required." });
      }
      if (recipientId !== "all" && recipientId !== "admin") {
        if (!adminSession && (!merchantSession || merchantSession.stallName !== recipientId)) {
          return res.status(401).json({ error: "Authentication required for stall notifications." });
        }
      }

      checkAndExpireSubscriptionsAndSendReminders();

      const filtered = notifications.filter(
        n => n.recipientId === recipientId || (recipientId !== "admin" && n.recipientType === "all")
      );
      const unreadCount = filtered.filter(n => !n.isRead).length;

      res.json({
        success: true,
        notifications: filtered,
        unreadCount
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to fetch notifications" });
    }
  });

  // 6. Mark Notifications as Read
  app.post("/api/notifications/mark-read", (req, res) => {
    try {
      if (!verifyCsrfForCookieMutation(req)) {
        return res.status(403).json({ error: "Security check failed." });
      }
      const { recipientId, notificationId, markAll } = req.body;
      if (!recipientId) return res.status(400).json({ error: "Recipient ID required" });

      const merchantSession = getMerchantSession(req);
      const adminSession = getAdminSession(req);
      if (recipientId === "admin" && !adminSession) {
        return res.status(401).json({ error: "Admin authentication required." });
      }
      if (recipientId !== "all" && recipientId !== "admin" && !adminSession && (!merchantSession || merchantSession.stallName !== recipientId)) {
        return res.status(401).json({ error: "Authentication required." });
      }

      if (markAll) {
        notifications.forEach(n => {
          if (n.recipientId === recipientId || (recipientId !== "admin" && n.recipientType === "all")) {
            n.isRead = true;
          }
        });
      } else if (notificationId) {
        const item = notifications.find(n => n.id === notificationId);
        if (item && (item.recipientId === recipientId || item.recipientType === "all")) {
          item.isRead = true;
        }
      }

      saveJsonFile(NOTIFICATIONS_FILE, notifications);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to mark notifications read" });
    }
  });

  // --------------------------------------------------------------------------
  // B. Single Super Administrator Endpoints (Registration-First, Then Login)
  // --------------------------------------------------------------------------

  // 0. Check whether the single Super Admin account exists (public boolean only)
  app.get("/api/admin/status", (_req, res) => {
    res.json({
      success: true,
      isRegistered: isSuperAdminRegistered()
    });
  });

  // 0B. Initial Single Super Admin Registration (Strictly once only!)
  app.post("/api/admin/register", async (req, res) => {
    try {
      if (!verifyCsrfForCookieMutation(req)) {
        return res.status(403).json({ error: "Security check failed." });
      }

      // Reject if currently logged in as a merchant or student trying to escalate
      if (getMerchantSession(req)) {
        return res.status(403).json({ error: "Stall owner accounts cannot register as Super Administrator." });
      }

      const { name, username, email, password, pin } = req.body || {};
      const result = await createSingleSuperAdmin({
        name: String(name || ""),
        username: String(username || ""),
        email: String(email || ""),
        password: String(password || ""),
        pin: pin ? String(pin) : undefined
      });

      if (!result.success) {
        return res.status(result.status || 400).json({ error: result.error });
      }

      logAuditAction(
        "update_settings",
        result.admin!.username,
        "System Security",
        "Initial Super Administrator account registered."
      );

      return res.status(201).json({
        success: true,
        message: "Super Administrator account registered permanently. Please log in with your registered credentials.",
        admin: result.admin
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to register Super Administrator." });
    }
  });

  // 1. Super Admin Login (Strictly against persisted Super Admin record)
  app.post("/api/admin/login", (req, res) => {
    try {
      if (!verifyCsrfForCookieMutation(req)) {
        return res.status(403).json({ error: "Security check failed." });
      }

      if (!isSuperAdminRegistered()) {
        return res.status(403).json({
          error: "Super Administrator has not been registered yet. Complete initial registration first.",
          needsRegistration: true
        });
      }

      const { identifier, password, pin } = req.body || {};
      const auth = verifySuperAdminCredentials({ identifier, password, pin });

      if (!auth.success || !auth.admin) {
        return res.status(401).json({ error: auth.error || "Invalid Super Administrator credentials." });
      }

      const token = signSessionToken({
        role: "admin",
        adminId: auth.admin.id,
        username: auth.admin.username,
        name: auth.admin.name,
        email: auth.admin.email
      });
      setSessionCookie(req, res, ADMIN_COOKIE_NAME, token);

      return res.json({
        success: true,
        admin: auth.admin
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Admin login failed" });
    }
  });

  // 1B. Super Admin Logout
  app.post("/api/admin/logout", (req, res) => {
    clearSessionCookie(req, res, ADMIN_COOKIE_NAME);
    res.json({ success: true });
  });

  // 2. Admin Dashboard Overview & Summary Statistics (Protected)
  app.get("/api/admin/summary", (req, res) => {
    try {
      const admin = requireSuperAdmin(req, res);
      if (!admin) return;

      checkAndExpireSubscriptionsAndSendReminders();

      const totalSubscribers = subscriptions.length;
      const activeSubscribers = subscriptions.filter(s => normalizeSubscriptionStatus(s.status) === "ACTIVE").length;
      const weeklySubscribers = subscriptions.filter(s => normalizeSubscriptionStatus(s.status) === "ACTIVE" && s.plan === "weekly").length;
      const monthlySubscribers = subscriptions.filter(s => normalizeSubscriptionStatus(s.status) === "ACTIVE" && s.plan === "monthly").length;
      const expiredSubscribers = subscriptions.filter(s => normalizeSubscriptionStatus(s.status) === "EXPIRED").length;

      const pendingPaymentsCount = payments.filter(p => p.status === "Pending Verification").length;
      const approvedPaymentsCount = payments.filter(p => p.status === "Approved").length;
      const rejectedPaymentsCount = payments.filter(p => p.status === "Rejected").length;

      // Revenue: strictly calculate from verified/approved payments only! Never include pending or rejected!
      const totalVerifiedRevenue = payments
        .filter(p => p.status === "Approved")
        .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

      const summary: AdminSubscriptionSummary = {
        totalSubscribers,
        activeSubscribers,
        weeklySubscribers,
        monthlySubscribers,
        expiredSubscribers,
        pendingPaymentsCount,
        approvedPaymentsCount,
        rejectedPaymentsCount,
        totalVerifiedRevenue
      };

      const registeredOwners = hooks?.getRegisteredOwners ? hooks.getRegisteredOwners() : [];
      const merchants = registeredOwners.map(owner => {
        const info = getStallSubscriptionAndTrialInfo(owner.stallName);
        return {
          ...owner,
          subscriptionStatus: info.status,
          trialStatus: info.trialStatus,
          expirationDate: info.subscription?.expirationDate || info.trialEndDate || null
        };
      });

      res.json({
        success: true,
        summary,
        subscriptions,
        merchants,
        recentPayments: payments.slice(0, 50),
        settings: adminSettings
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to load admin summary" });
    }
  });

  // 2B. Admin: Registered Stall Owners List & Account Control
  app.get("/api/admin/merchants", (req, res) => {
    try {
      const admin = requireSuperAdmin(req, res);
      if (!admin) return;
      const registeredOwners = hooks?.getRegisteredOwners ? hooks.getRegisteredOwners() : [];
      const merchants = registeredOwners.map(owner => {
        const info = getStallSubscriptionAndTrialInfo(owner.stallName);
        return {
          ...owner,
          subscriptionStatus: info.status,
          trialStatus: info.trialStatus,
          expirationDate: info.subscription?.expirationDate || info.trialEndDate || null
        };
      });
      res.json({ success: true, merchants });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to load merchants" });
    }
  });

  app.post("/api/admin/merchants/:id/status", async (req, res) => {
    try {
      const admin = requireSuperAdmin(req, res);
      if (!admin) return;
      const ownerId = req.params.id;
      const { status, accountStatus, reason } = req.body || {};
      const nextStatus = status || accountStatus;
      if (nextStatus !== "active" && nextStatus !== "suspended") {
        return res.status(400).json({ error: "Status must be 'active' or 'suspended'." });
      }
      if (!hooks?.setOwnerStatus) {
        return res.status(500).json({ error: "Merchant status service unavailable." });
      }
      const updated = await hooks.setOwnerStatus(ownerId, nextStatus);
      if (!updated) {
        return res.status(404).json({ error: "Merchant account not found." });
      }
      logAuditAction(
        nextStatus === "suspended" ? "suspend_stall" : "grant_manual_access",
        admin.username,
        updated.stallName,
        `Set merchant account (${updated.username}) status to ${nextStatus}. ${reason ? `Reason: ${reason}` : ""}`.trim()
      );
      res.json({ success: true, merchant: updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to update merchant status" });
    }
  });

  // 3. Admin: Verify Payment (Approve or Reject with Reason)
  app.post("/api/admin/payments/:id/verify", (req, res) => {
    try {
      const admin = requireSuperAdmin(req, res);
      if (!admin) return;

      const paymentId = req.params.id;
      const { action, rejectionReason } = req.body;

      if (action !== "approve" && action !== "reject") {
        return res.status(400).json({ error: "Action must be 'approve' or 'reject'." });
      }

      const payment = payments.find(p => p.id === paymentId);
      if (!payment) {
        return res.status(404).json({ error: "Payment record not found." });
      }

      // Prevent duplicate approval/extension
      if (payment.status === "Approved") {
        return res.status(400).json({ error: "This payment has already been approved." });
      }

      const verifier = admin.username;
      const now = new Date();

      if (action === "approve") {
        payment.status = "Approved";
        payment.verifiedAt = now.toISOString();
        payment.verifiedBy = verifier;

        // Activate or Extend Subscription
        let sub = subscriptions.find(s => s.stallName === payment.stallName);
        const { startDate, expirationDate, nextDueDate } = computeNextExpiration(
          normalizeSubscriptionStatus(sub?.status) === "ACTIVE" ? sub!.expirationDate : undefined,
          payment.plan,
          adminSettings.plans.monthly.billingCycle
        );

        if (!sub) {
          sub = {
            id: `sub_${payment.stallName.toLowerCase().replace(/[^a-z0-9]/g, "_")}`,
            stallName: payment.stallName,
            ownerId: payment.ownerId,
            plan: payment.plan,
            status: "ACTIVE",
            startDate: startDate.toISOString(),
            expirationDate: expirationDate.toISOString(),
            nextDueDate: nextDueDate.toISOString(),
            billingCycle: payment.plan === "monthly" ? "calendar_month" : "weekly",
            lastPaymentId: payment.id,
            autoRenewReminder: true,
            updatedAt: now.toISOString(),
            createdAt: now.toISOString()
          };
          subscriptions.push(sub);
        } else {
          sub.plan = payment.plan;
          sub.status = "ACTIVE";
          sub.startDate = startDate.toISOString();
          sub.expirationDate = expirationDate.toISOString();
          sub.nextDueDate = nextDueDate.toISOString();
          sub.lastPaymentId = payment.id;
          sub.updatedAt = now.toISOString();
        }

        payment.subscriptionExtendedTo = expirationDate.toISOString();

        saveJsonFile(SUBSCRIPTIONS_FILE, subscriptions);
        saveJsonFile(PAYMENTS_FILE, payments);

        // Notify Stall Owner
        notifications.unshift({
          id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          recipientType: "stall",
          recipientId: payment.stallName,
          title: "Payment Approved! Portal Access Active",
          message: `Your payment of ₱${payment.amount} (Ref: ${payment.referenceNumber}) has been approved. Your ${payment.plan} subscription is active until ${expirationDate.toLocaleDateString()}!`,
          type: "payment_approved",
          isRead: false,
          link: "portal",
          createdAt: now.toISOString()
        });
        saveJsonFile(NOTIFICATIONS_FILE, notifications);

        // Audit Log
        logAuditAction(
          "approve_payment",
          verifier,
          payment.stallName,
          `Approved payment ₱${payment.amount} (Ref: ${payment.referenceNumber}). Extended ${payment.plan} subscription to ${expirationDate.toISOString()}`,
          { paymentId: payment.id, amount: payment.amount, plan: payment.plan }
        );

        return res.json({
          success: true,
          message: `Payment approved! ${payment.stallName} is now active until ${expirationDate.toLocaleDateString()}.`,
          payment,
          subscription: sub
        });
      } else {
        // Reject Payment
        const reason = String(rejectionReason || "").trim() || "Payment proof could not be verified or reference number does not match banking records.";

        payment.status = "Rejected";
        payment.rejectionReason = reason;
        payment.verifiedAt = now.toISOString();
        payment.verifiedBy = verifier;

        let sub = subscriptions.find(s => s.stallName === payment.stallName);
        if (sub && normalizeSubscriptionStatus(sub.status) === "PENDING") {
          sub.status = "EXPIRED";
          sub.updatedAt = now.toISOString();
          saveJsonFile(SUBSCRIPTIONS_FILE, subscriptions);
        }

        saveJsonFile(PAYMENTS_FILE, payments);

        // Notify Stall Owner
        notifications.unshift({
          id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          recipientType: "stall",
          recipientId: payment.stallName,
          title: "Payment Submission Rejected",
          message: `Your payment of ₱${payment.amount} was rejected: "${reason}". Please submit a new payment proof with correct reference number.`,
          type: "payment_rejected",
          isRead: false,
          link: "subscription",
          createdAt: now.toISOString()
        });
        saveJsonFile(NOTIFICATIONS_FILE, notifications);

        // Audit Log
        logAuditAction(
          "reject_payment",
          verifier,
          payment.stallName,
          `Rejected payment ₱${payment.amount} (Ref: ${payment.referenceNumber}). Reason: ${reason}`,
          { paymentId: payment.id, reason }
        );

        return res.json({
          success: true,
          message: "Payment rejected. Rejection reason and notification sent to stall owner.",
          payment
        });
      }
    } catch (err: any) {
      console.error("Payment verification error:", err);
      res.status(500).json({ error: err.message || "Failed to verify payment." });
    }
  });

  // 4. Admin: Manually Grant, Suspend, or Revoke Access (With Audit Trail)
  app.post("/api/admin/manual-access", (req, res) => {
    try {
      const admin = requireSuperAdmin(req, res);
      if (!admin) return;

      const { stallName, action, durationDays, reason } = req.body;
      if (!stallName || !action) {
        return res.status(400).json({ error: "Stall name and action ('grant', 'suspend', or 'revoke') are required." });
      }

      const verifier = admin.username;
      const now = new Date();
      let sub = subscriptions.find(s => s.stallName === stallName);

      if (action === "grant" || action === "renew") {
        const days = Number(durationDays) || 7;
        const grantExp = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

        if (!sub) {
          sub = {
            id: `sub_${stallName.toLowerCase().replace(/[^a-z0-9]/g, "_")}`,
            stallName,
            ownerId: `cred_${stallName.split("—")[0].trim()}`,
            plan: days >= 30 ? "monthly" : "weekly",
            status: "ACTIVE",
            startDate: now.toISOString(),
            expirationDate: grantExp.toISOString(),
            nextDueDate: grantExp.toISOString(),
            billingCycle: "weekly",
            autoRenewReminder: true,
            isManuallyGranted: true,
            manualGrantReason: reason || "Administrative grace period granted",
            manualGrantExpiresAt: grantExp.toISOString(),
            updatedAt: now.toISOString(),
            createdAt: now.toISOString()
          };
          subscriptions.push(sub);
        } else {
          sub.status = "ACTIVE";
          sub.expirationDate = grantExp.toISOString();
          sub.nextDueDate = grantExp.toISOString();
          sub.isManuallyGranted = true;
          sub.manualGrantReason = reason || "Administrative grace period granted";
          sub.manualGrantExpiresAt = grantExp.toISOString();
          sub.updatedAt = now.toISOString();
        }

        saveJsonFile(SUBSCRIPTIONS_FILE, subscriptions);

        // Notify Stall
        notifications.unshift({
          id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          recipientType: "stall",
          recipientId: stallName,
          title: "Portal Access Activated by Administrator",
          message: `The administrator has granted your stall ${days} days of portal access until ${grantExp.toLocaleDateString()}. Reason: ${reason || "Administrative activation"}.`,
          type: "access_granted",
          isRead: false,
          link: "portal",
          createdAt: now.toISOString()
        });
        saveJsonFile(NOTIFICATIONS_FILE, notifications);

        logAuditAction(
          "grant_manual_access",
          verifier,
          stallName,
          `Manually granted ${days} days access until ${grantExp.toISOString()}. Reason: ${reason || "N/A"}`,
          { days, reason }
        );

        return res.json({
          success: true,
          message: `Granted ${days} days of portal access to ${stallName}.`,
          subscription: sub
        });
      } else if (action === "suspend") {
        if (!sub) {
          sub = {
            id: `sub_${stallName.toLowerCase().replace(/[^a-z0-9]/g, "_")}`,
            stallName,
            ownerId: `cred_${stallName.split("—")[0].trim()}`,
            plan: "monthly",
            status: "SUSPENDED",
            startDate: now.toISOString(),
            expirationDate: now.toISOString(),
            nextDueDate: now.toISOString(),
            billingCycle: "weekly",
            autoRenewReminder: false,
            updatedAt: now.toISOString(),
            createdAt: now.toISOString()
          };
          subscriptions.push(sub);
        } else {
          sub.status = "SUSPENDED";
          sub.updatedAt = now.toISOString();
        }

        saveJsonFile(SUBSCRIPTIONS_FILE, subscriptions);

        notifications.unshift({
          id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          recipientType: "stall",
          recipientId: stallName,
          title: "Portal Access Suspended",
          message: `Your portal access and public cafeteria menus have been suspended by administrator review. Reason: ${reason || "Compliance inspection"}. Contact administration to appeal.`,
          type: "access_revoked",
          isRead: false,
          link: "subscription",
          createdAt: now.toISOString()
        });
        saveJsonFile(NOTIFICATIONS_FILE, notifications);

        logAuditAction(
          "suspend_stall",
          verifier,
          stallName,
          `Suspended stall access. Reason: ${reason || "N/A"}`,
          { reason }
        );

        return res.json({
          success: true,
          message: `Portal access suspended for ${stallName}.`,
          subscription: sub
        });
      } else {
        // Revoke / Expire
        if (sub) {
          sub.status = "EXPIRED";
          sub.isManuallyGranted = false;
          sub.updatedAt = now.toISOString();
          saveJsonFile(SUBSCRIPTIONS_FILE, subscriptions);
        }

        notifications.unshift({
          id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          recipientType: "stall",
          recipientId: stallName,
          title: "Portal Access Revoked",
          message: `Your portal access was revoked by administrator. Reason: ${reason || "Administrative review"}.`,
          type: "access_revoked",
          isRead: false,
          link: "subscription",
          createdAt: now.toISOString()
        });
        saveJsonFile(NOTIFICATIONS_FILE, notifications);

        logAuditAction(
          "revoke_manual_access",
          verifier,
          stallName,
          `Manually revoked access. Reason: ${reason || "N/A"}`,
          { reason }
        );

        return res.json({
          success: true,
          message: `Portal access revoked for ${stallName}.`,
          subscription: sub
        });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to update manual access." });
    }
  });

  // 5. Admin: Update Payment Settings, Pricing & Billing Rules
  app.post("/api/admin/settings", async (req, res) => {
    try {
      const admin = requireSuperAdmin(req, res);
      if (!admin) return;

      const { gcash, bank, qrCode, plans } = req.body;

      if (gcash) adminSettings.gcash = { ...adminSettings.gcash, ...gcash };
      if (bank) adminSettings.bank = { ...adminSettings.bank, ...bank };
      if (qrCode) adminSettings.qrCode = { ...adminSettings.qrCode, ...qrCode };
      if (plans) adminSettings.plans = { ...adminSettings.plans, ...plans };

      adminSettings.updatedAt = new Date().toISOString();
      adminSettings.updatedBy = admin.username;

      await persistAdminSettings();

      logAuditAction(
        "update_settings",
        adminSettings.updatedBy,
        "System Settings",
        "Updated payment instructions, QR configuration, or plan pricing"
      );

      res.json({
        success: true,
        message: "Payment settings and pricing rules updated successfully.",
        settings: adminSettings
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to save settings." });
    }
  });

  // 6. Admin: Upload New Official Payment QR Code Image
  app.post("/api/admin/qr-upload", async (req, res) => {
    try {
      const admin = requireSuperAdmin(req, res);
      if (!admin) return;

      const { dataUrl } = req.body;
      if (!dataUrl || typeof dataUrl !== "string") {
        return res.status(400).json({ error: "QR code image data URL required." });
      }

      const matches = dataUrl.match(/^data:image\/(jpeg|jpg|png|webp|svg\+xml);base64,(.+)$/i);
      if (!matches) {
        return res.status(400).json({ error: "Invalid image format for QR code." });
      }

      const buffer = Buffer.from(matches[2], "base64");
      if (!buffer.length || buffer.length > 3 * 1024 * 1024) {
        return res.status(400).json({ error: "QR code image must be smaller than 3 MB." });
      }

      // Keep the QR image itself in MySQL-backed settings. A Vercel filesystem
      // path is not durable across deployments or serverless instances.
      const persistentUrl = dataUrl;
      adminSettings.qrCode.imageUrl = persistentUrl;
      adminSettings.updatedAt = new Date().toISOString();
      adminSettings.updatedBy = admin.username;
      await persistAdminSettings();

      logAuditAction(
        "update_settings",
        adminSettings.updatedBy,
        "QR Code",
        "Uploaded and stored official payment QR code in MySQL"
      );

      res.json({
        success: true,
        imageUrl: persistentUrl,
        message: "Official payment QR code uploaded and activated successfully."
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to upload QR code." });
    }
  });

  // 7. Admin: Get Audit Logs (Protected)
  app.get("/api/admin/audit-logs", (req, res) => {
    const admin = requireSuperAdmin(req, res);
    if (!admin) return;
    res.json({ success: true, logs: auditLogs });
  });
}
