import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Users,
  CreditCard,
  Search,
  Upload,
  QrCode,
  Building2,
  RefreshCw,
  Check,
  X,
  History,
  Lock,
  Unlock,
  Settings,
  LogOut,
  Sparkles,
  AlertTriangle,
  PauseCircle,
  UserCheck,
  UserPlus,
  Store,
  UtensilsCrossed,
  BarChart3,
  Smartphone,
  Tablet,
  Monitor,
  Activity,
  Eye
} from 'lucide-react';
import {
  UserSubscription,
  PaymentRecord,
  AdminPaymentSettings,
  AdminSubscriptionSummary,
  AuditLogEntry,
  AppPage,
  AdminMerchantRecord,
  AdminPlatformOverview,
  WebsiteVisitorAnalyticsData
} from '../types';
import {
  fetchAdminStatusAPI,
  adminRegisterAPI,
  adminLoginAPI,
  adminLogoutAPI,
  fetchAdminSummaryAPI,
  fetchAdminMerchantsAPI,
  fetchAdminPlatformOverviewAPI,
  fetchAdminVisitorAnalyticsAPI,
  adminUpdateMerchantStatusAPI,
  adminVerifyPaymentAPI,
  adminManualAccessAPI,
  adminUpdateSettingsAPI,
  adminUploadQRCodeAPI,
  fetchAdminAuditLogsAPI
} from '../services/api';
import { compressImageFile } from '../utils/imageCompressor';

interface AdminSubscriptionDashboardProps {
  onLogout: () => void;
  onNavigate: (page: AppPage) => void;
  adminUser?: { username: string; name: string } | null;
  onLoginSuccess?: (admin: { username: string; name: string }) => void;
}

