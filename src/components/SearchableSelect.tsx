import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, ChevronDown, X, Check } from 'lucide-react';
import { matchesSearch } from '../utils/searchMatch';

export interface SearchableSelectOption {
  value: string | number;
  label: string;
  sublabel?: string;
  badge?: string;
  badgeTone?: 'rose' | 'purple' | 'amber' | 'emerald' | 'slate';
  searchText?: string;
  disabled?: boolean;
}

interface SearchableSelectProps {
  value: string | number | null | undefined;
  onChange: (value: string | number | null) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyOptionLabel?: string;
  emptyOptionSublabel?: string;
  noResultsText?: string;
  disabled?: boolean;
  className?: string;
  allowClear?: boolean;
  ariaLabel?: string;
}

const BADGE_CLASSES: Record<NonNullable<SearchableSelectOption['badgeTone']>, string> = {
  rose: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  purple: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  amber: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  emerald: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  slate: 'bg-slate-800 text-slate-300 border-slate-700',
};

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  value,
  onChange,
  options,
  placeholder = 'Select an option...',
  searchPlaceholder = 'Type any letters, words, phone, or code...',
  emptyOptionLabel,
  emptyOptionSublabel,
  noResultsText = 'No matching items found',
  disabled = false,
  className = '',
  allowClear = false,
  ariaLabel,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedOption = useMemo(() => {
    if (value === null || value === undefined || value === '') return null;
    return options.find((opt) => String(opt.value) === String(value)) || null;
  }, [options, value]);

  const filteredOptions = useMemo(() => {
    if (!query.trim()) return options;
    return options.filter((opt) =>
      matchesSearch(query, opt.label, opt.sublabel, opt.badge, opt.searchText)
    );
  }, [options, query]);

  const showEmptyOption = useMemo(() => {
    if (!emptyOptionLabel) return false;
    if (!query.trim()) return true;
    return matchesSearch(query, emptyOptionLabel, emptyOptionSublabel);
  }, [emptyOptionLabel, emptyOptionSublabel, query]);

  // Flat list of selectable entries for keyboard navigation
  const navItems = useMemo(() => {
    const items: Array<{ type: 'empty' } | { type: 'option'; option: SearchableSelectOption }> = [];
    if (showEmptyOption) {
      items.push({ type: 'empty' });
    }
    filteredOptions.forEach((opt) => {
      if (!opt.disabled) {
        items.push({ type: 'option', option: opt });
      }
    });
    return items;
  }, [showEmptyOption, filteredOptions]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [query, isOpen]);

  // Close only on genuine click/touch outside container
  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [isOpen]);

  // Focus search input when opening
  useEffect(() => {
    if (isOpen) {
      const id = window.setTimeout(() => {
        inputRef.current?.focus();
      }, 10);
      return () => window.clearTimeout(id);
    }
  }, [isOpen]);

  const handleOpen = () => {
    if (disabled) return;
    setIsOpen(true);
  };

  const handleSelectOption = (nextValue: string | number | null) => {
    onChange(nextValue);
    setIsOpen(false);
    setQuery('');
  };

  const handleClearSelection = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
    setQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (navItems.length > 0) {
        setHighlightedIndex((prev) => (prev + 1) % navItems.length);
      }
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (navItems.length > 0) {
        setHighlightedIndex((prev) => (prev - 1 + navItems.length) % navItems.length);
      }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const target = navItems[highlightedIndex];
      if (target) {
        if (target.type === 'empty') {
          handleSelectOption(null);
        } else {
          handleSelectOption(target.option.value);
        }
      }
    }
  };

  const displayLabel = selectedOption
    ? selectedOption.label
    : emptyOptionLabel || placeholder;

  const hasSelection = Boolean(selectedOption);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger or Inline Active Search Input */}
      {!isOpen ? (
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-label={ariaLabel || placeholder}
          aria-expanded={isOpen}
          onClick={handleOpen}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
              e.preventDefault();
              handleOpen();
            }
          }}
          className={`w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs flex items-center justify-between gap-2 transition select-none ${
            disabled
              ? 'opacity-60 cursor-not-allowed text-slate-400'
              : 'cursor-pointer hover:border-slate-500 text-slate-100'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Search className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className={`truncate font-medium ${hasSelection ? 'text-white font-semibold' : 'text-slate-300'}`}>
              {displayLabel}
            </span>
            {selectedOption?.badge && (
              <span
                className={`hidden sm:inline-flex px-1.5 py-0.5 rounded border text-[10px] font-mono font-bold shrink-0 ${
                  BADGE_CLASSES[selectedOption.badgeTone || 'slate']
                }`}
              >
                {selectedOption.badge}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {allowClear && hasSelection && !disabled && (
              <button
                type="button"
                onClick={handleClearSelection}
                className="p-0.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition"
                title="Clear selection"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <ChevronDown className="w-4 h-4 text-slate-400" />
          </div>
        </div>
      ) : (
        <div className="w-full flex items-center rounded-xl bg-slate-950 border-2 border-amber-500 px-3 py-1.5 gap-2 shadow-lg shadow-amber-500/10">
          <Search className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={searchPlaceholder}
            aria-label={ariaLabel ? `${ariaLabel} search` : 'Search options'}
            className="w-full bg-transparent text-xs text-white placeholder-slate-400 focus:outline-none py-0.5"
          />
          {query && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="p-0.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition shrink-0"
              title="Clear search text"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setIsOpen(false)}
            className="p-0.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition shrink-0"
            title="Close dropdown"
          >
            <ChevronDown className="w-4 h-4 rotate-180" />
          </button>
        </div>
      )}

      {/* Dropdown List Panel */}
      {isOpen && (
        <div
          ref={listRef}
          className="absolute left-0 right-0 mt-1.5 z-50 rounded-xl bg-[#141923] border border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-64"
        >
          <div className="overflow-y-auto divide-y divide-slate-800/70">
            {showEmptyOption && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelectOption(null)}
                className={`w-full text-left px-3 py-2.5 text-xs flex items-center justify-between gap-2 transition ${
                  !hasSelection
                    ? 'bg-amber-500/15 text-amber-300'
                    : navItems[highlightedIndex]?.type === 'empty'
                    ? 'bg-slate-800 text-white'
                    : 'hover:bg-slate-800/80 text-slate-200'
                }`}
              >
                <div className="min-w-0">
                  <p className="font-bold truncate">{emptyOptionLabel}</p>
                  {emptyOptionSublabel && (
                    <p className="text-[10px] text-slate-400 truncate">{emptyOptionSublabel}</p>
                  )}
                </div>
                {!hasSelection && <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
              </button>
            )}

            {filteredOptions.map((opt) => {
              const isSelected = selectedOption && String(selectedOption.value) === String(opt.value);
              const navIdx = navItems.findIndex(
                (item) => item.type === 'option' && String(item.option.value) === String(opt.value)
              );
              const isHighlighted = navIdx >= 0 && navIdx === highlightedIndex;

              return (
                <button
                  key={String(opt.value)}
                  type="button"
                  disabled={opt.disabled}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => !opt.disabled && handleSelectOption(opt.value)}
                  className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 transition ${
                    opt.disabled
                      ? 'opacity-45 cursor-not-allowed bg-slate-900/40'
                      : isSelected
                      ? 'bg-amber-500/15 text-amber-200'
                      : isHighlighted
                      ? 'bg-slate-800 text-white'
                      : 'hover:bg-slate-800/80 text-slate-200'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-slate-100 truncate">{opt.label}</span>
                      {opt.badge && (
                        <span
                          className={`px-1.5 py-0.5 rounded border text-[10px] font-mono font-bold shrink-0 ${
                            BADGE_CLASSES[opt.badgeTone || 'slate']
                          }`}
                        >
                          {opt.badge}
                        </span>
                      )}
                    </div>
                    {opt.sublabel && (
                      <p className="text-[10px] text-slate-400 font-mono truncate mt-0.5">
                        {opt.sublabel}
                      </p>
                    )}
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                </button>
              );
            })}

            {filteredOptions.length === 0 && !showEmptyOption && (
              <div className="px-4 py-6 text-center text-xs text-slate-400 space-y-2">
                <p className="font-semibold text-slate-300">{noResultsText}</p>
                {query && (
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setQuery('');
                      inputRef.current?.focus();
                    }}
                    className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-[11px] font-semibold transition"
                  >
                    Clear "{query}"
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="px-3 py-1.5 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
            <span>
              {query.trim()
                ? `${filteredOptions.length} match${filteredOptions.length === 1 ? '' : 'es'}`
                : `${options.length} total`}
            </span>
            <span>Type or Backspace to edit</span>
          </div>
        </div>
      )}
    </div>
  );
};
