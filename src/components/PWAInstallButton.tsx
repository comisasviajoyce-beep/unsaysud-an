import React, { useState } from 'react';
import { Download, Share, X, CheckCircle, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  className?: string;
  variant?: 'header' | 'banner' | 'button';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  className = '',
  variant = 'header'
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [installing, setInstalling] = useState(false);

  // If already running inside standalone PWA mode, don't show the button
  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    setInstalling(true);
    try {
      await install();
    } finally {
      setInstalling(false);
    }
  };

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    if (variant === 'banner') {
      return (
        <div className={`p-4 bg-gradient-to-r from-orange-500 to-amber-500 rounded-2xl text-white shadow-md flex items-center justify-between gap-3 ${className}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5 text-white" />
            </div>
            <div>
              <h4 className="text-sm font-bold">Install Unsay Sud-an? App</h4>
              <p className="text-xs text-white/90">Fast offline access & one-tap cafeteria meal browsing</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleInstallClick}
            disabled={installing}
            className="px-4 py-2 rounded-xl bg-white text-orange-600 hover:bg-orange-50 font-bold text-xs transition shadow-xs shrink-0 flex items-center gap-1.5 active:scale-95"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{installing ? 'Installing...' : 'Install Now'}</span>
          </button>
        </div>
      );
    }

    return (
      <button
        type="button"
        onClick={handleInstallClick}
        disabled={installing}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold transition shadow-xs active:scale-95 ${className}`}
        title="Install app to your home screen"
      >
        <Download className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Install App</span>
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-orange-200 bg-orange-50/80 hover:bg-orange-100 text-orange-700 text-xs font-bold transition active:scale-95 ${className}`}
          title="Install app on iPhone / iPad"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Add to Home Screen</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
            <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl border border-stone-200 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <h3 className="text-base font-black text-stone-900 font-display">Install on iPhone / iPad</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs text-stone-600 leading-relaxed">
                <div className="p-3 bg-stone-50 rounded-2xl flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-orange-600 text-white flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">1</span>
                  <p>Tap the <strong className="text-stone-900">Share</strong> button <Share className="inline w-3.5 h-3.5 text-blue-600 mx-0.5" /> in your Safari bottom toolbar.</p>
                </div>
                <div className="p-3 bg-stone-50 rounded-2xl flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-orange-600 text-white flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">2</span>
                  <p>Scroll down and tap <strong className="text-stone-900">Add to Home Screen</strong>.</p>
                </div>
                <div className="p-3 bg-stone-50 rounded-2xl flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-orange-600 text-white flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">3</span>
                  <p>Tap <strong className="text-stone-900">Add</strong> at the top right to launch fullscreen anytime, even offline!</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold transition shadow-xs"
              >
                Got It
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
