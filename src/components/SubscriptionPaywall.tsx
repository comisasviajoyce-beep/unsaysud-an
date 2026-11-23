import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  CreditCard, 
  Lock, 
  Check, 
  Upload, 
  Calendar, 
  Clock, 
  AlertCircle, 
  CheckCircle2, 
  FileText, 
  Download, 
  RefreshCw, 
  ArrowRight, 
  QrCode, 
  Building2, 
  Sparkles,
  HelpCircle,
  Copy,
  ChevronRight
} from 'lucide-react';
import { 
  UserSubscription, 
  PaymentRecord, 
  AdminPaymentSettings, 
  SubscriptionPlanType, 
  PaymentMethod,
  AppPage,
  StallCredential,
  TrialStatus
} from '../types';
import { 
  fetchSubscriptionSettingsAPI, 
  fetchSubscriptionStatusAPI, 
  submitSubscriptionPaymentAPI, 
  fetchStallPaymentsAPI,
  startFreeTrialAPI 
} from '../services/api';
import { compressImageFile } from '../utils/imageCompressor';

interface SubscriptionPaywallProps {
  stallName?: string;
  stalls?: StallCredential[];
  onPaymentSubmitted?: () => void;
  onNavigate: (page: AppPage) => void;
  onRefreshStatus?: () => void;
  showBackToPortal?: boolean;
}

