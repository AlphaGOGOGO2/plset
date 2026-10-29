import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

const options = [
  { value: 'players', label: '전체 참가자' },
  { value: 'A', label: 'A팀' },
  { value: 'B', label: 'B팀' },
  { value: 'custom', label: '직접 입력' },
] as const;
export type RaceSource = typeof options[number]['value'];

// Keep the menu in the app's DOM so WebGL/compositor updates do not depend on
// a separate native select popup. Mouse and keyboard share the same selection.
export default function RaceSourceSelect({ value, disabled, onChange }: { value: RaceSource; disabled: boolean; onChange: (value: RaceSource) => void }) {
  const id = useId(), root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const selected = Math.max(0, options.findIndex(option => option.value === value));
  const [open, setOpen] = useState(false), [active, setActive] = useState(selected);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  const choose = (index: number) => { onChange(options[index].value); setOpen(false); trigger.current?.focus(); };
  return <div className="field-label race-source-select" ref={root} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
    <span id={`${id}-label`}>참가 대상</span>
    <button ref={trigger} type="button" role="combobox" aria-labelledby={`${id}-label`} aria-haspopup="listbox" aria-controls={`${id}-list`} aria-expanded={open && !disabled} aria-activedescendant={open ? `${id}-${active}` : undefined} disabled={disabled} onClick={() => { setActive(selected); setOpen(value => !value); }} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
      else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setActive(open ? (active + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length : selected); setOpen(true); }
      else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); setActive(event.key === 'Home' ? 0 : options.length - 1); setOpen(true); }
      else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (open) choose(active); else { setActive(selected); setOpen(true); } }
    }}><span>{options[selected].label}</span><ChevronDown size={15}/></button>
    {open && !disabled ? <div id={`${id}-list`} role="listbox" aria-labelledby={`${id}-label`} className="race-source-options">
      {options.map((option, index) => <button key={option.value} id={`${id}-${index}`} type="button" role="option" aria-selected={value === option.value} tabIndex={-1} className={active === index ? 'active' : ''} onPointerMove={() => setActive(index)} onPointerDown={event => event.preventDefault()} onClick={() => choose(index)}><span>{option.label}</span>{value === option.value ? <Check size={14}/> : null}</button>)}
    </div> : null}
  </div>;
}
