import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  UserPlus,
  LogIn,
  Phone
} from 'lucide-react';
import { DishItem, StallCredential, TranslationDictionary, AppPage, StallOwnerAccount } from '../../types';
import { MerchantDashboard } from '../MerchantDashboard';
import {
  loginStallOwnerAPI,
  registerStallOwnerAPI,
  forgotPasswordAPI,
  logoutMerchantAPI
} from '../../services/api';

interface StallPortalPageProps {
  authenticatedStall: string | null;
  currentOwner?: StallOwnerAccount | null;
  onAuthenticate: (stallName: string, owner?: StallOwnerAccount) => void;
  onUpdateOwner?: (owner: StallOwnerAccount) => void;
  onLogout: () => void;
  items: DishItem[];
  stallNotices: Record<string, string>;
  onSaveNotice: (notice: string) => void;
  onToggleStock: (id: number) => void | Promise<boolean>;
  onUpdatePrice: (id: number, delta: number) => void;
  onAddItem: (item: Omit<DishItem, 'id' | 'clicks'>) => void;
  onUpdateItem: (id: number, updates: Partial<DishItem>) => void;
  onToggleHideItem: (id: number) => void | Promise<boolean>;
  onDeleteItem?: (id: number, deleteImagePermanently?: boolean) => Promise<boolean>;
  onRestoreItem?: (archiveId: string) => Promise<boolean>;
  onBatchSaved?: (items: DishItem[]) => void;
  stalls: StallCredential[];
  onNavigate: (page: AppPage) => void;
  onOpenStallQR?: (stallName: string) => void;
  t: TranslationDictionary;
}

