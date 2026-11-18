import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import type { Race } from './domain';
import { pasteLines } from './scoreboard';

// Dropdowns of the scoreboard tab, drawn by the app instead of the browser's native <datalist>/<select> popups so they
// match the console. Same keyboard model as RaceSourceSelect: ↑/↓ to move, Enter to pick, Esc to close.
export type Option = { value: string; label?: string; race?: Race | null; hint?: string };
export type Group = { label: string; options: Option[] };

/** Where a menu opens: under its anchor, flipped above when there is no room below. Fixed, so a panel's overflow cannot clip it. */
function useMenuPlace(open: boolean, anchor: React.RefObject<HTMLElement | null>, rows: number) {
  const [style, setStyle] = useState<CSSProperties>({});
  useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    const place = () => {
      const r = anchor.current!.getBoundingClientRect(), height = Math.min(rows, 8) * 34 + 12, below = innerHeight - r.bottom > height + 8;
      setStyle({ position: 'fixed', left: r.left, width: Math.max(r.width, 150), ...(below ? { top: r.bottom + 4 } : { bottom: innerHeight - r.top + 4 }) });
    };
    place();
    addEventListener('resize', place); addEventListener('scroll', place, true);
    return () => { removeEventListener('resize', place); removeEventListener('scroll', place, true); };
  }, [open, anchor, rows]);
  return style;
}

/**
 * A text cell of the entry table with suggestions (the team's players, or the registered maps). Typing filters them;
 * the text stays free, so a name that is not on the list can still be typed. Pasting several names at once (one line
 * with spaces, or several lines) hands them to `onPasteMany` to fill the column downwards.
 */
export function ComboCell({ value, options, onChange, onPasteMany, readOnly, label, maxLength = 20 }: {
  value: string; options: Option[]; onChange: (value: string) => void; onPasteMany?: (values: string[]) => void;
  readOnly?: boolean; label: string; maxLength?: number;
}) {
  const id = useId(), input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false), [active, setActive] = useState(0);
  const q = value.replace(/\s+/g, '');
  const shown = options.filter(o => !q || (o.label ?? o.value).replace(/\s+/g, '').includes(q) || o.value.includes(q)).slice(0, 12);
  const style = useMenuPlace(open && shown.length > 0, input, shown.length);
  useEffect(() => { setActive(0); }, [value]);
  const pick = (o: Option) => { onChange(o.value); setOpen(false); };
  const key = (e: KeyboardEvent<HTMLInputElement>) => {
    if (readOnly) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(a => Math.min(shown.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' && open && shown[active]) { e.preventDefault(); pick(shown[active]); }
    else if (e.key === 'Escape') setOpen(false);
  };
  return <div className="sb-combo">
    <input ref={input} role="combobox" aria-label={label} aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list"
      autoComplete="off" maxLength={maxLength} readOnly={readOnly} value={value}
      onFocus={() => { if (!readOnly) setOpen(true); }} onBlur={() => setOpen(false)}
      onChange={e => { onChange(e.target.value); setOpen(true); }} onKeyDown={key}
      onPaste={e => {
        if (readOnly || !onPasteMany) return;
        const values = pasteLines(e.clipboardData.getData('text'));
        if (values.length > 1) { e.preventDefault(); onPasteMany(values); setOpen(false); }
      }}/>
    {value && !readOnly ? <button type="button" className="sb-combo-clear" aria-label={`${label} 지우기`} tabIndex={-1}
      onPointerDown={e => e.preventDefault()} onClick={() => { onChange(''); input.current?.focus(); }}><X size={13}/></button> : null}
    {open && shown.length ? <div className="sb-menu" id={`${id}-list`} role="listbox" style={style} onPointerDown={e => e.preventDefault()}>
      {shown.map((o, i) => <button key={o.value} type="button" role="option" aria-selected={o.value === value} className={i === active ? 'active' : ''} onPointerEnter={() => setActive(i)} onClick={() => pick(o)}>
        <span className="sb-menu-label" data-race={o.race ?? undefined}>{o.label ?? o.value}</span>{o.hint ? <small>{o.hint}</small> : o.value === value ? <Check size={14}/> : null}
      </button>)}
    </div> : null}
  </div>;
}

/** A select drawn by the app, with grouped options (the 기준 선수 picker). */
export function Picker({ value, groups, placeholder, onChange, label, children }: {
  value: string; groups: Group[]; placeholder: Option; onChange: (value: string) => void; label: string; children?: ReactNode;
}) {
  const id = useId(), trigger = useRef<HTMLButtonElement>(null), root = useRef<HTMLDivElement>(null);
  const all = [placeholder, ...groups.flatMap(g => g.options)];
  const current = all.find(o => o.value === value) ?? { value, label: value };
  const [open, setOpen] = useState(false), [active, setActive] = useState(0);
  const style = useMenuPlace(open, trigger, all.length + groups.length);
  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, all.findIndex(o => o.value === value)));
    const close = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  // Keep the highlighted option in view when the menu opens on a pick far down the list or the arrows move past the edge.
  useLayoutEffect(() => { if (open) root.current?.querySelector('.sb-menu button.active')?.scrollIntoView({ block: 'nearest' }); }, [open, active]);
  const choose = (o: Option) => { onChange(o.value); setOpen(false); trigger.current?.focus(); };
  const key = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!open) { setOpen(true); return; } setActive(a => Math.max(0, Math.min(all.length - 1, a + (e.key === 'ArrowDown' ? 1 : -1)))); }
    else if ((e.key === 'Enter' || e.key === ' ') && open) { e.preventDefault(); choose(all[active]); }
    else if (e.key === 'Escape') setOpen(false);
  };
  const item = (o: Option) => { const i = all.indexOf(o); return <button key={o.value || '-'} type="button" role="option" aria-selected={o.value === value} className={i === active ? 'active' : ''} onPointerEnter={() => setActive(i)} onClick={() => choose(o)}>
    <span className="sb-menu-label" data-race={o.race ?? undefined}>{o.label ?? o.value}</span>{o.value === value ? <Check size={14}/> : o.hint ? <small>{o.hint}</small> : null}
  </button>; };
  return <div className="sb-field sb-picker" ref={root}>
    <span id={`${id}-label`}>{label}</span>
    <button ref={trigger} type="button" role="combobox" aria-labelledby={`${id}-label`} aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-list`} onClick={() => setOpen(!open)} onKeyDown={key}>
      <span className="sb-menu-label" data-race={current.race ?? undefined}>{current.label ?? current.value}</span><ChevronDown size={15}/>
    </button>
    {open ? <div className="sb-menu" id={`${id}-list`} role="listbox" style={style}>
      {item(placeholder)}
      {groups.map(g => g.options.length ? <div key={g.label} role="group" aria-label={g.label}><span className="sb-menu-group">{g.label}</span>{g.options.map(item)}</div> : null)}
    </div> : null}
    {children}
  </div>;
}
