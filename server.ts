import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { initialMenuDatabase, initialStallNotices, stallCredentials } from "./src/data/initialData";
import {
  DishItem,
  SalesRecord,
  SalesItemEntry,
  StallOwnerAccount,
  AdminStallDirectoryEntry,
  WebsiteVisitorAnalyticsData
} from "./src/types";
import {
  registerSubscriptionRoutes,
  isStallSubscriptionActive,
  ensureStallTrialInitialized,
  hasStallSubscriptionOrTrialRecord,
  getStallSubscriptionAndTrialInfo
} from "./src/server/subscriptionService";
import { restoreOrSeedSupabaseState, writeSupabaseState, isSupabaseConfigured } from "./src/server/supabaseStore";
import {
  MERCHANT_COOKIE_NAME,
  clearSessionCookie,
  getAdminSession,
  getMerchantSession,
  hashSecret,
  isSuperAdminRegistered,
  requireMerchant,
  requireSuperAdmin,
  setSessionCookie,
  signSessionToken,
  verifyCsrfForCookieMutation,
  verifySecret
} from "./src/server/authMiddleware";

// ============================================================================
// Directory & Persistent Disk Storage Configuration
// ============================================================================
const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads", "dishes");
const DATA_DIR = path.join(process.cwd(), "data");

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const MENU_STORE_FILE = path.join(DATA_DIR, "menu_items.json");
const NOTICES_STORE_FILE = path.join(DATA_DIR, "stall_notices.json");
const OWNERS_STORE_FILE = path.join(DATA_DIR, "stall_owners.json");
const IMAGE_REGISTRY_FILE = path.join(DATA_DIR, "owner_images_registry.json");
const IMAGE_REGISTRY_BACKUP = path.join(DATA_DIR, "owner_images_registry.backup.json");
const VERSIONS_STORE_FILE = path.join(DATA_DIR, "menu_versions.json");
const SALES_STORE_FILE = path.join(DATA_DIR, "stall_sales_records.json");
const STALL_ANALYTICS_FILE = path.join(DATA_DIR, "stall_analytics.json");
const VISITOR_ANALYTICS_FILE = path.join(DATA_DIR, "visitor_analytics.json");

// Cache-busting and live update version tracker
let menuVersion = Date.now();

