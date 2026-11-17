import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, FastForward, Play, Plus, RotateCcw, X } from 'lucide-react';
import { LayoutGroup, motion } from 'motion/react';
import { MAP_DRAW_EXTRA, MAP_DRAW_FORMATS, addMap, mapDrawBase, randomSeed, removeMap, sessionMaps, validMapDraw, type MapDraw, type MapDrawFormat, type Session } from './domain';
import { mapDrawFrame, mapDrawPlan, mapOrderText, type MapDrawFrame } from './mapDraw';
import { mapImage } from './mapImages';
import { playSfx } from './sfx';

type Commit = (update: (s: Session) => Session, label?: string, history?: boolean) => void;
const START_DELAY_MS = 400;
const frameKey = (f: MapDrawFrame) => `${f.phase}:${f.game}:${f.tick}`;
const gameCount = (format: MapDrawFormat, maps: number) => format === 'ace' ? 1 : format === 'plus' ? maps + MAP_DRAW_EXTRA : maps;
const formatLabel = (format: MapDrawFormat, maps: number) => format === 'ace' ? '슈에' : `${gameCount(format, maps)}경기`;

function MapCard({ label, hidden = false }: { label: string; hidden?: boolean }) {
  const src = hidden ? null : mapImage(label);
  return <div className={`map-card${hidden ? ' map-card-hidden' : ''}`}>
    <div className="map-card-art">{src ? <img src={src} alt="" draggable={false}/> : <span>{hidden ? '?' : label}</span>}</div>
    <strong>{hidden ? '\u00a0' : label}</strong>
  </div>;
}

