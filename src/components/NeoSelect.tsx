import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type NeoSelectOption = {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
};

type NeoSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: NeoSelectOption[];
  className?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
  placeholder?: string;
};

type MenuPos = { top: number; left: number; width: number; maxHeight: number; placeAbove: boolean };

export function NeoSelect({
  value,
  onChange,
  options,
  className,
  style,
  disabled,
  placeholder,
}: NeoSelectProps) {
  const id = useId();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);

  const isCompact = useMemo(() => (className || '').split(/\s+/g).includes('neo-select-compact'), [className]);
  const selected = useMemo(() => options.find(o => o.value === value) || null, [options, value]);

  const enabledOptions = useMemo(() => options.filter(o => !o.disabled), [options]);

  const getInitialActiveIndex = () => {
    const idx = options.findIndex(o => o.value === value && !o.disabled);
    if (idx >= 0) return idx;
    return options.findIndex(o => !o.disabled);
  };

  const computeMenuPos = () => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const viewportH = window.innerHeight;
    const viewportW = window.innerWidth;
    const padding = 8;
    const desiredMax = Math.min(360, Math.max(180, viewportH - padding * 2));
    const belowSpace = viewportH - rect.bottom - padding;
    const aboveSpace = rect.top - padding;
    const placeAbove = aboveSpace > belowSpace && aboveSpace > 160;
    const maxHeight = Math.min(desiredMax, placeAbove ? aboveSpace : belowSpace);
    const width = Math.min(rect.width, viewportW - padding * 2);
    const left = Math.max(padding, Math.min(rect.left, viewportW - padding - width));
    const top = placeAbove ? Math.max(padding, rect.top - maxHeight - 6) : Math.min(viewportH - padding - maxHeight, rect.bottom + 6);
    setMenuPos({ top, left, width, maxHeight, placeAbove });
  };

  useLayoutEffect(() => {
    if (!open) return;
    computeMenuPos();
  }, [open, options.length, value]);

  useEffect(() => {
    if (!open) return;

    const onWin = () => computeMenuPos();
    const onScroll = () => computeMenuPos();
    window.addEventListener('resize', onWin);
    window.addEventListener('scroll', onScroll, true);

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (buttonRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown, true);

    return () => {
      window.removeEventListener('resize', onWin);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Keep active option visible.
    const menu = menuRef.current;
    if (!menu) return;
    const el = menu.querySelector<HTMLElement>(`[data-neo-option-idx="${activeIndex}"]`);
    if (!el) return;
    const menuRect = menu.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    if (elRect.top < menuRect.top) {
      menu.scrollTop -= (menuRect.top - elRect.top) + 6;
    } else if (elRect.bottom > menuRect.bottom) {
      menu.scrollTop += (elRect.bottom - menuRect.bottom) + 6;
    }
  }, [activeIndex, open]);

  const commit = (next: string) => {
    onChange(next);
    setOpen(false);
    queueMicrotask(() => buttonRef.current?.focus());
  };

  const moveActive = (dir: 1 | -1) => {
    if (!options.length) return;
    let idx = activeIndex;
    for (let tries = 0; tries < options.length; tries++) {
      idx = (idx + dir + options.length) % options.length;
      if (!options[idx]?.disabled) {
        setActiveIndex(idx);
        return;
      }
    }
  };

  const onButtonKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        setActiveIndex(getInitialActiveIndex());
        setOpen(true);
      }
      else moveActive(e.key === 'ArrowDown' ? 1 : -1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(o => {
        const next = !o;
        if (next) setActiveIndex(getInitialActiveIndex());
        return next;
      });
    }
  };

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      queueMicrotask(() => buttonRef.current?.focus());
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      moveActive(e.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const opt = options[activeIndex];
      if (opt && !opt.disabled) commit(opt.value);
      return;
    }
  };

  const label = selected?.label ?? placeholder ?? (enabledOptions[0]?.label ?? '');

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`neo-select neo-select-trigger${className ? ` ${className}` : ''}`}
        style={style}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`neo-select-menu-${id}`}
        onClick={() => {
          if (disabled) return;
          setOpen(o => {
            const next = !o;
            if (next) setActiveIndex(getInitialActiveIndex());
            return next;
          });
        }}
        onKeyDown={onButtonKeyDown}
      >
        <span className="neo-select-value">{label}</span>
      </button>

      {open && menuPos && createPortal(
        <div
          ref={menuRef}
          id={`neo-select-menu-${id}`}
          className={`neo-select-menu${isCompact ? ' neo-select-menu-compact' : ''}`}
          role="listbox"
          tabIndex={-1}
          aria-activedescendant={activeIndex >= 0 ? `neo-select-option-${id}-${activeIndex}` : undefined}
          data-compact={isCompact ? 'true' : undefined}
          onKeyDown={onMenuKeyDown}
          style={{
            position: 'fixed',
            top: menuPos.top,
            left: menuPos.left,
            width: menuPos.width,
            maxHeight: menuPos.maxHeight,
          }}
        >
          {options.map((opt, idx) => {
            const isSelected = opt.value === value;
            const isActive = idx === activeIndex;
            const optionClass = `neo-select-option${isCompact ? ' neo-select-option-compact' : ''}${isActive ? ' neo-select-option--active' : ''}`;
            return (
              <div
                key={`${opt.value}-${idx}`}
                id={`neo-select-option-${id}-${idx}`}
                role="option"
                aria-selected={isSelected}
                aria-disabled={opt.disabled || undefined}
                data-neo-option-idx={idx}
                className={optionClass}
                onMouseEnter={() => !opt.disabled && setActiveIndex(idx)}
                onMouseDown={(e) => e.preventDefault()} // keep focus behavior consistent
                onClick={() => {
                  if (opt.disabled) return;
                  commit(opt.value);
                }}
              >
                {opt.label}
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}


