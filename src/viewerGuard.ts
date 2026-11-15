// Viewers watch the host's screen, so the page body is read-only for them — except what is marked
// data-viewer-ok (copy buttons, view toggles, their private funding area). Pointer events are left
// alone so scrolling, text selection, and canvas camera drags keep working.
const BLOCKED = ['click', 'dblclick', 'auxclick', 'keydown', 'beforeinput', 'input', 'change', 'paste', 'cut', 'drop', 'dragstart', 'submit', 'contextmenu'] as const;
const PASSIVE_KEYS = new Set(['Tab', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End']);

export function guardViewer(root: HTMLElement) {
  const block = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element) || target.closest('[data-viewer-ok]')) return;
    if (event instanceof KeyboardEvent && (PASSIVE_KEYS.has(event.key) || ((event.ctrlKey || event.metaKey) && ['c', 'a'].includes(event.key.toLowerCase())))) return;
    event.preventDefault();
    event.stopPropagation();
  };
  for (const type of BLOCKED) root.addEventListener(type, block, true);
  return () => { for (const type of BLOCKED) root.removeEventListener(type, block, true); };
}
