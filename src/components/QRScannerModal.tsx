import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { QrCode, Camera, Upload, X, AlertCircle, CheckCircle2, Store, WifiOff } from 'lucide-react';
import { StallCredential } from '../types';

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  stalls: StallCredential[];
  onStallResolved: (stallName: string) => void;
}

export function resolveStallFromQrPayload(raw: string, stalls: StallCredential[]): StallCredential | null {
  const text = (raw || '').trim();
  if (!text) return null;

  let candidate = text;

  // 1. Check JSON payload e.g. {"stall":"Stall 1 — Swirly Bits"}
  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed.stall === 'string') candidate = parsed.stall.trim();
      else if (typeof parsed.stallName === 'string') candidate = parsed.stallName.trim();
      else if (typeof parsed.stallNo === 'string') candidate = parsed.stallNo.trim();
    } catch {}
  }

  // 2. Check custom scheme unsaysudan://stall/... or HTTP URL with ?stall=...
  if (candidate.startsWith('unsaysudan://')) {
    candidate = decodeURIComponent(candidate.replace(/^unsaysudan:\/\/(stall\/)?/i, '')).trim();
  } else if (/^https?:\/\//i.test(candidate) || candidate.includes('?stall=')) {
    try {
      const url = new URL(candidate.startsWith('http') ? candidate : `https://local.app/${candidate.replace(/^\//, '')}`);
      const q = url.searchParams.get('stall') || url.searchParams.get('s');
      if (q) candidate = q.trim();
    } catch {
      const match = candidate.match(/[?&]stall=([^&]+)/i);
      if (match?.[1]) {
        try {
          candidate = decodeURIComponent(match[1]).trim();
        } catch {}
      }
    }
  }

  const lower = candidate.toLowerCase();

  // Exact full name match
  const exact = stalls.find((s) => s.name.toLowerCase() === lower);
  if (exact) return exact;

  // Exact stallNo match (e.g. "Stall 1", "Stall 8A") or officialName match
  const byNoOrOfficial = stalls.find(
    (s) =>
      (s.stallNo && s.stallNo.toLowerCase() === lower) ||
      (s.officialName && s.officialName.toLowerCase() === lower)
  );
  if (byNoOrOfficial) return byNoOrOfficial;

  // Partial name or number prefix match
  const partial = stalls.find(
    (s) =>
      s.name.toLowerCase().includes(lower) ||
      lower.includes(s.name.toLowerCase()) ||
      (s.stallNo && lower.startsWith(s.stallNo.toLowerCase()))
  );
  return partial || null;
}

export const QRScannerModal: React.FC<QRScannerModalProps> = ({
  isOpen,
  onClose,
  stalls,
  onStallResolved
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanResultMsg, setScanResultMsg] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [manualQuery, setManualQuery] = useState('');

  const stopCamera = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setCameraError(null);
      setScanError(null);
      setScanResultMsg(null);
      return;
    }

    let cancelled = false;

    const startCamera = async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError('Camera access is not available on this browser. Upload a QR image or select a stall below.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true');
          await videoRef.current.play();
          setCameraActive(true);
          setCameraError(null);
          scanFrame();
        }
      } catch {
        if (!cancelled) {
          setCameraError('Camera permission denied or unavailable. You can scan from an uploaded QR image offline.');
          setCameraActive(false);
        }
      }
    };

    const scanFrame = () => {
      if (cancelled) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        const w = video.videoWidth || 640;
        const h = video.videoHeight || 480;
        if (w > 0 && h > 0) {
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(video, 0, 0, w, h);
            const imgData = ctx.getImageData(0, 0, w, h);
            const code = jsQR(imgData.data, w, h, { inversionAttempts: 'attemptBoth' });
            if (code && code.data) {
              handleDecodedQr(code.data);
              return;
            }
          }
        }
      }
      rafRef.current = requestAnimationFrame(scanFrame);
    };

    startCamera();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [isOpen, stalls]);

  const handleDecodedQr = (raw: string) => {
    setScanError(null);
    const matched = resolveStallFromQrPayload(raw, stalls);
    if (matched) {
      stopCamera();
      setScanResultMsg(`Matched ${matched.name}! Opening cached menu...`);
      setTimeout(() => {
        onStallResolved(matched.name);
        onClose();
      }, 450);
    } else {
      setScanError(`Scanned QR "${raw.slice(0, 60)}" does not match a registered USTP CDO Cafeteria stall.`);
    }
  };

  const handleImageFileScan = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setScanError(null);
    setScanResultMsg(null);

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current || document.createElement('canvas');
        const maxDim = 1024;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          setScanError('Could not initialize local image scanner.');
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, canvas.width, canvas.height, {
          inversionAttempts: 'attemptBoth'
        });
        if (code && code.data) {
          handleDecodedQr(code.data);
        } else {
          setScanError('No valid QR code was detected in that image. Try a clearer photo.');
        }
      };
      img.onerror = () => {
        setScanError('Selected file could not be decoded as an image.');
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-3xl border border-stone-200 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-stone-900 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-orange-600 text-white flex items-center justify-center">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black font-display">Offline Stall QR Scanner</h3>
              <p className="text-[11px] text-stone-300 flex items-center gap-1">
                <WifiOff className="w-3 h-3 text-emerald-400" />
                <span>Works 100% locally without internet</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition"
            aria-label="Close scanner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {scanResultMsg && (
            <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{scanResultMsg}</span>
            </div>
          )}

          {scanError && (
            <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{scanError}</span>
            </div>
          )}

          {/* Camera Viewfinder */}
          <div className="relative aspect-square w-full max-h-64 bg-stone-950 rounded-2xl overflow-hidden flex items-center justify-center border border-stone-800">
            <video
              ref={videoRef}
              className={`w-full h-full object-cover ${cameraActive ? 'block' : 'hidden'}`}
              muted
              playsInline
            />
            {cameraActive ? (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-44 h-44 border-2 border-orange-400 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
              </div>
            ) : (
              <div className="p-5 text-center space-y-2 text-stone-300">
                <Camera className="w-8 h-8 text-orange-400 mx-auto" />
                <p className="text-xs leading-relaxed">
                  {cameraError || 'Starting device camera for offline QR scanning...'}
                </p>
              </div>
            )}
            <canvas ref={canvasRef} className="hidden" />
          </div>

          {/* Scan from Uploaded Image (Offline safe fallback) */}
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageFileScan}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 py-2.5 px-4 bg-orange-600 hover:bg-orange-700 text-white font-black text-xs rounded-xl transition flex items-center justify-center gap-2 shadow-xs"
            >
              <Upload className="w-4 h-4" />
              <span>Scan QR from Image</span>
            </button>
          </div>

          {/* Quick Local Lookup by Stall Name / Number */}
          <div className="pt-2 border-t border-stone-100 space-y-2">
            <label className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider">
              Or Jump Directly to Cached Stall
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualQuery}
                onChange={(e) => setManualQuery(e.target.value)}
                placeholder="e.g. Stall 1 or Java Rice"
                className="flex-1 text-xs p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              <button
                type="button"
                onClick={() => {
                  if (manualQuery.trim()) handleDecodedQr(manualQuery);
                }}
                className="px-3.5 py-2 bg-stone-900 hover:bg-black text-white rounded-xl text-xs font-bold flex items-center gap-1"
              >
                <Store className="w-3.5 h-3.5" />
                <span>Open</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
