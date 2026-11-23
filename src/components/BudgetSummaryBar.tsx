import React, { useState } from 'react';
import { Wallet, ShoppingBag, ArrowRight, Check, AlertCircle } from 'lucide-react';
import { AppPage } from '../types';

interface BudgetSummaryBarProps {
  budget: number;
  spent: number;
  trayCount: number;
  onBudgetChange: (val: number) => void;
  onNavigate: (page: AppPage) => void;
  currentPage: AppPage;
}

const PRESET_BUDGETS = [50, 80, 100];

export const BudgetSummaryBar: React.FC<BudgetSummaryBarProps> = ({
  budget,
  spent,
  trayCount,
  onBudgetChange,
  onNavigate,
  currentPage
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempBudget, setTempBudget] = useState(budget.toString());

  const remaining = budget - spent;
  const isOverBudget = remaining < 0;

  const handleSaveBudget = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(tempBudget);
    if (!isNaN(val) && val >= 0) {
      onBudgetChange(val);
    }
    setIsEditing(false);
  };

  return (
    <div className="sticky top-16 z-20 bg-[#FFFDF9]/95 backdrop-blur-md border-b border-[#F0EBE1] shadow-2xs py-2 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm">
        
        {/* Left: Obvious Budget, Spent, and Remaining values */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-6">
          
          {/* Your Budget */}
          <div className="flex items-center gap-2">
            <span className="text-stone-500 font-semibold text-xs uppercase tracking-wider">
              Your Budget:
            </span>
            {isEditing ? (
              <form onSubmit={handleSaveBudget} noValidate className="flex items-center gap-1.5">
                <span className="text-stone-500 font-bold">₱</span>
                <input
                  type="number"
                  min="0"
                  max="1000"
                  value={tempBudget}
                  onChange={(e) => setTempBudget(e.target.value)}
                  className="w-16 px-1.5 py-0.5 text-xs font-bold bg-white border border-orange-400 rounded-lg text-stone-900 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  autoFocus
                />
                <button
                  type="submit"
                  className="p-1 bg-orange-600 text-white rounded-lg text-[10px] font-bold hover:bg-orange-700"
                >
                  <Check className="w-3 h-3" />
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setTempBudget(budget.toString());
                  setIsEditing(true);
                }}
                className="group flex items-center gap-1 hover:text-orange-600 transition"
                title="Click to edit budget"
              >
                <span className="text-stone-900 font-black text-sm sm:text-base font-display">
                  ₱{budget}
                </span>
                <span className="text-[10px] text-stone-400 group-hover:text-orange-600 underline">
                  edit
                </span>
              </button>
            )}
          </div>

          <span className="text-stone-300 hidden sm:inline">|</span>

          {/* Spent Amount */}
          <div className="flex items-center gap-1.5">
            <span className="text-stone-500 font-semibold text-xs uppercase tracking-wider">
              Spent:
            </span>
            <span className="text-stone-800 font-bold text-xs sm:text-sm">
              ₱{spent}
            </span>
            {trayCount > 0 && (
              <span className="text-[11px] text-stone-500 font-medium">
                ({trayCount} {trayCount === 1 ? 'item' : 'items'})
              </span>
            )}
          </div>

          <span className="text-stone-300 hidden sm:inline">|</span>

          {/* Remaining Amount - PROMINENT HIGHLIGHT */}
          <div className="flex items-center gap-2">
            <span className="text-stone-600 font-bold text-xs uppercase tracking-wider">
              Remaining:
            </span>
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs sm:text-sm font-black transition ${
                isOverBudget
                  ? 'bg-rose-50 text-rose-800 border border-rose-300'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-300'
              }`}
            >
              {isOverBudget ? (
                <>
                  <AlertCircle className="w-3 h-3 text-rose-600 shrink-0" />
                  <span>₱{Math.abs(remaining)} over</span>
                </>
              ) : (
                <span>₱{remaining}</span>
              )}
            </span>
          </div>

        </div>

        {/* Right: Quick Budget Selector Chips & View Tray action */}
        <div className="flex items-center gap-2 sm:gap-3 ml-auto">
          {/* Quick presets */}
          <div className="hidden md:flex items-center gap-1 text-[11px]">
            <span className="text-stone-400 mr-1 font-medium">Quick:</span>
            {PRESET_BUDGETS.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => onBudgetChange(amt)}
                className={`px-2 py-0.5 rounded-lg font-bold transition ${
                  budget === amt
                    ? 'bg-orange-600 text-white shadow-2xs font-black'
                    : 'bg-stone-100 text-stone-600 hover:bg-orange-50 hover:text-orange-700'
                }`}
              >
                ₱{amt}
              </button>
            ))}
          </div>

          {/* View Tray CTA if not on tray page */}
          {currentPage !== 'tray' && (
            <button
              type="button"
              onClick={() => onNavigate('tray')}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs ${
                trayCount > 0
                  ? 'bg-orange-600 hover:bg-orange-700 text-white shadow-xs'
                  : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Tray</span>
              {trayCount > 0 && (
                <span className="bg-white/20 px-1.5 py-0.2 rounded-full text-[10px] font-black">
                  {trayCount}
                </span>
              )}
              <ArrowRight className="w-3 h-3 hidden sm:inline" />
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