// ============================================================================
// In-Memory Database Stores (Persistent across user requests in server process)
// ============================================================================
interface OwnerImageRecord {
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

interface ArchivedDishItemRecord {
  archiveId: string;
  dish: DishItem;
  archivedAt: number;
  archivedBy: string;
  preservedImageId?: string;
}

interface ImageRegistryData {
  version: string;
  lastUpdated: string;
  description: string;
  images: OwnerImageRecord[];
  archivedDishes: ArchivedDishItemRecord[];
}

function loadImageRegistry(): ImageRegistryData {
  try {
    if (fs.existsSync(IMAGE_REGISTRY_FILE)) {
      const content = fs.readFileSync(IMAGE_REGISTRY_FILE, "utf-8");
      const parsed = JSON.parse(content);
      if (parsed && Array.isArray(parsed.images)) {
        return parsed;
      }
    }
  } catch (err) {
    console.error("Error loading image registry from disk:", err);
  }
  try {
    if (fs.existsSync(IMAGE_REGISTRY_BACKUP)) {
      const backupContent = fs.readFileSync(IMAGE_REGISTRY_BACKUP, "utf-8");
      const parsed = JSON.parse(backupContent);
      if (parsed && Array.isArray(parsed.images)) {
        return parsed;
      }
    }
  } catch {}

  const defaultRegistry: ImageRegistryData = {
    version: "1.0",
    lastUpdated: new Date().toISOString(),
    description: "Permanent Protected Stall-Owner Uploaded Images Master Registry",
    images: [],
    archivedDishes: []
  };
  return defaultRegistry;
}

function saveImageRegistry(registry: ImageRegistryData) {
  try {
    registry.lastUpdated = new Date().toISOString();
    const dataStr = JSON.stringify(registry, null, 2);
    fs.writeFileSync(IMAGE_REGISTRY_FILE, dataStr, "utf-8");
    fs.writeFileSync(IMAGE_REGISTRY_BACKUP, dataStr, "utf-8");
    void writeSupabaseState("image_registry", registry).catch(err => console.error("Supabase image registry sync failed:", err));
  } catch (err) {
    console.error("Failed to save image registry to disk:", err);
  }
}

let imageRegistry: ImageRegistryData = loadImageRegistry();

export interface MenuVersionSnapshot {
  versionId: string;
  stallName: string;
  timestamp: number;
  savedAt: string;
  itemCount: number;
  items: DishItem[];
  summary: string;
}

function loadMenuVersions(): Record<string, MenuVersionSnapshot[]> {
  try {
    if (fs.existsSync(VERSIONS_STORE_FILE)) {
      const content = fs.readFileSync(VERSIONS_STORE_FILE, "utf-8");
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
    }
  } catch (err) {
    console.error("Error loading menu versions from disk:", err);
  }
  return {};
}

function saveMenuVersions(versions: Record<string, MenuVersionSnapshot[]>) {
  try {
    fs.writeFileSync(VERSIONS_STORE_FILE, JSON.stringify(versions, null, 2), "utf-8");
    void writeSupabaseState("menu_versions", versions).catch(err => console.error("Supabase menu versions sync failed:", err));
  } catch (err) {
    console.error("Failed to save menu versions to disk:", err);
  }
}

let menuVersions: Record<string, MenuVersionSnapshot[]> = loadMenuVersions();

function reconnectProtectedOwnerImages(items: DishItem[], registry: ImageRegistryData): boolean {
  let changed = false;
  for (const reg of registry.images) {
    if (!reg.active) continue;
    // 1. Match by stable imageId
    let match = items.find(i => i.imageId && i.imageId === reg.imageId);
    // 2. Match by menuId and stallName
    if (!match) {
      match = items.find(i => i.id === reg.menuId && i.stall === reg.stallName);
    }
    // 3. Fallback match by stallName and dishName
    if (!match) {
      match = items.find(i => i.stall === reg.stallName && i.name.toLowerCase() === reg.dishName.toLowerCase());
    }
    if (match) {
      if (
        !match.ownerUploadedImage ||
        match.ownerUploadedImage !== reg.persistentImageUrl ||
        match.imageId !== reg.imageId
      ) {
        match.ownerUploadedImage = reg.persistentImageUrl;
        match.imageUrl = reg.persistentImageUrl;
        match.imageId = reg.imageId;
        match.storageId = reg.storageId;
        match.uploadTimestamp = reg.uploadTimestamp;
        match.isOwnerImageProtected = true;
        changed = true;
      }
    }
  }
  return changed;
}
interface StallOwnerRecord {
  id: string;
  stallNo: string;
  stallName: string;
  ownerName: string;
  username: string;
  email: string;
  contactNumber?: string;
  zone?: "outside" | "inside";
  accountStatus?: "active" | "suspended";
  passwordHash: string;
  passwordSalt: string;
  pinHash?: string;
  pinSalt?: string;
  createdAt: string;
  updatedAt: string;
}

function sanitizeOwner(owner: StallOwnerRecord): StallOwnerAccount {
  return {
    id: owner.id,
    stallNo: owner.stallNo,
    stallName: owner.stallName,
    ownerName: owner.ownerName,
    username: owner.username,
    email: owner.email,
    contactNumber: owner.contactNumber,
    zone: owner.zone,
    accountStatus: owner.accountStatus || "active",
    createdAt: owner.createdAt,
    role: "merchant"
  };
}

interface StallViewEvent {
  id: string;
  stallName: string;
  visitorId: string;
  timestamp: number; // epoch ms
}

interface ItemViewEvent {
  id: string;
  stallName: string;
  dishId: number;
  dishName: string;
  visitorId: string;
  timestamp: number; // epoch ms
}

function loadMenuData(): DishItem[] {
  try {
    if (fs.existsSync(MENU_STORE_FILE)) {
      const content = fs.readFileSync(MENU_STORE_FILE, "utf-8");
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.error("Error loading menu from disk, falling back to initial database:", err);
  }
  try {
    fs.writeFileSync(MENU_STORE_FILE, JSON.stringify(initialMenuDatabase, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to write initial menu database to disk:", err);
  }
  return [...initialMenuDatabase];
}

function saveMenuToDisk() {
  try {
    fs.writeFileSync(MENU_STORE_FILE, JSON.stringify(menuItems, null, 2), "utf-8");
    void writeSupabaseState("menu_items", menuItems).catch(err => console.error("Supabase menu sync failed:", err));
  } catch (err) {
    console.error("Failed to save menu items to disk:", err);
  }
}

function loadNoticesData(): Record<string, string> {
  try {
    if (fs.existsSync(NOTICES_STORE_FILE)) {
      const content = fs.readFileSync(NOTICES_STORE_FILE, "utf-8");
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
    }
  } catch (err) {
    console.error("Error loading notices from disk:", err);
  }
  try {
    fs.writeFileSync(NOTICES_STORE_FILE, JSON.stringify(initialStallNotices, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to write initial notices to disk:", err);
  }
  return { ...initialStallNotices };
}

function saveNoticesToDisk() {
  try {
    fs.writeFileSync(NOTICES_STORE_FILE, JSON.stringify(stallNotices, null, 2), "utf-8");
    void writeSupabaseState("stall_notices", stallNotices).catch(err => console.error("Supabase notices sync failed:", err));
  } catch (err) {
    console.error("Failed to save notices to disk:", err);
  }
}

function loadOwnersData(): StallOwnerRecord[] {
  try {
    if (fs.existsSync(OWNERS_STORE_FILE)) {
      const content = fs.readFileSync(OWNERS_STORE_FILE, "utf-8");
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (err) {
    console.error("Error loading owners from disk:", err);
  }
  try {
    fs.writeFileSync(OWNERS_STORE_FILE, JSON.stringify([], null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to write empty owners file to disk:", err);
  }
  return [];
}

function saveOwnersToDisk() {
  try {
    fs.writeFileSync(OWNERS_STORE_FILE, JSON.stringify(stallOwners, null, 2), "utf-8");
    void writeSupabaseState("stall_owners", stallOwners).catch(err => console.error("Supabase owners sync failed:", err));
  } catch (err) {
    console.error("Failed to save owners to disk:", err);
  }
}

let menuItems: DishItem[] = loadMenuData();
let stallNotices: Record<string, string> = loadNoticesData();
let stallOwners: StallOwnerRecord[] = loadOwnersData();

function seedInitialVersionsIfEmpty() {
  let modified = false;
  stallCredentials.forEach(cred => {
    if (!menuVersions[cred.name] || menuVersions[cred.name].length === 0) {
      const stallDishes = menuItems.filter(m => m.stall === cred.name);
      menuVersions[cred.name] = [{
        versionId: `v_initial_${cred.name.toLowerCase().replace(/[^a-z0-9]/g, "_")}`,
        stallName: cred.name,
        timestamp: Date.now() - 3600000,
        savedAt: new Date(Date.now() - 3600000).toISOString(),
        itemCount: stallDishes.length,
        items: JSON.parse(JSON.stringify(stallDishes)),
        summary: `Initial saved menu catalog (${stallDishes.length} items)`
      }];
      modified = true;
    }
  });
  if (modified) {
    saveMenuVersions(menuVersions);
  }
}
seedInitialVersionsIfEmpty();

function loadSalesRecords(): SalesRecord[] {
  try {
    if (fs.existsSync(SALES_STORE_FILE)) {
      const content = fs.readFileSync(SALES_STORE_FILE, "utf-8");
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        // Filter out legacy seeded demo records
        return parsed.filter((r: SalesRecord) => !String(r.id || "").startsWith("sale_seed_"));
      }
    }
  } catch (err) {
    console.error("Error loading sales records from disk:", err);
  }

  try {
    fs.writeFileSync(SALES_STORE_FILE, JSON.stringify([], null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to write empty sales records file:", err);
  }
  return [];
}

function saveSalesRecordsToDisk(records: SalesRecord[]) {
  try {
    fs.writeFileSync(SALES_STORE_FILE, JSON.stringify(records, null, 2), "utf-8");
    void writeSupabaseState("sales_records", records).catch(err => console.error("Supabase sales sync failed:", err));
  } catch (err) {
    console.error("Failed to save sales records to disk:", err);
  }
}

let salesRecords: SalesRecord[] = loadSalesRecords();

// Analytics Logs (Persisted to disk across restarts)
interface StallAnalyticsStore {
  stallViewLogs: StallViewEvent[];
  itemViewLogs: ItemViewEvent[];
}

function loadStallAnalytics(): StallAnalyticsStore {
  try {
    if (fs.existsSync(STALL_ANALYTICS_FILE)) {
      const content = fs.readFileSync(STALL_ANALYTICS_FILE, "utf-8");
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === "object") {
        return {
          stallViewLogs: Array.isArray(parsed.stallViewLogs) ? parsed.stallViewLogs : [],
          itemViewLogs: Array.isArray(parsed.itemViewLogs) ? parsed.itemViewLogs : []
        };
      }
    }
  } catch (err) {
    console.error("Error loading stall analytics from disk:", err);
  }
  return { stallViewLogs: [], itemViewLogs: [] };
}

function saveStallAnalyticsToDisk() {
  try {
    fs.writeFileSync(
      STALL_ANALYTICS_FILE,
      JSON.stringify({ stallViewLogs, itemViewLogs }, null, 2),
      "utf-8"
    );
    void writeSupabaseState("stall_analytics", { stallViewLogs, itemViewLogs }).catch(err => console.error("Supabase stall analytics sync failed:", err));
  } catch (err) {
    console.error("Failed to save stall analytics to disk:", err);
  }
}

const loadedStallAnalytics = loadStallAnalytics();
let stallViewLogs: StallViewEvent[] = loadedStallAnalytics.stallViewLogs;
let itemViewLogs: ItemViewEvent[] = loadedStallAnalytics.itemViewLogs;

// Website Visitor Analytics Store (Persisted to disk — strictly real events only)
interface VisitorProfileRecord {
  visitorId: string;
  firstSeenAt: number;
  lastSeenAt: number;
  lastSessionId: string;
  sessionCount: number;
  totalVisits: number;
  lastDeviceType: "Mobile" | "Tablet" | "Desktop";
}

interface SiteVisitEvent {
  id: string;
  visitorId: string;
  sessionId: string;
  page: string;
  deviceType: "Mobile" | "Tablet" | "Desktop";
  visitorType: "New" | "Returning";
  qrSource?: "deeplink" | "scanner" | null;
  qrStall?: string | null;
  timestamp: number;
}

interface VisitorAnalyticsStore {
  visitors: Record<string, VisitorProfileRecord>;
  visits: SiteVisitEvent[];
}

function loadVisitorAnalytics(): VisitorAnalyticsStore {
  try {
    if (fs.existsSync(VISITOR_ANALYTICS_FILE)) {
      const content = fs.readFileSync(VISITOR_ANALYTICS_FILE, "utf-8");
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === "object") {
        return {
          visitors: parsed.visitors && typeof parsed.visitors === "object" ? parsed.visitors : {},
          visits: Array.isArray(parsed.visits) ? parsed.visits : []
        };
      }
    }
  } catch (err) {
    console.error("Error loading visitor analytics from disk:", err);
  }
  try {
    fs.writeFileSync(VISITOR_ANALYTICS_FILE, JSON.stringify({ visitors: {}, visits: [] }, null, 2), "utf-8");
  } catch {}
  return { visitors: {}, visits: [] };
}

function saveVisitorAnalyticsToDisk() {
  try {
    fs.writeFileSync(VISITOR_ANALYTICS_FILE, JSON.stringify(visitorAnalyticsStore, null, 2), "utf-8");
    void writeSupabaseState("visitor_analytics", visitorAnalyticsStore).catch(err => console.error("Supabase visitor analytics sync failed:", err));
  } catch (err) {
    console.error("Failed to save visitor analytics to disk:", err);
  }
}

const visitorAnalyticsStore: VisitorAnalyticsStore = loadVisitorAnalytics();
let lastVisitorDiskSaveMs = 0;

// Deduplication tracking: (key -> last timestamp ms)
// Cooldown period: 10 minutes (600,000 ms) to prevent artificial view inflation
const VIEW_COOLDOWN_MS = 10 * 60 * 1000;
const stallViewCooldowns = new Map<string, number>();
const itemViewCooldowns = new Map<string, number>();
const siteVisitCooldowns = new Map<string, number>();

// Hydrate recent cooldowns from disk logs on startup
(() => {
  const cutoff = Date.now() - VIEW_COOLDOWN_MS;
  stallViewLogs.forEach(ev => {
    if (ev.timestamp >= cutoff) {
      stallViewCooldowns.set(`${ev.stallName}:${ev.visitorId}`, ev.timestamp);
    }
  });
  itemViewLogs.forEach(ev => {
    if (ev.timestamp >= cutoff) {
      itemViewCooldowns.set(`${ev.dishId}:${ev.visitorId}`, ev.timestamp);
    }
  });
})();

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  const PORT = Number(process.env.PORT) || 3000;
  app.set("trust proxy", 1);

  // Restore cloud state before accepting requests. Existing local JSON data seeds empty rows.
  if (isSupabaseConfigured()) {
    try {
      menuItems = await restoreOrSeedSupabaseState("menu_items", menuItems);
      stallNotices = await restoreOrSeedSupabaseState("stall_notices", stallNotices);
      stallOwners = await restoreOrSeedSupabaseState("stall_owners", stallOwners);
      imageRegistry = await restoreOrSeedSupabaseState("image_registry", imageRegistry);
      menuVersions = await restoreOrSeedSupabaseState("menu_versions", menuVersions);
      salesRecords = await restoreOrSeedSupabaseState("sales_records", salesRecords);
      const cloudStallAnalytics = await restoreOrSeedSupabaseState("stall_analytics", { stallViewLogs, itemViewLogs });
      stallViewLogs = cloudStallAnalytics.stallViewLogs || [];
      itemViewLogs = cloudStallAnalytics.itemViewLogs || [];
      const cloudVisitorAnalytics = await restoreOrSeedSupabaseState("visitor_analytics", visitorAnalyticsStore);
      Object.assign(visitorAnalyticsStore, cloudVisitorAnalytics);
      console.log("Supabase application state restored.");
    } catch (err) {
      console.error("Supabase startup restore failed; continuing with local JSON stores:", err);
    }
  }

  // Support image file upload payloads up to 25MB
  app.use(express.json({ limit: "25mb" }));
  app.use(express.urlencoded({ extended: true, limit: "25mb" }));

  // Serve persistent uploaded photos statically (404 immediately if file missing so it doesn't fallback to index.html)
  const uploadsStaticPath = path.join(process.cwd(), "public", "uploads");
  app.use("/uploads", express.static(uploadsStaticPath));
  app.use("/uploads", (_req, res) => {
    res.status(404).send("File not found");
  });
  app.use("/api/uploads", express.static(uploadsStaticPath));
  app.use("/api/uploads", (_req, res) => {
    res.status(404).send("File not found");
  });

  // Serve static representative assets
  const assetsStaticPath = path.join(process.cwd(), "public", "assets");
  app.use("/assets", express.static(assetsStaticPath));

  // Health Check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString(), persistence: isSupabaseConfigured() ? "supabase+local-fallback" : "local-only" });
  });

  // Register Subscription, Payment, Due Notifications & Super Admin Management Routes
  registerSubscriptionRoutes(app, {
    getRegisteredOwners: () => stallOwners.map(sanitizeOwner),
    setOwnerStatus: (ownerId: string, status: "active" | "suspended") => {
      const owner = stallOwners.find(o => o.id === ownerId);
      if (!owner) return null;
      owner.accountStatus = status;
      owner.updatedAt = new Date().toISOString();
      saveOwnersToDisk();
      menuVersion = Date.now();
      return sanitizeOwner(owner);
    }
  });

  // ==========================================================================
  // AUTHENTICATION & SESSION MANAGEMENT ROUTES
  // ==========================================================================

  // 0. Check Current Persistent Authenticated Session (HttpOnly cookies)
  app.get("/api/auth/session", (req, res) => {
    const merchantSession = getMerchantSession(req);
    let merchant: StallOwnerAccount | null = null;
    if (merchantSession) {
      const owner = stallOwners.find(o => o.id === merchantSession.ownerId);
      if (owner && owner.accountStatus !== "suspended") {
        merchant = sanitizeOwner(owner);
      } else {
        clearSessionCookie(req, res, MERCHANT_COOKIE_NAME);
      }
    }

    const adminSession = getAdminSession(req);
    const admin = adminSession
      ? {
          id: adminSession.adminId,
          username: adminSession.username,
          name: adminSession.name,
          email: adminSession.email,
          role: "admin" as const
        }
      : null;

    res.json({
      success: true,
      merchant,
      admin,
      superAdminRegistered: isSuperAdminRegistered()
    });
  });

  // 0B. Logout Merchant Session
  app.post("/api/auth/logout", (req, res) => {
    clearSessionCookie(req, res, MERCHANT_COOKIE_NAME);
    res.json({ success: true });
  });

  // 1. Stall Owner Registration (Independent multi-merchant accounts with duplicate & overwrite protection)
  app.post("/api/auth/register", (req, res) => {
    try {
      if (!verifyCsrfForCookieMutation(req)) {
        return res.status(403).json({ error: "Security check failed. Please refresh and try again." });
      }

      const {
        stallNo,
        stallName,
        customStallName,
        customStallNo,
        zone,
        ownerName,
        username,
        email,
        contactNumber,
        password,
        pin
      } = req.body || {};

      let cleanStallName = String(stallName || "").trim();
      const cleanCustomStallName = String(customStallName || "").trim();
      const cleanCustomStallNo = String(customStallNo || "").trim();
      if (cleanStallName === "__custom__") {
        if (!cleanCustomStallName) {
          return res.status(400).json({ error: "Please enter a name for your new cafeteria stall." });
        }
        if (
          cleanCustomStallNo &&
          !cleanCustomStallName.toLowerCase().startsWith(cleanCustomStallNo.toLowerCase())
        ) {
          cleanStallName = `${cleanCustomStallNo} — ${cleanCustomStallName}`;
        } else {
          cleanStallName = cleanCustomStallName;
        }
      }
      const cleanOwnerName = String(ownerName || "").trim();
      const cleanUsername = String(username || "").trim().toLowerCase();
      const cleanEmail = String(email || "").trim().toLowerCase();
      const cleanContact = String(contactNumber || "").trim();
      const rawPassword = String(password || "");
      const rawPin = String(pin || "").trim();

      if (!cleanStallName || !cleanOwnerName || !cleanUsername || !cleanEmail || !rawPassword) {
        return res.status(400).json({ error: "Please fill in stall name, owner name, username, email, and password." });
      }

      if (cleanOwnerName.length < 2) {
        return res.status(400).json({ error: "Owner / manager name must be at least 2 characters." });
      }

      if (!/^[a-zA-Z0-9._-]{3,32}$/.test(cleanUsername)) {
        return res.status(400).json({ error: "Username must be 3–32 characters (letters, numbers, dots, underscores, or hyphens)." });
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return res.status(400).json({ error: "Please enter a valid email address." });
      }

      if (cleanContact && !/^[0-9+\-\s()]{7,20}$/.test(cleanContact)) {
        return res.status(400).json({ error: "Contact number must contain 7–20 valid phone digits." });
      }

      if (rawPassword.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters long." });
      }

      if (rawPin && !/^\d{4,6}$/.test(rawPin)) {
        return res.status(400).json({ error: "Security PIN must be between 4 and 6 digits." });
      }

      // Check duplicate username or email
      const existingUsername = stallOwners.find(o => o.username.toLowerCase() === cleanUsername);
      if (existingUsername) {
        return res.status(409).json({ error: "This username is already taken. Please choose another username." });
      }

      const existingEmail = stallOwners.find(o => o.email.toLowerCase() === cleanEmail);
      if (existingEmail) {
        return res.status(409).json({ error: "This email address is already registered to an account." });
      }

      // Prevent overwriting an already-registered stall owner account
      const existingStallOwner = stallOwners.find(
        o => o.stallName.toLowerCase() === cleanStallName.toLowerCase()
      );
      if (existingStallOwner) {
        return res.status(409).json({
          error: "This cafeteria stall already has a registered owner account. Please choose another stall or register a new stall name."
        });
      }

      const { hash: passwordHash, salt: passwordSalt } = hashSecret(rawPassword);
      let pinHash: string | undefined;
      let pinSalt: string | undefined;
      if (rawPin) {
        const p = hashSecret(rawPin);
        pinHash = p.hash;
        pinSalt = p.salt;
      }

      const now = new Date().toISOString();
      const derivedStallNo = cleanCustomStallNo || String(stallNo || "").trim() || cleanStallName.split("—")[0]?.trim() || "Stall";
      const officialCatalogStall = stallCredentials.find(
        s => s.name.toLowerCase() === cleanStallName.toLowerCase()
      );
      const resolvedZone: "outside" | "inside" =
        officialCatalogStall?.zone ||
        (zone === "outside" ? "outside" : "inside");

      const newOwner: StallOwnerRecord = {
        id: `owner_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        stallNo: derivedStallNo,
        stallName: cleanStallName,
        ownerName: cleanOwnerName,
        username: cleanUsername,
        email: cleanEmail,
        contactNumber: cleanContact || undefined,
        zone: resolvedZone,
        accountStatus: "active",
        passwordHash,
        passwordSalt,
        pinHash,
        pinSalt,
        createdAt: now,
        updatedAt: now
      };

      stallOwners.push(newOwner);
      saveOwnersToDisk();

      // Initialize stall trial state cleanly ("Not Started", ready for 14-day Free Trial activation)
      ensureStallTrialInitialized(newOwner.stallName, newOwner.id);
      menuVersion = Date.now();

      // Issue persistent signed HttpOnly session cookie
      const sessionToken = signSessionToken({
        role: "merchant",
        ownerId: newOwner.id,
        stallName: newOwner.stallName,
        stallNo: newOwner.stallNo,
        username: newOwner.username
      });
      setSessionCookie(req, res, MERCHANT_COOKIE_NAME, sessionToken);

      res.status(201).json({
        success: true,
        owner: sanitizeOwner(newOwner)
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to register stall owner account." });
    }
  });

  // 2. Stall Owner Login (Username / Email + Password, OR Registered Stall Security PIN)
  app.post("/api/auth/login", (req, res) => {
    try {
      if (!verifyCsrfForCookieMutation(req)) {
        return res.status(403).json({ error: "Security check failed. Please refresh and try again." });
      }

      const { identifier, password, stall, pin } = req.body || {};

      // Method A: Username or Email + Password login
      if (identifier && password) {
        const idLower = String(identifier).trim().toLowerCase();
        const owner = stallOwners.find(
          o => o.username.toLowerCase() === idLower || o.email.toLowerCase() === idLower
        );

        if (!owner || !verifySecret(String(password), owner.passwordHash, owner.passwordSalt)) {
          return res.status(401).json({ error: "Invalid username/email or password." });
        }

        if (owner.accountStatus === "suspended") {
          return res.status(403).json({ error: "This merchant account is suspended. Please contact the Super Administrator." });
        }

        const token = signSessionToken({
          role: "merchant",
          ownerId: owner.id,
          stallName: owner.stallName,
          stallNo: owner.stallNo,
          username: owner.username
        });
        setSessionCookie(req, res, MERCHANT_COOKIE_NAME, token);

        return res.json({
          success: true,
          owner: sanitizeOwner(owner)
        });
      }

      // Method B: Registered Stall + Security PIN (No hardcoded fallback PINs!)
      if (stall && pin) {
        const cleanStall = String(stall).trim();
        const owner = stallOwners.find(o => o.stallName === cleanStall);
        if (!owner) {
          return res.status(401).json({ error: "No registered owner account found for this stall. Please register first." });
        }
        if (owner.accountStatus === "suspended") {
          return res.status(403).json({ error: "This merchant account is suspended. Please contact the Super Administrator." });
        }
        if (!owner.pinHash || !owner.pinSalt || !verifySecret(String(pin).trim(), owner.pinHash, owner.pinSalt)) {
          return res.status(401).json({ error: "Incorrect security PIN for this stall." });
        }

        const token = signSessionToken({
          role: "merchant",
          ownerId: owner.id,
          stallName: owner.stallName,
          stallNo: owner.stallNo,
          username: owner.username
        });
        setSessionCookie(req, res, MERCHANT_COOKIE_NAME, token);

        return res.json({
          success: true,
          owner: sanitizeOwner(owner)
        });
      }

      res.status(400).json({ error: "Please provide your login credentials." });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Login failed." });
    }
  });

  // 3. Forgot Password / Reset with Registered Security PIN
  app.post("/api/auth/forgot-password", (req, res) => {
    try {
      if (!verifyCsrfForCookieMutation(req)) {
        return res.status(403).json({ error: "Security check failed." });
      }

      const { stallName, pin, newPassword } = req.body || {};
      if (!stallName || !pin || !newPassword) {
        return res.status(400).json({ error: "Stall name, security PIN, and new password are required." });
      }

      if (String(newPassword).length < 6) {
        return res.status(400).json({ error: "New password must be at least 6 characters." });
      }

      const owner = stallOwners.find(o => o.stallName === String(stallName).trim());
      if (!owner) {
        return res.status(404).json({ error: "Stall owner account not found for this stall." });
      }

      if (!owner.pinHash || !owner.pinSalt || !verifySecret(String(pin).trim(), owner.pinHash, owner.pinSalt)) {
        return res.status(403).json({ error: "Security PIN verification failed." });
      }

      const { hash, salt } = hashSecret(String(newPassword));
      owner.passwordHash = hash;
      owner.passwordSalt = salt;
      owner.updatedAt = new Date().toISOString();
      saveOwnersToDisk();

      res.json({ success: true, message: "Password reset successfully. You can now log in." });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to reset password." });
    }
  });

  // 4. Update Profile / Security Settings (Authenticated Merchant matching stallName)
  app.post("/api/auth/update-profile", (req, res) => {
    try {
      const { stallName, currentPin, currentPassword, newOwnerName, newContactNumber, newPassword, newPin } = req.body || {};
      if (!stallName) {
        return res.status(400).json({ error: "Stall identifier is required." });
      }

      const session = requireMerchant(req, res, String(stallName).trim());
      if (!session) return;

      const owner = stallOwners.find(o => o.id === session.ownerId && o.stallName === session.stallName);
      if (!owner) {
        return res.status(404).json({ error: "Stall owner account not found." });
      }

      // Verify current PIN or current password
      const pinMatches = Boolean(currentPin && owner.pinHash && owner.pinSalt && verifySecret(String(currentPin).trim(), owner.pinHash, owner.pinSalt));
      const pwMatches = Boolean(currentPassword && verifySecret(String(currentPassword), owner.passwordHash, owner.passwordSalt));
      if (!pinMatches && !pwMatches) {
        return res.status(403).json({ error: "Current security PIN or password verification failed." });
      }

      if (newOwnerName && String(newOwnerName).trim()) {
        owner.ownerName = String(newOwnerName).trim();
      }

      if (newContactNumber !== undefined) {
        const cleanContact = String(newContactNumber || "").trim();
        if (cleanContact && !/^[0-9+\-\s()]{7,20}$/.test(cleanContact)) {
          return res.status(400).json({ error: "Contact number must contain 7–20 valid phone digits." });
        }
        owner.contactNumber = cleanContact || undefined;
      }

      if (newPassword) {
        if (String(newPassword).length < 6) {
          return res.status(400).json({ error: "New password must be at least 6 characters." });
        }
        const { hash, salt } = hashSecret(String(newPassword));
        owner.passwordHash = hash;
        owner.passwordSalt = salt;
      }

      if (newPin) {
        if (!/^\d{4,6}$/.test(String(newPin).trim())) {
          return res.status(400).json({ error: "New PIN must be 4–6 digits." });
        }
        const { hash, salt } = hashSecret(String(newPin).trim());
        owner.pinHash = hash;
        owner.pinSalt = salt;
      }

      owner.updatedAt = new Date().toISOString();
      saveOwnersToDisk();

      res.json({
        success: true,
        message: "Settings updated successfully.",
        owner: sanitizeOwner(owner)
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to update account settings." });
    }
  });

  // ==========================================================================
  // REAL VISITOR & STALL ANALYTICS ROUTES
  // ==========================================================================

  // 1. Record Stall Profile View (Student opens stall detail page)
  app.post("/api/analytics/stall-view", (req, res) => {
    try {
      const { stallName, visitorId } = req.body;
      if (!stallName || !visitorId) {
        return res.status(400).json({ error: "Stall name and anonymous visitor identifier are required." });
      }

      const now = Date.now();
      const dedupKey = `${stallName}:${visitorId}`;
      const lastView = stallViewCooldowns.get(dedupKey) || 0;

      // Reasonable Deduplication: Don't count rapid repeated refreshes within cooldown
      if (now - lastView < VIEW_COOLDOWN_MS) {
        return res.json({ success: true, deduplicated: true });
      }

      stallViewCooldowns.set(dedupKey, now);

      const event: StallViewEvent = {
        id: `sv_${now}_${Math.random().toString(36).substring(2, 6)}`,
        stallName,
        visitorId,
        timestamp: now
      };

      stallViewLogs.push(event);

      // Keep logs bounded to last 50,000 events and persist to disk
      if (stallViewLogs.length > 50000) {
        stallViewLogs = stallViewLogs.slice(-25000);
      }
      saveStallAnalyticsToDisk();

      res.json({ success: true, viewId: event.id });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to log stall view." });
    }
  });

  // 2. Record Menu Item View (Student clicks into food detail modal)
  app.post("/api/analytics/item-view", (req, res) => {
    try {
      const { stallName, dishId, dishName, visitorId } = req.body;
      if (!stallName || !dishId || !visitorId) {
        return res.status(400).json({ error: "Missing required item analytics fields." });
      }

      const now = Date.now();
      const dedupKey = `${dishId}:${visitorId}`;
      const lastView = itemViewCooldowns.get(dedupKey) || 0;

      if (now - lastView < VIEW_COOLDOWN_MS) {
        return res.json({ success: true, deduplicated: true });
      }

      itemViewCooldowns.set(dedupKey, now);

      const event: ItemViewEvent = {
        id: `iv_${now}_${Math.random().toString(36).substring(2, 6)}`,
        stallName,
        dishId: Number(dishId),
        dishName: String(dishName || "Menu Item"),
        visitorId,
        timestamp: now
      };

      itemViewLogs.push(event);

      // Update clicks on in-memory menu items and persist
      const dish = menuItems.find(m => m.id === event.dishId);
      if (dish) {
        dish.clicks = (dish.clicks || 0) + 1;
        saveMenuToDisk();
      }

      if (itemViewLogs.length > 50000) {
        itemViewLogs = itemViewLogs.slice(-25000);
      }
      saveStallAnalyticsToDisk();

      res.json({ success: true, viewId: event.id });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to log item view." });
    }
  });

  // 2B. Record Real Website Visitor Event (Total, Unique, New/Returning, Active, Pages, Devices, QR)
  app.post("/api/analytics/visit", (req, res) => {
    try {
      const {
        visitorId,
        sessionId,
        page,
        deviceType,
        qrSource,
        qrStall,
        isHeartbeat
      } = req.body || {};

      const cleanVisitorId = String(visitorId || "").trim().slice(0, 120);
      const cleanSessionId = String(sessionId || cleanVisitorId).trim().slice(0, 120);
      const cleanPage = String(page || "home").trim().slice(0, 40) || "home";
      if (!cleanVisitorId) {
        return res.status(400).json({ error: "visitorId is required." });
      }

      const allowedDevice: "Mobile" | "Tablet" | "Desktop" =
        deviceType === "Mobile" || deviceType === "Tablet" ? deviceType : "Desktop";
      const validQrSource: "deeplink" | "scanner" | null =
        qrSource === "deeplink" || qrSource === "scanner" ? qrSource : null;
      const cleanQrStall = validQrSource && qrStall ? String(qrStall).trim().slice(0, 120) : null;

      const now = Date.now();
      let profile = visitorAnalyticsStore.visitors[cleanVisitorId];

      if (isHeartbeat && profile) {
        profile.lastSeenAt = now;
        profile.lastDeviceType = allowedDevice;
        if (now - lastVisitorDiskSaveMs > 20000) {
          saveVisitorAnalyticsToDisk();
          lastVisitorDiskSaveMs = now;
        }
        return res.json({ success: true, heartbeat: true });
      }

      // Prevent duplicate visit events on immediate React StrictMode / double mounts
      const dedupKey = validQrSource
        ? `qr:${cleanSessionId}:${validQrSource}:${cleanQrStall || ""}`
        : `page:${cleanSessionId}:${cleanPage}`;
      const lastRecorded = siteVisitCooldowns.get(dedupKey) || 0;
      const cooldownMs = validQrSource ? 5000 : 30000;

      if (now - lastRecorded < cooldownMs) {
        if (profile) {
          profile.lastSeenAt = now;
        }
        return res.json({ success: true, deduplicated: true });
      }
      siteVisitCooldowns.set(dedupKey, now);

      let visitorType: "New" | "Returning" = "New";
      if (!profile) {
        profile = {
          visitorId: cleanVisitorId,
          firstSeenAt: now,
          lastSeenAt: now,
          lastSessionId: cleanSessionId,
          sessionCount: 1,
          totalVisits: 1,
          lastDeviceType: allowedDevice
        };
        visitorAnalyticsStore.visitors[cleanVisitorId] = profile;
      } else {
        const isNewSession = profile.lastSessionId !== cleanSessionId;
        if (isNewSession) {
          profile.sessionCount = (profile.sessionCount || 1) + 1;
          profile.lastSessionId = cleanSessionId;
        }
        if (profile.sessionCount > 1 || now - profile.firstSeenAt > 30 * 60 * 1000) {
          visitorType = "Returning";
        }
        profile.totalVisits = (profile.totalVisits || 0) + 1;
        profile.lastSeenAt = now;
        profile.lastDeviceType = allowedDevice;
      }

      const event: SiteVisitEvent = {
        id: `visit_${now}_${Math.random().toString(36).substring(2, 7)}`,
        visitorId: cleanVisitorId,
        sessionId: cleanSessionId,
        page: cleanPage,
        deviceType: allowedDevice,
        visitorType,
        qrSource: validQrSource,
        qrStall: cleanQrStall,
        timestamp: now
      };

      visitorAnalyticsStore.visits.push(event);
      if (visitorAnalyticsStore.visits.length > 100000) {
        visitorAnalyticsStore.visits = visitorAnalyticsStore.visits.slice(-50000);
      }

      saveVisitorAnalyticsToDisk();
      lastVisitorDiskSaveMs = now;

      res.json({ success: true, visitId: event.id, visitorType });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to record site visit." });
    }
  });

  // 2C. Super Admin: Website Visitor Analytics (Strictly computed from persisted real events)
  app.get("/api/admin/visitor-analytics", (req, res) => {
    try {
      const admin = requireSuperAdmin(req, res);
      if (!admin) return;

      const now = Date.now();
      const activeCutoff = now - 5 * 60 * 1000; // Active in last 5 minutes
      const todayKey = new Date(now).toISOString().slice(0, 10);
      const thisMonthKey = todayKey.slice(0, 7);

      const allVisitors = Object.values(visitorAnalyticsStore.visitors);
      const allVisits = visitorAnalyticsStore.visits;

      const uniqueVisitors = allVisitors.length;
      let returningVisitors = 0;
      let newVisitors = 0;
      let activeVisitors = 0;

      allVisitors.forEach(v => {
        if (v.lastSeenAt >= activeCutoff) {
          activeVisitors += 1;
        }
        if ((v.sessionCount || 1) > 1 || v.lastSeenAt - v.firstSeenAt > 30 * 60 * 1000) {
          returningVisitors += 1;
        } else {
          newVisitors += 1;
        }
      });

      const todayVisits = allVisits.filter(v => new Date(v.timestamp).toISOString().slice(0, 10) === todayKey).length;
      const thisMonthVisits = allVisits.filter(v => new Date(v.timestamp).toISOString().slice(0, 7) === thisMonthKey).length;

      // Daily Visits (Last 14 days)
      const dailyMap = new Map<string, { label: string; visits: number; visitors: Set<string>; qrVisits: number }>();
      for (let i = 13; i >= 0; i--) {
        const d = new Date(now - i * 24 * 60 * 60 * 1000);
        const key = d.toISOString().slice(0, 10);
        const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        dailyMap.set(key, { label, visits: 0, visitors: new Set(), qrVisits: 0 });
      }

      // Monthly Visits (Last 12 months)
      const monthlyMap = new Map<string, { label: string; visits: number; visitors: Set<string>; qrVisits: number }>();
      const baseDate = new Date(now);
      for (let i = 11; i >= 0; i--) {
        const d = new Date(baseDate.getFullYear(), baseDate.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const label = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
        monthlyMap.set(key, { label, visits: 0, visitors: new Set(), qrVisits: 0 });
      }

      const pageCounts = new Map<string, number>();
      const deviceTypes = { mobile: 0, tablet: 0, desktop: 0 };
      let totalQrVisits = 0;
      const uniqueQrVisitorsSet = new Set<string>();
      const qrBySource = { deeplink: 0, scanner: 0 };
      const qrStallCounts = new Map<string, number>();

      allVisits.forEach(ev => {
        const iso = new Date(ev.timestamp).toISOString();
        const dKey = iso.slice(0, 10);
        const mKey = iso.slice(0, 7);

        const dBucket = dailyMap.get(dKey);
        if (dBucket) {
          dBucket.visits += 1;
          dBucket.visitors.add(ev.visitorId);
          if (ev.qrSource) dBucket.qrVisits += 1;
        }

        const mBucket = monthlyMap.get(mKey);
        if (mBucket) {
          mBucket.visits += 1;
          mBucket.visitors.add(ev.visitorId);
          if (ev.qrSource) mBucket.qrVisits += 1;
        }

        pageCounts.set(ev.page, (pageCounts.get(ev.page) || 0) + 1);

        if (ev.deviceType === "Mobile") deviceTypes.mobile += 1;
        else if (ev.deviceType === "Tablet") deviceTypes.tablet += 1;
        else deviceTypes.desktop += 1;

        if (ev.qrSource) {
          totalQrVisits += 1;
          uniqueQrVisitorsSet.add(ev.visitorId);
          if (ev.qrSource === "deeplink") qrBySource.deeplink += 1;
          else if (ev.qrSource === "scanner") qrBySource.scanner += 1;
          if (ev.qrStall) {
            qrStallCounts.set(ev.qrStall, (qrStallCounts.get(ev.qrStall) || 0) + 1);
          }
        }
      });

      const totalVisitsCount = allVisits.length;
      const mostVisitedPages = Array.from(pageCounts.entries())
        .map(([page, visits]) => ({
          page,
          visits,
          sharePercent: totalVisitsCount > 0 ? Math.round((visits / totalVisitsCount) * 100) : 0
        }))
        .sort((a, b) => b.visits - a.visits);

      const payload: WebsiteVisitorAnalyticsData = {
        totalVisits: totalVisitsCount,
        uniqueVisitors,
        newVisitors,
        returningVisitors,
        activeVisitors,
        todayVisits,
        thisMonthVisits,
        dailyVisits: Array.from(dailyMap.entries()).map(([date, b]) => ({
          date,
          label: b.label,
          visits: b.visits,
          uniqueVisitors: b.visitors.size,
          qrVisits: b.qrVisits
        })),
        monthlyVisits: Array.from(monthlyMap.entries()).map(([month, b]) => ({
          month,
          label: b.label,
          visits: b.visits,
          uniqueVisitors: b.visitors.size,
          qrVisits: b.qrVisits
        })),
        mostVisitedPages,
        deviceTypes,
        qrVisits: {
          totalQrVisits,
          uniqueQrVisitors: uniqueQrVisitorsSet.size,
          bySource: qrBySource,
          topQrStalls: Array.from(qrStallCounts.entries())
            .map(([stallName, visits]) => ({ stallName, visits }))
            .sort((a, b) => b.visits - a.visits)
        },
        recentVisits: [...allVisits]
          .slice(-25)
          .reverse()
          .map(ev => ({
            id: ev.id,
            page: ev.page,
            deviceType: ev.deviceType,
            visitorType: ev.visitorType,
            qrSource: ev.qrSource || null,
            qrStall: ev.qrStall || null,
            timestamp: new Date(ev.timestamp).toISOString()
          }))
      };

      res.json({ success: true, analytics: payload });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to load website visitor analytics." });
    }
  });

  // 2D. Super Admin: Real Platform Stalls, Menus & Application Statistics
  app.get("/api/admin/platform-overview", (req, res) => {
    try {
      const admin = requireSuperAdmin(req, res);
      if (!admin) return;

      const knownStallMap = new Map<
        string,
        { name: string; stallNo?: string; officialName?: string; zone: "outside" | "inside"; isCustom: boolean }
      >();

      stallCredentials.forEach(s => {
        knownStallMap.set(s.name, {
          name: s.name,
          stallNo: s.stallNo,
          officialName: s.officialName,
          zone: s.zone,
          isCustom: false
        });
      });

      stallOwners.forEach(o => {
        if (!knownStallMap.has(o.stallName)) {
          knownStallMap.set(o.stallName, {
            name: o.stallName,
            stallNo: o.stallNo,
            officialName: o.stallName.includes("—") ? o.stallName.split("—")[1]?.trim() : o.stallName,
            zone: o.zone || "inside",
            isCustom: true
          });
        }
      });

      const stallsDirectory: AdminStallDirectoryEntry[] = Array.from(knownStallMap.values()).map(s => {
        const owner = stallOwners.find(o => o.stallName.toLowerCase() === s.name.toLowerCase());
        const subInfo = getStallSubscriptionAndTrialInfo(s.name);
        const visibleCheck = isStallVisibleToCustomers(s.name);
        const stallDishes = menuItems.filter(m => m.stall === s.name);
        const stallViewsCount = stallViewLogs.filter(v => v.stallName === s.name).length;

        return {
          name: s.name,
          stallNo: s.stallNo || owner?.stallNo,
          officialName: s.officialName,
          zone: s.zone,
          isCustom: s.isCustom,
          hasRegisteredOwner: Boolean(owner),
          ownerName: owner?.ownerName || null,
          ownerUsername: owner?.username || null,
          accountStatus: owner ? (owner.accountStatus || "active") : null,
          subscriptionStatus: owner || hasStallSubscriptionOrTrialRecord(s.name) ? subInfo.status : "CATALOG",
          trialStatus: subInfo.trialStatus,
          isPubliclyVisible: visibleCheck.active,
          totalDishes: stallDishes.length,
          availableDishes: stallDishes.filter(d => d.available && !d.hidden).length,
          soldOutDishes: stallDishes.filter(d => !d.available && !d.hidden).length,
          hiddenDishes: stallDishes.filter(d => d.hidden).length,
          ownerPhotosCount: stallDishes.filter(d => Boolean(d.ownerUploadedImage)).length,
          notice: stallNotices[s.name] || "",
          stallViews: stallViewsCount
        };
      });

      const activeNoticesCount = Object.values(stallNotices).filter(v => String(v || "").trim().length > 0).length;

      res.json({
        success: true,
        overview: {
          stats: {
            totalStalls: stallsDirectory.length,
            officialStalls: stallsDirectory.filter(s => !s.isCustom).length,
            customStalls: stallsDirectory.filter(s => s.isCustom).length,
            registeredStalls: stallsDirectory.filter(s => s.hasRegisteredOwner).length,
            unclaimedStalls: stallsDirectory.filter(s => !s.hasRegisteredOwner).length,
            totalMenuItems: menuItems.length,
            availableItems: menuItems.filter(m => m.available && !m.hidden).length,
            soldOutItems: menuItems.filter(m => !m.available && !m.hidden).length,
            hiddenItems: menuItems.filter(m => m.hidden).length,
            protectedOwnerImages: imageRegistry.images.filter(i => i.active).length,
            archivedDishes: imageRegistry.archivedDishes.length,
            activeNotices: activeNoticesCount,
            totalSalesRecords: salesRecords.length,
            totalStallProfileViews: stallViewLogs.length,
            totalItemViews: itemViewLogs.length
          },
          stalls: stallsDirectory,
          menus: menuItems
        }
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to load platform overview." });
    }
  });

  // 3. Fetch Real Stall Analytics for Dashboard (Requires authenticated Merchant matching stall or Super Admin)
  app.get("/api/analytics/:stallName", (req, res) => {
    try {
      const stallName = decodeURIComponent(req.params.stallName);
      const merchantSession = getMerchantSession(req);
      const adminSession = getAdminSession(req);
      if (!adminSession && (!merchantSession || merchantSession.stallName !== stallName)) {
        return res.status(401).json({ error: "Unauthorized: Stall owner authentication required to view stall analytics." });
      }
      const period = String(req.query.period || "7days"); // today, 7days, 30days

      const now = Date.now();
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const startOfTodayMs = startOfToday.getTime();

      const oneWeekAgoMs = now - 7 * 24 * 60 * 60 * 1000;
      const oneMonthAgoMs = now - 30 * 24 * 60 * 60 * 1000;

      // Filter views belonging strictly to this stall
      const stallViews = stallViewLogs.filter(v => v.stallName === stallName);
      const itemViews = itemViewLogs.filter(v => v.stallName === stallName);

      // High-level counters
      const todayViewsList = stallViews.filter(v => v.timestamp >= startOfTodayMs);
      const uniqueVisitorsToday = new Set(todayViewsList.map(v => v.visitorId)).size;
      const thisWeekViews = stallViews.filter(v => v.timestamp >= oneWeekAgoMs).length;
      const thisMonthViews = stallViews.filter(v => v.timestamp >= oneMonthAgoMs).length;
      const totalViews = stallViews.length;

      // Time Filtered dataset
      let periodStartMs = oneWeekAgoMs;
      let daysCount = 7;
      if (period === "today") {
        periodStartMs = startOfTodayMs;
        daysCount = 1;
      } else if (period === "30days") {
        periodStartMs = oneMonthAgoMs;
        daysCount = 30;
      }

      const filteredStallViews = stallViews.filter(v => v.timestamp >= periodStartMs);
      const filteredItemViews = itemViews.filter(v => v.timestamp >= periodStartMs);

      // Views By Day for Chart (Calculated from actual recorded events)
      const dayMap = new Map<string, { views: number; visitors: Set<string>; label: string }>();

      for (let i = daysCount - 1; i >= 0; i--) {
        const d = new Date(now - i * 24 * 60 * 60 * 1000);
        const dateKey = d.toISOString().split("T")[0];
        const label = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
        dayMap.set(dateKey, { views: 0, visitors: new Set(), label });
      }

      filteredStallViews.forEach(v => {
        const dateKey = new Date(v.timestamp).toISOString().split("T")[0];
        const entry = dayMap.get(dateKey);
        if (entry) {
          entry.views += 1;
          entry.visitors.add(v.visitorId);
        }
      });

      const viewsByDay = Array.from(dayMap.entries()).map(([date, data]) => ({
        date,
        label: data.label,
        views: data.views,
        uniqueVisitors: data.visitors.size
      }));

      // Popular Menu Items (Aggregated strictly from recorded item view events)
      const itemCounts = new Map<number, { dishName: string; views: number }>();
      filteredItemViews.forEach(v => {
        const curr = itemCounts.get(v.dishId) || { dishName: v.dishName, views: 0 };
        curr.views += 1;
        itemCounts.set(v.dishId, curr);
      });

      const popularItems = Array.from(itemCounts.entries())
        .map(([dishId, data]) => ({
          dishId,
          dishName: data.dishName,
          views: data.views
        }))
        .sort((a, b) => b.views - a.views);

      const mostViewedItem = popularItems.length > 0 ? `${popularItems[0].dishName} (${popularItems[0].views} views)` : null;

      // Recent Activity Feed (Privacy-safe: "Anonymous Visitor viewed your stall / dish")
      const recentEvents = [
        ...filteredStallViews.map(v => ({
          id: v.id,
          type: "stall_view" as const,
          description: "Anonymous Visitor opened your stall profile",
          timestamp: v.timestamp
        })),
        ...filteredItemViews.map(v => ({
          id: v.id,
          type: "item_view" as const,
          description: `Anonymous Visitor viewed “${v.dishName}” details`,
          timestamp: v.timestamp
        }))
      ]
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 15)
        .map(e => {
          const diffMs = now - e.timestamp;
          const diffSec = Math.floor(diffMs / 1000);
          const diffMin = Math.floor(diffSec / 60);
          const diffHour = Math.floor(diffMin / 60);

          let timeAgo = "Just now";
          if (diffMin >= 1 && diffMin < 60) timeAgo = `${diffMin} min${diffMin > 1 ? "s" : ""} ago`;
          else if (diffHour >= 1 && diffHour < 24) timeAgo = `${diffHour} hr${diffHour > 1 ? "s" : ""} ago`;
          else if (diffHour >= 24) timeAgo = `${Math.floor(diffHour / 24)}d ago`;

          return {
            id: e.id,
            type: e.type,
            description: e.description,
            timestamp: new Date(e.timestamp).toISOString(),
            timeAgo
          };
        });

      res.json({
        stallName,
        todayViews: todayViewsList.length,
        uniqueVisitorsToday,
        thisWeekViews,
        thisMonthViews,
        totalViews,
        menuItemViewsCount: itemViews.length,
        mostViewedItem,
        viewsByDay,
        popularItems,
        recentActivity: recentEvents
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to retrieve stall analytics." });
    }
  });

  // ==========================================================================
  // EXISTING MENU & STALL ROUTES (Preserved with strict stall-level authorization)
  // ==========================================================================

  // Customer-facing stall visibility helper:
  // Registered stalls & stalls with subscription/trial records strictly follow their subscription/trial active status.
  // Unclaimed cafeteria catalog stalls remain visible for students until claimed/restricted.
  function isStallVisibleToCustomers(stallName: string): { active: boolean; status: string } {
    const owner = stallOwners.find(o => o.stallName === stallName);
    if (owner && owner.accountStatus === "suspended") {
      return { active: false, status: "SUSPENDED" };
    }
    if (owner || hasStallSubscriptionOrTrialRecord(stallName)) {
      const subCheck = isStallSubscriptionActive(stallName);
      return { active: subCheck.active, status: subCheck.status };
    }
    return { active: true, status: "CATALOG" };
  }

  // Get menu and current stall notices with cache version
  app.get("/api/menu", (req, res) => {
    // Non-negotiable self-healing protection: ensure all registered owner images are attached
    if (reconnectProtectedOwnerImages(menuItems, imageRegistry)) {
      saveMenuToDisk();
      menuVersion = Date.now();
    }

    const requestedRole = String(req.query.role || "customer").toLowerCase();
    const requestedStall = req.query.stall ? decodeURIComponent(String(req.query.stall)) : null;
    const merchantSession = getMerchantSession(req);
    const adminSession = getAdminSession(req);

    let itemsToReturn = menuItems;

    if (requestedRole === "merchant" && requestedStall && merchantSession && merchantSession.stallName === requestedStall) {
      // Authenticated stall owner managing their own stall menu in Merchant Dashboard:
      itemsToReturn = menuItems.filter(dish => dish.stall === requestedStall);
    } else if (requestedRole === "admin" && adminSession) {
      // Authenticated Super Administrator reviewing all items:
      itemsToReturn = menuItems;
    } else {
      // Customer / public view: enforce subscription/trial expiration visibility filter
      itemsToReturn = menuItems.filter(dish => {
        if (dish.hidden) return false;
        return isStallVisibleToCustomers(dish.stall).active;
      });

      if (requestedStall) {
        if (!isStallVisibleToCustomers(requestedStall).active) {
          itemsToReturn = [];
        } else {
          itemsToReturn = itemsToReturn.filter(dish => dish.stall === requestedStall);
        }
      }
    }

    // Build stalls directory (official 16 + any custom registered stalls)
    const knownStallMap = new Map<string, { name: string; stallNo?: string; officialName?: string; zone: "outside" | "inside" }>();
    stallCredentials.forEach(s => knownStallMap.set(s.name, { name: s.name, stallNo: s.stallNo, officialName: s.officialName, zone: s.zone }));
    stallOwners.forEach(o => {
      if (!knownStallMap.has(o.stallName)) {
        knownStallMap.set(o.stallName, {
          name: o.stallName,
          stallNo: o.stallNo,
          officialName: o.stallName.includes("—") ? o.stallName.split("—")[1]?.trim() : o.stallName,
          zone: o.zone || "inside"
        });
      }
    });

    res.json({
      items: itemsToReturn,
      notices: stallNotices,
      stalls: Array.from(knownStallMap.values()).map(s => {
        const access = isStallVisibleToCustomers(s.name);
        return {
          name: s.name,
          stallNo: s.stallNo,
          officialName: s.officialName,
          zone: s.zone,
          isActive: access.active,
          subscriptionStatus: access.status,
          hasRegisteredOwner: stallOwners.some(o => o.stallName.toLowerCase() === s.name.toLowerCase())
        };
      }),
      version: menuVersion
    });
  });

  // Get current menu version for lightweight polling and real-time synchronization
  app.get("/api/menu/version", (_req, res) => {
    res.json({ version: menuVersion });
  });

  // Increment item view / interest click counter
  app.post("/api/menu/:id/click", (req, res) => {
    const id = parseInt(req.params.id, 10);
    const item = menuItems.find(m => m.id === id);
    if (item) {
      item.clicks = (item.clicks || 0) + 1;
      res.json({ success: true, clicks: item.clicks });
    } else {
      res.status(404).json({ error: "Item not found" });
    }
  });

  // Toggle item availability (in-stock / sold-out)
  app.post("/api/menu/:id/toggle-stock", (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { stall } = req.body || {};
    const item = menuItems.find(m => m.id === id);

    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }

    const session = requireMerchant(req, res, item.stall);
    if (!session) return;

    if (stall && item.stall !== stall) {
      return res.status(403).json({ error: "Unauthorized: You cannot modify another stall's item." });
    }

    // Strict Paywall Access Control: Subscription must be Active
    const access = isStallSubscriptionActive(session.stallName);
    if (!access.active) {
      return res.status(403).json({
        error: access.reason || "Subscription required: Your subscription is expired or inactive. Please renew to manage your stall.",
        subscriptionExpired: true,
        code: "SUBSCRIPTION_REQUIRED"
      });
    }

    item.available = !item.available;
    saveMenuToDisk();
    menuVersion = Date.now();
    res.json({ success: true, item });
  });

  // Adjust or set price
  app.post("/api/menu/:id/price", (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { price, delta, stall } = req.body || {};
    const item = menuItems.find(m => m.id === id);

    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }

    const session = requireMerchant(req, res, item.stall);
    if (!session) return;

    if (stall && item.stall !== stall) {
      return res.status(403).json({ error: "Unauthorized: You cannot modify another stall's item." });
    }

    // Strict Paywall Access Control: Subscription must be Active
    const priceAccess = isStallSubscriptionActive(session.stallName);
    if (!priceAccess.active) {
      return res.status(403).json({
        error: priceAccess.reason || "Subscription required: Your subscription is expired or inactive. Please renew to manage your stall.",
        subscriptionExpired: true,
        code: "SUBSCRIPTION_REQUIRED"
      });
    }

    if (typeof price === "number" && price >= 5) {
      item.price = price;
    } else if (typeof delta === "number") {
      const newPrice = item.price + delta;
      if (newPrice >= 5) item.price = newPrice;
    }

    saveMenuToDisk();
    menuVersion = Date.now();
    res.json({ success: true, item });
  });

  // ==========================================================================
  // PERSISTENT FOOD PHOTO STORAGE & MENU ITEM MANAGEMENT ROUTES
  // ==========================================================================

  // Upload, replace, or remove a food photo for a specific stall and menu item
  app.post("/api/menu/:id/photo", (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { stall, dataUrl, remove } = req.body || {};

      const item = menuItems.find(m => m.id === id);
      if (!item) {
        return res.status(404).json({ error: "Menu item not found in database." });
      }

      const session = requireMerchant(req, res, item.stall);
      if (!session) return;

      if (stall && item.stall !== stall) {
        return res.status(403).json({ error: "Unauthorized: You cannot modify another stall's item." });
      }

      // Strict Paywall Access Control: Subscription must be Active
      const photoAccess = isStallSubscriptionActive(session.stallName);
      if (!photoAccess.active) {
        return res.status(403).json({
          error: photoAccess.reason || "Subscription required: Your subscription is expired or inactive. Please renew to manage your stall.",
          subscriptionExpired: true,
          code: "SUBSCRIPTION_REQUIRED"
        });
      }

      // ACTION A: Remove Photo
      if (remove === true || dataUrl === null || dataUrl === "") {
        const { explicitPermanentDelete } = req.body;
        const previousImageId = item.imageId;
        const previousImageUrl = item.ownerUploadedImage || item.imageUrl;

        // If registered in owner images registry, mark as unassigned in registry (DO NOT DESTROY)
        if (previousImageId) {
          const regEntry = imageRegistry.images.find(r => r.imageId === previousImageId);
          if (regEntry) {
            regEntry.active = false;
            saveImageRegistry(imageRegistry);
          }
        }

        // Only delete physical file if stall owner explicitly chose "Delete Image Permanently"
        if (explicitPermanentDelete === true && previousImageUrl && previousImageUrl.includes("/uploads/dishes/")) {
          const oldFilename = previousImageUrl.split("?")[0].split("/").pop();
          if (oldFilename) {
            const oldFilePath = path.join(UPLOADS_DIR, oldFilename);
            if (fs.existsSync(oldFilePath)) {
              try { fs.unlinkSync(oldFilePath); } catch (unlinkErr) { console.warn(unlinkErr); }
            }
          }
        }

        delete item.ownerUploadedImage;
        delete item.imageId;
        delete item.storageId;
        delete item.isOwnerImageProtected;

        if (item.representativeImage) {
          item.imageUrl = item.representativeImage;
        } else {
          delete item.imageUrl;
        }
        saveMenuToDisk();
        menuVersion = Date.now();

        return res.json({
          success: true,
          item,
          message: explicitPermanentDelete ? "Photo permanently deleted." : "Photo unlinked and preserved in Stall Photo Vault. Reverted to standard dish preview."
        });
      }

      // ACTION B: Upload / Replace Photo
      if (typeof dataUrl !== "string") {
        return res.status(400).json({ error: "Photo upload failed. Your previous photo was kept." });
      }

      // Validate allowed mime types: JPG, JPEG, PNG, WEBP
      const matches = dataUrl.match(/^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/i);
      if (!matches) {
        return res.status(400).json({
          error: "Photo upload failed. Invalid image format (must be JPG, JPEG, PNG, or WEBP). Your previous photo was kept."
        });
      }

      let ext = matches[1].toLowerCase();
      if (ext === "jpeg") ext = "jpg";
      const base64Data = matches[2];
      const buffer = Buffer.from(base64Data, "base64");

      // Validate buffer size (15MB upper safety boundary)
      if (buffer.length > 15 * 1024 * 1024) {
        return res.status(400).json({
          error: "Photo upload failed. Image exceeds maximum file size. Your previous photo was kept."
        });
      }

      // Generate unique persistent filename and stable imageId
      const timestamp = Date.now();
      const stallSlug = item.stall.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_");
      const filename = `stall_${stallSlug}_item_${item.id}_${timestamp}.${ext}`;
      const imageId = `img_${stallSlug}_item_${item.id}_${timestamp}`;
      const targetFilePath = path.join(UPLOADS_DIR, filename);

      // 1. Write actual image to persistent storage
      try {
        fs.writeFileSync(targetFilePath, buffer);
      } catch (writeErr) {
        console.error("Failed to write image file to persistent storage:", writeErr);
        return res.status(500).json({ error: "Photo upload failed. Your previous photo was kept." });
      }

      // 2. Register in persistent master owner images registry
      const persistentUrl = `/uploads/dishes/${filename}?v=${timestamp}`;
      const regRecord: OwnerImageRecord = {
        imageId,
        storageId: filename,
        persistentImageUrl: persistentUrl,
        menuId: item.id,
        stallName: item.stall,
        stallNo: item.stall.split("—")[0].trim(),
        ownerId: `cred_${item.stall.split("—")[0].trim()}`,
        dishName: item.name,
        dishCategory: item.category,
        dishPrice: item.price,
        uploadTimestamp: timestamp,
        isProtected: true,
        active: true
      };

      const existingRegIndex = imageRegistry.images.findIndex(
        r => r.imageId === imageId || (r.menuId === item.id && r.stallName === item.stall)
      );
      if (existingRegIndex >= 0) {
        imageRegistry.images[existingRegIndex] = regRecord;
      } else {
        imageRegistry.images.push(regRecord);
      }
      saveImageRegistry(imageRegistry);

      item.imageId = imageId;
      item.storageId = filename;
      item.uploadTimestamp = timestamp;
      item.isOwnerImageProtected = true;
      item.ownerUploadedImage = persistentUrl;
      item.imageUrl = persistentUrl;

      // 3. Persist updated menu database to disk
      try {
        saveMenuToDisk();
      } catch (dbErr) {
        console.error("Failed to update database record for menu photo:", dbErr);
        try { fs.unlinkSync(targetFilePath); } catch {}
        return res.status(500).json({ error: "We couldn't save the new photo. Please try again." });
      }

      menuVersion = Date.now();

      return res.json({
        success: true,
        item,
        imageUrl: persistentUrl,
        message: "Photo saved successfully and permanently protected!"
      });
    } catch (err: any) {
      console.error("Photo save transaction failed:", err);
      return res.status(500).json({ error: "We couldn't save the new photo. Please try again." });
    }
  });

  // Update existing menu item details (name, price, category, etc.)
  app.post("/api/menu/:id/update", (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { stall, updates } = req.body || {};
      const item = menuItems.find(m => m.id === id);

      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }

      const session = requireMerchant(req, res, item.stall);
      if (!session) return;

      if (stall && item.stall !== stall) {
        return res.status(403).json({ error: "Unauthorized: You cannot modify another stall's item." });
      }

      // Strict Paywall Access Control: Subscription must be Active
      const updateAccess = isStallSubscriptionActive(session.stallName);
      if (!updateAccess.active) {
        return res.status(403).json({
          error: updateAccess.reason || "Subscription required: Your subscription is expired or inactive. Please renew to manage your stall.",
          subscriptionExpired: true,
          code: "SUBSCRIPTION_REQUIRED"
        });
      }

      if (updates.name && typeof updates.name === "string") {
        item.name = updates.name.trim();
        // Update registry metadata to track name change without changing stable imageId!
        if (item.imageId) {
          const regEntry = imageRegistry.images.find(r => r.imageId === item.imageId);
          if (regEntry) {
            regEntry.dishName = item.name;
            saveImageRegistry(imageRegistry);
          }
        }
      }
      if (typeof updates.price === "number" && updates.price >= 1) {
        item.price = updates.price;
        if (item.imageId) {
          const regEntry = imageRegistry.images.find(r => r.imageId === item.imageId);
          if (regEntry) {
            regEntry.dishPrice = item.price;
            saveImageRegistry(imageRegistry);
          }
        }
      }
      if (updates.category) {
        item.category = updates.category;
        if (item.imageId) {
          const regEntry = imageRegistry.images.find(r => r.imageId === item.imageId);
          if (regEntry) {
            regEntry.dishCategory = item.category;
            saveImageRegistry(imageRegistry);
          }
        }
      }
      if (typeof updates.items === "string") item.items = updates.items.trim();
      if (typeof updates.available === "boolean") item.available = updates.available;
      
      // CRITICAL DATA-SAFETY RULE: NEVER remove image fields when updating names, prices, categories, etc.
      // Only remove if explicitly requested via remove: true or imageUrl: null / ""
      if (updates.ownerUploadedImage !== undefined) {
        if (!updates.ownerUploadedImage) {
          delete item.ownerUploadedImage;
        } else {
          item.ownerUploadedImage = updates.ownerUploadedImage;
        }
      }
      if (updates.representativeImage !== undefined) {
        item.representativeImage = updates.representativeImage;
      }
      if (updates.imageUrl !== undefined) {
        if (updates.imageUrl === null || updates.imageUrl === "") {
          if (item.representativeImage) {
            item.imageUrl = item.representativeImage;
          } else {
            delete item.imageUrl;
          }
        } else {
          item.imageUrl = updates.imageUrl;
        }
      }
      if (typeof updates.hidden === "boolean") item.hidden = updates.hidden;

      saveMenuToDisk();
      menuVersion = Date.now();

      res.json({ success: true, item });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to update item" });
    }
  });

  // Safe Menu Item Deletion (Preserves owner image in vault unless explicitly requested)
  app.post("/api/menu/:id/delete", (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { stall, deleteImagePermanently } = req.body || {};
      const itemIndex = menuItems.findIndex(m => m.id === id);

      if (itemIndex === -1) {
        return res.status(404).json({ error: "Menu item not found" });
      }

      const item = menuItems[itemIndex];

      const session = requireMerchant(req, res, item.stall);
      if (!session) return;

      if (stall && item.stall !== stall) {
        return res.status(403).json({ error: "Unauthorized: You cannot delete another stall's item." });
      }

      // Strict Paywall Access Control: Subscription must be Active
      const deleteAccess = isStallSubscriptionActive(session.stallName);
      if (!deleteAccess.active) {
        return res.status(403).json({
          error: deleteAccess.reason || "Subscription required: Your subscription is expired or inactive. Please renew to manage your stall.",
          subscriptionExpired: true,
          code: "SUBSCRIPTION_REQUIRED"
        });
      }

      // SAFE PRESERVATION: Archive the dish and its image record
      const archiveRecord: ArchivedDishItemRecord = {
        archiveId: `archived_${id}_${Date.now()}`,
        dish: { ...item },
        archivedAt: Date.now(),
        archivedBy: stall || item.stall,
        preservedImageId: item.imageId
      };

      imageRegistry.archivedDishes.push(archiveRecord);

      // If registered image exists, mark unlinked but keep protected in registry
      if (item.imageId) {
        const regEntry = imageRegistry.images.find(r => r.imageId === item.imageId);
        if (regEntry) {
          regEntry.active = false;
        }
      }

      // Only delete physical image file if owner explicitly requested permanent file destruction
      if (deleteImagePermanently === true && item.ownerUploadedImage && item.ownerUploadedImage.includes("/uploads/dishes/")) {
        const filename = item.ownerUploadedImage.split("?")[0].split("/").pop();
        if (filename) {
          const filePath = path.join(UPLOADS_DIR, filename);
          if (fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); } catch (e) { console.warn(e); }
          }
        }
      }

      saveImageRegistry(imageRegistry);

      // Remove from active menu list
      menuItems.splice(itemIndex, 1);
      saveMenuToDisk();
      menuVersion = Date.now();

      res.json({
        success: true,
        message: "Menu item safely removed. Any uploaded food photo has been preserved in your stall photo vault.",
        archivedDish: archiveRecord
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to safely remove menu item" });
    }
  });

  // Get Stall Photo Vault & Archived Dishes (Authenticated Merchant for stallName)
  app.get("/api/menu/photo-vault/:stallName", (req, res) => {
    try {
      const stallName = decodeURIComponent(req.params.stallName);
      const session = requireMerchant(req, res, stallName);
      if (!session) return;
      const stallImages = imageRegistry.images.filter(r => r.stallName === stallName);
      const archived = imageRegistry.archivedDishes.filter(a => a.dish.stall === stallName);
      res.json({
        success: true,
        stallName,
        protectedImages: stallImages,
        archivedDishes: archived
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to fetch stall photo vault" });
    }
  });

  // Restore Archived Dish
  app.post("/api/menu/restore-dish", (req, res) => {
    try {
      const { archiveId, stall } = req.body || {};
      const idx = imageRegistry.archivedDishes.findIndex(a => a.archiveId === archiveId);
      if (idx === -1) {
        return res.status(404).json({ error: "Archived dish record not found" });
      }
      const record = imageRegistry.archivedDishes[idx];
      const session = requireMerchant(req, res, record.dish.stall);
      if (!session) return;

      if (stall && record.dish.stall !== stall) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      let targetId = record.dish.id;
      if (menuItems.some(m => m.id === targetId)) {
        targetId = Math.max(...menuItems.map(m => m.id), 0) + 1;
      }

      const restoredDish: DishItem = {
        ...record.dish,
        id: targetId
      };

      if (record.preservedImageId) {
        const reg = imageRegistry.images.find(r => r.imageId === record.preservedImageId);
        if (reg) {
          reg.active = true;
          reg.menuId = targetId;
          restoredDish.ownerUploadedImage = reg.persistentImageUrl;
          restoredDish.imageUrl = reg.persistentImageUrl;
          restoredDish.imageId = reg.imageId;
          restoredDish.storageId = reg.storageId;
          restoredDish.isOwnerImageProtected = true;
        }
      }

      imageRegistry.archivedDishes.splice(idx, 1);
      saveImageRegistry(imageRegistry);

      menuItems.push(restoredDish);
      saveMenuToDisk();
      menuVersion = Date.now();

      res.json({ success: true, item: restoredDish });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to restore dish" });
    }
  });

  // Bulk Synchronize & Restore Owner Photos from authenticated owner's stall vault
  app.post("/api/menu/sync-photos", (req, res) => {
    try {
      const session = requireMerchant(req, res);
      if (!session) return;

      const { photos } = req.body || {};
      if (!Array.isArray(photos) || photos.length === 0) {
        return res.json({ success: true, updatedCount: 0 });
      }

      let updatedCount = 0;

      for (const p of photos) {
        if (!p || typeof p.id !== 'number' || !p.imageUrl) continue;
        const item = menuItems.find(m => m.id === p.id && m.stall === session.stallName);
        if (!item) continue;

        // Skip if item already has this image
        if (item.imageUrl === p.imageUrl) continue;

        // If base64 dataUrl, persist to file system
        if (p.imageUrl.startsWith("data:image/")) {
          const matches = p.imageUrl.match(/^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/i);
          if (matches) {
            let ext = matches[1].toLowerCase();
            if (ext === "jpeg") ext = "jpg";
            const buffer = Buffer.from(matches[2], "base64");
            const timestamp = Date.now();
            const stallSlug = item.stall.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_");
            const filename = `stall_${stallSlug}_item_${item.id}_${timestamp}.${ext}`;
            const targetFilePath = path.join(UPLOADS_DIR, filename);
            fs.writeFileSync(targetFilePath, buffer);
            const savedUrl = `/uploads/dishes/${filename}?v=${timestamp}`;
            item.ownerUploadedImage = savedUrl;
            item.imageUrl = savedUrl;
            updatedCount++;
          }
        } else if (p.imageUrl.startsWith("/uploads/") || p.imageUrl.startsWith("http")) {
          item.ownerUploadedImage = p.imageUrl;
          item.imageUrl = p.imageUrl;
          updatedCount++;
        }
      }

      if (updatedCount > 0) {
        saveMenuToDisk();
        menuVersion = Date.now();
      }

      res.json({ success: true, updatedCount, version: menuVersion });
    } catch (err: any) {
      console.error("Failed to sync/restore photos:", err);
      res.status(500).json({ error: "Failed to sync photos." });
    }
  });

  // Add new menu item to database and persist
  app.post("/api/menu/add", (req, res) => {
    try {
      const { stall, item } = req.body || {};
      if (!item || !stall) {
        return res.status(400).json({ error: "Missing required menu item details." });
      }

      const session = requireMerchant(req, res, String(stall));
      if (!session) return;

      if (item.stall && item.stall !== stall) {
        return res.status(403).json({ error: "Unauthorized: Stall mismatch." });
      }
      item.stall = session.stallName;

      // Strict Paywall Access Control: Subscription must be Active
      const addAccess = isStallSubscriptionActive(session.stallName);
      if (!addAccess.active) {
        return res.status(403).json({
          error: addAccess.reason || "Subscription required: Your subscription is expired or inactive. Please renew to manage your stall.",
          subscriptionExpired: true,
          code: "SUBSCRIPTION_REQUIRED"
        });
      }

      const newId = Math.max(...menuItems.map(m => m.id), 0) + 1;
      let persistentImageUrl = item.imageUrl;

      // If a base64 photo dataUrl is attached, save to persistent storage
      let imageId: string | undefined = undefined;
      let storageId: string | undefined = undefined;
      let uploadTimestamp: number | undefined = undefined;

      if (item.imageUrl && item.imageUrl.startsWith("data:image/")) {
        const matches = item.imageUrl.match(/^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/i);
        if (matches) {
          let ext = matches[1].toLowerCase();
          if (ext === "jpeg") ext = "jpg";
          const buffer = Buffer.from(matches[2], "base64");
          const timestamp = Date.now();
          const stallSlug = stall.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_");
          const filename = `stall_${stallSlug}_item_${newId}_${timestamp}.${ext}`;
          imageId = `img_${stallSlug}_item_${newId}_${timestamp}`;
          storageId = filename;
          uploadTimestamp = timestamp;
          const targetFilePath = path.join(UPLOADS_DIR, filename);
          fs.writeFileSync(targetFilePath, buffer);
          persistentImageUrl = `/uploads/dishes/${filename}?v=${timestamp}`;

          // Register in persistent master owner images registry
          const regRecord: OwnerImageRecord = {
            imageId,
            storageId: filename,
            persistentImageUrl,
            menuId: newId,
            stallName: stall,
            stallNo: stall.split("—")[0].trim(),
            ownerId: `cred_${stall.split("—")[0].trim()}`,
            dishName: item.name,
            dishCategory: item.category,
            dishPrice: item.price,
            uploadTimestamp: timestamp,
            isProtected: true,
            active: true
          };
          imageRegistry.images.push(regRecord);
          saveImageRegistry(imageRegistry);
        }
      }

      const created: DishItem = {
        ...item,
        id: newId,
        imageUrl: persistentImageUrl,
        ownerUploadedImage: imageId ? persistentImageUrl : (item.ownerUploadedImage || (persistentImageUrl?.includes('/uploads/') ? persistentImageUrl : undefined)),
        imageId,
        storageId,
        uploadTimestamp,
        isOwnerImageProtected: imageId ? true : item.isOwnerImageProtected,
        clicks: 0
      };

      menuItems.unshift(created);
      saveMenuToDisk();
      menuVersion = Date.now();

      res.json({ success: true, item: created });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to create menu item" });
    }
  });

  // ==========================================================================
  // PERMANENT BATCH SAVE, VERSIONING & RESTORE ENDPOINTS
  // ==========================================================================

  // Permanent Batch Save: Commits all additions, edits, deletions, and photos for authenticated merchant's stall
  app.post("/api/menu/save-batch", (req, res) => {
    try {
      const { stall, items, deletedItemIds, summary } = req.body || {};
      if (!stall || typeof stall !== "string") {
        return res.status(400).json({ error: "Stall name is required." });
      }

      const session = requireMerchant(req, res, stall);
      if (!session) return;

      if (!Array.isArray(items)) {
        return res.status(400).json({ error: "Menu items array is required." });
      }

      // Backend security: verify all submitted items match this stall
      for (const item of items) {
        if (item.stall && item.stall !== stall) {
          return res.status(403).json({ error: `Unauthorized: Item "${item.name}" does not belong to stall "${stall}".` });
        }
      }

      // Strict Paywall Access Control: Subscription must be Active
      const batchAccess = isStallSubscriptionActive(session.stallName);
      if (!batchAccess.active) {
        return res.status(403).json({
          error: batchAccess.reason || "Subscription required: Your subscription is expired or inactive. Please renew to manage your stall.",
          subscriptionExpired: true,
          code: "SUBSCRIPTION_REQUIRED"
        });
      }

      const stallSlug = stall.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_");

      // 1. Process deleted items safely: Archive and preserve photos
      if (Array.isArray(deletedItemIds) && deletedItemIds.length > 0) {
        for (const delId of deletedItemIds) {
          const existingItem = menuItems.find(m => m.id === delId && m.stall === stall);
          if (existingItem) {
            const archiveRecord: ArchivedDishItemRecord = {
              archiveId: `archived_${delId}_${Date.now()}`,
              dish: { ...existingItem },
              archivedAt: Date.now(),
              archivedBy: stall,
              preservedImageId: existingItem.imageId
            };
            imageRegistry.archivedDishes.push(archiveRecord);

            if (existingItem.imageId) {
              const reg = imageRegistry.images.find(r => r.imageId === existingItem.imageId);
              if (reg) {
                reg.active = false;
              }
            }
          }
        }
      }

      // Find max ID currently in menu items database
      let currentMaxId = Math.max(...menuItems.map(m => typeof m.id === "number" ? m.id : 0), 0);

      // 2. Process each item in the batch
      const processedStallItems: DishItem[] = [];

      for (const rawItem of items) {
        let itemId = rawItem.id;
        // If new item (temporary or unassigned ID)
        if (!itemId || itemId < 0 || typeof itemId !== "number" || (!menuItems.some(m => m.id === itemId) && itemId > 1000000000000)) {
          currentMaxId += 1;
          itemId = currentMaxId;
        }

        let itemImageUrl = rawItem.imageUrl;
        let itemOwnerImage = rawItem.ownerUploadedImage;
        let itemImageId = rawItem.imageId;
        let itemStorageId = rawItem.storageId;
        let itemUploadTimestamp = rawItem.uploadTimestamp;
        let itemIsProtected = rawItem.isOwnerImageProtected;

        // Check if existing item in database had a protected owner image
        const existingDbItem = menuItems.find(m => m.id === itemId);
        if (existingDbItem && existingDbItem.ownerUploadedImage) {
          // Unless intentionally removed (empty string or explicit flag), NEVER lose owner image!
          if (!itemOwnerImage && rawItem.removePhoto !== true) {
            itemOwnerImage = existingDbItem.ownerUploadedImage;
            itemImageId = existingDbItem.imageId;
            itemStorageId = existingDbItem.storageId;
            itemUploadTimestamp = existingDbItem.uploadTimestamp;
            itemIsProtected = true;
          }
        }

        // Check imageRegistry for this item or imageId
        if (itemImageId) {
          const regEntry = imageRegistry.images.find(r => r.imageId === itemImageId);
          if (regEntry) {
            regEntry.dishName = rawItem.name.trim();
            regEntry.dishPrice = Number(rawItem.price);
            regEntry.dishCategory = rawItem.category;
            regEntry.active = true;
            itemOwnerImage = regEntry.persistentImageUrl;
            itemIsProtected = true;
          }
        }

        // Check if photo was uploaded as base64 dataUrl
        const candidatePhoto = (itemImageUrl && itemImageUrl.startsWith("data:image/")) 
          ? itemImageUrl 
          : (itemOwnerImage && itemOwnerImage.startsWith("data:image/") ? itemOwnerImage : null);

        if (candidatePhoto) {
          const matches = candidatePhoto.match(/^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/i);
          if (matches) {
            let ext = matches[1].toLowerCase();
            if (ext === "jpeg") ext = "jpg";
            const buffer = Buffer.from(matches[2], "base64");
            const timestamp = Date.now();
            const filename = `stall_${stallSlug}_item_${itemId}_${timestamp}.${ext}`;
            const targetFilePath = path.join(UPLOADS_DIR, filename);
            fs.writeFileSync(targetFilePath, buffer);

            const persistentUrl = `/uploads/dishes/${filename}?v=${timestamp}`;
            const newImageId = `img_${stallSlug}_item_${itemId}_${timestamp}`;

            itemImageId = newImageId;
            itemStorageId = filename;
            itemUploadTimestamp = timestamp;
            itemIsProtected = true;
            itemOwnerImage = persistentUrl;
            itemImageUrl = persistentUrl;

            // Register in permanent master owner images registry
            const regRecord: OwnerImageRecord = {
              imageId: newImageId,
              storageId: filename,
              persistentImageUrl: persistentUrl,
              menuId: itemId,
              stallName: stall,
              stallNo: stall.split("—")[0].trim(),
              ownerId: `cred_${stall.split("—")[0].trim()}`,
              dishName: rawItem.name.trim(),
              dishCategory: rawItem.category,
              dishPrice: Number(rawItem.price),
              uploadTimestamp: timestamp,
              isProtected: true,
              active: true
            };

            const existingIdx = imageRegistry.images.findIndex(r => r.imageId === newImageId || (r.menuId === itemId && r.stallName === stall));
            if (existingIdx >= 0) {
              imageRegistry.images[existingIdx] = regRecord;
            } else {
              imageRegistry.images.push(regRecord);
            }
          }
        }

        // Final image priority:
        // Rule: IF ownerUploadedImage exists -> ALWAYS display ownerUploadedImage.
        // IF ownerUploadedImage does not exist -> display representative image matching menu name & description.
        const finalOwnerImage = (itemOwnerImage && !itemOwnerImage.includes("representative")) ? itemOwnerImage : undefined;
        let finalRepImage = rawItem.representativeImage || (existingDbItem ? existingDbItem.representativeImage : undefined);

        const processed: DishItem = {
          ...rawItem,
          id: itemId,
          stall,
          name: rawItem.name.trim(),
          items: (rawItem.items || rawItem.name).trim(),
          price: Number(rawItem.price),
          category: rawItem.category,
          available: rawItem.available !== false,
          ownerUploadedImage: finalOwnerImage,
          representativeImage: finalRepImage,
          imageUrl: finalOwnerImage || finalRepImage || rawItem.imageUrl,
          imageId: itemImageId,
          storageId: itemStorageId,
          uploadTimestamp: itemUploadTimestamp,
          isOwnerImageProtected: finalOwnerImage ? true : false,
          clicks: rawItem.clicks || (existingDbItem ? existingDbItem.clicks : 0) || 0
        };

        processedStallItems.push(processed);
      }

      // 3. Atomically update menuItems on disk
      // Remove previous items for this stall, then insert new processed items
      menuItems = [
        ...menuItems.filter(m => m.stall !== stall),
        ...processedStallItems
      ];

      saveMenuToDisk();
      saveImageRegistry(imageRegistry);

      // 4. Create Version History Snapshot
      const snapshot: MenuVersionSnapshot = {
        versionId: `v_${stallSlug}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        stallName: stall,
        timestamp: Date.now(),
        savedAt: new Date().toISOString(),
        itemCount: processedStallItems.length,
        items: JSON.parse(JSON.stringify(processedStallItems)),
        summary: summary || `Saved ${processedStallItems.length} menu items`
      };

      if (!menuVersions[stall]) {
        menuVersions[stall] = [];
      }
      menuVersions[stall].unshift(snapshot);
      // Keep up to 35 snapshots per stall
      if (menuVersions[stall].length > 35) {
        menuVersions[stall] = menuVersions[stall].slice(0, 35);
      }
      saveMenuVersions(menuVersions);

      menuVersion = Date.now();

      res.json({
        success: true,
        message: "Changes saved successfully.",
        items: processedStallItems,
        snapshot,
        version: menuVersion
      });
    } catch (err: any) {
      console.error("Batch save error:", err);
      res.status(500).json({ error: err.message || "Failed to save menu changes." });
    }
  });

  // Fetch Version History for a Stall (Authenticated Merchant matching stall)
  app.get("/api/menu/versions/:stallName", (req, res) => {
    try {
      const stallName = decodeURIComponent(req.params.stallName);
      const session = requireMerchant(req, res, stallName);
      if (!session) return;
      const versions = menuVersions[stallName] || [];
      res.json({
        success: true,
        stallName,
        versions
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to fetch versions." });
    }
  });

  // Restore a Previous Saved Version for a Stall
  app.post("/api/menu/versions/restore", (req, res) => {
    try {
      const { stall, versionId } = req.body || {};
      if (!stall || !versionId) {
        return res.status(400).json({ error: "Stall and versionId are required." });
      }

      const session = requireMerchant(req, res, String(stall));
      if (!session) return;

      const stallVersions = menuVersions[stall] || [];
      const targetVersion = stallVersions.find(v => v.versionId === versionId);
      if (!targetVersion) {
        return res.status(404).json({ error: "Version snapshot not found." });
      }

      // Restore items from snapshot while protecting and reconnecting all owner images
      const restoredItems: DishItem[] = JSON.parse(JSON.stringify(targetVersion.items));
      reconnectProtectedOwnerImages(restoredItems, imageRegistry);

      // Replace this stall's items in menuItems
      menuItems = [
        ...menuItems.filter(m => m.stall !== stall),
        ...restoredItems
      ];

      saveMenuToDisk();

      // Create a snapshot for this restoration
      const newSnapshot: MenuVersionSnapshot = {
        versionId: `v_restore_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        stallName: stall,
        timestamp: Date.now(),
        savedAt: new Date().toISOString(),
        itemCount: restoredItems.length,
        items: JSON.parse(JSON.stringify(restoredItems)),
        summary: `Restored version from ${new Date(targetVersion.timestamp).toLocaleString()}`
      };

      stallVersions.unshift(newSnapshot);
      saveMenuVersions(menuVersions);

      menuVersion = Date.now();

      res.json({
        success: true,
        message: "Version restored successfully.",
        items: restoredItems,
        snapshot: newSnapshot,
        version: menuVersion
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to restore version." });
    }
  });

  // Save stall broadcast notice
  app.post("/api/stalls/notice", (req, res) => {
    const { stall, notice } = req.body || {};
    if (!stall) {
      return res.status(400).json({ error: "Stall name is required" });
    }

    const session = requireMerchant(req, res, String(stall));
    if (!session) return;

    // Strict Paywall Access Control: Subscription must be Active
    const noticeAccess = isStallSubscriptionActive(session.stallName);
    if (!noticeAccess.active) {
      return res.status(403).json({
        error: noticeAccess.reason || "Subscription required: Your subscription is expired or inactive. Please renew to manage your stall.",
        subscriptionExpired: true,
        code: "SUBSCRIPTION_REQUIRED"
      });
    }
    stallNotices[session.stallName] = String(notice || "").trim();
    saveNoticesToDisk();
    menuVersion = Date.now();
    res.json({ success: true, stall: session.stallName, notice: stallNotices[session.stallName] });
  });

  // ==========================================================================
  // SMART SALES TRACKER ROUTES (Protected per-merchant + Offline Sync Idempotency)
  // ==========================================================================

  // 1. Fetch Sales Records & Dashboard Metrics for Authenticated Merchant Stall
  app.get("/api/sales/:stallName", (req, res) => {
    try {
      const stallName = decodeURIComponent(req.params.stallName).trim();
      const session = requireMerchant(req, res, stallName);
      if (!session) return;

      const { filter, startDate, endDate, recordType } = req.query;

      // Strictly filter by exact stallName so one merchant never reads another merchant's sales
      const matchedRecords = salesRecords.filter(r => r.stallName === stallName);

      const todayStr = new Date().toISOString().slice(0, 10);

      // Date Range Calculation Helpers
      const now = new Date();
      // Start of current week (Monday)
      const dayOfWeek = (now.getDay() + 6) % 7; // Monday = 0
      const monday = new Date(now);
      monday.setDate(now.getDate() - dayOfWeek);
      const startOfWeekStr = monday.toISOString().slice(0, 10);

      // Start of current month
      const startOfMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

      // Filter records by date
      let filtered = matchedRecords;
      if (filter === "today") {
        filtered = filtered.filter(r => r.date === todayStr);
      } else if (filter === "this_week") {
        filtered = filtered.filter(r => r.date >= startOfWeekStr && r.date <= todayStr);
      } else if (filter === "this_month") {
        filtered = filtered.filter(r => r.date >= startOfMonthStr && r.date <= todayStr);
      } else if (filter === "custom" && startDate && endDate) {
        filtered = filtered.filter(r => r.date >= String(startDate) && r.date <= String(endDate));
      }

      // Filter by record type if requested
      if (recordType === "daily_summary" || recordType === "itemized") {
        filtered = filtered.filter(r => r.recordType === recordType);
      }

      // Sort records by date descending (newest first)
      filtered.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

      // ------------------------------------------------------------------------
      // TODAY'S METRICS CALCULATION (Smart Deduplication)
      // If both itemized and daily summary exist for today, use itemized to avoid double counting
      // ------------------------------------------------------------------------
      const todayRecords = matchedRecords.filter(r => r.date === todayStr);
      let todaySales = 0;
      let todayExpenses = 0;
      let todayItemsSold = 0;

      // Group today by record type
      const todayItemized = todayRecords.filter(r => r.recordType === "itemized");
      const todaySummaries = todayRecords.filter(r => r.recordType === "daily_summary");

      if (todayItemized.length > 0) {
        // Use itemized records as primary
        todaySales = todayItemized.reduce((sum, r) => sum + (r.totalSales || 0), 0);
        todayExpenses = todayItemized.reduce((sum, r) => sum + (r.totalExpenses || 0), 0);
        todayItemsSold = todayItemized.reduce((sum, r) => sum + (r.totalItemsSold || 0), 0);
      } else if (todaySummaries.length > 0) {
        todaySales = todaySummaries.reduce((sum, r) => sum + (r.totalSales || 0), 0);
        todayExpenses = todaySummaries.reduce((sum, r) => sum + (r.totalExpenses || 0), 0);
        todayItemsSold = todaySummaries.reduce((sum, r) => sum + (r.totalItemsSold || 0), 0);
      }
      const todayProfit = todaySales - todayExpenses;

      // Best selling item today
      const todayItemMap: Record<string, { quantity: number; totalSales: number }> = {};
      todayRecords.forEach(r => {
        if (r.items) {
          r.items.forEach(it => {
            const key = it.foodName.trim();
            if (!todayItemMap[key]) todayItemMap[key] = { quantity: 0, totalSales: 0 };
            todayItemMap[key].quantity += it.quantitySold || 0;
            todayItemMap[key].totalSales += it.totalSales || 0;
          });
        }
      });
      let todayBestSellingItem: { name: string; quantity: number; totalSales: number } | null = null;
      let maxTodayQty = 0;
      Object.entries(todayItemMap).forEach(([name, data]) => {
        if (data.quantity > maxTodayQty) {
          maxTodayQty = data.quantity;
          todayBestSellingItem = { name, quantity: data.quantity, totalSales: data.totalSales };
        }
      });

      // ------------------------------------------------------------------------
      // FILTERED RANGE TOTALS & METRICS (Smart Deduplicated by Date)
      // ------------------------------------------------------------------------
      // When recordType is 'all', deduplicate by date to avoid double-counting if an owner
      // recorded both an itemized record and a daily summary on the same date.
      const dateMap = new Map<string, SalesRecord[]>();
      filtered.forEach(r => {
        const list = dateMap.get(r.date) || [];
        list.push(r);
        dateMap.set(r.date, list);
      });

      let filterSales = 0;
      let filterExpenses = 0;
      let filterItemsSold = 0;

      dateMap.forEach((dayRecords) => {
        if (recordType === "daily_summary") {
          dayRecords.filter(r => r.recordType === "daily_summary").forEach(r => {
            filterSales += r.totalSales || 0;
            filterExpenses += r.totalExpenses || 0;
            filterItemsSold += r.totalItemsSold || 0;
          });
        } else if (recordType === "itemized") {
          dayRecords.filter(r => r.recordType === "itemized").forEach(r => {
            filterSales += r.totalSales || 0;
            filterExpenses += r.totalExpenses || 0;
            filterItemsSold += r.totalItemsSold || 0;
          });
        } else {
          // 'all' records mode: Deduplicate per day
          const itemizedList = dayRecords.filter(r => r.recordType === "itemized");
          const summaryList = dayRecords.filter(r => r.recordType === "daily_summary");
          if (itemizedList.length > 0) {
            itemizedList.forEach(r => {
              filterSales += r.totalSales || 0;
              filterExpenses += r.totalExpenses || 0;
              filterItemsSold += r.totalItemsSold || 0;
            });
          } else {
            summaryList.forEach(r => {
              filterSales += r.totalSales || 0;
              filterExpenses += r.totalExpenses || 0;
              filterItemsSold += r.totalItemsSold || 0;
            });
          }
        }
      });

      const filterProfit = filterSales - filterExpenses;

      // Filtered range item aggregation
      const rangeItemMap: Record<string, { quantity: number; totalSales: number }> = {};
      filtered.forEach(r => {
        if (r.items) {
          r.items.forEach(it => {
            const key = it.foodName.trim();
            if (!rangeItemMap[key]) rangeItemMap[key] = { quantity: 0, totalSales: 0 };
            rangeItemMap[key].quantity += it.quantitySold || 0;
            rangeItemMap[key].totalSales += it.totalSales || 0;
          });
        }
      });

      let filterBestSellingItem: { name: string; quantity: number; totalSales: number } | null = null;
      let maxRangeQty = 0;
      Object.entries(rangeItemMap).forEach(([name, data]) => {
        if (data.quantity > maxRangeQty) {
          maxRangeQty = data.quantity;
          filterBestSellingItem = { name, quantity: data.quantity, totalSales: data.totalSales };
        }
      });

      // Slow-selling items analysis:
      // Prompt requirement: "Identify slow-selling items based on their recorded sales quantities,
      // without claiming that an item is slow-selling when there is insufficient data."
      const itemKeys = Object.keys(rangeItemMap);
      const slowSellingItems: { name: string; quantity: number; totalSales: number; reason: string }[] = [];
      const insufficientDataForSlowSelling = itemKeys.length < 3;

      if (!insufficientDataForSlowSelling) {
        const sortedAsc = Object.entries(rangeItemMap)
          .sort((a, b) => a[1].quantity - b[1].quantity);
        
        // Take items with notably low sales compared to the median or below 10 items
        const avgQty = sortedAsc.reduce((sum, item) => sum + item[1].quantity, 0) / sortedAsc.length;
        sortedAsc.forEach(([name, data]) => {
          if (data.quantity <= Math.max(3, Math.floor(avgQty * 0.4)) && slowSellingItems.length < 3) {
            slowSellingItems.push({
              name,
              quantity: data.quantity,
              totalSales: data.totalSales,
              reason: `${data.quantity} sold vs average of ${Math.round(avgQty)} units. Consider featuring or bundling.`
            });
          }
        });
      }

      res.json({
        success: true,
        stallName,
        records: filtered,
        totalCount: matchedRecords.length,
        metrics: {
          todayTotalSales: todaySales,
          todayExpenses,
          todayEstimatedProfit: todayProfit,
          todayItemsSold,
          todayBestSellingItem,
          filterTotalSales: filterSales,
          filterExpenses,
          filterEstimatedProfit: filterProfit,
          filterItemsSold,
          filterBestSellingItem,
          slowSellingItems,
          insufficientDataForSlowSelling
        }
      });
    } catch (err: any) {
      console.error("Sales fetch error:", err);
      res.status(500).json({ error: err.message || "Failed to fetch sales records." });
    }
  });

  // 2. Create or Save a Daily Sales Report or Per-Item Record
  app.post("/api/sales", (req, res) => {
    try {
      const {
        stallName,
        recordType,
        date,
        totalSales,
        totalExpenses,
        notes,
        items,
        overrideDuplicate,
        clientMutationId
      } = req.body || {};

      if (!stallName || !recordType || !date) {
        return res.status(400).json({ error: "Stall name, record type, and date are required." });
      }

      const session = requireMerchant(req, res, String(stallName).trim());
      if (!session) return;

      // Offline sync idempotency guard
      if (clientMutationId) {
        const existingSynced = salesRecords.find((r: any) => r.clientMutationId === clientMutationId && r.stallName === session.stallName);
        if (existingSynced) {
          return res.json({ success: true, message: "Sales record already synchronized.", record: existingSynced });
        }
      }

      // Subscription Access Check
      const access = isStallSubscriptionActive(session.stallName);
      if (!access.active) {
        return res.status(403).json({
          error: access.reason || "Subscription required to record sales data.",
          subscriptionExpired: true,
          code: "SUBSCRIPTION_REQUIRED"
        });
      }

      if (recordType !== "daily_summary" && recordType !== "itemized") {
        return res.status(400).json({ error: "Invalid record type. Must be 'daily_summary' or 'itemized'." });
      }

      // Validate date format YYYY-MM-DD
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: "Date must be formatted as YYYY-MM-DD." });
      }

      const numExpenses = Math.max(0, parseFloat(totalExpenses) || 0);
      let numSales = Math.max(0, parseFloat(totalSales) || 0);
      let totalItemsSold = 0;
      let processedItems: SalesItemEntry[] | undefined = undefined;

      // Validate and compute itemized entries if present
      if (recordType === "itemized") {
        if (!Array.isArray(items) || items.length === 0) {
          return res.status(400).json({ error: "At least one food item is required for a per-item sales record." });
        }

        processedItems = items.map((it: any, index: number) => {
          const foodName = String(it.foodName || "").trim();
          if (!foodName) {
            throw new Error(`Item #${index + 1} must have a food name.`);
          }
          const quantitySold = Math.max(0, parseInt(it.quantitySold, 10) || 0);
          const sellingPrice = Math.max(0, parseFloat(it.sellingPrice) || 0);
          const itemTotal = quantitySold * sellingPrice;
          totalItemsSold += quantitySold;

          return {
            id: it.id || `item_${Date.now()}_${index}`,
            dishId: it.dishId ? Number(it.dishId) : undefined,
            foodName,
            quantitySold,
            sellingPrice,
            totalSales: itemTotal,
            notes: it.notes ? String(it.notes).trim() : undefined
          };
        });

        // Computed total sales from items
        numSales = processedItems.reduce((sum, it) => sum + it.totalSales, 0);
      } else {
        // Daily summary mode: prevent negative amounts
        if (numSales < 0 || numExpenses < 0) {
          return res.status(400).json({ error: "Sales and expenses amounts cannot be negative." });
        }
      }

      const estimatedProfit = numSales - numExpenses;

      // Duplicate prevention:
      // If a record of the SAME TYPE already exists for this stall & date:
      const existingIndex = salesRecords.findIndex(
        r => r.stallName === stallName && r.date === date && r.recordType === recordType
      );

      if (existingIndex !== -1 && !overrideDuplicate) {
        const existing = salesRecords[existingIndex];
        return res.status(409).json({
          success: false,
          duplicate: true,
          existingId: existing.id,
          message: `A ${recordType === "daily_summary" ? "Daily Sales Summary" : "Per-Item Sales Record"} already exists for ${date}. Would you like to update it instead?`
        });
      }

      if (existingIndex !== -1 && overrideDuplicate) {
        // Update existing record
        salesRecords[existingIndex] = {
          ...salesRecords[existingIndex],
          totalSales: numSales,
          totalExpenses: numExpenses,
          estimatedProfit,
          notes: notes ? String(notes).trim() : undefined,
          items: processedItems,
          totalItemsSold: recordType === "itemized" ? totalItemsSold : salesRecords[existingIndex].totalItemsSold,
          updatedAt: new Date().toISOString()
        };
        saveSalesRecordsToDisk(salesRecords);
        return res.json({
          success: true,
          message: "Sales record updated successfully.",
          record: salesRecords[existingIndex]
        });
      }

      // Create new record
      const newRecord: SalesRecord & { clientMutationId?: string } = {
        id: `sale_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        stallName: session.stallName,
        recordType,
        date,
        totalSales: numSales,
        totalExpenses: numExpenses,
        estimatedProfit,
        notes: notes ? String(notes).trim() : undefined,
        items: processedItems,
        totalItemsSold: recordType === "itemized" ? totalItemsSold : undefined,
        ...(clientMutationId ? { clientMutationId: String(clientMutationId) } : {}),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      salesRecords.unshift(newRecord);
      saveSalesRecordsToDisk(salesRecords);

      res.status(201).json({
        success: true,
        message: "Sales report saved successfully.",
        record: newRecord
      });
    } catch (err: any) {
      console.error("Save sales error:", err);
      res.status(400).json({ error: err.message || "Failed to save sales record." });
    }
  });

  // 3. Update Existing Sales Record
  app.put("/api/sales/:id", (req, res) => {
    try {
      const { id } = req.params;
      const {
        date,
        totalSales,
        totalExpenses,
        notes,
        items
      } = req.body || {};

      const record = salesRecords.find(r => r.id === id);
      if (!record) {
        return res.status(404).json({ error: "Sales record not found." });
      }

      const session = requireMerchant(req, res, record.stallName);
      if (!session) return;

      if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        record.date = date;
      }

      if (typeof totalExpenses !== "undefined") {
        record.totalExpenses = Math.max(0, parseFloat(totalExpenses) || 0);
      }

      if (record.recordType === "itemized" && Array.isArray(items)) {
        let totalItemsSold = 0;
        record.items = items.map((it: any, index: number) => {
          const foodName = String(it.foodName || "").trim();
          if (!foodName) throw new Error(`Item #${index + 1} must have a name.`);
          const quantitySold = Math.max(0, parseInt(it.quantitySold, 10) || 0);
          const sellingPrice = Math.max(0, parseFloat(it.sellingPrice) || 0);
          totalItemsSold += quantitySold;
          return {
            id: it.id || `item_${Date.now()}_${index}`,
            dishId: it.dishId ? Number(it.dishId) : undefined,
            foodName,
            quantitySold,
            sellingPrice,
            totalSales: quantitySold * sellingPrice,
            notes: it.notes ? String(it.notes).trim() : undefined
          };
        });
        record.totalSales = record.items.reduce((sum, it) => sum + it.totalSales, 0);
        record.totalItemsSold = totalItemsSold;
      } else if (typeof totalSales !== "undefined") {
        record.totalSales = Math.max(0, parseFloat(totalSales) || 0);
      }

      record.estimatedProfit = record.totalSales - record.totalExpenses;
      if (typeof notes !== "undefined") {
        record.notes = String(notes || "").trim();
      }
      record.updatedAt = new Date().toISOString();

      saveSalesRecordsToDisk(salesRecords);

      res.json({
        success: true,
        message: "Sales record updated successfully.",
        record
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || "Failed to update record." });
    }
  });

  // 4. Delete Sales Record
  app.delete("/api/sales/:id", (req, res) => {
    try {
      const { id } = req.params;
      const existing = salesRecords.find(r => r.id === id);
      if (!existing) {
        return res.status(404).json({ error: "Sales record not found." });
      }

      const session = requireMerchant(req, res, existing.stallName);
      if (!session) return;

      salesRecords = salesRecords.filter(r => r.id !== id);
      saveSalesRecordsToDisk(salesRecords);
      res.json({ success: true, message: "Record deleted successfully." });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to delete record." });
    }
  });

  // ==========================================================================
  // VITE MIDDLEWARE & STATIC ASSETS
  // ==========================================================================
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        ws: { server: httpServer },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Unsay Sud-an? server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
