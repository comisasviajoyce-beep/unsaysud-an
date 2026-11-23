import React, { useState, useEffect } from 'react';
import { X, Lock, Eye, EyeOff, KeyRound, AlertCircle, UserPlus } from 'lucide-react';
import { StallCredential, StallOwnerAccount } from '../types';
import { verifyStallLoginAPI } from '../services/api';

interface MerchantAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  stalls: StallCredential[];
  onLoginSuccess: (stallName: string, owner?: StallOwnerAccount) => void;
  onOpenFullPortal?: () => void;
}

export const MerchantAuthModal: React.FC<MerchantAuthModalProps> = ({
  isOpen,
  onClose,
  stalls,
  onLoginSuccess,
  onOpenFullPortal
}) => {
  const [selectedStall, setSelectedStall] = useState(stalls[0]?.name || '');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (stalls.length > 0 && !selectedStall) {
      setSelectedStall(stalls[0].name);
    }
  }, [stalls, selectedStall]);

  if (!isOpen) return null;

  const handleKeypadPress = (digit: string) => {
    if (pin.length < 6) {
      setPin((prev) => prev + digit);
      setErrorMsg('');
    }
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
    setErrorMsg('');
  };

  const handleClear = () => {
    setPin('');
    setErrorMsg('');
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmedPin = pin.trim();
    if (!/^\d{4,6}$/.test(trimmedPin)) {
      setErrorMsg('Please enter your registered 4–6 digit security PIN.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const result = await verifyStallLoginAPI(selectedStall, trimmedPin);
      if (result.success && result.owner) {
        onLoginSuccess(result.owner.stallName, result.owner);
        onClose();
        setPin('');
      } else {
        setErrorMsg(
          result.error || 'Incorrect PIN or unregistered stall. Please sign in or register via Stall Portal.'
        );
      }
    } catch {
      setErrorMsg('Unable to connect to authentication server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        id="merchant-auth-backdrop"
        onClick={onClose}
        className="fixed inset-0 bg-stone-950/70 backdrop-blur-sm transition-opacity"
      />

      <div
        id="merchant-auth-card"
        className="relative z-10 w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-stone-200 p-5 space-y-4 overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center text-lg font-bold">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-stone-900 font-display">
                Cafeteria Merchant Access
              </h3>
              <p className="text-[10px] text-stone-600">
                Registered Stall Owners & Managers
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-500 flex items-center justify-center transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold text-stone-700 block">
            Select Your Cafeteria Stall:
          </label>
          <select
            id="merchant-stall-select"
            value={selectedStall}
            onChange={(e) => setSelectedStall(e.target.value)}
            className="w-full bg-stone-50 border border-stone-200 text-xs font-bold text-stone-800 rounded-xl p-2.5 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition"
          >
            {stalls.map((s) => (
              <option key={s.name} value={s.name}>
                {s.zone === 'outside' ? 'Outside • ' : 'Inside • '}
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="font-bold text-stone-700 text-xs block">
            Enter Registered Security PIN:
          </label>

          <div className="relative">
            <input
              id="merchant-pin-input"
              type={showPin ? 'text' : 'password'}
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => {
                setPin(e.target.value);
                setErrorMsg('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmit();
              }}
              placeholder="••••"
              className="w-full bg-stone-50 border border-stone-200 text-base font-black tracking-widest text-stone-900 rounded-xl px-3 py-2.5 text-center focus:outline-none focus:border-orange-500 transition"
            />
            <button
              type="button"
              onClick={() => setShowPin(!showPin)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-stone-400 hover:text-stone-700"
            >
              {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1.5 pt-1">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleKeypadPress(digit)}
              className="py-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 active:scale-95 text-stone-800 font-black text-sm transition"
            >
              {digit}
            </button>
          ))}
          <button
            type="button"
            onClick={handleClear}
            className="py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 active:scale-95 text-rose-600 font-bold text-xs transition"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress('0')}
            className="py-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 active:scale-95 text-stone-800 font-black text-sm transition"
          >
            0
          </button>
          <button
            type="button"
            onClick={handleBackspace}
            className="py-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 active:scale-95 text-stone-700 font-bold text-sm transition"
          >
            ⌫
          </button>
        </div>

        {errorMsg && (
          <div className="p-2 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-[11px] font-bold text-center flex items-center justify-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <button
          id="merchant-login-submit"
          type="button"
          disabled={loading}
          onClick={() => handleSubmit()}
          className="w-full py-2.5 sm:py-3 rounded-xl bg-orange-600 hover:bg-orange-700 active:scale-95 text-white font-black text-xs sm:text-sm shadow-md transition flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          <KeyRound className="w-4 h-4" />
          <span>{loading ? 'Verifying...' : 'Unlock Stall Dashboard'}</span>
        </button>

        {onOpenFullPortal && (
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenFullPortal();
            }}
            className="w-full py-2 text-xs font-bold text-orange-700 hover:text-orange-800 bg-orange-50 hover:bg-orange-100 rounded-xl border border-orange-200 transition flex items-center justify-center gap-1.5"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Username Login / Register New Stall Account</span>
          </button>
        )}
      </div>
    </div>
  );
};
