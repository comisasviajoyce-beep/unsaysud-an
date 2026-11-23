import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { QrCode, Download, X, Copy, Check } from 'lucide-react';

interface StallQRModalProps {
  isOpen: boolean;
  onClose: () => void;
  stallName: string | null;
}

export const StallQRModal: React.FC<StallQRModalProps> = ({
  isOpen,
  onClose,
  stallName
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const deepLink = stallName
    ? `${window.location.origin}/?stall=${encodeURIComponent(stallName)}`
    : '';

  useEffect(() => {
    if (!isOpen || !stallName) return;
    let active = true;
    QRCode.toDataURL(deepLink, {
      width: 320,
      margin: 2,
      color: { dark: '#1c1917', light: '#ffffff' }
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrDataUrl('');
      });
    return () => {
      active = false;
    };
  }, [isOpen, stallName, deepLink]);

  if (!isOpen || !stallName) return null;

  const handleDownload = () => {
    if (!qrDataUrl) return;
    const link = document.createElement('a');
    const safeName = stallName.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    link.href = qrDataUrl;
    link.download = `${safeName}_qr.png`;
    link.click();
  };

  const handleCopyLink = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(deepLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-stone-950/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-white rounded-3xl border border-stone-200 shadow-2xl p-6 space-y-4 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-2 border-b border-stone-100">
          <div className="flex items-center gap-2 text-stone-900">
            <QrCode className="w-4 h-4 text-orange-600" />
            <h3 className="text-sm font-black font-display">Stall Menu QR Code</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-black text-orange-600 uppercase tracking-wider">
            USTP CDO Cafeteria
          </p>
          <h4 className="text-base font-black text-stone-900 font-display">{stallName}</h4>
          <p className="text-[11px] text-stone-500">
            Scan with the in-app Offline QR Scanner or phone camera to open this stall menu.
          </p>
        </div>

        <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 inline-flex items-center justify-center">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt={`QR Code for ${stallName}`} className="w-52 h-52 rounded-xl" />
          ) : (
            <div className="w-52 h-52 flex items-center justify-center text-xs text-stone-400">
              Generating QR...
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={handleDownload}
            disabled={!qrDataUrl}
            className="flex-1 py-2.5 px-3 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download PNG</span>
          </button>

          <button
            type="button"
            onClick={handleCopyLink}
            className="py-2.5 px-3 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy Link'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