export const StallPortalPage: React.FC<StallPortalPageProps> = ({
  authenticatedStall,
  currentOwner: propOwner,
  onAuthenticate,
  onUpdateOwner,
  onLogout,
  items,
  stallNotices,
  onSaveNotice,
  onToggleStock,
  onUpdatePrice,
  onAddItem,
  onUpdateItem,
  onToggleHideItem,
  onDeleteItem,
  onRestoreItem,
  onBatchSaved,
  stalls,
  onNavigate,
  onOpenStallQR,
  t
}) => {
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [localOwner, setLocalOwner] = useState<StallOwnerAccount | null>(propOwner || null);

  useEffect(() => {
    setLocalOwner(propOwner || null);
  }, [propOwner]);

  // Login Form State
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Quick PIN login toggle
  const [usePinLogin, setUsePinLogin] = useState(false);
  const [quickStallName, setQuickStallName] = useState(stalls[0]?.name || '');
  const [quickPin, setQuickPin] = useState('');

  // Registration Form State
  const firstAvailableStall = stalls.find((s) => !s.hasRegisteredOwner)?.name || stalls[0]?.name || '__custom__';
  const [regStallSelection, setRegStallSelection] = useState<string>(firstAvailableStall);
  const [customStallName, setCustomStallName] = useState('');
  const [customStallNo, setCustomStallNo] = useState('');
  const [regStallZone, setRegStallZone] = useState<'outside' | 'inside'>('inside');
  const [regOwnerName, setRegOwnerName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regContactNumber, setRegContactNumber] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regPin, setRegPin] = useState('');
  const [regConfirmPin, setRegConfirmPin] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegPin, setShowRegPin] = useState(false);

  // Forgot Password Form State
  const [forgotStallName, setForgotStallName] = useState(stalls[0]?.name || '');
  const [forgotPin, setForgotPin] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');

  useEffect(() => {
    if (stalls.length > 0 && !quickStallName) {
      setQuickStallName(stalls[0].name);
    }
    if (stalls.length > 0 && !forgotStallName) {
      setForgotStallName(stalls[0].name);
    }
    if (stalls.length > 0 && regStallSelection !== '__custom__') {
      const currentMatch = stalls.find((s) => s.name === regStallSelection);
      if (!currentMatch || currentMatch.hasRegisteredOwner) {
        const nextAvail = stalls.find((s) => !s.hasRegisteredOwner)?.name || '__custom__';
        setRegStallSelection(nextAvail);
      }
    }
  }, [stalls, quickStallName, forgotStallName, regStallSelection]);

  // If already authenticated, show the Merchant Dashboard
  if (authenticatedStall) {
    const activeStallZone =
      stalls.find((s) => s.name === authenticatedStall)?.zone || localOwner?.zone;
    return (
      <MerchantDashboard
        stallName={authenticatedStall}
        stallZone={activeStallZone}
        items={items}
        stallNotice={stallNotices[authenticatedStall] || ''}
        onSaveNotice={onSaveNotice}
        onToggleStock={onToggleStock}
        onUpdatePrice={onUpdatePrice}
        onAddItem={onAddItem}
        onUpdateItem={onUpdateItem}
        onToggleHideItem={onToggleHideItem}
        onDeleteItem={onDeleteItem}
        onRestoreItem={onRestoreItem}
        onBatchSaved={onBatchSaved}
        onLogout={async () => {
          await logoutMerchantAPI();
          setLocalOwner(null);
          onLogout();
        }}
        ownerProfile={localOwner}
        onUpdateOwnerProfile={(updated) => {
          setLocalOwner(updated);
          if (onUpdateOwner) onUpdateOwner(updated);
        }}
        onOpenStallQR={onOpenStallQR}
        t={t}
      />
    );
  }

  // Handle Login Submit (explicit validation, zero native browser pattern issues)
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (usePinLogin) {
      if (!quickStallName) {
        setErrorMsg('Please select your cafeteria stall.');
        return;
      }
      if (!/^\d{4,6}$/.test(quickPin.trim())) {
        setErrorMsg('Please enter your 4 to 6 digit numeric security PIN.');
        return;
      }
    } else {
      if (!loginIdentifier.trim() || !loginPassword) {
        setErrorMsg('Please enter your username/email and password.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const result = usePinLogin
        ? await loginStallOwnerAPI({
            stall: quickStallName,
            pin: quickPin.trim()
          })
        : await loginStallOwnerAPI({
            identifier: loginIdentifier.trim(),
            password: loginPassword
          });

      if (result.success && result.owner) {
        setLocalOwner(result.owner);
        onAuthenticate(result.owner.stallName, result.owner);
      } else {
        setErrorMsg(
          result.error ||
            (usePinLogin
              ? 'Incorrect security PIN or unregistered stall.'
              : 'Invalid username/email or password.')
        );
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Login failed. Please check your connection.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Registration Submit (no HTML constraint errors, clear human messages)
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const isCustomStall = regStallSelection === '__custom__';
    const finalStallName = isCustomStall ? customStallName.trim() : regStallSelection.trim();
    const cleanOwnerName = regOwnerName.trim();
    const cleanUsername = regUsername.trim().toLowerCase();
    const cleanEmail = regEmail.trim().toLowerCase();
    const cleanContact = regContactNumber.trim();
    const cleanPin = regPin.trim();
    const cleanConfirmPin = regConfirmPin.trim();

    if (!finalStallName) {
      setErrorMsg(
        isCustomStall
          ? 'Please enter the name of your new cafeteria stall.'
          : 'Please select your cafeteria stall.'
      );
      return;
    }

    if (cleanOwnerName.length < 2) {
      setErrorMsg('Owner / manager name must be at least 2 characters.');
      return;
    }

    if (!/^[a-zA-Z0-9._-]{3,32}$/.test(cleanUsername)) {
      setErrorMsg(
        'Username must be 3–32 characters using letters, numbers, dots, underscores, or hyphens.'
      );
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setErrorMsg('Please enter a valid email address (for example: owner@example.com).');
      return;
    }

    if (cleanContact && !/^[0-9+\-\s()]{7,20}$/.test(cleanContact)) {
      setErrorMsg('Please enter a valid contact number (7–20 digits) or leave it blank.');
      return;
    }

    if (regPassword.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.');
      return;
    }

    if (regPassword !== regConfirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    if (cleanPin || cleanConfirmPin) {
      if (!/^\d{4,6}$/.test(cleanPin)) {
        setErrorMsg('Security PIN must be 4 to 6 numeric digits.');
        return;
      }
      if (cleanPin !== cleanConfirmPin) {
        setErrorMsg('Security PIN entries do not match.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const selectedCred = stalls.find((s) => s.name === finalStallName);
      const stallNo = isCustomStall
        ? customStallNo.trim() || finalStallName.split('—')[0]?.trim() || 'Stall'
        : selectedCred?.stallNo || finalStallName.split('—')[0]?.trim() || 'Stall';

      const result = await registerStallOwnerAPI({
        stallNo,
        stallName: finalStallName,
        zone: isCustomStall ? regStallZone : (selectedCred?.zone || 'inside'),
        ownerName: cleanOwnerName,
        username: cleanUsername,
        email: cleanEmail,
        contactNumber: cleanContact || undefined,
        password: regPassword,
        pin: cleanPin || undefined
      });

      if (result.success && result.owner) {
        setLocalOwner(result.owner);
        onAuthenticate(result.owner.stallName, result.owner);
      } else {
        setErrorMsg(result.error || 'Failed to create stall owner account.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Registration failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Forgot Password Submit
  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!/^\d{4,6}$/.test(forgotPin.trim())) {
      setErrorMsg('Please enter your 4 to 6 digit security PIN.');
      return;
    }

    if (forgotNewPassword.length < 6) {
      setErrorMsg('New password must be at least 6 characters.');
      return;
    }

    if (forgotNewPassword !== forgotConfirmPassword) {
      setErrorMsg('New passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await forgotPasswordAPI({
        stallName: forgotStallName,
        pin: forgotPin.trim(),
        newPassword: forgotNewPassword
      });

      if (result.success) {
        setSuccessMsg(result.message || 'Password reset successfully! Please log in.');
        setAuthMode('login');
        setLoginPassword('');
        setForgotPin('');
        setForgotNewPassword('');
        setForgotConfirmPassword('');
      } else {
        setErrorMsg(result.error || 'Failed to reset password.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Reset failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-4 sm:py-8 space-y-6 animate-fade-in">
      {/* Portal Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-100 text-orange-800 border border-orange-200 text-xs font-black uppercase tracking-wider">
          <ShieldCheck className="w-3.5 h-3.5 text-orange-600" />
          <span>Cafeteria Merchant Portal</span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-black text-stone-900 font-display">
          {authMode === 'login' && 'Stall Owner Login'}
          {authMode === 'register' && 'Create Stall Owner Account'}
          {authMode === 'forgot' && 'Reset Stall Password'}
        </h1>

        <p className="text-xs sm:text-sm text-stone-600 max-w-md mx-auto">
          {authMode === 'login' &&
            'Sign in to manage your stall menu, prices, food photos, Smart Sales Tracker, and 14-day free trial or subscription.'}
          {authMode === 'register' &&
            'Register an independent merchant account for your cafeteria stall with your own credentials.'}
          {authMode === 'forgot' &&
            'Authorize password reset using your assigned stall and registered security PIN.'}
        </p>
      </div>

      {/* Main Card */}
      <div className="bg-white rounded-3xl border border-orange-100 p-6 sm:p-8 shadow-sm space-y-5">
        {/* Navigation Tabs between Login and Register */}
        {authMode !== 'forgot' && (
          <div className="grid grid-cols-2 p-1 bg-stone-100 rounded-2xl border border-stone-200 text-xs font-bold text-stone-600">
            <button
              type="button"
              onClick={() => {
                setAuthMode('login');
                setErrorMsg('');
                setSuccessMsg('');
              }}
              className={`py-2 rounded-xl transition flex items-center justify-center gap-1.5 ${
                authMode === 'login'
                  ? 'bg-white text-stone-900 shadow-2xs font-black'
                  : 'hover:text-stone-900'
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Stall Owner Login</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setAuthMode('register');
                setErrorMsg('');
                setSuccessMsg('');
              }}
              className={`py-2 rounded-xl transition flex items-center justify-center gap-1.5 ${
                authMode === 'register'
                  ? 'bg-white text-stone-900 shadow-2xs font-black'
                  : 'hover:text-stone-900'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Register Stall</span>
            </button>
          </div>
        )}

        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* FORM 1: LOGIN */}
        {authMode === 'login' && (
          <form onSubmit={handleLoginSubmit} noValidate className="space-y-4 text-xs">
            {!usePinLogin ? (
              <>
                <div>
                  <label className="block font-black text-stone-800 mb-1">
                    Username / Email Address *
                  </label>
                  <input
                    type="text"
                    autoComplete="username"
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    placeholder="Enter your registered username or email"
                    className="w-full text-xs sm:text-sm p-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white font-medium text-stone-900"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-black text-stone-800">Password *</label>
                    <button
                      type="button"
                      onClick={() => {
                        setErrorMsg('');
                        setAuthMode('forgot');
                      }}
                      className="text-[11px] font-bold text-orange-600 hover:text-orange-700 hover:underline"
                    >
                      Forgot Password?
                    </button>
                  </div>

                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full text-xs sm:text-sm p-3 pr-10 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white text-stone-900"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 p-1"
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block font-black text-stone-800 mb-1">
                    Select Your Registered Cafeteria Stall *
                  </label>
                  <select
                    value={quickStallName}
                    onChange={(e) => setQuickStallName(e.target.value)}
                    className="w-full text-xs sm:text-sm p-3 bg-stone-50 border border-stone-200 rounded-xl font-medium text-stone-800"
                  >
                    {stalls.map((s) => (
                      <option key={s.name} value={s.name}>
                        {s.stallNo} — {s.officialName || s.name} ({s.zone === 'outside' ? 'Outside' : 'Inside'})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-black text-stone-800 mb-1">
                    Registered Security PIN (4–6 Digits) *
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={quickPin}
                    onChange={(e) => setQuickPin(e.target.value)}
                    placeholder="Enter your personal 4–6 digit PIN"
                    className="w-full text-xs sm:text-sm p-3 bg-stone-50 border border-stone-200 rounded-xl font-mono tracking-widest text-stone-900"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white font-black text-xs sm:text-sm rounded-xl transition shadow-xs flex items-center justify-center gap-2 active:scale-95 disabled:opacity-60"
            >
              {isSubmitting ? (
                <span>Verifying Account...</span>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>Log In to Stall Dashboard</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <div className="pt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-500 border-t border-stone-100">
              <button
                type="button"
                onClick={() => {
                  setErrorMsg('');
                  setUsePinLogin(!usePinLogin);
                }}
                className="text-orange-600 font-bold hover:underline"
              >
                {usePinLogin ? '← Switch to Username / Password Login' : 'Use Registered Security PIN Login'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setAuthMode('register');
                  setErrorMsg('');
                }}
                className="text-stone-700 font-bold hover:underline"
              >
                New stall owner? Register
              </button>
            </div>
          </form>
        )}

        {/* FORM 2: REGISTER ACCOUNT */}
        {authMode === 'register' && (
          <form onSubmit={handleRegisterSubmit} noValidate className="space-y-4 text-xs">
            {/* Stall Selection */}
            <div>
              <label className="block font-black text-stone-800 mb-1">
                Cafeteria Stall Assignment *
              </label>
              <select
                value={regStallSelection}
                onChange={(e) => setRegStallSelection(e.target.value)}
                className="w-full text-xs sm:text-sm p-3 bg-stone-50 border border-stone-200 rounded-xl font-medium text-stone-800"
              >
                {stalls.map((s) => (
                  <option key={s.name} value={s.name} disabled={Boolean(s.hasRegisteredOwner)}>
                    {s.stallNo} — {s.officialName || s.name}{' '}
                    {s.hasRegisteredOwner ? '(Already Registered)' : '(Available)'}
                  </option>
                ))}
                <option value="__custom__">+ Register a New / Custom Cafeteria Stall</option>
              </select>
              <span className="text-[10px] text-stone-400 mt-1 block">
                Each stall has its own isolated owner account, menu, sales, and subscription status.
              </span>
            </div>

            {regStallSelection === '__custom__' && (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 p-3.5 bg-orange-50/60 rounded-2xl border border-orange-200">
                <div>
                  <label className="block font-bold text-stone-800 mb-1">Stall No.</label>
                  <input
                    type="text"
                    value={customStallNo}
                    onChange={(e) => setCustomStallNo(e.target.value)}
                    placeholder="e.g. Stall 16"
                    className="w-full text-xs p-2.5 bg-white border border-stone-200 rounded-xl"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-bold text-stone-800 mb-1">Full Stall Name *</label>
                  <input
                    type="text"
                    value={customStallName}
                    onChange={(e) => setCustomStallName(e.target.value)}
                    placeholder="e.g. Stall 16 — Kuya Ben Grill"
                    className="w-full text-xs p-2.5 bg-white border border-stone-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-bold text-stone-800 mb-1">Zone *</label>
                  <select
                    value={regStallZone}
                    onChange={(e) => setRegStallZone(e.target.value as 'outside' | 'inside')}
                    className="w-full text-xs p-2.5 bg-white border border-stone-200 rounded-xl font-medium text-stone-800"
                  >
                    <option value="inside">Inside Cafeteria</option>
                    <option value="outside">Outside Cafeteria</option>
                  </select>
                </div>
              </div>
            )}

            {/* Owner Full Name & Contact Number */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-black text-stone-800 mb-1">
                  Owner / Manager Name *
                </label>
                <input
                  type="text"
                  value={regOwnerName}
                  onChange={(e) => setRegOwnerName(e.target.value)}
                  placeholder="Full name of stall owner"
                  className="w-full text-xs sm:text-sm p-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 font-medium"
                />
              </div>

              <div>
                <label className="block font-black text-stone-800 mb-1 flex items-center gap-1">
                  <Phone className="w-3 h-3 text-stone-500" />
                  <span>Contact Number (Optional)</span>
                </label>
                <input
                  type="tel"
                  inputMode="tel"
                  value={regContactNumber}
                  onChange={(e) => setRegContactNumber(e.target.value)}
                  placeholder="e.g. 0917 123 4567"
                  className="w-full text-xs sm:text-sm p-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>

            {/* Username & Email */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-black text-stone-800 mb-1">Username *</label>
                <input
                  type="text"
                  autoComplete="username"
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  placeholder="e.g. mariastall"
                  className="w-full text-xs sm:text-sm p-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono"
                />
              </div>

              <div>
                <label className="block font-black text-stone-800 mb-1">Email Address *</label>
                <input
                  type="text"
                  inputMode="email"
                  autoComplete="email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="owner@example.com"
                  className="w-full text-xs sm:text-sm p-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>

            {/* Password & Confirm */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-black text-stone-800">Password *</label>
                  <button
                    type="button"
                    onClick={() => setShowRegPassword(!showRegPassword)}
                    className="text-[10px] text-stone-500 hover:text-stone-800"
                  >
                    {showRegPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <input
                  type={showRegPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="Min. 6 characters"
                  className="w-full text-xs sm:text-sm p-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block font-black text-stone-800 mb-1">Confirm Password *</label>
                <input
                  type={showRegPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={regConfirmPassword}
                  onChange={(e) => setRegConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="w-full text-xs sm:text-sm p-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>

            {/* 4-6 Digit Security PIN (Optional) */}
            <div className="p-3.5 bg-orange-50/70 rounded-2xl border border-orange-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-orange-950 block">
                  Security PIN (4–6 Digits, Optional)
                </span>
                <button
                  type="button"
                  onClick={() => setShowRegPin(!showRegPin)}
                  className="text-[10px] text-orange-700 font-bold"
                >
                  {showRegPin ? 'Hide PIN' : 'Show PIN'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-stone-800 mb-1">Create 4–6 Digit PIN</label>
                  <input
                    type={showRegPin ? 'text' : 'password'}
                    inputMode="numeric"
                    maxLength={6}
                    value={regPin}
                    onChange={(e) => setRegPin(e.target.value)}
                    placeholder="4–6 numeric digits"
                    className="w-full text-xs sm:text-sm p-2.5 bg-white border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono tracking-widest text-stone-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-800 mb-1">Confirm PIN</label>
                  <input
                    type={showRegPin ? 'text' : 'password'}
                    inputMode="numeric"
                    maxLength={6}
                    value={regConfirmPin}
                    onChange={(e) => setRegConfirmPin(e.target.value)}
                    placeholder="Re-enter PIN"
                    className="w-full text-xs sm:text-sm p-2.5 bg-white border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono tracking-widest text-stone-900"
                  />
                </div>
              </div>

              <span className="text-[10px] text-stone-500 block leading-tight">
                If set, your personal PIN allows quick stall login, sensitive profile authorization, and password recovery.
              </span>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white font-black text-xs sm:text-sm rounded-xl transition shadow-xs flex items-center justify-center gap-2 active:scale-95 disabled:opacity-60"
            >
              {isSubmitting ? (
                <span>Creating Account...</span>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  <span>Register Stall Owner Account</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => setAuthMode('login')}
                className="text-xs text-orange-600 font-bold hover:underline"
              >
                Already have an account? Log In
              </button>
            </div>
          </form>
        )}

        {/* FORM 3: FORGOT PASSWORD RESET */}
        {authMode === 'forgot' && (
          <form onSubmit={handleForgotSubmit} noValidate className="space-y-4 text-xs">
            <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 text-amber-900 text-[11px] leading-relaxed">
              Verify your identity by selecting your cafeteria stall and providing your registered 4–6 digit security PIN.
            </div>

            <div>
              <label className="block font-black text-stone-800 mb-1">Your Cafeteria Stall *</label>
              <select
                value={forgotStallName}
                onChange={(e) => setForgotStallName(e.target.value)}
                className="w-full text-xs sm:text-sm p-3 bg-stone-50 border border-stone-200 rounded-xl font-medium text-stone-800"
              >
                {stalls.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.stallNo} — {s.officialName || s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-black text-stone-800 mb-1">Registered Security PIN *</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={forgotPin}
                onChange={(e) => setForgotPin(e.target.value)}
                placeholder="Enter 4–6 digit PIN"
                className="w-full text-xs sm:text-sm p-3 bg-stone-50 border border-stone-200 rounded-xl font-mono tracking-widest text-stone-900"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-black text-stone-800 mb-1">New Password *</label>
                <input
                  type="password"
                  value={forgotNewPassword}
                  onChange={(e) => setForgotNewPassword(e.target.value)}
                  placeholder="Min. 6 characters"
                  className="w-full text-xs sm:text-sm p-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block font-black text-stone-800 mb-1">Confirm New Password *</label>
                <input
                  type="password"
                  value={forgotConfirmPassword}
                  onChange={(e) => setForgotConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="w-full text-xs sm:text-sm p-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white font-black text-xs sm:text-sm rounded-xl transition shadow-xs flex items-center justify-center gap-2 active:scale-95 disabled:opacity-60"
            >
              <span>Reset Password & Proceed to Login</span>
            </button>

            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => setAuthMode('login')}
                className="text-xs text-stone-600 hover:text-stone-900 font-bold hover:underline"
              >
                ← Back to Login
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Student Return Prompt */}
      <div className="text-center p-4 bg-white/60 rounded-2xl border border-orange-100/60 space-y-1 text-xs">
        <p className="text-stone-500">Are you a student looking for food that fits your budget?</p>
        <button
          type="button"
          onClick={() => onNavigate('home')}
          className="text-orange-600 font-bold hover:text-orange-700 underline"
        >
          Return to Student Meal Discovery (Home)
        </button>
      </div>
    </div>
  );
};
