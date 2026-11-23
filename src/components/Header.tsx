import { 
  Home, 
  Search, 
  Store, 
  ShoppingBag, 
  ClipboardList, 
  HelpCircle, 
  Lock, 
  LogOut,
  ShieldCheck,
  Bell,
  ShieldAlert,
  CreditCard,
  QrCode
} from 'lucide-react';
import { Language, TranslationDictionary, AppPage } from '../types';
import { PWAInstallButton } from './PWAInstallButton';

interface HeaderProps {
  currentPage: AppPage;
  onNavigate: (page: AppPage) => void;
  currentLang: Language;
  onLanguageChange: (lang: Language) => void;
  trayCount: number;
  onOpenMerchantAuth: () => void;
  t: TranslationDictionary;
  isMerchantActive: boolean;
  activeStallName: string | null;
  onLogoutMerchant: () => void;
  onSecretTap: () => void;
  unreadNotificationsCount?: number;
  onOpenNotifications?: () => void;
  isAdminActive?: boolean;
  onLogoutAdmin?: () => void;
  onOpenQRScanner?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentPage,
  onNavigate,
  currentLang,
  onLanguageChange,
  trayCount,
  onOpenMerchantAuth,
  t,
  isMerchantActive,
  activeStallName,
  onLogoutMerchant,
  onSecretTap,
  unreadNotificationsCount = 0,
  onOpenNotifications,
  isAdminActive = false,
  onLogoutAdmin,
  onOpenQRScanner
}) => {
  const navItems: { id: AppPage; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'home', label: 'Home', icon: <Home className="w-4 h-4" /> },
    { id: 'explore', label: 'Explore', icon: <Search className="w-4 h-4" /> },
    { id: 'stalls', label: 'Stalls', icon: <Store className="w-4 h-4" /> },
    { id: 'tray', label: 'Tray', icon: <ShoppingBag className="w-4 h-4" />, badge: trayCount },
    { id: 'orders', label: 'Orders', icon: <ClipboardList className="w-4 h-4" /> },
    { id: 'subscription', label: 'Subscription', icon: <CreditCard className="w-4 h-4" /> },
    { id: 'portal', label: 'Stall Portal', icon: <ShieldCheck className="w-4 h-4" /> },
    ...(isAdminActive ? [{ id: 'admin' as AppPage, label: 'Admin', icon: <ShieldAlert className="w-4 h-4 text-purple-600" /> }] : []),
    { id: 'help', label: 'Help', icon: <HelpCircle className="w-4 h-4" /> },
  ];

  return (
    <header className="sticky top-0 z-30 bg-[#FFFDF9]/95 backdrop-blur-md border-b border-[#F0EBE1] shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-18">
          
          {/* Logo / Brand - Restored Original Branding */}
          <div className="flex items-center gap-4 sm:gap-6">
            <div 
              id="brand-logo"
              onClick={() => onNavigate('home')}
              className="flex items-center gap-1.5 cursor-pointer select-none group transition-transform active:scale-98"
            >
              <span className="text-base sm:text-xl font-black tracking-tight text-stone-900 font-display flex items-baseline">
                <span>unsaysud-an</span>
                <span className="text-orange-600">tech</span>
                <span className="text-stone-400 font-normal mx-0.5">/</span>
                <span className="text-xs sm:text-sm font-extrabold text-stone-700 font-mono tracking-tight bg-stone-100 px-1.5 py-0.5 rounded-md border border-stone-200">
                  ustpcdocafeteria
                </span>
              </span>
              <span className="hidden xl:inline-block ml-1 text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 border border-orange-200">
                USTP CDO Campus
              </span>
            </div>

            {/* Desktop Navigation Links */}
            <nav className="hidden md:flex items-center gap-1 text-xs sm:text-sm font-semibold text-stone-600">
              {navItems.map((item) => {
                const isActive = currentPage === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onNavigate(item.id)}
                    className={`relative px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 ${
                      isActive
                        ? 'bg-orange-50 text-orange-700 border border-orange-200/80 font-black shadow-2xs'
                        : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
                    }`}
                  >
                    <span className={isActive ? 'text-orange-600' : 'text-stone-500'}>
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                    {typeof item.badge === 'number' && item.badge > 0 && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full font-black min-w-[18px] text-center bg-orange-600 text-white">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Right Header Area */}
          <div className="flex items-center gap-2 sm:gap-3">
            
            {/* Merchant Active Badge / Portal trigger */}
            {isMerchantActive && (
              <div 
                onClick={() => onNavigate('portal')}
                className="flex items-center gap-2 bg-amber-50 hover:bg-amber-100 border border-amber-300 px-3 py-1.5 rounded-xl text-xs cursor-pointer transition"
                title="Go to Stall Dashboard"
              >
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span className="font-bold text-amber-900 truncate max-w-[120px] sm:max-w-[160px]">
                  {activeStallName}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onLogoutMerchant();
                  }}
                  className="text-stone-500 hover:text-stone-800 ml-1 p-0.5"
                  title="Logout merchant"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Admin Active Badge */}
            {isAdminActive && (
              <div 
                onClick={() => onNavigate('admin')}
                className="flex items-center gap-2 bg-purple-50 hover:bg-purple-100 border border-purple-300 px-3 py-1.5 rounded-xl text-xs cursor-pointer transition"
                title="Go to Admin Dashboard"
              >
                <span className="w-2 h-2 rounded-full bg-purple-600 animate-pulse" />
                <span className="font-bold text-purple-900">
                  Admin
                </span>
                {onLogoutAdmin && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onLogoutAdmin();
                    }}
                    className="text-stone-500 hover:text-stone-800 ml-1 p-0.5"
                    title="Logout admin"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            {/* Scan Stall QR Button */}
            {onOpenQRScanner && (
              <button
                type="button"
                onClick={onOpenQRScanner}
                className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 text-xs font-bold transition active:scale-95"
                title="Scan Stall QR Code (Works Offline)"
              >
                <QrCode className="w-4 h-4" />
                <span className="hidden lg:inline">Scan QR</span>
              </button>
            )}

            {/* PWA Install Button */}
            <PWAInstallButton />

            {/* In-App Notifications Bell */}
            {onOpenNotifications && (
              <button
                type="button"
                onClick={onOpenNotifications}
                className="relative p-2 rounded-xl bg-stone-100 hover:bg-stone-200/80 text-stone-600 hover:text-stone-900 transition active:scale-95"
                title="In-app Notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadNotificationsCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-orange-600 text-white text-[10px] font-black flex items-center justify-center ring-2 ring-white animate-pulse">
                    {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
                  </span>
                )}
              </button>
            )}

            {/* Language Switcher */}
            <div className="flex items-center bg-stone-100 p-0.5 rounded-xl border border-stone-200/80 text-[11px] font-bold text-stone-600">
              <button
                onClick={() => onLanguageChange('bisaya')}
                className={`px-2 py-1 rounded-lg transition ${
                  currentLang === 'bisaya' ? 'bg-white text-stone-900 shadow-2xs font-black' : 'hover:text-stone-900'
                }`}
              >
                Bisaya
              </button>
              <button
                onClick={() => onLanguageChange('english')}
                className={`px-2 py-1 rounded-lg transition ${
                  currentLang === 'english' ? 'bg-white text-stone-900 shadow-2xs font-black' : 'hover:text-stone-900'
                }`}
              >
                EN
              </button>
            </div>

          </div>

        </div>
      </div>
    </header>
  );
};
