import React, { useState } from 'react';
import { 
  UtensilsCrossed, 
  Utensils, 
  Flame, 
  CupSoda, 
  Cake, 
  Sparkles, 
  Croissant, 
  Package, 
  Apple, 
  Layers,
  Dices,
  ArrowRight,
  Check,
  Search,
  Filter,
  Minus,
  Plus,
  QrCode
} from 'lucide-react';
import { DishItem, CategoryFilter, AppPage, TranslationDictionary } from '../../types';
import { FoodCard } from '../FoodCard';
import { 
  RiceBowlDoodle, 
  ChickenDoodle, 
  DrinkDoodle, 
  DumplingDoodle, 
  FriesDoodle, 
  BurgerDoodle,
  UtensilsDoodle 
} from '../FoodDoodles';

interface HomePageProps {
  budget: number;
  onBudgetChange: (val: number) => void;
  dishes: DishItem[];
  selectedCategory: CategoryFilter;
  onCategoryChange: (cat: CategoryFilter) => void;
  onQuickAdd: (dish: DishItem) => void;
  onOpenDetail: (dish: DishItem) => void;
  onOpenRoulette: () => void;
  onNavigate: (page: AppPage) => void;
  onToggleFavorite: (id: number) => void;
  favorites: number[];
  totalStalls?: number;
  onOpenQRScanner?: () => void;
  t: TranslationDictionary;
}

const CATEGORIES: { key: CategoryFilter; label: string; icon: React.ReactNode }[] = [
  { key: 'All', label: 'All Categories', icon: <UtensilsCrossed className="w-4 h-4" /> },
  { key: 'Rice Meals', label: 'Rice Meals', icon: <Utensils className="w-4 h-4" /> },
  { key: 'Snacks', label: 'Snacks', icon: <Flame className="w-4 h-4" /> },
  { key: 'Drinks', label: 'Drinks', icon: <CupSoda className="w-4 h-4" /> },
  { key: 'Desserts', label: 'Desserts', icon: <Cake className="w-4 h-4" /> },
  { key: 'Street Food', label: 'Street Food', icon: <Sparkles className="w-4 h-4" /> },
  { key: 'Bread & Pastries', label: 'Bread & Pastries', icon: <Croissant className="w-4 h-4" /> },
  { key: 'Dumplings', label: 'Dumplings', icon: <Package className="w-4 h-4" /> },
  { key: 'Fruits', label: 'Fruits', icon: <Apple className="w-4 h-4" /> },
  { key: 'Other', label: 'Other', icon: <Layers className="w-4 h-4" /> },
];

