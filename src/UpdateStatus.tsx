import { useEffect, useState } from 'react';
import type { UpdateState } from './env';
import './updater.css';

export default function UpdateStatus() {
  const [update, setUpdate] = useState<UpdateState|null>(null);
  const [error, setError] = useState('');
  const [installing, setInstalling] = useState(false);
  useEffect(() => {
    const api = window.plset;
    if (!api) return;
    let live = true, received = false;
    const stop = api.onUpdate(value => { received = true; if (live) setUpdate(value); });
    api.updateStatus().then(value => { if (live && !received) setUpdate(value); }).catch(() => { if (live) setError('업데이트 상태를 불러오지 못했습니다.'); });
    return () => { live = false; stop(); };
  }, []);
  if (!window.plset || update?.status === 'disabled') return null;
  const status = update?.status ?? 'idle';
  const busy = installing || ['checking', 'downloading', 'installing'].includes(status);
  const label = status === 'checking' ? '업데이트 확인 중' : status === 'downloading' ? `업데이트 다운로드 ${update?.progress ?? 0}%` : status === 'ready' ? '설치 및 재시작' : status === 'installing' ? '설치 준비 중' : status === 'error' ? '다시 확인' : '업데이트 확인';
  async function activate() {
    const api = window.plset;
    if (!api) return;
    setError('');
    try {
      if (status === 'ready') {
        setInstalling(true);
        // Commit any onBlur edit before asking the main process to save and quit.
        (document.activeElement as HTMLElement|null)?.blur();
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        await api.installUpdate();
      } else await api.checkUpdate();
    } catch { setError('업데이트를 확인하지 못했습니다. 다시 시도해 주세요.'); }
    finally { setInstalling(false); }
  }
  return <div className="app-update" aria-label="프로그램 업데이트">
    <div aria-live="polite" className="app-update-status">
      {status === 'latest' ? '최신 버전입니다' : status === 'ready' ? `v${update?.version} 준비 완료` : status === 'downloading' ? `v${update?.version}` : null}
    </div>
    <button type="button" className={status === 'ready' ? 'update-ready' : ''} disabled={busy} onClick={() => void activate()}>{label}</button>
    {status === 'downloading' ? <progress aria-label="업데이트 다운로드" max={100} value={update?.progress ?? 0}/> : null}
    {status === 'ready' && update?.notes ? <details><summary>변경 내역</summary><p>{update.notes}</p></details> : null}
    {error || status === 'error' ? <p role="status" className="app-update-error">{error || update?.message}</p> : null}
  </div>;
}
