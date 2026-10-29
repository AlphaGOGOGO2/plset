import { useState } from 'react';
import { Check, Palette } from 'lucide-react';
import { THEMES, applyTheme, loadTheme, previewPalette, saveTheme, type Theme } from './theme';
export default function SettingsPage({ notify }: { notify: (text: string) => void }) {
  const [current, setCurrent] = useState(() => loadTheme().id);
  const select = (theme: Theme) => {
    if (theme.id === current) return;
    saveTheme(theme); applyTheme(theme); setCurrent(theme.id);
    notify(`${theme.name} 테마를 적용했습니다.`);
  };
  return <section className="settings-page" aria-label="설정">
    <div className="page-heading"><div><span className="eyebrow">PREFERENCES</span><h1>설정</h1><p>이 PC에만 저장되는 화면 설정입니다. 세션 파일에는 포함되지 않습니다.</p></div></div>
    <section className="panel settings-section" aria-label="테마 색상">
      <div className="settings-section-head"><Palette size={18}/><div><h2>테마 색상</h2><span>선택 즉시 적용됩니다. 선수 사진과 1위·경고·B팀 색은 유지됩니다.</span></div></div>
      <div className="theme-grid" role="radiogroup" aria-label="테마 선택">{THEMES.map(theme => {
        const p = previewPalette(theme), selected = theme.id === current;
        return <button type="button" role="radio" aria-checked={selected} className={`theme-card${selected ? ' selected' : ''}`} key={theme.id} onClick={() => select(theme)}>
          <div className="theme-preview" style={{ background: p.bg, borderColor: p.line }} aria-hidden="true">
            <div className="theme-preview-side" style={{ background: p.panel, borderColor: p.line }}><i style={{ background: p.deep, borderColor: p.accent }}/><i style={{ background: p.line }}/><i style={{ background: p.line }}/></div>
            <div className="theme-preview-main">
              <div className="theme-preview-panel" style={{ background: p.panel, borderColor: p.line }}><b style={{ background: p.text }}/><span style={{ background: p.muted }}/><span style={{ background: p.muted, width: '55%' }}/></div>
              <div className="theme-preview-panel" style={{ background: p.panel, borderColor: p.line }}><em style={{ background: p.accent }}/><span style={{ background: p.muted, width: '70%' }}/></div>
            </div>
          </div>
          <div className="theme-card-info"><strong>{theme.name}</strong><small>{theme.description}</small></div>
          <span className="theme-check">{selected ? <Check size={14}/> : null}</span>
        </button>;
      })}</div>
    </section>
  </section>;
}