export const HomePage: React.FC<HomePageProps> = ({
  budget,
  onBudgetChange,
  dishes,
  selectedCategory,
  onCategoryChange,
  onQuickAdd,
  onOpenDetail,
  onOpenRoulette,
  onNavigate,
  onToggleFavorite,
  favorites,
  totalStalls = 15,
  onOpenQRScanner,
  t
}) => {
  // Step 1: Budget counter controls (₱10 increments, bounds: [10, 500])
  const handleDecrement = () => {
    onBudgetChange(Math.max(10, budget - 10));
  };

  const handleIncrement = () => {
    onBudgetChange(Math.min(500, budget + 10));
  };

  // Dishes matching budget and category on homepage
  const matchingDishes = dishes.filter((dish) => {
    if (dish.hidden) return false;
    if (dish.price > budget) return false;
    if (selectedCategory !== 'All' && dish.category !== selectedCategory) return false;
    return true;
  });

  return (
    <div className="space-y-8 sm:space-y-10 pb-12">
      
      {/* 1. Visually Attractive Warm Orange Hero Area with Hand-Drawn Food Doodles */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-500 via-orange-600 to-amber-600 text-white p-7 sm:p-10 shadow-lg shadow-orange-900/10 border border-orange-400/30 text-center max-w-4xl mx-auto">
        
        {/* Subtle, Playful Food Doodles along edges & corners */}
        <div className="absolute -left-2 -top-2 text-white/20 pointer-events-none rotate-12 hidden sm:block">
          <RiceBowlDoodle size={72} className="text-white/25" />
        </div>
        <div className="absolute -right-2 -top-2 text-white/20 pointer-events-none -rotate-12 hidden sm:block">
          <DrinkDoodle size={68} className="text-white/25" />
        </div>
        <div className="absolute left-6 -bottom-3 text-white/20 pointer-events-none -rotate-12 hidden md:block">
          <DumplingDoodle size={58} className="text-white/25" />
        </div>
        <div className="absolute right-6 -bottom-3 text-white/20 pointer-events-none rotate-12 hidden md:block">
          <ChickenDoodle size={60} className="text-white/25" />
        </div>
        <div className="absolute left-1/3 -top-5 text-white/10 pointer-events-none rotate-45 hidden lg:block">
          <FriesDoodle size={50} className="text-white/15" />
        </div>
        <div className="absolute right-1/4 -bottom-4 text-white/10 pointer-events-none -rotate-15 hidden lg:block">
          <BurgerDoodle size={52} className="text-white/15" />
        </div>

        {/* Clean Center Content */}
        <div className="relative z-10 max-w-xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md border border-white/25 text-xs font-black text-orange-100 tracking-wide">
            <UtensilsDoodle size={14} className="text-amber-200" />
            <span>USTP CDO Campus Food Discovery</span>
          </div>

          <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black text-white font-display tracking-tight leading-tight">
            “Unsay sud-an nimo today?”
          </h1>
          
          <p className="text-sm sm:text-base text-orange-100 font-medium max-w-md mx-auto">
            Find food that fits your budget.
          </p>

          {onOpenQRScanner && (
            <div className="pt-2 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={onOpenQRScanner}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-white text-orange-700 hover:bg-orange-50 font-black text-xs shadow-sm transition active:scale-95"
              >
                <QrCode className="w-4 h-4" />
                <span>Scan Stall QR Code</span>
              </button>
            </div>
          )}
        </div>
      </section>

      {/* 2. Step 1: Budget Selection (Mobile-Friendly Counter: [ − ] ₱50 [ + ]) */}
      <section className="bg-white rounded-3xl border border-orange-100 p-5 sm:p-7 shadow-xs space-y-4 max-w-4xl mx-auto">
        <div className="flex items-center justify-between gap-2">
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-orange-600 bg-orange-100/80 px-2 py-0.5 rounded-md">
              Step 1
            </span>
            <h2 className="text-base sm:text-lg font-black text-stone-900 font-display mt-1">
              What's your budget?
            </h2>
          </div>
          <span className="text-xs font-semibold text-stone-500 bg-orange-50/80 border border-orange-100 px-2.5 py-1 rounded-full">
            ₱10 – ₱500 limit
          </span>
        </div>

        {/* Layout: [ − ]     ₱50     [ + ] */}
        <div className="flex items-center justify-center gap-5 sm:gap-10 py-5 sm:py-7 px-4 bg-gradient-to-b from-orange-50/50 via-amber-50/20 to-white rounded-2xl border border-orange-100/80">
          {/* Minus Button */}
          <button
            type="button"
            onClick={handleDecrement}
            disabled={budget <= 10}
            aria-label="Decrease budget by ₱10"
            className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center transition-all select-none border-2 ${
              budget <= 10
                ? 'bg-stone-100 border-stone-200 text-stone-300 cursor-not-allowed shadow-none'
                : 'bg-white border-orange-200 text-orange-600 hover:bg-orange-500 hover:text-white hover:border-orange-500 hover:shadow-md hover:shadow-orange-500/20 active:scale-95 shadow-xs cursor-pointer'
            }`}
          >
            <Minus className="w-6 h-6 sm:w-7 sm:h-7 stroke-[3]" />
          </button>

          {/* Prominently Displayed Selected Budget */}
          <div className="flex flex-col items-center justify-center min-w-[130px] sm:min-w-[170px] select-none text-center">
            <span className="text-4xl sm:text-6xl font-black text-stone-900 font-display tracking-tight leading-none">
              ₱{budget}
            </span>
            <span className="text-[11px] sm:text-xs font-bold text-orange-600 uppercase tracking-wider mt-2">
              Budget
            </span>
          </div>

          {/* Plus Button */}
          <button
            type="button"
            onClick={handleIncrement}
            disabled={budget >= 500}
            aria-label="Increase budget by ₱10"
            className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center transition-all select-none border-2 ${
              budget >= 500
                ? 'bg-stone-100 border-stone-200 text-stone-300 cursor-not-allowed shadow-none'
                : 'bg-white border-orange-200 text-orange-600 hover:bg-orange-500 hover:text-white hover:border-orange-500 hover:shadow-md hover:shadow-orange-500/20 active:scale-95 shadow-xs cursor-pointer'
            }`}
          >
            <Plus className="w-6 h-6 sm:w-7 sm:h-7 stroke-[3]" />
          </button>
        </div>
      </section>

      {/* 3. Step 2: Food Category Selection (Clean White Card with Subtle Category Icons) */}
      <section className="bg-white rounded-3xl border border-orange-100 p-5 sm:p-7 shadow-xs space-y-4 max-w-4xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-orange-600 bg-orange-100/80 px-2 py-0.5 rounded-md">
              Step 2
            </span>
            <h2 className="text-base sm:text-lg font-black text-stone-900 font-display mt-1">
              What do you want to eat?
            </h2>
          </div>
          {selectedCategory !== 'All' && (
            <button
              type="button"
              onClick={() => onCategoryChange('All')}
              className="text-xs font-bold text-orange-600 hover:text-orange-700 underline"
            >
              Show all
            </button>
          )}
        </div>

        {/* Clean Category Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
          {CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat.key;
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => onCategoryChange(cat.key)}
                className={`flex items-center gap-2.5 p-3 rounded-2xl border text-left transition active:scale-95 text-xs sm:text-sm font-bold ${
                  isSelected
                    ? 'bg-orange-600 text-white border-orange-600 shadow-sm'
                    : 'bg-white text-stone-700 border-stone-200 hover:bg-orange-50/80 hover:text-orange-700 hover:border-orange-200'
                }`}
              >
                <span className={isSelected ? 'text-amber-100' : 'text-orange-500'}>
                  {cat.icon}
                </span>
                <span className="truncate">{cat.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 4. Surprise Me Card Banner (Warm Food Accent Gradient) */}
      <section className="max-w-4xl mx-auto overflow-hidden rounded-3xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 p-5 sm:p-6 text-white shadow-md hover:shadow-xl transition-all duration-300 border border-amber-300/30 relative">
        {/* Decorative corner doodle */}
        <div className="absolute -right-4 -bottom-4 text-white/15 pointer-events-none hidden sm:block">
          <FriesDoodle size={76} className="text-white/20" />
        </div>

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md text-white flex items-center justify-center shrink-0 shadow-xs">
              <Dices className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-amber-100">
                <Sparkles className="w-3 h-3 text-amber-200" />
                <span>SURPRISE ME!</span>
              </div>
              <h3 className="text-base sm:text-lg font-black text-white font-display">
                “Don't know what to eat?”
              </h3>
              <p className="text-xs sm:text-sm text-orange-100 font-medium">
                Let Unsay-Sud-an pick a meal that fits your ₱{budget} budget.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenRoulette}
            className="self-start sm:self-auto px-5 py-2.5 rounded-2xl bg-white text-orange-700 hover:bg-orange-50 font-black text-xs sm:text-sm shadow-md transition active:scale-95 flex items-center gap-2 shrink-0"
          >
            <Dices className="w-4 h-4 text-orange-600" />
            <span>Surprise Me</span>
            <ArrowRight className="w-3.5 h-3.5 text-orange-600" />
          </button>
        </div>
      </section>

      {/* 5. Step 3: Matching Food Grid */}
      <section className="space-y-4">
        
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1 border-b border-orange-100">
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-orange-600 bg-orange-100/80 px-2 py-0.5 rounded-md">
              Step 3
            </span>
            <h2 className="text-base sm:text-xl font-black text-stone-900 font-display mt-1">
              What food fits your budget?
            </h2>
            <p className="text-xs text-stone-500">
              Here’s what you can get for ₱{budget} • Showing {matchingDishes.length} {matchingDishes.length === 1 ? 'meal' : 'meals'}
              {selectedCategory !== 'All' ? ` in ${selectedCategory}` : ''}
            </p>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('explore')}
            className="text-xs font-bold text-orange-600 hover:text-orange-700 flex items-center gap-1 self-start sm:self-auto"
          >
            <span>Explore full menu with filters</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Empty State */}
        {matchingDishes.length === 0 ? (
          <div className="bg-white rounded-3xl border border-dashed border-stone-300 p-8 sm:p-12 text-center max-w-lg mx-auto space-y-4 shadow-2xs">
            <div className="w-12 h-12 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center mx-auto">
              <UtensilsCrossed className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-black text-stone-900 font-display">
                No meals found for ₱{budget} in {selectedCategory}
              </h3>
              <p className="text-xs text-stone-500 leading-relaxed">
                Try selecting "All Categories" or raising your budget to ₱60 or ₱75.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              {selectedCategory !== 'All' && (
                <button
                  type="button"
                  onClick={() => onCategoryChange('All')}
                  className="px-4 py-2 bg-stone-900 text-white rounded-xl text-xs font-bold hover:bg-black transition"
                >
                  All Categories
                </button>
              )}
              <button
                type="button"
                onClick={() => onBudgetChange(Math.max(60, budget + 20))}
                className="px-4 py-2 bg-orange-600 text-white rounded-xl text-xs font-bold hover:bg-orange-700 transition"
              >
                Increase Budget (+₱20)
              </button>
            </div>
          </div>
        ) : (
          /* Multi-column grid: 1 col on mobile, 2 on tablet, 3 on laptop, 4 on wide */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 sm:gap-6">
            {matchingDishes.map((dish) => (
              <FoodCard
                key={dish.id}
                dish={dish}
                budget={budget}
                isBestMatch={dish.price <= budget && dish.price >= budget - 15}
                isFavorite={favorites.includes(dish.id)}
                onToggleFavorite={onToggleFavorite}
                onOpenDetail={onOpenDetail}
                onQuickAdd={onQuickAdd}
                t={t}
              />
            ))}
          </div>
        )}

      </section>

      {/* 6. Bottom Navigation Prompt */}
      <section className="text-center pt-6 border-t border-orange-100">
        <p className="text-xs text-stone-500 mb-3">
          Looking for specific cafeteria stalls or want to view your tray order?
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => onNavigate('explore')}
            className="px-4 py-2.5 rounded-xl bg-white border border-orange-100 text-stone-800 text-xs font-bold hover:bg-orange-50/50 hover:border-orange-200 transition shadow-2xs"
          >
            Explore Search & Filters
          </button>
          <button
            type="button"
            onClick={() => onNavigate('stalls')}
            className="px-4 py-2.5 rounded-xl bg-white border border-orange-100 text-stone-800 text-xs font-bold hover:bg-orange-50/50 hover:border-orange-200 transition shadow-2xs"
          >
            View All {totalStalls} Stalls
          </button>
          <button
            type="button"
            onClick={() => onNavigate('tray')}
            className="px-4 py-2.5 rounded-xl bg-orange-600 text-white text-xs font-bold hover:bg-orange-700 transition shadow-xs"
          >
            Check My Tray
          </button>
        </div>
      </section>

    </div>
  );
};