export default function MapDrawPage({ s, commit, notify, visible, viewer = false }: { s: Session; commit: Commit; notify: (text: string) => void; visible: boolean; viewer?: boolean }) {
  // A viewer may run a draw of their own. It lives in this window only, and the host's draw takes over again when a newer one starts.
  const [own, setOwn] = useState<MapDraw | null>(null), [skipped, setSkipped] = useState<MapDraw | null>(null), [mapName, setMapName] = useState('');
  const shared = validMapDraw(s.mapDraw) ? s.mapDraw : null;
  const run = viewer && own && (!shared || own.startedAt >= shared.startedAt) ? own : shared, mine = viewer && run === own && !!own;
  const [format, setFormat] = useState<MapDrawFormat>(run?.format ?? 'plus');
  // The picker follows whatever draw is on screen, so "다시 추첨" repeats the same format unless it is changed.
  useEffect(() => { if (run) setFormat(run.format); }, [run]);
  const pool = sessionMaps(s);
  const plan = useMemo(() => run ? mapDrawPlan(run) : null, [run]);
  const frameAt = (now: number): MapDrawFrame | null => plan && run ? mapDrawFrame(plan, run === skipped ? plan.total : now - run.startedAt) : null;
  const [frame, setFrame] = useState<MapDrawFrame | null>(() => frameAt(Date.now()));
  const live = useRef(false);
  useEffect(() => {
    const first = frameAt(Date.now());
    setFrame(first);
    // Sounds belong to a reveal that is being watched as it happens, not to a finished one opened later.
    live.current = !!first && first.phase !== 'done';
    if (!visible || !first || first.phase === 'done') return;
    let id = 0, last = frameKey(first);
    const loop = () => {
      const next = frameAt(Date.now())!, key = frameKey(next);
      if (key !== last) {
        last = key; setFrame(next);
        if (next.phase === 'roll' || next.phase === 'intro') playSfx('wheelTick');
        else if (next.phase === 'hold') playSfx(plan!.steps[next.game].extra ? 'win' : 'teamPlace');
        else if (live.current) playSfx('cheer');
      }
      if (next.phase !== 'done') id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [plan, run, skipped, visible]);

  const labelOf = (id: string) => run?.items.find(item => item.id === id)?.label ?? '';
  const running = !!frame && frame.phase !== 'done', done = frame?.phase === 'done';
  // The screen shows the last draw until a different format is picked; then it previews that format's empty slots.
  const shown = run && run.format === format ? run : null, shownPlan = shown ? plan : null, shownFrame = shown ? frame : null;
  const start = () => {
    if (running) return;
    if (pool.length < MAP_DRAW_EXTRA) { notify(`맵을 ${MAP_DRAW_EXTRA}개 이상 등록해주세요.`); return; }
    const next: MapDraw = { format, seed: randomSeed(), startedAt: Date.now() + START_DELAY_MS, items: pool.map(({ id, label }) => ({ id, label })) };
    if (viewer) setOwn(next); else commit(v => ({ ...v, mapDraw: next }), `맵 추첨 시작 · ${formatLabel(format, pool.length)} · ${pool.length}개 맵`);
  };
  // The host's skip reaches every viewer (the start time moves into the past); a viewer's skip is their own view only.
  const skip = () => {
    if (!run || !plan || !running) return;
    if (viewer) setSkipped(run); else commit(v => ({ ...v, mapDraw: { ...run, startedAt: Date.now() - plan.total } }), '맵 추첨 결과 바로 보기', false);
  };
  const clear = () => { if (viewer) setOwn(null); else commit(v => ({ ...v, mapDraw: null }), '맵 추첨 초기화'); };
  const copy = async () => {
    if (!shownPlan || !done) return;
    try { await navigator.clipboard.writeText(mapOrderText(shownPlan.games.map(labelOf))); notify('맵 순서를 복사했습니다.'); } catch { notify('복사하지 못했습니다. 다시 시도해주세요.'); }
  };
  const add = () => { try { commit(v => addMap(v, mapName), `맵 추가 · ${mapName.trim()}`); setMapName(''); } catch (e) { notify((e as Error).message); } };

  const maps = shown ? shown.items.length : pool.length, ace = format === 'ace';
  const slots = shownPlan ? shownPlan.games.length : gameCount(format, maps), base = shown ? mapDrawBase(shown) : ace ? 0 : maps;
  const slotName = (i: number) => ace ? '슈퍼에이스' : `${i + 1}경기`;
  const runKey = shown ? `${shown.seed}-${shown.startedAt}` : 'idle';
  const phase = shownFrame?.phase ?? 'idle', game = shownFrame && shownFrame.game >= 0 ? shownFrame.game : null;
  const extra = !!(shownPlan && game !== null && phase !== 'done' && shownPlan.steps[game].extra);
  const caption = phase === 'idle' ? (ace ? '슈퍼에이스 맵 추첨' : `${formatLabel(format, maps)} 맵 추첨`) : phase === 'intro' ? '맵을 섞는 중' : phase === 'done' ? '추첨 완료' : slotName(game!);
  const hint = phase === 'idle' ? (pool.length < MAP_DRAW_EXTRA ? `맵을 ${MAP_DRAW_EXTRA}개 이상 등록하면 추첨할 수 있습니다.`
      : ace ? `등록된 ${maps}개 맵 중 하나를 뽑습니다.`
      : format === 'full' ? `1~${maps}경기에 맵이 한 번씩 나옵니다.`
      : `1~${maps}경기는 맵마다 한 번씩, ${maps + 1}~${maps + MAP_DRAW_EXTRA}경기는 등록된 맵 중 ${MAP_DRAW_EXTRA}개가 다시 나옵니다.`)
    : phase === 'intro' ? (ace ? '곧 슈퍼에이스 맵이 공개됩니다.' : '곧 1경기 맵부터 공개됩니다.') : phase === 'done' ? (ace ? '슈퍼에이스 결정전 맵입니다.' : '아래 순서대로 진행합니다.') : phase === 'hold' ? '확정!' : '어떤 맵이 나올까요?';

  return <div className="mapdraw" data-phase={phase} data-extra={extra || undefined} data-format={format}>
    <LayoutGroup id="mapdraw">
      <section className="panel mapdraw-stage">
        <div className="mapdraw-head">
          <div><h2>맵 추첨</h2>
            <div className="segmented mapdraw-format" role="group" aria-label="추첨 형식" data-viewer-ok>{MAP_DRAW_FORMATS.map(f => <button key={f} type="button" className={format === f ? 'selected' : ''} aria-pressed={format === f} disabled={running} onClick={() => setFormat(f)}>{formatLabel(f, pool.length)}</button>)}</div>
            {viewer && shown ? <span className={`count-pill mapdraw-owner${mine ? ' mine' : ''}`}>{mine ? '내 추첨' : '진행자 추첨'}</span> : null}
          </div>
          <div className="mapdraw-actions" data-viewer-ok>
            {running ? <button className="button" onClick={skip}><FastForward size={15}/> 결과 바로 보기</button> : null}
            {shown && done ? <button className="button" onClick={copy}><Copy size={15}/> 순서 복사</button> : null}
            {shown && !running && (!viewer || mine) ? <button className="button" onClick={clear}><RotateCcw size={15}/> 초기화</button> : null}
            <button className="button primary" disabled={running || pool.length < MAP_DRAW_EXTRA} onClick={start}><Play size={15}/> {shown ? '다시 추첨' : '추첨 시작'}</button>
          </div>
        </div>
        <div className="mapdraw-spotlight">
          <span className="mapdraw-caption" key={caption}>{caption}</span>
          <div className="mapdraw-center">
            {shownFrame?.phase === 'hold'
              ? <motion.div className="mapdraw-center-card locked" key={`lock-${runKey}-${shownFrame.game}`} layoutId={`mapdraw-${runKey}-${shownFrame.game}`} initial={{ scale: 1.12 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 420, damping: 18 }}><MapCard label={labelOf(shownFrame.face)}/></motion.div>
              : shownFrame && (shownFrame.phase === 'intro' || shownFrame.phase === 'roll')
                ? <div className="mapdraw-center-card rolling" key={`roll-${shownFrame.game}-${shownFrame.tick}`}><MapCard label={shownFrame.face ? labelOf(shownFrame.face) : ''} hidden={!shownFrame.face}/></div>
                : <div className={`mapdraw-center-card${phase === 'done' ? ' finished' : ''}`}><MapCard label="" hidden/></div>}
          </div>
          <p className="mapdraw-hint">{hint}</p>
        </div>
        <ol className="mapdraw-slots" aria-label="경기별 맵">
          {Array.from({ length: slots }, (_, i) => {
            const placed = !!shownPlan && !!shownFrame && i < shownFrame.placed, current = phase !== 'idle' && phase !== 'done' && game === i;
            return <li key={i} className={`mapdraw-slot${i >= base ? ' extra' : ''}${current ? ' current' : ''}${placed ? ' placed' : ''}`}>
              <span className="mapdraw-slot-no">{slotName(i)}</span>
              <div className="mapdraw-slot-card">{placed ? <motion.div layoutId={`mapdraw-${runKey}-${i}`} transition={{ type: 'spring', stiffness: 260, damping: 26 }}><MapCard label={labelOf(shownPlan!.games[i])}/></motion.div> : <div className="mapdraw-slot-empty" aria-hidden="true">?</div>}</div>
            </li>;
          })}
        </ol>
      </section>
    </LayoutGroup>
    <section className="panel mapdraw-pool">
      <div className="mapdraw-head"><div><h2>등록된 맵</h2><span className="count-pill">{pool.length}개</span></div>
        {!viewer ? <form className="mapdraw-add" onSubmit={e => { e.preventDefault(); add(); }}><input aria-label="추가할 맵 이름" placeholder="맵 이름" maxLength={30} value={mapName} disabled={running} onChange={e => setMapName(e.target.value)}/><button className="button" type="submit" disabled={running || !mapName.trim()}><Plus size={15}/> 맵 추가</button></form> : null}
      </div>
      <ul className="mapdraw-pool-list">
        {pool.map(map => <li key={map.id}><MapCard label={map.label}/>{!viewer ? <button className="icon-button mapdraw-remove" aria-label={`${map.label} 삭제`} disabled={running} onClick={() => commit(v => removeMap(v, map.id), `맵 삭제 · ${map.label}`)}><X size={14}/></button> : null}</li>)}
      </ul>
      {!pool.length ? <div className="empty-state">등록된 맵이 없습니다.</div> : null}
    </section>
  </div>;
}