export const AdminSubscriptionDashboard: React.FC<AdminSubscriptionDashboardProps> = ({
  onLogout,
  onNavigate,
  adminUser,
  onLoginSuccess
}) => {
  const [localAdmin, setLocalAdmin] = useState<{ username: string; name: string } | null>(adminUser || null);
  const [isCheckingStatus, setIsCheckingStatus] = useState<boolean>(true);
  const [isAdminRegistered, setIsAdminRegistered] = useState<boolean | null>(null);
  const [adminStatusError, setAdminStatusError] = useState<string | null>(null);

  // Super Admin Registration-First State
  const [regName, setRegName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regPin, setRegPin] = useState('');
  const [regError, setRegError] = useState<string | null>(null);
  const [regSuccessMsg, setRegSuccessMsg] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);

  // Super Admin Login State (clean empty inputs — zero hardcoded defaults!)
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginPin, setLoginPin] = useState('');
  const [usePinMode, setUsePinMode] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    setLocalAdmin(adminUser || null);
  }, [adminUser]);

  // Check if single Super Admin account exists on disk
  const refreshAdminStatus = async () => {
    setIsCheckingStatus(true);
    try {
      const status = await fetchAdminStatusAPI();
      if (!status.success) {
        setIsAdminRegistered(null);
        setAdminStatusError(status.error || 'Unable to verify Super Admin registration status.');
        return;
      }
      setAdminStatusError(null);
      setIsAdminRegistered(status.isRegistered);
      if (status.admin) {
        setLocalAdmin(status.admin);
        if (onLoginSuccess) onLoginSuccess(status.admin);
      }
    } finally {
      setIsCheckingStatus(false);
    }
  };

  useEffect(() => {
    refreshAdminStatus();
  }, []);

  const [activeTab, setActiveTab] = useState<'pending' | 'merchants' | 'subscribers' | 'payments' | 'stallsMenus' | 'visitors' | 'settings' | 'audit'>('pending');
  const [summary, setSummary] = useState<AdminSubscriptionSummary | null>(null);
  const [merchants, setMerchants] = useState<AdminMerchantRecord[]>([]);
  const [subscriptions, setSubscriptions] = useState<UserSubscription[]>([]);
  const [recentPayments, setRecentPayments] = useState<PaymentRecord[]>([]);
  const [settings, setSettings] = useState<AdminPaymentSettings | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [platformOverview, setPlatformOverview] = useState<AdminPlatformOverview | null>(null);
  const [visitorAnalytics, setVisitorAnalytics] = useState<WebsiteVisitorAnalyticsData | null>(null);
  const [visitorChartMode, setVisitorChartMode] = useState<'daily' | 'monthly'>('daily');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [actionErrorMsg, setActionErrorMsg] = useState<string | null>(null);

  // Search & Filter
  const [searchMerchant, setSearchMerchant] = useState<string>('');
  const [searchSubscriber, setSearchSubscriber] = useState<string>('');
  const [subscriberFilter, setSubscriberFilter] = useState<'all' | 'Active' | 'Expired'>('all');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'Pending Verification' | 'Approved' | 'Rejected'>('all');
  const [searchOverviewStall, setSearchOverviewStall] = useState<string>('');
  const [searchOverviewMenu, setSearchOverviewMenu] = useState<string>('');
  const [filterOverviewMenuStall, setFilterOverviewMenuStall] = useState<string>('all');
  const [filterOverviewMenuStatus, setFilterOverviewMenuStatus] = useState<'all' | 'available' | 'soldout' | 'hidden'>('all');

  // Modals
  const [rejectModalPayment, setRejectModalPayment] = useState<PaymentRecord | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [isProcessingAction, setIsProcessingAction] = useState<boolean>(false);

  const [manualAccessModalStall, setManualAccessModalStall] = useState<string | null>(null);
  const [manualAccessDays, setManualAccessDays] = useState<number>(7);
  const [manualAccessReason, setManualAccessReason] = useState<string>('');

  const [suspendStallTarget, setSuspendStallTarget] = useState<string | null>(null);
  const [suspendReasonInput, setSuspendReasonInput] = useState<string>('Administrative inspection & compliance review');

  const [revokeConfirmStall, setRevokeConfirmStall] = useState<string | null>(null);

  const [merchantStatusTarget, setMerchantStatusTarget] = useState<{
    merchant: AdminMerchantRecord;
    nextStatus: 'active' | 'suspended';
  } | null>(null);
  const [merchantStatusReason, setMerchantStatusReason] = useState<string>('');

  const [lightboxImg, setLightboxImg] = useState<string | null>(null);

  // Settings Edit State
  const [editGcashName, setEditGcashName] = useState<string>('');
  const [editGcashNumber, setEditGcashNumber] = useState<string>('');
  const [editGcashInstructions, setEditGcashInstructions] = useState<string>('');

  const [editBankName, setEditBankName] = useState<string>('');
  const [editBankHolder, setEditBankHolder] = useState<string>('');
  const [editBankNumber, setEditBankNumber] = useState<string>('');
  const [editBankInstructions, setEditBankInstructions] = useState<string>('');

  const [editWeeklyPrice, setEditWeeklyPrice] = useState<number>(25);
  const [editMonthlyPrice, setEditMonthlyPrice] = useState<number>(100);
  const [editBillingCycle, setEditBillingCycle] = useState<'calendar_month' | 'exact_30_days'>('calendar_month');

  const [qrUploadPreview, setQrUploadPreview] = useState<string | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState<boolean>(false);

  const showToast = (msg: string) => {
    setActionErrorMsg(null);
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const showError = (msg: string) => {
    setActionErrorMsg(msg);
  };

  const loadAdminData = async () => {
    if (!localAdmin && !adminUser) return;
    setIsLoading(true);
    setActionErrorMsg(null);
    try {
      const [sumRes, logsRes, merchantsRes, overviewRes, visitorsRes] = await Promise.all([
        fetchAdminSummaryAPI(),
        fetchAdminAuditLogsAPI(),
        fetchAdminMerchantsAPI(),
        fetchAdminPlatformOverviewAPI(),
        fetchAdminVisitorAnalyticsAPI()
      ]);

      if (sumRes.success) {
        setSummary(sumRes.summary || null);
        setSubscriptions(sumRes.subscriptions || []);
        setRecentPayments(sumRes.recentPayments || []);
        if (sumRes.settings) {
          setSettings(sumRes.settings);
          setEditGcashName(sumRes.settings.gcash.accountName);
          setEditGcashNumber(sumRes.settings.gcash.accountNumber);
          setEditGcashInstructions(sumRes.settings.gcash.instructions);

          setEditBankName(sumRes.settings.bank.bankName);
          setEditBankHolder(sumRes.settings.bank.accountHolder);
          setEditBankNumber(sumRes.settings.bank.accountNumber);
          setEditBankInstructions(sumRes.settings.bank.instructions);

          setEditWeeklyPrice(sumRes.settings.plans.weekly.price);
          setEditMonthlyPrice(sumRes.settings.plans.monthly.price);
          setEditBillingCycle(sumRes.settings.plans.monthly.billingCycle);
        }
      } else if (sumRes.error) {
        showError(sumRes.error);
      }

      if (logsRes.success && logsRes.logs) {
        setAuditLogs(logsRes.logs);
      }
      if (merchantsRes.success && merchantsRes.merchants) {
        setMerchants(merchantsRes.merchants);
      }
      if (overviewRes.success && overviewRes.overview) {
        setPlatformOverview(overviewRes.overview);
      }
      if (visitorsRes.success && visitorsRes.analytics) {
        setVisitorAnalytics(visitorsRes.analytics);
      }
    } catch (err: any) {
      showError(err?.message || 'Failed to load administrator data.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (localAdmin || adminUser) {
      loadAdminData();
    }
  }, [localAdmin, adminUser]);

  // Step 1: Initial Single Super Admin Registration Handler
  const handleSuperAdminRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError(null);
    setRegSuccessMsg(null);

    const cleanName = regName.trim();
    const cleanUsername = regUsername.trim().toLowerCase();
    const cleanEmail = regEmail.trim().toLowerCase();
    const cleanPin = regPin.trim();

    if (cleanName.length < 2) {
      setRegError('Full name must be at least 2 characters.');
      return;
    }
    if (!/^[a-zA-Z0-9._-]{3,32}$/.test(cleanUsername)) {
      setRegError('Username must be 3–32 characters (letters, numbers, dots, underscores, or hyphens).');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setRegError('Please enter a valid administrator email address.');
      return;
    }
    if (regPassword.length < 8) {
      setRegError('Super Admin password must be at least 8 characters long.');
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setRegError('Passwords do not match.');
      return;
    }
    if (cleanPin && !/^\d{4,6}$/.test(cleanPin)) {
      setRegError('Optional security PIN must be 4–6 numeric digits.');
      return;
    }

    setIsRegistering(true);
    try {
      const res = await adminRegisterAPI({
        name: cleanName,
        username: cleanUsername,
        email: cleanEmail,
        password: regPassword,
        pin: cleanPin || undefined
      });
      if (res.success) {
        setRegSuccessMsg(
          res.message || 'Super Admin account registered! Please log in with your registered credentials.'
        );
        setLoginIdentifier(cleanUsername);
        setLoginPassword('');
        setRegPassword('');
        setRegConfirmPassword('');
        setRegPin('');
        setIsAdminRegistered(true);
      } else {
        setRegError(res.error || 'Could not register Super Admin.');
      }
    } catch (err: any) {
      setRegError(err.message || 'Registration request failed.');
    } finally {
      setIsRegistering(false);
    }
  };

  // Step 2: Super Admin Login Handler
  const handleAdminLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    if (usePinMode) {
      if (!/^\d{4,6}$/.test(loginPin.trim())) {
        setLoginError('Please enter your 4–6 digit Super Admin security PIN.');
        return;
      }
    } else if (!loginIdentifier.trim() || !loginPassword) {
      setLoginError('Please enter your Super Admin username/email and password.');
      return;
    }

    setIsLoggingIn(true);
    try {
      const res = await adminLoginAPI({
        identifier: usePinMode ? undefined : loginIdentifier.trim(),
        password: usePinMode ? undefined : loginPassword,
        pin: usePinMode ? loginPin.trim() : undefined
      });
      if (res.success && res.admin) {
        setLocalAdmin(res.admin);
        setLoginPassword('');
        setLoginPin('');
        if (onLoginSuccess) onLoginSuccess(res.admin);
        showToast(`Welcome, ${res.admin.name}!`);
      } else {
        setLoginError(res.error || 'Invalid Super Admin credentials.');
      }
    } catch (err: any) {
      setLoginError(err.message || 'Login failed. Please check network.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogoutAdmin = async () => {
    await adminLogoutAPI();
    setLocalAdmin(null);
    onLogout();
  };

  // Approve Payment
  const handleApprovePayment = async (payment: PaymentRecord) => {
    if (isProcessingAction) return;
    setIsProcessingAction(true);
    try {
      const res = await adminVerifyPaymentAPI(
        payment.id,
        'approve',
        undefined,
        localAdmin?.username || adminUser?.username
      );
      if (res.success) {
        showToast(`Payment of ₱${payment.amount} approved for ${payment.stallName}!`);
        await loadAdminData();
      } else {
        showError(res.error || 'Failed to approve payment');
      }
    } catch (err: any) {
      showError(err.message || 'Error approving payment');
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Reject Payment Submit
  const handleConfirmReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectModalPayment) return;
    if (!rejectionReason.trim()) {
      showError('Please provide a reason for rejecting this payment receipt.');
      return;
    }
    setIsProcessingAction(true);
    try {
      const res = await adminVerifyPaymentAPI(
        rejectModalPayment.id,
        'reject',
        rejectionReason.trim(),
        localAdmin?.username || adminUser?.username
      );
      if (res.success) {
        showToast(`Payment rejected for ${rejectModalPayment.stallName}.`);
        setRejectModalPayment(null);
        setRejectionReason('');
        await loadAdminData();
      } else {
        showError(res.error || 'Failed to reject payment');
      }
    } catch (err: any) {
      showError(err.message || 'Error rejecting payment');
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Manual Access Grant
  const handleConfirmManualAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualAccessModalStall) return;
    setIsProcessingAction(true);
    try {
      const res = await adminManualAccessAPI({
        stallName: manualAccessModalStall,
        action: 'grant',
        durationDays: manualAccessDays,
        reason: manualAccessReason.trim() || 'Manual administrative access granted',
        adminUsername: localAdmin?.username || adminUser?.username
      });
      if (res.success) {
        showToast(`Granted ${manualAccessDays} days access to ${manualAccessModalStall}!`);
        setManualAccessModalStall(null);
        setManualAccessReason('');
        await loadAdminData();
      } else {
        showError(res.error || 'Failed to grant manual access');
      }
    } catch (err: any) {
      showError(err.message || 'Error granting manual access');
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Revoke Manual Access
  const handleConfirmRevokeAccess = async () => {
    if (!revokeConfirmStall) return;
    setIsProcessingAction(true);
    try {
      const res = await adminManualAccessAPI({
        stallName: revokeConfirmStall,
        action: 'revoke',
        reason: 'Administrative revocation',
        adminUsername: localAdmin?.username || adminUser?.username
      });
      if (res.success) {
        showToast(`Access revoked for ${revokeConfirmStall}.`);
        setRevokeConfirmStall(null);
        await loadAdminData();
      } else {
        showError(res.error || 'Failed to revoke access');
      }
    } catch (err: any) {
      showError(err.message || 'Error revoking access');
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Suspend Stall Subscription
  const handleConfirmSuspendStall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!suspendStallTarget) return;
    setIsProcessingAction(true);
    try {
      const res = await adminManualAccessAPI({
        stallName: suspendStallTarget,
        action: 'suspend',
        reason: suspendReasonInput.trim() || 'Suspended by Super Administrator',
        adminUsername: localAdmin?.username || adminUser?.username
      });
      if (res.success) {
        showToast(`${suspendStallTarget} subscription has been suspended.`);
        setSuspendStallTarget(null);
        await loadAdminData();
      } else {
        showError(res.error || 'Failed to suspend stall');
      }
    } catch (err: any) {
      showError(err.message || 'Error suspending stall');
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Toggle Registered Merchant Account Status (Active / Suspended)
  const handleConfirmMerchantStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!merchantStatusTarget) return;
    setIsProcessingAction(true);
    try {
      const { merchant, nextStatus } = merchantStatusTarget;
      const res = await adminUpdateMerchantStatusAPI(
        merchant.id,
        nextStatus,
        merchantStatusReason.trim() || undefined
      );
      if (res.success) {
        showToast(res.message || `Merchant status updated to ${nextStatus}.`);
        setMerchantStatusTarget(null);
        setMerchantStatusReason('');
        await loadAdminData();
      } else {
        showError(res.error || 'Failed to update merchant account status.');
      }
    } catch (err: any) {
      showError(err.message || 'Error updating merchant account status.');
    } finally {
      setIsProcessingAction(false);
    }
  };

  // QR Upload Change
  const handleQRFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const compressionRes = await compressImageFile(file);
      const compressedDataUrl = compressionRes.dataUrl;
      setQrUploadPreview(compressedDataUrl);

      const res = await adminUploadQRCodeAPI(
        compressedDataUrl,
        localAdmin?.username || adminUser?.username
      );
      if (res.success) {
        showToast('Official payment QR code uploaded and activated successfully!');
        await loadAdminData();
      } else {
        showError(res.error || 'Failed to upload QR code');
      }
    } catch {
      showError('Failed to process QR code file');
    }
  };

  // Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editGcashName.trim() || !editGcashNumber.trim() || !editBankName.trim() || !editBankHolder.trim() || !editBankNumber.trim()) {
      showError('Please fill in all required GCash and Bank fields.');
      return;
    }
    setIsSavingSettings(true);
    try {
      const res = await adminUpdateSettingsAPI(
        {
          gcash: {
            accountName: editGcashName.trim(),
            accountNumber: editGcashNumber.trim(),
            instructions: editGcashInstructions.trim(),
            isEnabled: true
          },
          bank: {
            bankName: editBankName.trim(),
            accountHolder: editBankHolder.trim(),
            accountNumber: editBankNumber.trim(),
            instructions: editBankInstructions.trim(),
            isEnabled: true
          },
          plans: {
            weekly: {
              price: Number(editWeeklyPrice),
              durationDays: 7,
              name: 'Weekly Plan',
              description: '7 days portal access',
              isEnabled: true
            },
            monthly: {
              price: Number(editMonthlyPrice),
              billingCycle: editBillingCycle,
              name: 'Monthly Plan',
              description: 'One calendar month access',
              isEnabled: true
            }
          }
        },
        localAdmin?.username || adminUser?.username
      );

      if (res.success) {
        showToast('Payment instructions and pricing updated successfully!');
        await loadAdminData();
      } else {
        showError(res.error || 'Failed to save settings');
      }
    } catch (err: any) {
      showError(err.message || 'Error saving settings');
    } finally {
      setIsSavingSettings(false);
    }
  };

  // =========================================================================
  // UNAUTHENTICATED VIEW: STRICT REGISTRATION-FIRST, THEN LOGIN WORKFLOW
  // =========================================================================
  if (!localAdmin && !adminUser) {
    if (isCheckingStatus) {
      return (
        <div className="max-w-md mx-auto py-16 px-4 text-center space-y-3">
          <RefreshCw className="w-7 h-7 animate-spin text-purple-600 mx-auto" />
          <p className="text-xs font-bold text-stone-600">Checking Super Administrator registration status...</p>
        </div>
      );
    }

    if (adminStatusError || isAdminRegistered === null) {
      return (
        <div className="max-w-md mx-auto py-16 px-4 text-center space-y-4">
          <AlertCircle className="w-8 h-8 text-rose-600 mx-auto" />
          <p className="text-sm font-bold text-stone-800">Cannot verify Super Admin setup status.</p>
          <p className="text-xs text-stone-600">{adminStatusError || 'Please try again.'}</p>
          <button
            type="button"
            onClick={refreshAdminStatus}
            className="px-5 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-black"
          >
            Retry status check
          </button>
        </div>
      );
    }

    // WORKFLOW STEP 1: NO SUPER ADMIN EXISTS YET -> SHOW REGISTRATION SCREEN FIRST
    if (isAdminRegistered === false) {
      return (
        <div className="max-w-md mx-auto py-8 px-4 animate-fade-in">
          <div className="bg-white rounded-3xl border border-stone-200/90 shadow-xl overflow-hidden">
            <div className="bg-gradient-to-r from-stone-900 via-stone-850 to-purple-950 p-6 text-white text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center mx-auto border border-white/20">
                <UserPlus className="w-6 h-6 text-purple-300" />
              </div>
              <span className="inline-block px-2.5 py-0.5 rounded-full bg-purple-600/80 text-white text-[10px] font-black uppercase tracking-wider">
                One-Time Setup • Single Super Admin
              </span>
              <h2 className="text-xl font-black font-display tracking-tight text-white">
                Super Administrator Registration
              </h2>
              <p className="text-xs text-stone-300">
                Create the sole authorized Super Administrator account for Unsay Sud-an?. Once created, additional admin registrations are permanently locked.
              </p>
            </div>

            <form onSubmit={handleSuperAdminRegister} noValidate className="p-6 space-y-3.5 text-xs">
              {regError && (
                <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{regError}</span>
                </div>
              )}

              <div>
                <label className="block font-black text-stone-800 mb-1">Full Name *</label>
                <input
                  type="text"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder="Enter administrator full name"
                  className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-black text-stone-800 mb-1">Admin Username *</label>
                  <input
                    type="text"
                    autoComplete="username"
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                    placeholder="e.g. superadmin"
                    className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-black text-stone-800 mb-1">Admin Email *</label>
                  <input
                    type="text"
                    inputMode="email"
                    autoComplete="email"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="admin@example.com"
                    className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-black text-stone-800 mb-1">Password (min. 8 chars) *</label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block font-black text-stone-800 mb-1">Confirm Password *</label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={regConfirmPassword}
                    onChange={(e) => setRegConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-black text-stone-800 mb-1">
                  Master Security PIN (4–6 Digits, Optional)
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={regPin}
                  onChange={(e) => setRegPin(e.target.value)}
                  placeholder="Optional 4–6 digit numeric PIN"
                  className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono tracking-widest"
                />
              </div>

              <button
                type="submit"
                disabled={isRegistering}
                className="w-full py-3 px-4 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-black text-xs transition shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isRegistering ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Registering Super Admin...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Create Single Super Admin Account</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => onNavigate('home')}
                className="w-full text-center text-xs text-stone-500 hover:text-stone-800 font-bold py-1"
              >
                Back to Cafeteria Home
              </button>
            </form>
          </div>
        </div>
      );
    }

    // WORKFLOW STEP 2: SUPER ADMIN REGISTERED -> SHOW LOGIN SCREEN
    return (
      <div className="max-w-md mx-auto py-10 px-4 animate-fade-in">
        <div className="bg-white rounded-3xl border border-stone-200/90 shadow-xl overflow-hidden">
          <div className="bg-gradient-to-r from-stone-900 via-stone-850 to-purple-950 p-6 text-white text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center mx-auto border border-white/20">
              <Lock className="w-6 h-6 text-purple-300" />
            </div>
            <h2 className="text-xl font-black font-display tracking-tight text-white">
              Super Administrator Login
            </h2>
            <p className="text-xs text-stone-300">
              Sign in with the registered Super Administrator credentials to access system-wide controls.
            </p>
          </div>

          <form onSubmit={handleAdminLoginSubmit} noValidate className="p-6 space-y-4">
            {regSuccessMsg && (
              <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>{regSuccessMsg}</span>
              </div>
            )}

            {loginError && (
              <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{loginError}</span>
              </div>
            )}

            {/* Mode Toggle */}
            <div className="flex bg-stone-100 p-1 rounded-xl text-xs font-bold text-stone-600">
              <button
                type="button"
                onClick={() => setUsePinMode(false)}
                className={`flex-1 py-1.5 rounded-lg transition ${
                  !usePinMode ? 'bg-white text-stone-900 shadow-2xs font-black' : 'hover:text-stone-900'
                }`}
              >
                Password Login
              </button>
              <button
                type="button"
                onClick={() => setUsePinMode(true)}
                className={`flex-1 py-1.5 rounded-lg transition ${
                  usePinMode ? 'bg-white text-stone-900 shadow-2xs font-black' : 'hover:text-stone-900'
                }`}
              >
                Security PIN
              </button>
            </div>

            {!usePinMode ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    Admin Username or Email *
                  </label>
                  <input
                    type="text"
                    autoComplete="username"
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    placeholder="Enter registered admin username or email"
                    className="w-full text-xs p-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 text-stone-900 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    Admin Password *
                  </label>
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Enter Super Admin password"
                    className="w-full text-xs p-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 text-stone-900 font-medium"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Master Security PIN *
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={loginPin}
                  onChange={(e) => setLoginPin(e.target.value)}
                  placeholder="••••"
                  className="w-full text-xs p-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 text-stone-900 font-mono tracking-widest text-center text-lg"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-3 px-4 rounded-xl bg-purple-700 hover:bg-purple-800 active:scale-98 text-white font-black text-xs transition shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isLoggingIn ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Sign In to Super Admin Dashboard</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => onNavigate('home')}
              className="w-full text-center text-xs text-stone-500 hover:text-stone-800 font-bold py-1"
            >
              Back to Cafeteria Home
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Pending Payments List
  const pendingPayments = recentPayments.filter((p) => p.status === 'Pending Verification');

  // Filtered Merchants
  const filteredMerchants = merchants.filter((m) => {
    if (!searchMerchant.trim()) return true;
    const q = searchMerchant.toLowerCase().trim();
    return (
      m.ownerName.toLowerCase().includes(q) ||
      m.stallName.toLowerCase().includes(q) ||
      m.username.toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q)
    );
  });

  // Filtered Subscribers
  const filteredSubscribers = subscriptions.filter((s) => {
    const norm = String(s.status || '').toUpperCase();
    const isExp = norm !== 'ACTIVE' || Date.now() >= new Date(s.expirationDate).getTime();
    if (subscriberFilter === 'Active' && isExp) return false;
    if (subscriberFilter === 'Expired' && !isExp) return false;
    if (searchSubscriber.trim()) {
      return s.stallName.toLowerCase().includes(searchSubscriber.toLowerCase().trim());
    }
    return true;
  });

  // Filtered Payments History
  const filteredPayments = recentPayments.filter((p) => {
    if (paymentFilter !== 'all' && p.status !== paymentFilter) return false;
    return true;
  });

  return (
    <div className="max-w-6xl mx-auto py-4 sm:py-8 space-y-6 animate-fade-in">
      {toastMsg && (
        <div className="fixed top-20 right-6 z-50 bg-stone-900 text-white px-4 py-2.5 rounded-2xl shadow-xl text-xs font-bold flex items-center gap-2 border border-stone-700 animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMsg}</span>
        </div>
      )}

      {actionErrorMsg && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{actionErrorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionErrorMsg(null)}
            className="text-rose-600 hover:text-rose-900 font-bold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Admin Top Header */}
      <div className="bg-stone-900 text-white p-5 sm:p-7 rounded-3xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-orange-600 text-white text-[10px] font-black uppercase tracking-wider">
              Single Super Admin Mode
            </span>
            <span className="text-xs text-stone-400">
              Signed in as {(localAdmin || adminUser)?.name || (localAdmin || adminUser)?.username}
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black font-display tracking-tight text-white">
            System Administration & Billing Control
          </h1>

          <p className="text-xs text-stone-300">
            Monitor registered stall owners, verify payments, configure payment details, and manage stall access.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={loadAdminData}
            disabled={isLoading}
            className="p-2.5 bg-stone-800 hover:bg-stone-700 rounded-xl text-stone-300 hover:text-white transition text-xs font-bold flex items-center gap-1.5"
            title="Refresh Data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            type="button"
            onClick={handleLogoutAdmin}
            className="px-4 py-2 bg-stone-800 hover:bg-rose-900/60 border border-stone-700 hover:border-rose-500 rounded-xl text-rose-300 hover:text-white transition text-xs font-bold flex items-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* Top Analytics Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 bg-emerald-50 rounded-3xl border border-emerald-200 space-y-1">
          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 block">
            Verified Total Revenue
          </span>
          <div className="text-2xl sm:text-3xl font-black text-emerald-950 font-display">
            ₱{(summary?.totalVerifiedRevenue ?? 0).toLocaleString()}
          </div>
          <p className="text-[10px] text-emerald-700 font-medium">
            Approved merchant payments only
          </p>
        </div>

        <div className="p-4 bg-orange-50 rounded-3xl border border-orange-200 space-y-1">
          <span className="text-[10px] font-black uppercase tracking-wider text-orange-800 block">
            Registered Stall Owners
          </span>
          <div className="text-2xl sm:text-3xl font-black text-orange-950 font-display">
            {merchants.length}
          </div>
          <p className="text-[10px] text-orange-700 font-medium">
            {summary?.activeSubscribers ?? 0} Active • {summary?.weeklySubscribers ?? 0} Weekly • {summary?.monthlySubscribers ?? 0} Monthly
          </p>
        </div>

        <div
          className={`p-4 rounded-3xl border space-y-1 ${
            (summary?.pendingPaymentsCount ?? 0) > 0
              ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-300/60'
              : 'bg-stone-50 border-stone-200'
          }`}
        >
          <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 block flex items-center justify-between">
            <span>Pending Verifications</span>
            {(summary?.pendingPaymentsCount ?? 0) > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            )}
          </span>
          <div className="text-2xl sm:text-3xl font-black text-amber-950 font-display">
            {summary?.pendingPaymentsCount ?? 0}
          </div>
          <p className="text-[10px] text-amber-700 font-medium">
            {(summary?.pendingPaymentsCount ?? 0) > 0 ? 'Requires administrator approval' : 'All receipts reviewed'}
          </p>
        </div>

        <div className="p-4 bg-rose-50 rounded-3xl border border-rose-200 space-y-1">
          <span className="text-[10px] font-black uppercase tracking-wider text-rose-800 block">
            Expired / Restricted
          </span>
          <div className="text-2xl sm:text-3xl font-black text-rose-950 font-display">
            {summary?.expiredSubscribers ?? 0}
          </div>
          <p className="text-[10px] text-rose-700 font-medium">
            Hidden from student menus until renewed
          </p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto p-1 bg-stone-100 rounded-2xl text-xs font-bold text-stone-600 no-scrollbar">
        <button
          type="button"
          onClick={() => setActiveTab('pending')}
          className={`py-2 px-3.5 rounded-xl transition flex items-center gap-1.5 shrink-0 ${
            activeTab === 'pending' ? 'bg-white text-stone-900 shadow-2xs font-black' : 'hover:text-stone-900'
          }`}
        >
          <Clock className="w-3.5 h-3.5 text-amber-600" />
          <span>Pending Verifications</span>
          {pendingPayments.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[10px] font-black">
              {pendingPayments.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('merchants')}
          className={`py-2 px-3.5 rounded-xl transition flex items-center gap-1.5 shrink-0 ${
            activeTab === 'merchants' ? 'bg-white text-stone-900 shadow-2xs font-black' : 'hover:text-stone-900'
          }`}
        >
          <Store className="w-3.5 h-3.5 text-emerald-600" />
          <span>Registered Stall Owners ({merchants.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('subscribers')}
          className={`py-2 px-3.5 rounded-xl transition flex items-center gap-1.5 shrink-0 ${
            activeTab === 'subscribers' ? 'bg-white text-stone-900 shadow-2xs font-black' : 'hover:text-stone-900'
          }`}
        >
          <Users className="w-3.5 h-3.5 text-orange-600" />
          <span>Subscriptions & Access</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('payments')}
          className={`py-2 px-3.5 rounded-xl transition flex items-center gap-1.5 shrink-0 ${
            activeTab === 'payments' ? 'bg-white text-stone-900 shadow-2xs font-black' : 'hover:text-stone-900'
          }`}
        >
          <CreditCard className="w-3.5 h-3.5 text-blue-600" />
          <span>Payment History</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('stallsMenus')}
          className={`py-2 px-3.5 rounded-xl transition flex items-center gap-1.5 shrink-0 ${
            activeTab === 'stallsMenus' ? 'bg-white text-stone-900 shadow-2xs font-black' : 'hover:text-stone-900'
          }`}
        >
          <UtensilsCrossed className="w-3.5 h-3.5 text-orange-600" />
          <span>Stalls & Menus ({platformOverview?.stats.totalMenuItems ?? 0})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('visitors')}
          className={`py-2 px-3.5 rounded-xl transition flex items-center gap-1.5 shrink-0 ${
            activeTab === 'visitors' ? 'bg-white text-stone-900 shadow-2xs font-black' : 'hover:text-stone-900'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5 text-indigo-600" />
          <span>Visitor Analytics ({visitorAnalytics?.totalVisits ?? 0})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className={`py-2 px-3.5 rounded-xl transition flex items-center gap-1.5 shrink-0 ${
            activeTab === 'settings' ? 'bg-white text-stone-900 shadow-2xs font-black' : 'hover:text-stone-900'
          }`}
        >
          <Settings className="w-3.5 h-3.5 text-stone-700" />
          <span>Payment Settings & QR</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('audit')}
          className={`py-2 px-3.5 rounded-xl transition flex items-center gap-1.5 shrink-0 ${
            activeTab === 'audit' ? 'bg-white text-stone-900 shadow-2xs font-black' : 'hover:text-stone-900'
          }`}
        >
          <History className="w-3.5 h-3.5 text-purple-600" />
          <span>Audit Logs</span>
        </button>
      </div>

      {/* TAB 1: PENDING VERIFICATIONS */}
      {activeTab === 'pending' && (
        <div className="bg-white rounded-3xl border border-stone-200/90 p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <div>
              <h3 className="text-base font-black text-stone-900 font-display">
                Payments Awaiting Verification
              </h3>
              <p className="text-xs text-stone-500">
                Inspect receipts and click Approve to activate subscription or Reject with reason.
              </p>
            </div>
            <span className="text-xs font-bold text-amber-700 bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
              {pendingPayments.length} Pending
            </span>
          </div>

          {pendingPayments.length === 0 ? (
            <div className="text-center py-12 px-4 space-y-2 text-stone-400">
              <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500 stroke-[1.5]" />
              <h4 className="text-xs font-bold text-stone-700">No Pending Payments</h4>
              <p className="text-[11px] text-stone-400 max-w-sm mx-auto">
                All submitted stall receipts have been verified. New submissions from stall owners will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingPayments.map((item) => (
                <div
                  key={item.id}
                  className="p-4 sm:p-5 rounded-2xl border-2 border-amber-200 bg-amber-50/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition hover:border-amber-300"
                >
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px] font-black uppercase">
                        Pending Verification
                      </span>
                      <span className="text-[11px] text-stone-400">
                        Submitted {new Date(item.submittedAt).toLocaleString()}
                      </span>
                    </div>

                    <div>
                      <h4 className="text-sm sm:text-base font-black text-stone-900">{item.stallName}</h4>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-600 mt-0.5 font-medium">
                        <span>Plan: <strong className="capitalize text-stone-900">{item.plan}</strong></span>
                        <span>Method: <strong className="uppercase text-stone-900">{item.paymentMethod}</strong></span>
                        <span>Ref No: <strong className="font-mono text-stone-900">{item.referenceNumber}</strong></span>
                        <span>Payment Date: <strong className="text-stone-900">{item.paymentDate}</strong></span>
                      </div>
                    </div>

                    {item.notes && (
                      <p className="text-[11px] text-stone-500 italic">Note: &quot;{item.notes}&quot;</p>
                    )}
                  </div>

                  <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                    <div
                      onClick={() => setLightboxImg(item.proofImageUrl)}
                      className="w-16 h-16 sm:w-20 sm:h-20 bg-stone-100 rounded-xl border border-stone-200 overflow-hidden cursor-pointer hover:opacity-90 relative group shadow-2xs"
                      title="Click to view full receipt"
                    >
                      <img src={item.proofImageUrl} alt="Proof" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-stone-900/30 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white text-[10px] font-bold">
                        Enlarge
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => handleApprovePayment(item)}
                        disabled={isProcessingAction}
                        className="py-2 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-xs flex items-center justify-center gap-1.5 transition disabled:opacity-50"
                      >
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                        <span>Approve ₱{item.amount}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setRejectModalPayment(item);
                          setRejectionReason('');
                        }}
                        disabled={isProcessingAction}
                        className="py-1.5 px-4 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Reject Receipt</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: REGISTERED STALL OWNERS MONITORING */}
      {activeTab === 'merchants' && (
        <div className="bg-white rounded-3xl border border-stone-200/90 p-5 sm:p-6 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-100">
            <div>
              <h3 className="text-base font-black text-stone-900 font-display">
                Registered Cafeteria Stall Owners
              </h3>
              <p className="text-xs text-stone-500">
                Real registered merchant accounts stored on the server. Suspend or reactivate access per merchant.
              </p>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                value={searchMerchant}
                onChange={(e) => setSearchMerchant(e.target.value)}
                placeholder="Search owner, username, stall..."
                className="pl-8 pr-3 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 text-stone-900 font-medium"
              />
            </div>
          </div>

          {filteredMerchants.length === 0 ? (
            <div className="text-center py-12 px-4 space-y-2 text-stone-400">
              <UserCheck className="w-10 h-10 mx-auto text-stone-300 stroke-[1.5]" />
              <h4 className="text-xs font-bold text-stone-700">No Registered Stall Owners Yet</h4>
              <p className="text-[11px] text-stone-400 max-w-sm mx-auto">
                Newly registered stall owners from the Stall Portal will appear here with their live subscription status.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-stone-100 text-stone-400 text-[10px] uppercase font-black tracking-wider">
                    <th className="py-2.5 px-2">Owner & Username</th>
                    <th className="py-2.5 px-2">Assigned Stall</th>
                    <th className="py-2.5 px-2">Email & Contact</th>
                    <th className="py-2.5 px-2">Subscription</th>
                    <th className="py-2.5 px-2">Account Status</th>
                    <th className="py-2.5 px-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 text-stone-700">
                  {filteredMerchants.map((m) => (
                    <tr key={m.id} className="hover:bg-stone-50/60 transition">
                      <td className="py-3 px-2">
                        <span className="font-bold text-stone-900 block">{m.ownerName}</span>
                        <span className="text-[11px] font-mono text-stone-500">@{m.username}</span>
                      </td>
                      <td className="py-3 px-2 font-semibold text-stone-800">{m.stallName}</td>
                      <td className="py-3 px-2">
                        <span className="block text-stone-700">{m.email}</span>
                        {m.contactNumber && (
                          <span className="text-[11px] text-stone-500 font-mono">{m.contactNumber}</span>
                        )}
                      </td>
                      <td className="py-3 px-2">
                        <span className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-800 text-[10px] font-bold">
                          {m.subscriptionStatus || m.trialStatus || 'Not Started'}
                        </span>
                      </td>
                      <td className="py-3 px-2">
                        {m.accountStatus === 'suspended' ? (
                          <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-black uppercase">
                            Suspended
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-right">
                        {m.accountStatus === 'suspended' ? (
                          <button
                            type="button"
                            onClick={() => {
                              setMerchantStatusTarget({ merchant: m, nextStatus: 'active' });
                              setMerchantStatusReason('Account reactivated by Super Administrator');
                            }}
                            className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-[11px] border border-emerald-200 transition"
                          >
                            Reactivate
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setMerchantStatusTarget({ merchant: m, nextStatus: 'suspended' });
                              setMerchantStatusReason('Administrative compliance review');
                            }}
                            className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[11px] border border-rose-200 transition"
                          >
                            Suspend
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: SUBSCRIBER DIRECTORY & ACCESS CONTROL */}
      {activeTab === 'subscribers' && (
        <div className="bg-white rounded-3xl border border-stone-200/90 p-5 sm:p-6 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-100">
            <div>
              <h3 className="text-base font-black text-stone-900 font-display">
                Stall Subscriptions & Access Overrides
              </h3>
              <p className="text-xs text-stone-500">Live subscription status, expiration timeline, and manual access override.</p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  type="text"
                  value={searchSubscriber}
                  onChange={(e) => setSearchSubscriber(e.target.value)}
                  placeholder="Search stall..."
                  className="pl-8 pr-3 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 text-stone-900 font-medium"
                />
              </div>

              <select
                value={subscriberFilter}
                onChange={(e) => setSubscriberFilter(e.target.value as any)}
                className="text-xs p-1.5 bg-stone-50 border border-stone-200 rounded-xl font-bold text-stone-700"
              >
                <option value="all">All Statuses</option>
                <option value="Active">Active Only</option>
                <option value="Expired">Expired / Restricted</option>
              </select>
            </div>
          </div>

          {filteredSubscribers.length === 0 ? (
            <div className="text-center py-10 text-stone-400 text-xs">
              No stall subscriptions recorded yet. Subscriptions appear once registered merchants start a trial or submit payment.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-stone-100 text-stone-400 text-[10px] uppercase font-black tracking-wider">
                    <th className="py-2.5 px-2">Stall Name</th>
                    <th className="py-2.5 px-2">Plan</th>
                    <th className="py-2.5 px-2">Status</th>
                    <th className="py-2.5 px-2">Start Date</th>
                    <th className="py-2.5 px-2">Expiration Date</th>
                    <th className="py-2.5 px-2">Days Left</th>
                    <th className="py-2.5 px-2 text-right">Access Controls</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 text-stone-700">
                  {filteredSubscribers.map((sub) => {
                    const now = Date.now();
                    const expTime = new Date(sub.expirationDate).getTime();
                    const daysLeft = Math.max(0, Math.ceil((expTime - now) / (1000 * 60 * 60 * 24)));
                    const normStatus = String(sub.status || 'EXPIRED').toUpperCase();
                    const isSuspended = normStatus === 'SUSPENDED';
                    const isPending = normStatus === 'PENDING';
                    const isExp = isSuspended || isPending || now >= expTime || normStatus === 'EXPIRED';

                    return (
                      <tr key={sub.id} className="hover:bg-stone-50/60 transition">
                        <td className="py-3 px-2 font-bold text-stone-900">
                          {sub.stallName}
                          {sub.isManuallyGranted && (
                            <span className="block text-[10px] text-purple-600 font-bold">
                              (Admin Grace: {sub.manualGrantReason})
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-2 capitalize font-semibold">{sub.plan}</td>
                        <td className="py-3 px-2">
                          {isSuspended ? (
                            <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 text-[10px] font-black inline-flex items-center gap-1 border border-purple-200">
                              <AlertTriangle className="w-3 h-3 text-purple-700" />
                              <span>SUSPENDED</span>
                            </span>
                          ) : isPending ? (
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black inline-flex items-center gap-1 border border-amber-200">
                              <Clock className="w-3 h-3 text-amber-700" />
                              <span>PENDING</span>
                            </span>
                          ) : isExp ? (
                            <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-black inline-flex items-center gap-1 border border-rose-200">
                              <XCircle className="w-3 h-3 text-rose-600" />
                              <span>EXPIRED</span>
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black inline-flex items-center gap-1 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>ACTIVE</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-2 text-stone-500 font-mono">
                          {new Date(sub.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                        <td className={`py-3 px-2 font-mono font-bold ${isExp ? 'text-rose-600' : 'text-stone-800'}`}>
                          {new Date(sub.expirationDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                        <td className="py-3 px-2 font-black">
                          {isExp ? (
                            <span className="text-rose-600">0 days</span>
                          ) : (
                            <span className="text-stone-900">{daysLeft} days</span>
                          )}
                        </td>
                        <td className="py-3 px-2 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setManualAccessModalStall(sub.stallName);
                                setManualAccessDays(7);
                                setManualAccessReason('Administrative activation');
                              }}
                              className="px-2.5 py-1 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-lg text-[11px] font-bold transition flex items-center gap-1"
                              title="Activate or Extend Subscription"
                            >
                              <Unlock className="w-3 h-3 text-emerald-600" />
                              <span>{isExp ? 'Activate' : 'Extend'}</span>
                            </button>

                            {!isSuspended && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSuspendStallTarget(sub.stallName);
                                  setSuspendReasonInput('Administrative inspection & compliance review');
                                }}
                                className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg text-[11px] font-bold transition"
                                title="Suspend stall subscription and hide public dishes"
                              >
                                <PauseCircle className="w-3 h-3 text-amber-600" />
                              </button>
                            )}

                            {!isExp && (
                              <button
                                type="button"
                                onClick={() => setRevokeConfirmStall(sub.stallName)}
                                className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-[11px] font-bold transition"
                                title="Revoke active access"
                              >
                                <Lock className="w-3 h-3 text-rose-600" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: PAYMENT HISTORY */}
      {activeTab === 'payments' && (
        <div className="bg-white rounded-3xl border border-stone-200/90 p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-100">
            <div>
              <h3 className="text-base font-black text-stone-900 font-display">
                All Transactions & Payment Records
              </h3>
              <p className="text-xs text-stone-500">Filter by verification status.</p>
            </div>

            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value as any)}
              className="text-xs p-1.5 bg-stone-50 border border-stone-200 rounded-xl font-bold text-stone-700"
            >
              <option value="all">All Payments</option>
              <option value="Approved">Approved Only</option>
              <option value="Pending Verification">Pending Only</option>
              <option value="Rejected">Rejected Only</option>
            </select>
          </div>

          {filteredPayments.length === 0 ? (
            <div className="text-center py-10 text-stone-400 text-xs">
              No payment transactions recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-stone-100 text-stone-400 text-[10px] uppercase font-black tracking-wider">
                    <th className="py-2.5 px-2">Submitted</th>
                    <th className="py-2.5 px-2">Stall</th>
                    <th className="py-2.5 px-2">Plan</th>
                    <th className="py-2.5 px-2">Method</th>
                    <th className="py-2.5 px-2">Reference</th>
                    <th className="py-2.5 px-2">Amount</th>
                    <th className="py-2.5 px-2">Proof</th>
                    <th className="py-2.5 px-2">Status</th>
                    <th className="py-2.5 px-2">Verified By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 text-stone-700">
                  {filteredPayments.map((item) => (
                    <tr key={item.id} className="hover:bg-stone-50/60 transition">
                      <td className="py-3 px-2 text-stone-500 font-mono text-[11px]">
                        {new Date(item.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="py-3 px-2 font-bold text-stone-900">{item.stallName}</td>
                      <td className="py-3 px-2 capitalize font-semibold">{item.plan}</td>
                      <td className="py-3 px-2 uppercase font-mono text-[11px] font-bold text-stone-600">{item.paymentMethod}</td>
                      <td className="py-3 px-2 font-mono text-stone-900 font-bold">{item.referenceNumber}</td>
                      <td className="py-3 px-2 font-black text-stone-900 font-display">₱{item.amount}</td>
                      <td className="py-3 px-2">
                        {item.proofImageUrl ? (
                          <button
                            type="button"
                            onClick={() => setLightboxImg(item.proofImageUrl)}
                            className="text-[11px] font-bold text-orange-600 hover:text-orange-700 hover:underline"
                          >
                            View Receipt
                          </button>
                        ) : (
                          <span className="text-stone-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-2">
                        {item.status === 'Approved' ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Approved</span>
                          </span>
                        ) : item.status === 'Rejected' ? (
                          <div className="space-y-0.5">
                            <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-black inline-flex items-center gap-1">
                              <XCircle className="w-3 h-3" />
                              <span>Rejected</span>
                            </span>
                            {item.rejectionReason && (
                              <span className="block text-[10px] text-rose-600 truncate max-w-[150px]" title={item.rejectionReason}>
                                {item.rejectionReason}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>Pending</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-stone-500 text-[11px]">{item.verifiedBy || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 4B: STALLS, MENUS & APPLICATION STATISTICS */}
      {activeTab === 'stallsMenus' && (
        <div className="space-y-6 animate-fade-in">
          {/* Real Application Statistics Summary */}
          <div className="bg-white rounded-3xl border border-stone-200/90 p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-stone-100">
              <div>
                <h3 className="text-base font-black text-stone-900 font-display">
                  Real-Time Platform & Menu Statistics
                </h3>
                <p className="text-xs text-stone-500">
                  Live figures computed directly from server records on disk.
                </p>
              </div>
              <span className="text-[11px] font-bold text-stone-500">
                {platformOverview ? `${platformOverview.stats.totalStalls} stalls • ${platformOverview.stats.totalMenuItems} menu items` : 'Loading...'}
              </span>
            </div>

            {platformOverview ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                <div className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200">
                  <span className="text-[10px] font-black uppercase text-stone-500 block">Total Stalls</span>
                  <div className="text-xl font-black text-stone-900 font-display mt-0.5">
                    {platformOverview.stats.totalStalls}
                  </div>
                  <span className="text-[10px] text-stone-500">
                    {platformOverview.stats.registeredStalls} claimed • {platformOverview.stats.customStalls} custom
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-orange-50 border border-orange-200">
                  <span className="text-[10px] font-black uppercase text-orange-800 block">Total Menu Items</span>
                  <div className="text-xl font-black text-orange-950 font-display mt-0.5">
                    {platformOverview.stats.totalMenuItems}
                  </div>
                  <span className="text-[10px] text-orange-700">
                    {platformOverview.stats.availableItems} available
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200">
                  <span className="text-[10px] font-black uppercase text-rose-800 block">Sold Out / Hidden</span>
                  <div className="text-xl font-black text-rose-950 font-display mt-0.5">
                    {platformOverview.stats.soldOutItems} / {platformOverview.stats.hiddenItems}
                  </div>
                  <span className="text-[10px] text-rose-700">
                    Live dish availability
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200">
                  <span className="text-[10px] font-black uppercase text-emerald-800 block">Owner Photos</span>
                  <div className="text-xl font-black text-emerald-950 font-display mt-0.5">
                    {platformOverview.stats.protectedOwnerImages}
                  </div>
                  <span className="text-[10px] text-emerald-700">
                    {platformOverview.stats.archivedDishes} archived dishes
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-blue-50 border border-blue-200">
                  <span className="text-[10px] font-black uppercase text-blue-800 block">Sales Logs</span>
                  <div className="text-xl font-black text-blue-950 font-display mt-0.5">
                    {platformOverview.stats.totalSalesRecords}
                  </div>
                  <span className="text-[10px] text-blue-700">
                    {platformOverview.stats.activeNotices} active notices
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-purple-50 border border-purple-200">
                  <span className="text-[10px] font-black uppercase text-purple-800 block">Stall & Dish Views</span>
                  <div className="text-xl font-black text-purple-950 font-display mt-0.5">
                    {platformOverview.stats.totalStallProfileViews + platformOverview.stats.totalItemViews}
                  </div>
                  <span className="text-[10px] text-purple-700">
                    {platformOverview.stats.totalStallProfileViews} stall • {platformOverview.stats.totalItemViews} dish
                  </span>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-stone-400">Loading platform statistics...</div>
            )}
          </div>

          {/* Stalls Directory */}
          <div className="bg-white rounded-3xl border border-stone-200/90 p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-100">
              <div>
                <h3 className="text-base font-black text-stone-900 font-display">
                  Cafeteria Stalls Directory
                </h3>
                <p className="text-xs text-stone-500">
                  All official and custom registered stalls with owner binding, visibility, and menu counts.
                </p>
              </div>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  type="text"
                  value={searchOverviewStall}
                  onChange={(e) => setSearchOverviewStall(e.target.value)}
                  placeholder="Filter stalls or owners..."
                  className="pl-8 pr-3 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 text-stone-900 font-medium"
                />
              </div>
            </div>

            {platformOverview && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-stone-100 text-stone-400 text-[10px] uppercase font-black tracking-wider">
                      <th className="py-2.5 px-2">Stall & Zone</th>
                      <th className="py-2.5 px-2">Registered Owner</th>
                      <th className="py-2.5 px-2">Subscription / Visibility</th>
                      <th className="py-2.5 px-2">Dishes</th>
                      <th className="py-2.5 px-2">Owner Photos</th>
                      <th className="py-2.5 px-2">Profile Views</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 text-stone-700">
                    {platformOverview.stalls
                      .filter((s) => {
                        const q = searchOverviewStall.trim().toLowerCase();
                        if (!q) return true;
                        return (
                          s.name.toLowerCase().includes(q) ||
                          (s.ownerName || '').toLowerCase().includes(q) ||
                          (s.ownerUsername || '').toLowerCase().includes(q)
                        );
                      })
                      .map((s) => (
                        <tr key={s.name} className="hover:bg-stone-50/60 transition">
                          <td className="py-3 px-2">
                            <span className="font-bold text-stone-900 block">{s.name}</span>
                            <div className="flex items-center gap-1.5 mt-0.5 text-[10px]">
                              <span className="px-1.5 py-0.2 rounded bg-stone-100 text-stone-600 uppercase font-bold">
                                {s.zone}
                              </span>
                              {s.isCustom && (
                                <span className="px-1.5 py-0.2 rounded bg-purple-100 text-purple-700 font-bold">
                                  Custom Stall
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-2">
                            {s.hasRegisteredOwner ? (
                              <div>
                                <span className="font-bold text-stone-900 block">{s.ownerName}</span>
                                <span className="text-[10px] font-mono text-stone-500">
                                  @{s.ownerUsername} • {s.accountStatus || 'active'}
                                </span>
                              </div>
                            ) : (
                              <span className="text-stone-400 text-[11px] italic">Unclaimed Catalog</span>
                            )}
                          </td>
                          <td className="py-3 px-2">
                            <div className="space-y-0.5">
                              <span className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-800 text-[10px] font-bold inline-block">
                                {s.subscriptionStatus}
                              </span>
                              <span
                                className={`block text-[10px] font-bold ${
                                  s.isPubliclyVisible ? 'text-emerald-700' : 'text-rose-600'
                                }`}
                              >
                                {s.isPubliclyVisible ? 'Visible to students' : 'Hidden from students'}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-2">
                            <span className="font-black text-stone-900">{s.totalDishes}</span>
                            <span className="block text-[10px] text-stone-500">
                              {s.availableDishes} avail • {s.soldOutDishes} sold out
                              {s.hiddenDishes > 0 ? ` • ${s.hiddenDishes} hidden` : ''}
                            </span>
                          </td>
                          <td className="py-3 px-2 font-bold text-stone-800">{s.ownerPhotosCount}</td>
                          <td className="py-3 px-2 font-bold text-stone-800">{s.stallViews}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* All Menus Table */}
          <div className="bg-white rounded-3xl border border-stone-200/90 p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-stone-100">
              <div>
                <h3 className="text-base font-black text-stone-900 font-display">
                  All Menu Items Across Stalls
                </h3>
                <p className="text-xs text-stone-500">
                  Real-time inventory of every dish, price, availability, and student visibility.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input
                    type="text"
                    value={searchOverviewMenu}
                    onChange={(e) => setSearchOverviewMenu(e.target.value)}
                    placeholder="Search dish or stall..."
                    className="pl-8 pr-3 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 text-stone-900 font-medium"
                  />
                </div>
                <select
                  value={filterOverviewMenuStall}
                  onChange={(e) => setFilterOverviewMenuStall(e.target.value)}
                  className="text-xs p-1.5 bg-stone-50 border border-stone-200 rounded-xl font-bold text-stone-700 max-w-[180px]"
                >
                  <option value="all">All Stalls</option>
                  {(platformOverview?.stalls || []).map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <select
                  value={filterOverviewMenuStatus}
                  onChange={(e) => setFilterOverviewMenuStatus(e.target.value as any)}
                  className="text-xs p-1.5 bg-stone-50 border border-stone-200 rounded-xl font-bold text-stone-700"
                >
                  <option value="all">All Statuses</option>
                  <option value="available">Available</option>
                  <option value="soldout">Sold Out</option>
                  <option value="hidden">Hidden</option>
                </select>
              </div>
            </div>

            {platformOverview && (
              <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-stone-100 text-stone-400 text-[10px] uppercase font-black tracking-wider">
                      <th className="py-2.5 px-2">Dish</th>
                      <th className="py-2.5 px-2">Stall</th>
                      <th className="py-2.5 px-2">Category</th>
                      <th className="py-2.5 px-2">Price</th>
                      <th className="py-2.5 px-2">Status</th>
                      <th className="py-2.5 px-2">Photo</th>
                      <th className="py-2.5 px-2 text-right">Clicks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 text-stone-700">
                    {platformOverview.menus
                      .filter((m) => {
                        if (filterOverviewMenuStall !== 'all' && m.stall !== filterOverviewMenuStall) return false;
                        if (filterOverviewMenuStatus === 'available' && (!m.available || m.hidden)) return false;
                        if (filterOverviewMenuStatus === 'soldout' && (m.available || m.hidden)) return false;
                        if (filterOverviewMenuStatus === 'hidden' && !m.hidden) return false;
                        const q = searchOverviewMenu.trim().toLowerCase();
                        if (!q) return true;
                        return (
                          m.name.toLowerCase().includes(q) ||
                          m.stall.toLowerCase().includes(q) ||
                          m.category.toLowerCase().includes(q)
                        );
                      })
                      .map((m) => (
                        <tr key={m.id} className="hover:bg-stone-50/60 transition">
                          <td className="py-2.5 px-2 font-bold text-stone-900">{m.name}</td>
                          <td className="py-2.5 px-2 text-stone-600">{m.stall}</td>
                          <td className="py-2.5 px-2">{m.category}</td>
                          <td className="py-2.5 px-2 font-black text-stone-900">₱{m.price}</td>
                          <td className="py-2.5 px-2">
                            {m.hidden ? (
                              <span className="px-2 py-0.5 rounded-full bg-stone-200 text-stone-800 text-[10px] font-bold">
                                Hidden
                              </span>
                            ) : m.available ? (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                                Available
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold">
                                Sold Out
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-2 text-[11px]">
                            {m.ownerUploadedImage ? (
                              <span className="text-emerald-700 font-bold">Owner Photo</span>
                            ) : m.representativeImage || m.imageUrl ? (
                              <span className="text-stone-500">Catalog</span>
                            ) : (
                              <span className="text-stone-400">None</span>
                            )}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono font-bold text-stone-800">
                            {m.clicks || 0}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4C: WEBSITE VISITOR ANALYTICS (Strictly Real Persisted Events) */}
      {activeTab === 'visitors' && (
        <div className="space-y-6 animate-fade-in">
          <div className="bg-white rounded-3xl border border-stone-200/90 p-5 sm:p-6 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-100">
              <div>
                <h3 className="text-base font-black text-stone-900 font-display flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-indigo-600" />
                  <span>Website Visitor Analytics</span>
                </h3>
                <p className="text-xs text-stone-500">
                  Real visitor activity persisted on disk across sessions, devices, pages, and QR entry points.
                </p>
              </div>
              <button
                type="button"
                onClick={loadAdminData}
                disabled={isLoading}
                className="self-start sm:self-auto px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold flex items-center gap-1.5 transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                <span>Refresh Analytics</span>
              </button>
            </div>

            {!visitorAnalytics ? (
              <div className="py-10 text-center text-xs text-stone-400">Loading visitor analytics...</div>
            ) : (
              <>
                {/* Primary Visitor Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-200">
                    <span className="text-[10px] font-black uppercase text-indigo-800 block">Total Visits</span>
                    <div className="text-2xl font-black text-indigo-950 font-display mt-0.5">
                      {visitorAnalytics.totalVisits.toLocaleString()}
                    </div>
                    <span className="text-[10px] text-indigo-700">
                      {visitorAnalytics.todayVisits} today • {visitorAnalytics.thisMonthVisits} this month
                    </span>
                  </div>

                  <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200">
                    <span className="text-[10px] font-black uppercase text-emerald-800 block">Unique Visitors</span>
                    <div className="text-2xl font-black text-emerald-950 font-display mt-0.5">
                      {visitorAnalytics.uniqueVisitors.toLocaleString()}
                    </div>
                    <span className="text-[10px] text-emerald-700">Distinct visitor IDs</span>
                  </div>

                  <div className="p-4 rounded-2xl bg-sky-50 border border-sky-200">
                    <span className="text-[10px] font-black uppercase text-sky-800 block">New vs Returning</span>
                    <div className="text-2xl font-black text-sky-950 font-display mt-0.5">
                      {visitorAnalytics.newVisitors} / {visitorAnalytics.returningVisitors}
                    </div>
                    <span className="text-[10px] text-sky-700">New / Returning visitors</span>
                  </div>

                  <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200">
                    <span className="text-[10px] font-black uppercase text-amber-800 flex items-center gap-1">
                      <Activity className="w-3 h-3 text-amber-600" />
                      <span>Active Visitors</span>
                    </span>
                    <div className="text-2xl font-black text-amber-950 font-display mt-0.5">
                      {visitorAnalytics.activeVisitors}
                    </div>
                    <span className="text-[10px] text-amber-700">Active in last 5 mins</span>
                  </div>

                  <div className="p-4 rounded-2xl bg-purple-50 border border-purple-200 col-span-2 sm:col-span-1">
                    <span className="text-[10px] font-black uppercase text-purple-800 flex items-center gap-1">
                      <QrCode className="w-3 h-3 text-purple-600" />
                      <span>QR Code Visits</span>
                    </span>
                    <div className="text-2xl font-black text-purple-950 font-display mt-0.5">
                      {visitorAnalytics.qrVisits.totalQrVisits}
                    </div>
                    <span className="text-[10px] text-purple-700">
                      {visitorAnalytics.qrVisits.uniqueQrVisitors} unique QR visitors
                    </span>
                  </div>
                </div>

                {/* Daily & Monthly Visits Chart */}
                <div className="p-4 sm:p-5 rounded-2xl bg-stone-50 border border-stone-200 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-stone-800">
                        {visitorChartMode === 'daily' ? 'Daily Visits (Last 14 Days)' : 'Monthly Visits (Last 12 Months)'}
                      </h4>
                      <p className="text-[11px] text-stone-500">
                        Computed strictly from recorded visits on disk.
                      </p>
                    </div>
                    <div className="inline-flex bg-white p-0.5 rounded-xl border border-stone-200 text-xs font-bold">
                      <button
                        type="button"
                        onClick={() => setVisitorChartMode('daily')}
                        className={`px-3 py-1 rounded-lg transition ${
                          visitorChartMode === 'daily' ? 'bg-indigo-600 text-white' : 'text-stone-600 hover:text-stone-900'
                        }`}
                      >
                        Daily
                      </button>
                      <button
                        type="button"
                        onClick={() => setVisitorChartMode('monthly')}
                        className={`px-3 py-1 rounded-lg transition ${
                          visitorChartMode === 'monthly' ? 'bg-indigo-600 text-white' : 'text-stone-600 hover:text-stone-900'
                        }`}
                      >
                        Monthly
                      </button>
                    </div>
                  </div>

                  {(() => {
                    const buckets =
                      visitorChartMode === 'daily'
                        ? visitorAnalytics.dailyVisits
                        : visitorAnalytics.monthlyVisits;
                    const maxBucketVisits = Math.max(...buckets.map((b) => b.visits), 0);

                    return (
                      <div className="overflow-x-auto pb-1">
                        <div className="min-w-[540px] grid grid-flow-col auto-cols-fr gap-2 items-end h-40 pt-4">
                          {buckets.map((b) => {
                            const heightPct =
                              maxBucketVisits > 0 && b.visits > 0
                                ? Math.max(8, Math.round((b.visits / maxBucketVisits) * 100))
                                : 0;
                            return (
                              <div
                                key={'date' in b ? b.date : b.month}
                                className="flex flex-col items-center justify-end h-full gap-1"
                                title={`${b.label}: ${b.visits} visits (${b.uniqueVisitors} unique, ${b.qrVisits} QR)`}
                              >
                                <span className="text-[10px] font-bold text-stone-600">
                                  {b.visits > 0 ? b.visits : ''}
                                </span>
                                <div className="w-full max-w-[32px] flex-1 flex items-end bg-stone-200/50 rounded-t-lg overflow-hidden">
                                  {heightPct > 0 && (
                                    <div
                                      className="w-full bg-indigo-600 rounded-t-lg transition-all"
                                      style={{ height: `${heightPct}%` }}
                                    />
                                  )}
                                </div>
                                <span className="text-[9px] text-stone-500 font-medium truncate max-w-full">
                                  {b.label}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Pages, Devices, and QR Code Breakdown */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {/* Most Visited Pages */}
                  <div className="p-4 rounded-2xl border border-stone-200 bg-white space-y-3">
                    <h4 className="text-xs font-black uppercase tracking-wider text-stone-800 flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Most Visited Pages</span>
                    </h4>
                    {visitorAnalytics.mostVisitedPages.length === 0 ? (
                      <p className="text-xs text-stone-400 py-4 text-center">No page visits recorded yet.</p>
                    ) : (
                      <div className="space-y-2 text-xs">
                        {visitorAnalytics.mostVisitedPages.map((p) => (
                          <div key={p.page} className="space-y-1">
                            <div className="flex items-center justify-between font-bold text-stone-800">
                              <span className="capitalize">/{p.page}</span>
                              <span>
                                {p.visits} ({p.sharePercent}%)
                              </span>
                            </div>
                            <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-indigo-500 rounded-full"
                                style={{ width: `${p.sharePercent}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Device Types */}
                  <div className="p-4 rounded-2xl border border-stone-200 bg-white space-y-3">
                    <h4 className="text-xs font-black uppercase tracking-wider text-stone-800">
                      Device Types
                    </h4>
                    {(() => {
                      const { mobile, tablet, desktop } = visitorAnalytics.deviceTypes;
                      const totalDev = mobile + tablet + desktop;
                      const pct = (n: number) => (totalDev > 0 ? Math.round((n / totalDev) * 100) : 0);
                      return (
                        <div className="space-y-2.5 text-xs">
                          <div className="flex items-center justify-between p-2.5 rounded-xl bg-stone-50 border border-stone-100">
                            <span className="flex items-center gap-2 font-bold text-stone-800">
                              <Smartphone className="w-4 h-4 text-orange-600" />
                              <span>Mobile</span>
                            </span>
                            <span className="font-black text-stone-900">
                              {mobile} ({pct(mobile)}%)
                            </span>
                          </div>
                          <div className="flex items-center justify-between p-2.5 rounded-xl bg-stone-50 border border-stone-100">
                            <span className="flex items-center gap-2 font-bold text-stone-800">
                              <Tablet className="w-4 h-4 text-sky-600" />
                              <span>Tablet</span>
                            </span>
                            <span className="font-black text-stone-900">
                              {tablet} ({pct(tablet)}%)
                            </span>
                          </div>
                          <div className="flex items-center justify-between p-2.5 rounded-xl bg-stone-50 border border-stone-100">
                            <span className="flex items-center gap-2 font-bold text-stone-800">
                              <Monitor className="w-4 h-4 text-indigo-600" />
                              <span>Desktop</span>
                            </span>
                            <span className="font-black text-stone-900">
                              {desktop} ({pct(desktop)}%)
                            </span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* QR Code Visits Breakdown */}
                  <div className="p-4 rounded-2xl border border-stone-200 bg-white space-y-3">
                    <h4 className="text-xs font-black uppercase tracking-wider text-stone-800 flex items-center gap-1.5">
                      <QrCode className="w-3.5 h-3.5 text-purple-600" />
                      <span>Identifiable QR Visits</span>
                    </h4>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2.5 rounded-xl bg-purple-50 border border-purple-100">
                        <span className="text-[10px] font-bold text-purple-700 block">QR Deep Links</span>
                        <span className="text-lg font-black text-purple-950">
                          {visitorAnalytics.qrVisits.bySource.deeplink}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-orange-50 border border-orange-100">
                        <span className="text-[10px] font-bold text-orange-700 block">In-App Scanner</span>
                        <span className="text-lg font-black text-orange-950">
                          {visitorAnalytics.qrVisits.bySource.scanner}
                        </span>
                      </div>
                    </div>

                    {visitorAnalytics.qrVisits.topQrStalls.length === 0 ? (
                      <p className="text-[11px] text-stone-400 pt-1">
                        No QR-attributed stall visits recorded yet. Visits via ?stall=... links or the QR scanner appear here automatically.
                      </p>
                    ) : (
                      <div className="space-y-1.5 pt-1 text-xs">
                        <span className="text-[10px] font-black uppercase text-stone-400 block">
                          Top QR-Visited Stalls
                        </span>
                        {visitorAnalytics.qrVisits.topQrStalls.slice(0, 5).map((q) => (
                          <div key={q.stallName} className="flex items-center justify-between text-stone-700">
                            <span className="truncate font-semibold pr-2">{q.stallName}</span>
                            <span className="font-black text-stone-900 shrink-0">{q.visits}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Recent Visits Log */}
                <div className="space-y-2">
                  <h4 className="text-xs font-black uppercase tracking-wider text-stone-800">
                    Recent Recorded Visits ({visitorAnalytics.recentVisits.length})
                  </h4>
                  {visitorAnalytics.recentVisits.length === 0 ? (
                    <p className="text-xs text-stone-400 py-4 text-center border border-dashed border-stone-200 rounded-2xl">
                      No visits recorded yet.
                    </p>
                  ) : (
                    <div className="overflow-x-auto border border-stone-200 rounded-2xl">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="bg-stone-50 border-b border-stone-200 text-stone-400 text-[10px] uppercase font-black tracking-wider">
                            <th className="py-2 px-3">Time</th>
                            <th className="py-2 px-3">Page</th>
                            <th className="py-2 px-3">Visitor Type</th>
                            <th className="py-2 px-3">Device</th>
                            <th className="py-2 px-3">QR Attribution</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100 text-stone-700">
                          {visitorAnalytics.recentVisits.map((rv) => (
                            <tr key={rv.id} className="hover:bg-stone-50/70">
                              <td className="py-2 px-3 font-mono text-[11px] text-stone-500">
                                {new Date(rv.timestamp).toLocaleString()}
                              </td>
                              <td className="py-2 px-3 font-bold text-stone-900 capitalize">/{rv.page}</td>
                              <td className="py-2 px-3">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    rv.visitorType === 'Returning'
                                      ? 'bg-sky-100 text-sky-800'
                                      : 'bg-emerald-100 text-emerald-800'
                                  }`}
                                >
                                  {rv.visitorType}
                                </span>
                              </td>
                              <td className="py-2 px-3">{rv.deviceType}</td>
                              <td className="py-2 px-3">
                                {rv.qrSource ? (
                                  <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 text-[10px] font-bold">
                                    {rv.qrSource === 'deeplink' ? 'QR Link' : 'QR Scanner'}
                                    {rv.qrStall ? `: ${rv.qrStall}` : ''}
                                  </span>
                                ) : (
                                  <span className="text-stone-400">Direct</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: PAYMENT SETTINGS & QR */}
      {activeTab === 'settings' && (
        <form onSubmit={handleSaveSettings} noValidate className="bg-white rounded-3xl border border-stone-200/90 p-5 sm:p-6 shadow-xs space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <div>
              <h3 className="text-base font-black text-stone-900 font-display">
                Official Payment Details & Plan Pricing
              </h3>
              <p className="text-xs text-stone-500">
                Update account numbers, upload official QR codes, and configure pricing rules.
              </p>
            </div>

            <button
              type="submit"
              disabled={isSavingSettings}
              className="py-2.5 px-5 bg-orange-600 hover:bg-orange-700 text-white font-black text-xs rounded-xl shadow-xs transition flex items-center gap-1.5"
            >
              {isSavingSettings ? (
                <span>Saving...</span>
              ) : (
                <>
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>Save All Settings</span>
                </>
              )}
            </button>
          </div>

          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-orange-950 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-orange-600" />
              <span>Subscription Plan Pricing & Rules</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 space-y-1">
                <label className="block font-black text-stone-800">Weekly Plan Price (₱) *</label>
                <input
                  type="number"
                  min={5}
                  value={editWeeklyPrice}
                  onChange={(e) => setEditWeeklyPrice(Number(e.target.value))}
                  className="w-full p-2.5 bg-white border border-stone-300 rounded-xl font-black text-stone-900 text-sm"
                />
              </div>

              <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 space-y-1">
                <label className="block font-black text-stone-800">Monthly Plan Price (₱) *</label>
                <input
                  type="number"
                  min={10}
                  value={editMonthlyPrice}
                  onChange={(e) => setEditMonthlyPrice(Number(e.target.value))}
                  className="w-full p-2.5 bg-white border border-stone-300 rounded-xl font-black text-stone-900 text-sm"
                />
              </div>

              <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 space-y-1">
                <label className="block font-black text-stone-800">Monthly Billing Cycle *</label>
                <select
                  value={editBillingCycle}
                  onChange={(e) => setEditBillingCycle(e.target.value as any)}
                  className="w-full p-2.5 bg-white border border-stone-300 rounded-xl font-bold text-stone-900 text-xs"
                >
                  <option value="calendar_month">Calendar Month (Due last day of month)</option>
                  <option value="exact_30_days">Exact 30 Days from payment</option>
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-3 border-t border-stone-100">
            <h4 className="text-xs font-black uppercase tracking-wider text-blue-900 flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5 text-blue-600" />
              <span>Official GCash Configuration</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-black text-stone-800 mb-1">GCash Account Name *</label>
                <input
                  type="text"
                  value={editGcashName}
                  onChange={(e) => setEditGcashName(e.target.value)}
                  className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl font-medium"
                />
              </div>

              <div>
                <label className="block font-black text-stone-800 mb-1">GCash Mobile Number *</label>
                <input
                  type="text"
                  value={editGcashNumber}
                  onChange={(e) => setEditGcashNumber(e.target.value)}
                  className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block font-black text-stone-800 text-xs mb-1">GCash Payment Instructions</label>
              <textarea
                rows={2}
                value={editGcashInstructions}
                onChange={(e) => setEditGcashInstructions(e.target.value)}
                className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs font-medium"
              />
            </div>
          </div>

          <div className="space-y-3 pt-3 border-t border-stone-100">
            <h4 className="text-xs font-black uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Official Bank Transfer Configuration</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block font-black text-stone-800 mb-1">Bank Name *</label>
                <input
                  type="text"
                  value={editBankName}
                  onChange={(e) => setEditBankName(e.target.value)}
                  className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl font-medium"
                />
              </div>

              <div>
                <label className="block font-black text-stone-800 mb-1">Account Holder Name *</label>
                <input
                  type="text"
                  value={editBankHolder}
                  onChange={(e) => setEditBankHolder(e.target.value)}
                  className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl font-medium"
                />
              </div>

              <div>
                <label className="block font-black text-stone-800 mb-1">Account Number *</label>
                <input
                  type="text"
                  value={editBankNumber}
                  onChange={(e) => setEditBankNumber(e.target.value)}
                  className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block font-black text-stone-800 text-xs mb-1">Bank Transfer Instructions</label>
              <textarea
                rows={2}
                value={editBankInstructions}
                onChange={(e) => setEditBankInstructions(e.target.value)}
                className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs font-medium"
              />
            </div>
          </div>

          <div className="space-y-3 pt-3 border-t border-stone-100">
            <h4 className="text-xs font-black uppercase tracking-wider text-purple-900 flex items-center gap-1.5">
              <QrCode className="w-3.5 h-3.5 text-purple-600" />
              <span>Official Payment QR Code Graphic</span>
            </h4>

            <div className="flex flex-col sm:flex-row items-center gap-6 p-4 bg-purple-50/50 rounded-2xl border border-purple-100">
              <div className="w-36 h-36 bg-white p-2 rounded-2xl border border-purple-200 shrink-0 flex items-center justify-center overflow-hidden">
                <img
                  src={qrUploadPreview || settings?.qrCode.imageUrl || '/uploads/admin/official_qr.svg'}
                  alt="QR Preview"
                  className="w-full h-full object-contain"
                />
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <h5 className="font-black text-stone-900">Upload or Replace QR Code Image</h5>
                  <p className="text-stone-500 text-[11px] mt-0.5">
                    This official QR code is rendered on the stall owner subscription payment page.
                  </p>
                </div>

                <div className="relative inline-block">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleQRFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="py-2 px-4 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload New QR Image</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* TAB 6: AUDIT LOGS */}
      {activeTab === 'audit' && (
        <div className="bg-white rounded-3xl border border-stone-200/90 p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <div>
              <h3 className="text-base font-black text-stone-900 font-display">
                Administrator Actions & Security Audit Trail
              </h3>
              <p className="text-xs text-stone-500">
                Chronological log of payment approvals, rejections, overrides, and account status changes.
              </p>
            </div>
            <span className="text-xs text-stone-400 font-bold">{auditLogs.length} events logged</span>
          </div>

          {auditLogs.length === 0 ? (
            <div className="text-center py-10 text-stone-400 text-xs">No audit logs recorded yet.</div>
          ) : (
            <div className="divide-y divide-stone-100">
              {auditLogs.map((log) => (
                <div key={log.id} className="py-3 flex items-start gap-3 text-xs">
                  <div className="mt-0.5">
                    {log.action.includes('approve') ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : log.action.includes('reject') || log.action.includes('suspend') ? (
                      <XCircle className="w-4 h-4 text-rose-600" />
                    ) : log.action.includes('grant') ? (
                      <Unlock className="w-4 h-4 text-purple-600" />
                    ) : (
                      <Settings className="w-4 h-4 text-orange-600" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-bold text-stone-900">{log.details}</span>
                      <span className="text-[10px] text-stone-400 font-mono shrink-0">
                        {new Date(log.timestamp).toLocaleString()}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-stone-500 mt-0.5">
                      <span>Action by: <strong className="text-stone-700">{log.performedBy}</strong></span>
                      <span>Target: <strong className="text-stone-700">{log.targetStall}</strong></span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: REJECT PAYMENT WITH REASON */}
      {rejectModalPayment && (
        <div
          className="fixed inset-0 z-50 bg-stone-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setRejectModalPayment(null)}
        >
          <div
            className="max-w-md w-full bg-white rounded-3xl p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <h4 className="text-sm font-black text-rose-950 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600" />
                <span>Reject Payment Receipt</span>
              </h4>
              <button
                type="button"
                onClick={() => setRejectModalPayment(null)}
                className="text-stone-400 hover:text-stone-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-stone-600">
              Rejecting payment for <strong>{rejectModalPayment.stallName}</strong> (₱{rejectModalPayment.amount}, Ref: {rejectModalPayment.referenceNumber}). Provide a clear explanation so the merchant can resubmit.
            </p>

            <form onSubmit={handleConfirmReject} noValidate className="space-y-4 text-xs">
              <div>
                <label className="block font-black text-stone-800 mb-1">Rejection Reason *</label>
                <textarea
                  rows={3}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Explain why the receipt could not be verified..."
                  className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500 font-medium text-stone-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRejectModalPayment(null)}
                  className="px-4 py-2 text-stone-600 hover:bg-stone-100 rounded-xl font-bold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessingAction}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl shadow-xs transition"
                >
                  Confirm Rejection
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: MANUAL ACCESS OVERRIDE */}
      {manualAccessModalStall && (
        <div
          className="fixed inset-0 z-50 bg-stone-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setManualAccessModalStall(null)}
        >
          <div
            className="max-w-md w-full bg-white rounded-3xl p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <h4 className="text-sm font-black text-purple-950 flex items-center gap-2">
                <Unlock className="w-4 h-4 text-purple-600" />
                <span>Grant Administrative Access</span>
              </h4>
              <button
                type="button"
                onClick={() => setManualAccessModalStall(null)}
                className="text-stone-400 hover:text-stone-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-stone-600">
              Grant temporary bypass or grace period access to <strong>{manualAccessModalStall}</strong>.
            </p>

            <form onSubmit={handleConfirmManualAccess} noValidate className="space-y-4 text-xs">
              <div>
                <label className="block font-black text-stone-800 mb-1">Access Duration *</label>
                <select
                  value={manualAccessDays}
                  onChange={(e) => setManualAccessDays(Number(e.target.value))}
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl font-bold text-stone-800"
                >
                  <option value={3}>3 Days Grace Period</option>
                  <option value={7}>7 Days (1 Week)</option>
                  <option value={14}>14 Days (2 Weeks)</option>
                  <option value={30}>30 Days (1 Month)</option>
                </select>
              </div>

              <div>
                <label className="block font-black text-stone-800 mb-1">Reason for Override *</label>
                <input
                  type="text"
                  value={manualAccessReason}
                  onChange={(e) => setManualAccessReason(e.target.value)}
                  placeholder="Enter reason for override"
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl font-medium"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setManualAccessModalStall(null)}
                  className="px-4 py-2 text-stone-600 hover:bg-stone-100 rounded-xl font-bold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessingAction}
                  className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-black rounded-xl shadow-xs transition"
                >
                  Grant Temporary Access
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: SUSPEND STALL SUBSCRIPTION */}
      {suspendStallTarget && (
        <div
          className="fixed inset-0 z-50 bg-stone-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setSuspendStallTarget(null)}
        >
          <div
            className="max-w-md w-full bg-white rounded-3xl p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <h4 className="text-sm font-black text-amber-950 flex items-center gap-2">
                <PauseCircle className="w-4 h-4 text-amber-600" />
                <span>Suspend Stall Subscription</span>
              </h4>
              <button type="button" onClick={() => setSuspendStallTarget(null)} className="text-stone-400 hover:text-stone-700">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-stone-600">
              Suspending <strong>{suspendStallTarget}</strong> hides its menu items from students until reactivated.
            </p>
            <form onSubmit={handleConfirmSuspendStall} noValidate className="space-y-4 text-xs">
              <div>
                <label className="block font-black text-stone-800 mb-1">Suspension Reason</label>
                <input
                  type="text"
                  value={suspendReasonInput}
                  onChange={(e) => setSuspendReasonInput(e.target.value)}
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl font-medium"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button type="button" onClick={() => setSuspendStallTarget(null)} className="px-4 py-2 text-stone-600 hover:bg-stone-100 rounded-xl font-bold">
                  Cancel
                </button>
                <button type="submit" disabled={isProcessingAction} className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-black rounded-xl">
                  Confirm Suspension
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: REVOKE ACCESS CONFIRMATION */}
      {revokeConfirmStall && (
        <div
          className="fixed inset-0 z-50 bg-stone-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setRevokeConfirmStall(null)}
        >
          <div className="max-w-sm w-full bg-white rounded-3xl p-6 shadow-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-sm font-black text-rose-950 flex items-center gap-2">
              <Lock className="w-4 h-4 text-rose-600" />
              <span>Revoke Portal Access</span>
            </h4>
            <p className="text-xs text-stone-600">
              Revoke active portal access for <strong>{revokeConfirmStall}</strong>? Their public dishes will be hidden until subscription renewal.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setRevokeConfirmStall(null)} className="px-4 py-2 text-xs font-bold text-stone-600 hover:bg-stone-100 rounded-xl">
                Cancel
              </button>
              <button
                type="button"
                disabled={isProcessingAction}
                onClick={handleConfirmRevokeAccess}
                className="px-4 py-2 text-xs font-black bg-rose-600 hover:bg-rose-700 text-white rounded-xl"
              >
                Revoke Access
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: MERCHANT ACCOUNT SUSPEND / REACTIVATE */}
      {merchantStatusTarget && (
        <div
          className="fixed inset-0 z-50 bg-stone-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setMerchantStatusTarget(null)}
        >
          <div className="max-w-md w-full bg-white rounded-3xl p-6 shadow-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-sm font-black text-stone-900">
              {merchantStatusTarget.nextStatus === 'suspended' ? 'Suspend Merchant Account' : 'Reactivate Merchant Account'}
            </h4>
            <p className="text-xs text-stone-600">
              Update account status for <strong>{merchantStatusTarget.merchant.ownerName}</strong> ({merchantStatusTarget.merchant.stallName}).
            </p>
            <form onSubmit={handleConfirmMerchantStatus} noValidate className="space-y-4 text-xs">
              <div>
                <label className="block font-black text-stone-800 mb-1">Reason / Note</label>
                <input
                  type="text"
                  value={merchantStatusReason}
                  onChange={(e) => setMerchantStatusReason(e.target.value)}
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setMerchantStatusTarget(null)} className="px-4 py-2 font-bold text-stone-600 hover:bg-stone-100 rounded-xl">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessingAction}
                  className={`px-4 py-2 font-black text-white rounded-xl ${
                    merchantStatusTarget.nextStatus === 'suspended'
                      ? 'bg-rose-600 hover:bg-rose-700'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  Confirm
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 6: RECEIPT LIGHTBOX */}
      {lightboxImg && (
        <div
          className="fixed inset-0 z-50 bg-stone-950/85 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setLightboxImg(null)}
        >
          <div
            className="max-w-2xl max-h-[90vh] bg-white rounded-3xl p-4 overflow-hidden relative shadow-2xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <h4 className="text-xs font-black text-stone-900">High-Resolution Payment Receipt Inspection</h4>
              <button
                type="button"
                onClick={() => setLightboxImg(null)}
                className="text-stone-400 hover:text-stone-700 text-xs font-bold"
              >
                Close
              </button>
            </div>

            <div className="max-h-[75vh] overflow-auto flex items-center justify-center bg-stone-50 rounded-2xl p-2">
              <img src={lightboxImg} alt="Receipt Inspection" className="max-w-full max-h-[70vh] object-contain rounded-xl" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