export const SubscriptionPaywall: React.FC<SubscriptionPaywallProps> = ({
  stallName,
  stalls = [],
  onPaymentSubmitted,
  onNavigate,
  onRefreshStatus,
  showBackToPortal = false
}) => {
  // Active Stall Selection State (strictly scoped to logged-in stallName)
  const [activeStall, setActiveStall] = useState<string>(stallName || '');

  useEffect(() => {
    setActiveStall(stallName || '');
  }, [stallName]);

  // Settings & Status
  const [settings, setSettings] = useState<AdminPaymentSettings | null>(null);
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [trialStatus, setTrialStatus] = useState<TrialStatus>('Not Started');
  const [isTrial, setIsTrial] = useState<boolean>(false);
  const [isSubscribed, setIsSubscribed] = useState<boolean>(false);
  const [trialStartDate, setTrialStartDate] = useState<string | null>(null);
  const [trialEndDate, setTrialEndDate] = useState<string | null>(null);
  const [trialDaysRemaining, setTrialDaysRemaining] = useState<number>(0);
  const [isActivatingTrial, setIsActivatingTrial] = useState<boolean>(false);
  const [trialSuccessMsg, setTrialSuccessMsg] = useState<string | null>(null);
  const [trialErrorMsg, setTrialErrorMsg] = useState<string | null>(null);

  const [paymentHistory, setPaymentHistory] = useState<PaymentRecord[]>([]);
  const [pendingPayment, setPendingPayment] = useState<PaymentRecord | null>(null);
  const [daysRemaining, setDaysRemaining] = useState<number>(0);
  const [isExpired, setIsExpired] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Form State
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlanType>('monthly');
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('gcash');
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [proofDataUrl, setProofDataUrl] = useState<string | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [proofError, setProofError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Lightbox modal for previewing payment proofs
  const [previewModalImg, setPreviewModalImg] = useState<string | null>(null);

  // Load Data
  const loadData = async () => {
    setIsLoading(true);
    setTrialSuccessMsg(null);
    setTrialErrorMsg(null);
    try {
      const settingsRes = await fetchSubscriptionSettingsAPI();
      if (settingsRes.success && settingsRes.settings) {
        setSettings(settingsRes.settings);
      }

      if (!activeStall) {
        setSubscription(null);
        setPaymentHistory([]);
        setPendingPayment(null);
        setIsLoading(false);
        return;
      }

      const [statusRes, paymentsRes] = await Promise.all([
        fetchSubscriptionStatusAPI(activeStall),
        fetchStallPaymentsAPI(activeStall)
      ]);

      if (statusRes) {
        setTrialStatus(statusRes.trialStatus || 'Not Started');
        setIsTrial(!!statusRes.isTrial);
        setIsSubscribed(!!statusRes.isSubscribed);
        setTrialStartDate(statusRes.trialStartDate || null);
        setTrialEndDate(statusRes.trialEndDate || null);
        setTrialDaysRemaining(statusRes.trialDaysRemaining ?? 0);
        setIsExpired(!!statusRes.isExpired);
        setDaysRemaining(statusRes.daysRemaining || 0);

        if (statusRes.hasSubscription && statusRes.subscription) {
          setSubscription(statusRes.subscription);
          if (statusRes.subscription.plan && statusRes.subscription.plan !== 'trial') {
            setSelectedPlan(statusRes.subscription.plan);
          }
        } else {
          setSubscription(null);
        }

        if (statusRes.pendingPayment) {
          setPendingPayment(statusRes.pendingPayment);
        } else {
          setPendingPayment(null);
        }
      }
      if (paymentsRes.success && paymentsRes.payments) {
        setPaymentHistory(paymentsRes.payments);
      }
    } catch (err) {
      console.error('Failed to load subscription data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartTrial = async () => {
    if (!activeStall) {
      setTrialErrorMsg('Please log in as a registered stall owner first to start your 14-day free trial.');
      return;
    }
    setIsActivatingTrial(true);
    setTrialErrorMsg(null);
    setTrialSuccessMsg(null);
    try {
      const res = await startFreeTrialAPI(activeStall);
      if (res.success) {
        setTrialSuccessMsg(res.message || 'Free 14-Day Trial activated successfully!');
        await loadData();
        if (onRefreshStatus) onRefreshStatus();
      } else {
        setTrialErrorMsg(res.error || 'Failed to activate free trial.');
      }
    } catch (err: any) {
      setTrialErrorMsg(err.message || 'Network error activating free trial.');
    } finally {
      setIsActivatingTrial(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeStall]);

  // Handle Receipt Upload with Compression
  const handleReceiptFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setProofError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.match(/^image\/(jpeg|jpg|png|webp)$/i)) {
      setProofError('Please upload an image file (JPG, PNG, or WEBP).');
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setProofError('File size exceeds 15MB limit.');
      return;
    }

    try {
      const compressionRes = await compressImageFile(file);
      const compressedDataUrl = compressionRes.dataUrl;
      setProofDataUrl(compressedDataUrl);
      setProofPreview(compressedDataUrl);
    } catch (err: any) {
      setProofError('Failed to process image. Please try another file.');
    }
  };

  // Handle Payment Submit
  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);

    if (!activeStall) {
      setSubmitError('Please log in to your Stall Owner account before submitting payment proof.');
      return;
    }

    if (!proofDataUrl) {
      setSubmitError('Please upload a screenshot or photo of your payment receipt.');
      return;
    }

    if (!referenceNumber.trim()) {
      setSubmitError('Please enter the transaction reference number from your receipt.');
      return;
    }

    const currentPrice = selectedPlan === 'weekly' 
      ? (settings?.plans.weekly.price || 25)
      : (settings?.plans.monthly.price || 100);

    setIsSubmitting(true);
    try {
      const res = await submitSubscriptionPaymentAPI({
        stallName: activeStall,
        plan: selectedPlan === 'weekly' ? 'weekly' : 'monthly',
        amount: currentPrice,
        paymentMethod: selectedMethod,
        referenceNumber: referenceNumber.trim(),
        paymentDate,
        proofImageDataUrl: proofDataUrl
      });

      if (res.success) {
        setSubmitSuccess(res.message || 'Payment submitted successfully! Waiting for admin verification.');
        setReferenceNumber('');
        setProofDataUrl(null);
        setProofPreview(null);
        await loadData();
        if (onPaymentSubmitted) onPaymentSubmitted();
        if (onRefreshStatus) onRefreshStatus();
      } else {
        setSubmitError(res.error || 'Failed to submit payment. Please try again.');
      }
    } catch (err: any) {
      setSubmitError(err.message || 'Network error submitting payment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const weeklyPrice = settings?.plans.weekly.price ?? 25;
  const monthlyPrice = settings?.plans.monthly.price ?? 100;
  const currentPlanAmount = selectedPlan === 'weekly' ? weeklyPrice : monthlyPrice;
  const normSubStatus = subscription ? String(subscription.status).toUpperCase() : '';
  const isSuspended = normSubStatus === 'SUSPENDED';
  const isActive = subscription && normSubStatus === 'ACTIVE' && !isExpired && !isSuspended;

  return (
    <div className="max-w-4xl mx-auto py-4 sm:py-8 space-y-6 animate-fade-in">
      
      {/* 1. Header Banner */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-black uppercase tracking-wider shadow-2xs">
          <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
          <span>Free 14-Day Trial for Cafeteria Stall Owners</span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-black text-stone-900 font-display">
          Stall Owner Subscription & Billing
        </h1>

        {activeStall ? (
          <p className="text-xs sm:text-sm text-stone-600 max-w-xl mx-auto">
            Manage merchant portal access for <strong className="text-stone-900">{activeStall}</strong>. Every registered cafeteria stall owner receives a complimentary <strong>Free 14-Day Trial</strong> with full access to menu management, price updates, photo vault, and sales tracking.
          </p>
        ) : (
          <div className="max-w-lg mx-auto p-4 rounded-2xl bg-orange-50 border border-orange-200 text-xs text-stone-700 space-y-3">
            <p>
              Log in or register your cafeteria stall owner account in the <strong>Stall Portal</strong> to activate your Free 14-Day Trial or submit subscription payments.
            </p>
            <button
              type="button"
              onClick={() => onNavigate('portal')}
              className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-black text-xs transition inline-flex items-center gap-1.5"
            >
              <span>Go to Stall Owner Portal</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Trial Activation Success / Error Alerts */}
      {trialSuccessMsg && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs flex items-center gap-3 animate-fade-in shadow-2xs">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <div className="space-y-0.5">
            <h4 className="font-black text-emerald-950">Free 14-Day Trial Activated!</h4>
            <p className="text-[11px]">{trialSuccessMsg}</p>
          </div>
        </div>
      )}

      {trialErrorMsg && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-300 text-rose-900 text-xs flex items-center gap-3 animate-fade-in shadow-2xs">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <div className="space-y-0.5">
            <h4 className="font-black text-rose-950">Trial Notice</h4>
            <p className="text-[11px]">{trialErrorMsg}</p>
          </div>
        </div>
      )}

      {/* 2. DEDICATED FREE 14-DAY TRIAL & SUBSCRIPTION STATUS CARD */}
      <div className="bg-white rounded-3xl border border-stone-200 shadow-2xs p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-orange-600 bg-orange-100/80 px-2.5 py-0.5 rounded-md">
                Stall Subscription Status
              </span>
              <span className="text-[11px] font-bold text-stone-500">
                Official Merchant Account
              </span>
            </div>
            
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              {isSuspended ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100 text-red-900 text-xs font-black border border-red-300 shadow-2xs">
                  <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                  <span>SUSPENDED BY ADMIN</span>
                </span>
              ) : normSubStatus === 'PENDING' ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-black border border-amber-300 shadow-2xs">
                  <Clock className="w-3.5 h-3.5 text-amber-600 animate-spin" />
                  <span>PENDING VERIFICATION</span>
                </span>
              ) : trialStatus === 'Trial Active' ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-900 text-xs font-black border border-emerald-300 shadow-2xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Free 14-Day Trial: Trial Active</span>
                </span>
              ) : trialStatus === 'Subscribed' ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-100 text-indigo-900 text-xs font-black border border-indigo-300 shadow-2xs">
                  <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Subscribed ({subscription?.plan === 'weekly' ? 'Weekly Plan' : 'Monthly Plan'})</span>
                </span>
              ) : trialStatus === 'Trial Expired' ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-100 text-rose-900 text-xs font-black border border-rose-300 shadow-2xs">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                  <span>Free 14-Day Trial: Trial Expired</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-black border border-amber-300 shadow-2xs">
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  <span>Free 14-Day Trial: Not Started (Eligible)</span>
                </span>
              )}

              {pendingPayment && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-bold border border-amber-300">
                  <Clock className="w-3 h-3 text-amber-600 animate-spin" />
                  <span>Payment Pending Verification</span>
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            <button
              type="button"
              onClick={loadData}
              disabled={isLoading}
              className="px-3.5 py-2 rounded-xl border border-stone-200 hover:bg-stone-50 text-xs font-bold text-stone-700 transition flex items-center gap-1.5 active:scale-95"
              title="Query live server timestamps and verify subscription status"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh Status</span>
            </button>

            {(trialStatus === 'Trial Active' || trialStatus === 'Subscribed') && showBackToPortal && (
              <button
                type="button"
                onClick={() => onNavigate('portal')}
                className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-black transition flex items-center gap-1.5 shadow-xs active:scale-95"
              >
                <span>Enter Stall Portal</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* State A: NOT STARTED */}
        {trialStatus === 'Not Started' && (
          <div className="p-5 rounded-2xl bg-gradient-to-r from-amber-50/80 via-orange-50/60 to-white border border-amber-200/90 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-orange-600 text-white text-[10px] font-black uppercase tracking-wider">
                    Free 14-Day Trial
                  </span>
                  <h3 className="text-sm sm:text-base font-black text-stone-900 font-display">
                    Start Your Free 14-Day Trial
                  </h3>
                </div>
                <p className="text-xs text-stone-600 leading-relaxed max-w-xl">
                  Activate your complimentary 14-day subscription trial to access all intended stall-owner features without any upfront fee. Manage live menu items, update student prices in real time, protect food photos, and use the smart sales tracker.
                </p>
              </div>

              <button
                type="button"
                onClick={handleStartTrial}
                disabled={isActivatingTrial}
                className="px-6 py-3 rounded-2xl bg-orange-600 hover:bg-orange-700 active:scale-95 text-white font-black text-xs transition flex items-center gap-2 shadow-sm shrink-0 self-start sm:self-center"
              >
                {isActivatingTrial ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Activating Trial...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-amber-200" />
                    <span>Start Free 14-Day Trial</span>
                  </>
                )}
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 text-stone-700 text-[11px] font-medium border-t border-amber-100">
              <div className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Live Menu & Viands</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Instant Price Updates</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Permanent Photo Vault</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Smart Sales Tracker</span>
              </div>
            </div>
            
            <p className="text-[10px] text-stone-500 italic">
              * Note: The trial duration is strictly calculated on the server and runs for 14 continuous days. Refreshing or logging out will not restart the trial.
            </p>
          </div>
        )}

        {/* State B: TRIAL ACTIVE */}
        {trialStatus === 'Trial Active' && (
          <div className="space-y-4">
            <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-emerald-50 via-[#F7FCF9] to-white border border-emerald-200/90 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-black uppercase tracking-wider">
                      Free 14-Day Trial
                    </span>
                    <h3 className="text-sm sm:text-base font-black text-emerald-950 font-display">
                      Trial Period is Active
                    </h3>
                  </div>
                  <p className="text-xs text-emerald-800/90 mt-1">
                    Stall owners have unrestricted access to all merchant portal features during the 14-day trial period. No payment is required until your trial concludes.
                  </p>
                </div>

                <div className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-black text-xs text-center shrink-0 shadow-2xs self-start sm:self-center">
                  <span className="block text-lg font-display leading-tight">{trialDaysRemaining}</span>
                  <span className="text-[10px] uppercase tracking-wider font-bold">Days Remaining</span>
                </div>
              </div>

              {/* Server-Side Calculated Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-2 border-t border-emerald-100">
                <div className="p-3 bg-white/80 rounded-xl border border-emerald-100">
                  <span className="text-[10px] text-stone-500 font-bold uppercase block">Trial Started</span>
                  <span className="text-xs sm:text-sm font-black text-stone-900 mt-0.5 block">
                    {trialStartDate ? new Date(trialStartDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recently Activated'}
                  </span>
                </div>

                <div className="p-3 bg-white/80 rounded-xl border border-emerald-100">
                  <span className="text-[10px] text-stone-500 font-bold uppercase block">Trial Ends</span>
                  <span className="text-xs sm:text-sm font-black text-emerald-800 mt-0.5 block">
                    {trialEndDate ? new Date(trialEndDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'In 14 Days'}
                  </span>
                </div>

                <div className="p-3 bg-white/80 rounded-xl border border-emerald-100">
                  <span className="text-[10px] text-stone-500 font-bold uppercase block">Trial Access</span>
                  <span className="text-xs sm:text-sm font-black text-stone-900 mt-0.5 block">
                    100% Full Merchant Features
                  </span>
                </div>
              </div>

              <p className="text-[10px] text-stone-500 italic">
                * Stored securely on the campus server. Refreshing the browser, logging out, or clearing browser cache will not reset your trial period.
              </p>
            </div>
          </div>
        )}

        {/* State C: TRIAL EXPIRED */}
        {trialStatus === 'Trial Expired' && (
          <div className="p-5 rounded-2xl bg-gradient-to-r from-rose-50/90 via-rose-50/40 to-white border border-rose-300 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-black uppercase tracking-wider">
                    Free 14-Day Trial
                  </span>
                  <h3 className="text-sm sm:text-base font-black text-rose-950 font-display">
                    Your Free 14-Day Trial Has Expired
                  </h3>
                </div>
                <p className="text-xs text-rose-900/90 leading-relaxed">
                  Your 14-day trial period has ended. Access to stall-owner features (menu updates, live pricing, photo uploads, and sales tracker) is currently locked. To restore full portal access, please review the available subscription plans below and submit your payment verification.
                </p>
              </div>
            </div>

            {/* Trial History Timeline */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1 border-t border-rose-100">
              <div className="p-3 bg-white/90 rounded-xl border border-rose-100">
                <span className="text-[10px] text-stone-500 font-bold uppercase block">Trial Started</span>
                <span className="text-xs font-black text-stone-900 mt-0.5 block">
                  {trialStartDate ? new Date(trialStartDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Expired'}
                </span>
              </div>

              <div className="p-3 bg-white/90 rounded-xl border border-rose-100">
                <span className="text-[10px] text-stone-500 font-bold uppercase block">Trial Ended</span>
                <span className="text-xs font-black text-rose-700 mt-0.5 block">
                  {trialEndDate ? new Date(trialEndDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Expired'}
                </span>
              </div>

              <div className="p-3 bg-white/90 rounded-xl border border-rose-100">
                <span className="text-[10px] text-stone-500 font-bold uppercase block">Days Remaining</span>
                <span className="text-xs font-black text-rose-700 mt-0.5 block">
                  0 Days (Trial Expired)
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px] leading-relaxed">
              <strong>Student Customer Guarantee:</strong> Student meal browsing, cafeteria price discovery, and budget calculations are NEVER blocked by a stall owner's subscription expiration. Your existing menu remains visible to students; only stall-owner dashboard edits are restricted.
            </div>
          </div>
        )}

        {/* State D: SUBSCRIBED */}
        {trialStatus === 'Subscribed' && (
          <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-indigo-50/70 via-indigo-50/30 to-white border border-indigo-200/90 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full bg-indigo-600 text-white text-[10px] font-black uppercase tracking-wider">
                    Paid Plan
                  </span>
                  <h3 className="text-sm sm:text-base font-black text-indigo-950 font-display">
                    Active Subscription ({subscription?.plan === 'weekly' ? 'Weekly Plan' : 'Monthly Plan'})
                  </h3>
                </div>
                <p className="text-xs text-indigo-900/90">
                  Your official cafeteria subscription is active and verified. You have full uninterrupted access to all merchant portal features.
                </p>
              </div>

              <div className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-black text-xs text-center shrink-0 shadow-2xs self-start sm:self-center">
                <span className="block text-lg font-display leading-tight">{daysRemaining}</span>
                <span className="text-[10px] uppercase tracking-wider font-bold">Days Left</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1 border-t border-indigo-100">
              <div className="p-3 bg-white/90 rounded-xl border border-indigo-100">
                <span className="text-[10px] text-stone-500 font-bold uppercase block">Active Plan</span>
                <span className="text-xs font-black text-stone-900 mt-0.5 block">
                  {subscription?.plan === 'weekly' ? 'Weekly (₱25 / 7 Days)' : 'Monthly (₱100 / Month)'}
                </span>
              </div>

              <div className="p-3 bg-white/90 rounded-xl border border-indigo-100">
                <span className="text-[10px] text-stone-500 font-bold uppercase block">Expiration Date</span>
                <span className="text-xs font-black text-stone-900 mt-0.5 block">
                  {subscription ? new Date(subscription.expirationDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}
                </span>
              </div>

              <div className="p-3 bg-white/90 rounded-xl border border-indigo-100">
                <span className="text-[10px] text-stone-500 font-bold uppercase block">Renewal Deadline</span>
                <span className="text-xs font-black text-indigo-800 mt-0.5 block">
                  {subscription ? new Date(subscription.nextDueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'N/A'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Pending Payment Alert if any */}
        {pendingPayment && (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start gap-3">
            <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="font-black text-amber-950">
                Payment Verification in Progress (Ref: {pendingPayment.referenceNumber})
              </h4>
              <p className="text-[11px] leading-relaxed">
                You submitted ₱{pendingPayment.amount} for the {pendingPayment.plan} plan on {new Date(pendingPayment.submittedAt).toLocaleDateString()}. Campus finance administration will verify your receipt and extend your access automatically upon approval.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 3. Section 1: Choose Subscription Plan */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base sm:text-lg font-black text-stone-900 font-display flex items-center gap-2">
            <span>1. Choose Subscription Plan</span>
          </h2>
          <span className="text-xs text-stone-500 font-medium">Select your billing duration</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Weekly Plan */}
          <div
            onClick={() => setSelectedPlan('weekly')}
            className={`p-5 rounded-3xl border-2 transition cursor-pointer relative flex flex-col justify-between ${
              selectedPlan === 'weekly'
                ? 'border-orange-500 bg-orange-50/40 shadow-xs'
                : 'border-stone-200 bg-white hover:border-stone-300'
            }`}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="px-2.5 py-1 rounded-full bg-orange-100 text-orange-800 text-[10px] font-black uppercase tracking-wider">
                  Weekly Plan
                </span>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  selectedPlan === 'weekly' ? 'border-orange-600 bg-orange-600 text-white' : 'border-stone-300'
                }`}>
                  {selectedPlan === 'weekly' && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                </div>
              </div>

              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black text-stone-900 font-display">₱{weeklyPrice}</span>
                  <span className="text-xs font-bold text-stone-500">/ 7 days</span>
                </div>
                <p className="text-xs text-stone-600 mt-1">
                  {settings?.plans.weekly.description || 'Access duration: 7 days from confirmed start or renewal date.'}
                </p>
              </div>

              <ul className="space-y-2 text-xs text-stone-700 pt-2 border-t border-stone-100">
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Full cafeteria portal access for 7 days</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Live price updates & dish availability toggle</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Stall visitor interest and view analytics</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Renewal due date 7 days after activation</span>
                </li>
              </ul>
            </div>

            <div className="mt-4 pt-3 border-t border-orange-100/60 text-[11px] text-stone-500">
              Ideal for short-term and weekly stall operational cycles.
            </div>
          </div>

          {/* Monthly Plan */}
          <div
            onClick={() => setSelectedPlan('monthly')}
            className={`p-5 rounded-3xl border-2 transition cursor-pointer relative flex flex-col justify-between ${
              selectedPlan === 'monthly'
                ? 'border-orange-500 bg-orange-50/40 shadow-xs'
                : 'border-stone-200 bg-white hover:border-stone-300'
            }`}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black uppercase tracking-wider">
                    Monthly Plan
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black">
                    Recommended
                  </span>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  selectedPlan === 'monthly' ? 'border-orange-600 bg-orange-600 text-white' : 'border-stone-300'
                }`}>
                  {selectedPlan === 'monthly' && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                </div>
              </div>

              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black text-stone-900 font-display">₱{monthlyPrice}</span>
                  <span className="text-xs font-bold text-stone-500">/ calendar month</span>
                </div>
                <p className="text-xs text-stone-600 mt-1">
                  {settings?.plans.monthly.description || 'Access duration: One calendar month. Regular renewal deadline is the last day of the month.'}
                </p>
              </div>

              <ul className="space-y-2 text-xs text-stone-700 pt-2 border-t border-stone-100">
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Full cafeteria portal access for 1 calendar month</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Permanent high-resolution food photo uploads</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Version history & rollbacks (35 saved snapshots)</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Automated 7-day, 3-day, and 1-day due reminders</span>
                </li>
              </ul>
            </div>

            <div className="mt-4 pt-3 border-t border-orange-100/60 text-[11px] text-stone-500">
              Renewal deadline falls on the last day of the applicable calendar month.
            </div>
          </div>

        </div>
      </div>

      {/* 4. Section 2: Payment Method & Official Instructions */}
      <div className="bg-white rounded-3xl border border-stone-200/90 p-5 sm:p-6 shadow-xs space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-stone-100">
          <div>
            <h2 className="text-base sm:text-lg font-black text-stone-900 font-display flex items-center gap-2">
              <span>2. Official Payment Instructions</span>
            </h2>
            <p className="text-xs text-stone-500">Configured by Administrator. Do not pay to unverified accounts.</p>
          </div>

          <div className="text-right">
            <span className="text-[10px] font-bold text-stone-400 block uppercase">Amount Due</span>
            <span className="text-lg sm:text-xl font-black text-orange-600 font-display">₱{currentPlanAmount}</span>
          </div>
        </div>

        {/* Method Selector Tabs */}
        <div className="grid grid-cols-3 p-1 bg-stone-100 rounded-2xl text-xs font-bold text-stone-600">
          <button
            type="button"
            onClick={() => setSelectedMethod('gcash')}
            className={`py-2 rounded-xl transition flex items-center justify-center gap-1.5 ${
              selectedMethod === 'gcash' ? 'bg-white text-stone-900 shadow-2xs font-black' : 'hover:text-stone-900'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5 text-blue-600" />
            <span>GCash</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedMethod('bank')}
            className={`py-2 rounded-xl transition flex items-center justify-center gap-1.5 ${
              selectedMethod === 'bank' ? 'bg-white text-stone-900 shadow-2xs font-black' : 'hover:text-stone-900'
            }`}
          >
            <Building2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Bank Transfer</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedMethod('qr')}
            className={`py-2 rounded-xl transition flex items-center justify-center gap-1.5 ${
              selectedMethod === 'qr' ? 'bg-white text-stone-900 shadow-2xs font-black' : 'hover:text-stone-900'
            }`}
          >
            <QrCode className="w-3.5 h-3.5 text-purple-600" />
            <span>QR Code</span>
          </button>
        </div>

        {/* Method A: GCash */}
        {selectedMethod === 'gcash' && (
          <div className="p-4 sm:p-5 bg-blue-50/50 rounded-2xl border border-blue-100 space-y-4">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-full bg-blue-600 text-white text-[10px] font-black">
                Official GCash Merchant
              </span>
              <span className="text-xs text-blue-900 font-medium">Verified Cafeteria Account</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-white rounded-xl border border-blue-200/60 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-stone-400 font-bold block uppercase">Account Name</span>
                  <span className="text-sm font-black text-stone-900">
                    {settings?.gcash.accountName || 'USTP Cafeteria Admin'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(settings?.gcash.accountName || 'USTP Cafeteria Admin', 'gcash_name')}
                  className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-100"
                  title="Copy Name"
                >
                  {copiedField === 'gcash_name' ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>

              <div className="p-3 bg-white rounded-xl border border-blue-200/60 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-stone-400 font-bold block uppercase">GCash Mobile Number</span>
                  <span className="text-sm font-black text-blue-700 font-mono">
                    {settings?.gcash.accountNumber || '0917-882-9912'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(settings?.gcash.accountNumber || '0917-882-9912', 'gcash_num')}
                  className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-100"
                  title="Copy Number"
                >
                  {copiedField === 'gcash_num' ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <p className="text-[11px] text-blue-900/80 leading-relaxed">
              {settings?.gcash.instructions || 'Send exact amount via GCash Express Send. Save the transaction screenshot with visible Reference Number.'}
            </p>
          </div>
        )}

        {/* Method B: Bank Transfer */}
        {selectedMethod === 'bank' && (
          <div className="p-4 sm:p-5 bg-emerald-50/50 rounded-2xl border border-emerald-100 space-y-4">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-full bg-emerald-700 text-white text-[10px] font-black">
                Official Bank Account
              </span>
              <span className="text-xs text-emerald-950 font-medium">InstaPay / PESONet</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 bg-white rounded-xl border border-emerald-200/60">
                <span className="text-[10px] text-stone-400 font-bold block uppercase">Bank Name</span>
                <span className="text-xs sm:text-sm font-black text-stone-900 block mt-0.5">
                  {settings?.bank.bankName || 'Landbank of the Philippines'}
                </span>
              </div>

              <div className="p-3 bg-white rounded-xl border border-emerald-200/60">
                <span className="text-[10px] text-stone-400 font-bold block uppercase">Account Holder</span>
                <span className="text-xs sm:text-sm font-black text-stone-900 block mt-0.5">
                  {settings?.bank.accountHolder || 'USTP CDO Cafeteria Management'}
                </span>
              </div>

              <div className="p-3 bg-white rounded-xl border border-emerald-200/60 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-stone-400 font-bold block uppercase">Account Number</span>
                  <span className="text-xs sm:text-sm font-black text-emerald-700 font-mono block mt-0.5">
                    {settings?.bank.accountNumber || '3401-2290-88'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(settings?.bank.accountNumber || '3401-2290-88', 'bank_num')}
                  className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-100"
                  title="Copy Number"
                >
                  {copiedField === 'bank_num' ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <p className="text-[11px] text-emerald-950/80 leading-relaxed">
              {settings?.bank.instructions || 'Transfer exact amount via InstaPay or PESONet. Include your Stall Name in remarks.'}
            </p>
          </div>
        )}

        {/* Method C: QR Code Payment */}
        {selectedMethod === 'qr' && (
          <div className="p-4 sm:p-5 bg-purple-50/50 rounded-2xl border border-purple-100 space-y-4">
            <div className="flex flex-col sm:flex-row items-center gap-6">
              
              {/* QR Image Frame */}
              <div className="relative group shrink-0">
                <div className="w-48 h-48 sm:w-56 sm:h-56 bg-white p-3 rounded-2xl border-2 border-purple-200 shadow-sm flex items-center justify-center overflow-hidden">
                  {settings?.qrCode.imageUrl ? (
                    <img 
                      src={settings.qrCode.imageUrl} 
                      alt="Official Payment QR" 
                      className="w-full h-full object-contain cursor-pointer"
                      onClick={() => setPreviewModalImg(settings.qrCode.imageUrl)}
                    />
                  ) : (
                    <div className="text-center text-stone-400 p-4">
                      <QrCode className="w-12 h-12 mx-auto mb-2 text-stone-300" />
                      <span className="text-xs">QR Code configured by Admin</span>
                    </div>
                  )}
                </div>

                {settings?.qrCode.imageUrl && (
                  <a
                    href={settings.qrCode.imageUrl}
                    download="USTP_Cafeteria_Payment_QR.svg"
                    className="mt-2 w-full py-1.5 px-3 bg-white hover:bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-stone-700 flex items-center justify-center gap-1.5 transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download QR</span>
                  </a>
                )}
              </div>

              {/* Instructions */}
              <div className="space-y-3 flex-1">
                <div className="space-y-1">
                  <span className="px-2.5 py-1 rounded-full bg-purple-700 text-white text-[10px] font-black uppercase">
                    Official QR Ph / GCash Code
                  </span>
                  <h3 className="text-base font-black text-stone-900 font-display">
                    Scan to Pay ₱{currentPlanAmount}
                  </h3>
                </div>

                <ol className="space-y-2 text-xs text-stone-700 list-decimal pl-4">
                  <li>Open GCash, Maya, or any bank app with QR Ph scanning.</li>
                  <li>Scan the official QR code on the left.</li>
                  <li>Ensure the recipient shows <strong>USTP CDO CAFETERIA</strong>.</li>
                  <li>Enter exact payment amount: <strong>₱{currentPlanAmount}</strong>.</li>
                  <li>Save transaction receipt and copy your reference number.</li>
                </ol>

                <p className="text-[11px] text-purple-900 font-medium">
                  {settings?.qrCode.instructions || 'Scan using GCash, Maya, or bank app. Save receipt for verification.'}
                </p>
              </div>

            </div>
          </div>
        )}

      </div>

      {/* 5. Section 3: Submit Payment Proof Form */}
      <form onSubmit={handleSubmitPayment} noValidate className="bg-white rounded-3xl border border-stone-200/90 p-5 sm:p-6 shadow-xs space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-stone-100">
          <div>
            <h2 className="text-base sm:text-lg font-black text-stone-900 font-display flex items-center gap-2">
              <span>3. Submit Proof of Payment</span>
            </h2>
            <p className="text-xs text-stone-500">
              Submitted payments enter <span className="font-bold text-amber-700">Pending Verification</span> until approved by administrator.
            </p>
          </div>

          <span className="px-2.5 py-1 rounded-full bg-orange-50 text-orange-800 text-xs font-black border border-orange-200">
            {selectedPlan === 'weekly' ? 'Weekly (₱25)' : 'Monthly (₱100)'}
          </span>
        </div>

        {submitError && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{submitError}</span>
          </div>
        )}

        {submitSuccess && (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{submitSuccess}</span>
          </div>
        )}

        {/* Upload Box */}
        <div>
          <label className="block font-black text-stone-800 text-xs mb-1.5">
            Upload Receipt Screenshot / Photo *
          </label>

          <div className="border-2 border-dashed border-stone-300 hover:border-orange-500 rounded-2xl p-4 sm:p-6 text-center transition bg-stone-50/50 hover:bg-orange-50/20 relative">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleReceiptFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />

            {proofPreview ? (
              <div className="flex flex-col items-center gap-2">
                <img 
                  src={proofPreview} 
                  alt="Proof Preview" 
                  className="max-h-48 rounded-xl object-contain border border-stone-200 shadow-2xs cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPreviewModalImg(proofPreview);
                  }}
                />
                <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Receipt photo ready! Click image to enlarge, or click to replace</span>
                </span>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center mx-auto text-orange-600">
                  <Upload className="w-5 h-5" />
                </div>
                <div className="text-xs">
                  <span className="font-bold text-orange-600 hover:underline">Click to upload</span>
                  <span className="text-stone-500"> or drag and drop your receipt</span>
                </div>
                <p className="text-[10px] text-stone-400">
                  PNG, JPG, or WEBP up to 15MB. Image will be preserved securely for verification.
                </p>
              </div>
            )}
          </div>

          {proofError && (
            <p className="text-xs text-rose-600 mt-1 font-medium">{proofError}</p>
          )}
        </div>

        {/* Reference Number & Payment Date */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block font-black text-stone-800 mb-1">
              Transaction Reference Number *
            </label>
            <input
              type="text"
              required
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder="e.g. 1002 9841 8291 or Ref # 8829"
              className="w-full text-xs sm:text-sm p-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono tracking-wide text-stone-900"
            />
            <span className="text-[10px] text-stone-400 mt-0.5 block">
              Found on your GCash SMS or Bank transfer receipt.
            </span>
          </div>

          <div>
            <label className="block font-black text-stone-800 mb-1">
              Payment Date *
            </label>
            <input
              type="date"
              required
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="w-full text-xs sm:text-sm p-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 font-medium text-stone-900"
            />
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3.5 bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white font-black text-xs sm:text-sm rounded-xl transition shadow-xs flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
        >
          {isSubmitting ? (
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Submitting Payment Proof...</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              <span>Submit ₱{currentPlanAmount} Payment for Verification</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          )}
        </button>

        <p className="text-center text-[10px] text-stone-400">
          Your payment will be reviewed by USTP Cafeteria Admin. Once verified, subscription status is updated instantly.
        </p>
      </form>

      {/* 6. Section 4: Payment History for this Stall */}
      <div className="bg-white rounded-3xl border border-stone-200/90 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-stone-100">
          <div>
            <h3 className="text-base font-black text-stone-900 font-display">
              Payment Submission History
            </h3>
            <p className="text-xs text-stone-500">Records of receipts submitted for {stallName}</p>
          </div>
          <span className="text-xs text-stone-500 font-bold">{paymentHistory.length} record(s)</span>
        </div>

        {paymentHistory.length === 0 ? (
          <div className="text-center py-8 text-stone-400 text-xs">
            <FileText className="w-8 h-8 mx-auto mb-1 text-stone-300 stroke-[1.5]" />
            <span>No payment records found for this stall.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-stone-100 text-stone-400 text-[10px] uppercase font-black tracking-wider">
                  <th className="py-2.5 px-2">Date Submitted</th>
                  <th className="py-2.5 px-2">Plan</th>
                  <th className="py-2.5 px-2">Method</th>
                  <th className="py-2.5 px-2">Reference No.</th>
                  <th className="py-2.5 px-2">Amount</th>
                  <th className="py-2.5 px-2">Proof</th>
                  <th className="py-2.5 px-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-stone-700">
                {paymentHistory.map((item) => (
                  <tr key={item.id} className="hover:bg-stone-50/60 transition">
                    <td className="py-3 px-2 font-medium">
                      {new Date(item.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="py-3 px-2">
                      <span className="capitalize font-bold text-stone-900">{item.plan}</span>
                    </td>
                    <td className="py-3 px-2 uppercase font-mono text-[11px] font-bold text-stone-600">
                      {item.paymentMethod}
                    </td>
                    <td className="py-3 px-2 font-mono text-stone-900 font-bold">
                      {item.referenceNumber}
                    </td>
                    <td className="py-3 px-2 font-black text-stone-900 font-display">
                      ₱{item.amount}
                    </td>
                    <td className="py-3 px-2">
                      {item.proofImageUrl ? (
                        <button
                          type="button"
                          onClick={() => setPreviewModalImg(item.proofImageUrl)}
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
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Approved</span>
                        </span>
                      ) : item.status === 'Rejected' ? (
                        <div className="space-y-0.5">
                          <span className="px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-black inline-flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            <span>Rejected</span>
                          </span>
                          {item.rejectionReason && (
                            <span className="block text-[10px] text-rose-600 max-w-xs truncate" title={item.rejectionReason}>
                              {item.rejectionReason}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>Pending</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Proof Lightbox Modal */}
      {previewModalImg && (
        <div 
          className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setPreviewModalImg(null)}
        >
          <div 
            className="max-w-xl max-h-[85vh] bg-white rounded-3xl p-4 overflow-hidden relative shadow-2xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <h4 className="text-xs font-black text-stone-900">Payment Receipt Inspection</h4>
              <button
                type="button"
                onClick={() => setPreviewModalImg(null)}
                className="text-stone-400 hover:text-stone-700 text-xs font-bold"
              >
                Close
              </button>
            </div>

            <div className="max-h-[70vh] overflow-auto flex items-center justify-center">
              <img 
                src={previewModalImg} 
                alt="Receipt Inspection" 
                className="max-w-full max-h-[65vh] object-contain rounded-xl"
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
