import { useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';
import { getMode, subscribeMode, toggleMode } from './theme';

// Dark/light switch in the sidebar foot, between the starjoa.kr link and the version row.
// The choice is a local preference shared by every open tab through localStorage,
// including the broadcast output window, so the stream and the console agree.
export default function ModeToggle() {
  const mode = useSyncExternalStore(subscribeMode, getMode, () => 'dark' as const);
  const light = mode === 'light';
  return <button type="button" className="sidebar-mode" role="switch" aria-checked={light} aria-label={light ? '다크 모드로 전환' : '라이트 모드로 전환'} onClick={toggleMode}>
    <span className="sidebar-mode-icon" aria-hidden="true">{light ? <Sun size={12}/> : <Moon size={12}/>}</span>
    <span className="sidebar-mode-label">{light ? '라이트 모드' : '다크 모드'}</span>
    <span className="sidebar-mode-track" aria-hidden="true"/>
  </button>;
}
