import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { ClipboardPaste, Copy, KeyRound, LogOut, Minus, Plus, Radio, RotateCcw, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { givenName, number, sessionMaps, type Race, type Session, type Team } from './domain';
import { chatEntries, sideOrder, SB_SET_NAME, emptyRow, fillRows, mapShort, pasteDown, fitStage, SB_STYLES, SB_STYLE_LABEL, type SbStyle, SB_MAX_ROWS, SB_SET_LABEL, SB_SETS, scoreboardView, sessionScoreboard, type SbRow, type SbSetId, type Scoreboard, type ScoreboardView, type EntryBoardView, isSbStyle, BOARD_SETS, parseBoardSets, type BoardSet, clockHour, gameColor, GAME_COLORS } from './scoreboard';
import { fetchMe, type PrefsMessage } from './live';
import { ComboCell, Picker, type Option } from './ScoreboardControls';
import type { Mode } from './mode';

type Commit = (update: (s: Session) => Session, label?: string, history?: boolean) => void;
export type OverlayKind = 'score' | 'entry';

// Each design is a set of custom properties passed inline: light mode re-tints every color it finds in the stylesheets
// (theme.ts), and the overlay has to look the same in the console preview, in either mode, and on stream. Shapes and
// fonts that differ per design live in scoreboard.css under [data-style=…].
type Vars = Record<`--sb-${string}`, string>;
const WHITE_TEXT: Vars = { '--sb-text': '#f3f5fa', '--sb-muted': 'rgba(222, 229, 242, .6)', '--sb-faint': 'rgba(222, 229, 242, .32)' };
const STYLE_VARS: Record<SbStyle, Vars> = {
  glass: {
    ...WHITE_TEXT, '--sb-bg': 'linear-gradient(180deg, rgba(255, 255, 255, .16), transparent 46%), rgba(13, 17, 25, .8)',
    '--sb-border': '1px solid rgba(255, 255, 255, .13)', '--sb-shadow': '0 10px 28px rgba(0, 0, 0, .36), inset 0 1px 0 rgba(255, 255, 255, .16)',
    '--sb-blur': 'blur(18px) saturate(160%)', '--sb-deep': 'rgba(8, 11, 17, .9)', '--sb-line': 'rgba(255, 255, 255, .13)',
    '--sb-live': '#9fe3b8', '--sb-ink': '#0b0e14', '--sb-glow': 'rgba(214, 255, 229, .95)', '--sb-T': '#62a6ff', '--sb-P': '#f2c45a', '--sb-Z': '#ff6161',
  },
  doodle: {
    '--sb-text': '#1d1d1f', '--sb-muted': '#55524c', '--sb-faint': '#a7a197',
    '--sb-bg': 'repeating-linear-gradient(180deg, transparent 0 10px, rgba(70, 110, 220, .14) 10px 11px), #fffdf4', '--sb-bg-done': 'repeating-linear-gradient(180deg, transparent 0 10px, rgba(70, 110, 220, .1) 10px 11px), #dcd6c8',
    '--sb-border': '2px solid #1d1d1f', '--sb-shadow': '3px 3px 0 rgba(20, 20, 20, .85)', '--sb-blur': 'none',
    '--sb-deep': '#ffe96b', '--sb-line': '#1d1d1f', '--sb-live': '#e8467c', '--sb-ink': '#1d1d1f', '--sb-glow': '#ff4f8b',
    '--sb-T': '#1f5fd6', '--sb-P': '#c98800', '--sb-Z': '#d8302a',
  },
  // 배틀넷: the classic Battle.net look — near-black panels in a dark red frame, square corners, green headings,
  // periwinkle titles and a few stars in the panel, as on scmscx.com.
  bnet: {
    '--sb-text': '#ececec', '--sb-muted': '#a9a9a9', '--sb-faint': '#5c5c5c', '--sb-title': '#a8b4ff',
    '--sb-bg': 'radial-gradient(1px 1px at 12% 30%, rgba(255, 255, 255, .55), transparent 70%), radial-gradient(1px 1px at 47% 72%, rgba(255, 255, 255, .4), transparent 70%), radial-gradient(1.5px 1.5px at 83% 24%, rgba(190, 200, 255, .55), transparent 70%), radial-gradient(1px 1px at 66% 48%, rgba(255, 240, 200, .35), transparent 70%), rgba(20, 20, 22, .93)',
    '--sb-border': '2px solid #8f0e0e', '--sb-shadow': 'inset 0 0 0 1px rgba(0, 0, 0, .9), 0 0 0 1px rgba(0, 0, 0, .85), 0 4px 12px rgba(0, 0, 0, .5)',
    '--sb-blur': 'none', '--sb-deep': '#070707', '--sb-line': 'rgba(143, 14, 14, .55)', '--sb-live': '#3fd23f', '--sb-ink': '#050505', '--sb-glow': '#ff3030',
    '--sb-T': '#8fa2ff', '--sb-P': '#ffe14a', '--sb-Z': '#ff3b3b',
  },
  // 네온: gunmetal plates with chamfered corners and glowing green lettering.
  neon: {
    '--sb-text': '#dce8ee', '--sb-muted': '#8fa3ae', '--sb-faint': '#4f5f68',
    '--sb-bg': 'repeating-linear-gradient(135deg, rgba(255, 255, 255, .03) 0 2px, transparent 2px 6px), linear-gradient(180deg, #333d45 0%, #161c21 50%, #090c0f 100%)',
    '--sb-border': '1px solid #7d929e', '--sb-shadow': 'inset 0 1px 0 rgba(62, 230, 127, .6), inset 0 0 0 1px rgba(0, 0, 0, .7), inset 0 -2px 0 rgba(0, 0, 0, .6), 0 4px 14px rgba(0, 0, 0, .55)',
    '--sb-blur': 'none', '--sb-deep': '#05090b', '--sb-line': '#3a464e', '--sb-live': '#3ee67f', '--sb-ink': '#03140a', '--sb-glow': '#6dffa6',
    '--sb-T': '#4fb6ff', '--sb-P': '#ffd447', '--sb-Z': '#ff4b3e',
  },
  studio: {
    ...WHITE_TEXT, '--sb-bg': 'linear-gradient(90deg, #e3283f 0 4px, #10162b 4px)', '--sb-bg-end': 'linear-gradient(270deg, #e3283f 0 4px, #10162b 4px)',
    '--sb-border': '0 solid transparent', '--sb-shadow': '0 6px 18px rgba(0, 0, 0, .5)', '--sb-blur': 'none',
    '--sb-deep': '#1d2645', '--sb-line': 'rgba(255, 255, 255, .1)', '--sb-live': '#ffc928', '--sb-ink': '#10162b', '--sb-glow': '#ffc928',
    '--sb-T': '#5aa9ff', '--sb-P': '#ffc928', '--sb-Z': '#ff5468',
  },
  white: {
    '--sb-text': '#15171c', '--sb-muted': '#5f6672', '--sb-faint': '#a2a8b3',
    '--sb-bg': 'rgba(250, 251, 253, .9)', '--sb-border': '1px solid rgba(0, 0, 0, .07)', '--sb-shadow': '0 8px 24px rgba(0, 0, 0, .3)',
    '--sb-blur': 'blur(14px) saturate(140%)', '--sb-deep': '#eceef3', '--sb-line': 'rgba(0, 0, 0, .1)', '--sb-live': '#15171c', '--sb-ink': '#ffffff', '--sb-glow': '#3b82f6',
    '--sb-T': '#1d6ce8', '--sb-P': '#b98200', '--sb-Z': '#dc2f37',
  },
  pixel: {
    '--sb-text': '#fbfbff', '--sb-muted': '#b9bce0', '--sb-faint': '#5d628f',
    '--sb-bg': 'repeating-linear-gradient(0deg, rgba(255, 255, 255, .05) 0 1px, transparent 1px 3px), #1c2042',
    '--sb-border': '2px solid #fbfbff', '--sb-shadow': '4px 4px 0 #07081a', '--sb-blur': 'none',
    '--sb-deep': '#0d1030', '--sb-line': '#3c4180', '--sb-live': '#ffd23f', '--sb-ink': '#1c2042', '--sb-glow': '#ffd23f',
    '--sb-T': '#5ec8ff', '--sb-P': '#ffd23f', '--sb-Z': '#ff5d7c',
  },
};
const styleVars = (style: SbStyle) => STYLE_VARS[style] as CSSProperties;
// A stand-in for the game screen behind the overlay, so the glass reads the way it will on stream.
const STAGE = { background: 'radial-gradient(120% 90% at 20% 10%, #3b2f2a 0%, transparent 55%), radial-gradient(90% 80% at 85% 90%, #24313a 0%, transparent 60%), repeating-linear-gradient(45deg, #1b1a1c 0 14px, #201f22 14px 28px)' } as CSSProperties;
const RACE_WORD: Record<Race, string> = { T: 'TERRAN', P: 'PROTOSS', Z: 'ZERG' };

function Name({ name, race, className = '', won = false }: { name: string; race: Race | null; className?: string; won?: boolean }) {
  // The circled W hangs off the right of the text, so the name itself stays centred.
  return <span className={`sb-name ${className}`} data-race={race ?? undefined}><span className="sb-name-text">{name || ' '}{won ? <i className="sb-win-mark" aria-label="승">W</i> : null}</span></span>;
}

// Positions on a 1920×1080 StarCraft: Remastered screen, measured from the HUD: the minimap frame is x 0–328 with its top
// edge at y 768, and in observer mode the game's timer tab sits on it at x 70–245, y 732–768. The scoreboard covers the
// minimap's width and ends on that edge, leaving a gap for the timer between its two race boxes; the entry board sits to
// the right of the minimap. An OBS / XSplit source the size of the game capture lines them up.
export const SC_W = 1920, SC_H = 1080;
const SPOT: Record<OverlayKind, CSSProperties> = { score: { left: 0, top: 676, width: 328, height: 92 }, entry: { left: 334, top: 751 } };
// The game HUD drawn behind the console preview so the placement can be judged (not part of the overlay).
const HUD_FRAME = '6px solid #3a3330';
const HUD: { style: CSSProperties; text?: string }[] = [
  { style: { left: 0, top: 768, width: 328, height: 312, background: '#0a0b0c', border: HUD_FRAME } },
  { style: { left: 328, top: 822, width: 1196, height: 258, background: '#0b0c0d', border: HUD_FRAME } },
  { style: { left: 1524, top: 768, width: 330, height: 312, background: '#0b0c0d', border: HUD_FRAME } },
  { style: { left: 70, top: 732, width: 175, height: 36, background: '#0b0c0d', border: HUD_FRAME, borderBottom: 0, clipPath: 'polygon(14% 0, 86% 0, 100% 100%, 0 100%)', color: '#e8e8e8', font: '600 24px Manrope Variable, sans-serif', display: 'grid', placeItems: 'center' }, text: '00:07' },
];

/** The scoreboard on the minimap: set and title, sets won · the current game's players · games won, and their races around the game timer. */
export function ScoreBug({ v }: { v: ScoreboardView }) {
  // Before any entry is typed the name slots stay empty rather than showing team names.
  const left = v.now?.left ?? { name: '', race: null, pos: '', color: '' }, right = v.now?.right ?? { name: '', race: null, pos: '', color: '' };
  return <div className="sb-bug" data-style={v.style} style={styleVars(v.style)}>
    <div className="sb-glass sb-bar sb-head sb-bug-head"><b>{v.setLabel}</b><span className="sb-bug-title">{v.title}</span><span className="sb-prize">{v.prize > 0 ? `두 ${number(v.prize)}개` : null}</span></div>
    <div className="sb-glass sb-bar sb-bug-main">
      <span className="sb-set" title="세트 스코어">{v.left.setScore}</span>
      <Name name={left.name} race={left.race}/>
      <span className="sb-games" title="경기 스코어"><b>{v.left.gameScore}</b><i/><b>{v.right.gameScore}</b></span>
      <Name name={right.name} race={right.race} className="right"/>
      <span className="sb-set" title="세트 스코어">{v.right.setScore}</span>
    </div>
    <div className="sb-bug-races">
      {/* The start location sits on the outer side of each race letter ("11 P" on the left, "Z 5" on the right), and both
          take the player's colour in the game once it is picked. */}
      <span className="sb-glass sb-race" data-race={left.race ?? undefined} style={left.color ? { color: left.color } : undefined} title={left.race ? RACE_WORD[left.race] : undefined}>{left.pos ? <i className="sb-pos" title="시작 위치">{left.pos}</i> : null}{left.race ?? ''}</span>
      <span aria-hidden="true"/>
      <span className="sb-glass sb-race" data-race={right.race ?? undefined} style={right.color ? { color: right.color } : undefined} title={right.race ? RACE_WORD[right.race] : undefined}>{right.race ?? ''}{right.pos ? <i className="sb-pos" title="시작 위치">{right.pos}</i> : null}</span>
    </div>
  </div>;
}

/** The entry board: one bar per game with its number beside it, the game being played highlighted and decided games marked. */
/** The entry boards side by side (1SET and 2SET while 2SET is on air); the SUPER ACE card rides on the last one. */
export function EntryBoards({ v }: { v: ScoreboardView }) {
  return <div className="sb-entries">{v.entries.map((e, i) => <EntryBoard key={e.set} v={v} e={e} ace={i === v.entries.length - 1 ? v.ace : null}/>)}</div>;
}

export function EntryBoard({ v, e, ace }: { v: ScoreboardView; e: EntryBoardView; ace: ScoreboardView['ace'] }) {
  return <div className="sb-entry" data-style={v.style} data-ace={ace ? '' : undefined} style={styleVars(v.style)}>
    <div className="sb-glass sb-bar sb-head"><b>{e.setLabel}</b><span>{e.title}</span></div>
    <div className="sb-glass sb-bar sb-entry-teams"><span>{v.left.label}</span><strong>{e.left}<i>:</i>{e.right}</strong><span>{v.right.label}</span></div>
    {ace ? <div className="sb-glass sb-ace-card" data-current={ace.winner ? undefined : ''}>
      <b className="sb-ace-label">SUPER ACE</b>
      <span className="sb-ace-line">
        <Name name={ace.left.name} race={ace.left.race} won={ace.winner === 'left'} className={ace.winner === 'left' ? 'won' : ace.winner ? 'lost' : ''}/>
        <span className="sb-map">{ace.map}</span>
        <Name name={ace.right.name} race={ace.right.race} won={ace.winner === 'right'} className={`right ${ace.winner === 'right' ? 'won' : ace.winner ? 'lost' : ''}`}/>
      </span>
    </div> : null}
    <ol className="sb-entry-rows">
      {e.rows.map(r => <li key={r.no} data-current={r.current || undefined} data-winner={r.winner ?? undefined}>
        <span className="sb-glass sb-bar sb-no">{r.no}</span>
        <span className="sb-glass sb-bar sb-entry-line">
          <Name name={r.left.name} race={r.left.race} won={r.winner === 'left'} className={r.winner === 'left' ? 'won' : r.winner ? 'lost' : ''}/>
          <span className="sb-map">{r.map}</span>
          <Name name={r.right.name} race={r.right.race} won={r.winner === 'right'} className={`right ${r.winner === 'right' ? 'won' : r.winner ? 'lost' : ''}`}/>
        </span>
      </li>)}
    </ol>
  </div>;
}

/** Where the stage goes inside the element (see fitStage), kept current as the element is resized. */
function useFit() {
  const ref = useRef<HTMLDivElement>(null), [fit, setFit] = useState(() => fitStage(0, 0));
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => setFit(fitStage(el.clientWidth, el.clientHeight, SC_W, SC_H));
    fit();
    const ro = new ResizeObserver(fit); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, fit] as const;
}

const fade = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: .3 } };
/** The overlays at their places on a 1920×1080 stage, fitted into the box it is in (`fill`: the whole page). */
function OverlayStage({ v, kinds, hud = false, fill = false }: { v: ScoreboardView; kinds: OverlayKind[]; hud?: boolean; fill?: boolean }) {
  const [ref, { k, x, y }] = useFit();
  return <div ref={ref} className={`sb-fit${fill ? ' fill' : ''}`}>
    <div className="sb-stage" style={{ width: SC_W, height: SC_H, transform: `translate(${x}px, ${y}px) scale(${k})`, ...(hud ? STAGE : {}) }}>
      {hud ? HUD.map((h, i) => <div key={i} className="sb-hud" style={h.style}>{h.text}</div>) : null}
      <AnimatePresence>{kinds.map(kind => <motion.div key={kind} className="sb-spot" style={SPOT[kind]} {...fade}>{kind === 'score' ? <ScoreBug v={v}/> : <EntryBoards v={v}/>}</motion.div>)}</AnimatePresence>
    </div>
  </div>;
}

/**
 * What an OBS / XSplit browser source renders: a transparent page with the overlays and design its streamer picked.
 * `prefs` are the streamer's live settings from the room (their console saves them under the key in the link); until
 * they arrive, or for an older link without a key, the settings written into the link apply.
 */
export function ScoreboardOverlay({ s, kinds, base, style, sets, prefs }: { s: Session; kinds: OverlayKind[]; base: string | null; style: SbStyle; sets: BoardSet[]; prefs?: unknown }) {
  useEffect(() => { document.documentElement.classList.add('sb-overlay-page'); }, []);
  const live = mineFrom(prefs);
  if (live) return <OverlayStage v={scoreboardView(s, live.base || null, live.style, live.sets)} kinds={(['score', 'entry'] as OverlayKind[]).filter(k => live.show[k])} fill/>;
  return <OverlayStage v={scoreboardView(s, base, style, sets)} kinds={kinds} fill/>;
}

/**
 * One streamer's own broadcast settings: 기준 선수, design and which overlays are on. Kept in this browser and written into
 * their link, so they never touch the shared session the host edits.
 */
type Mine = { base: string; style: SbStyle; show: Record<OverlayKind, boolean>; sets: BoardSet[] };
const MINE_KEY = 'plset.scoreboard.mine', BASE_KEY = 'plset.scoreboard.base', LINK_KEY = 'plset.scoreboard.key';
/** Settings read back from storage or the room, with anything missing or unknown at its default; null when not an object. */
function mineFrom(raw: unknown): Mine | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, any>;
  return { base: typeof r.base === 'string' ? r.base.slice(0, 40) : '', style: isSbStyle(r.style) ? r.style : 'glass', show: { score: r.show?.score !== false, entry: r.show?.entry !== false }, sets: Array.isArray(r.sets) && r.sets.length === 1 ? parseBoardSets(r.sets[0]) : [...BOARD_SETS] };
}
/** This browser's random key for its OBS link: the room keeps this streamer's settings under it. */
function linkKey() {
  try {
    const saved = localStorage.getItem(LINK_KEY);
    if (saved && /^[a-z0-9]{16,40}$/.test(saved)) return saved;
    const key = Array.from(crypto.getRandomValues(new Uint8Array(20)), b => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
    localStorage.setItem(LINK_KEY, key);
    return key;
  } catch { return null; }
}
function useMine(): [Mine, (patch: Partial<Mine>) => void] {
  const [mine, setMine] = useState<Mine>(() => {
    const fallback: Mine = { base: '', style: 'glass', show: { score: true, entry: true }, sets: [...BOARD_SETS] };
    try {
      const raw = JSON.parse(localStorage.getItem(MINE_KEY) ?? 'null');
      if (!raw) return { ...fallback, base: localStorage.getItem(BASE_KEY) ?? '' };
      return mineFrom(raw) ?? fallback;
    } catch { return fallback; }
  });
  const set = (patch: Partial<Mine>) => setMine(m => {
    const next = { ...m, ...patch };
    try { localStorage.setItem(MINE_KEY, JSON.stringify(next)); } catch { /* Still applies to this page and its link. */ }
    return next;
  });
  return [mine, set];
}

/**
 * 방싸개 login, shown to viewers of a live room: the account (separate from the host's) that keeps the entry and the
 * scores while the host runs the rest. Once logged in this viewer's scoreboard tab is editable.
 */
function ScorerLogin({ scorer, onLogin, onLogout, notify }: { scorer: string | null; onLogin: (id: string, password: string) => Promise<string | null>; onLogout: () => Promise<void>; notify: (text: string) => void }) {
  const [open, setOpen] = useState(false), [id, setId] = useState(''), [password, setPassword] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  if (scorer) return <div className="sb-scorer" data-viewer-ok>
    <span className="count-pill sb-onair-pill"><KeyRound size={13}/> 방싸개 · {scorer}</span>
    <button type="button" className="button" onClick={() => void onLogout().then(() => notify('방싸개 로그아웃했습니다.'))}><LogOut size={15}/> 로그아웃</button>
  </div>;
  if (!open) return <div className="sb-scorer" data-viewer-ok><button type="button" className="button" onClick={() => setOpen(true)}><KeyRound size={15}/> 방싸개 로그인</button></div>;
  const submit = async () => {
    if (busy || !id.trim() || !password) return;
    setBusy(true); setError('');
    const failed = await onLogin(id.trim(), password);
    setBusy(false);
    if (failed) { setError(failed); return; }
    setOpen(false); setPassword(''); notify('방싸개로 로그인했습니다. 스코어보드를 수정할 수 있습니다.');
  };
  return <form className="sb-scorer sb-scorer-form" data-viewer-ok onSubmit={e => { e.preventDefault(); void submit(); }}>
    <input aria-label="방싸개 아이디" placeholder="아이디" autoComplete="username" maxLength={20} value={id} onChange={e => setId(e.target.value)} autoFocus/>
    <input aria-label="방싸개 비밀번호" placeholder="비밀번호" type="password" autoComplete="current-password" maxLength={256} value={password} onChange={e => setPassword(e.target.value)}/>
    <button type="submit" className="button primary" disabled={busy || !id.trim() || !password}>로그인</button>
    <button type="button" className="icon-button" aria-label="방싸개 로그인 닫기" onClick={() => { setOpen(false); setError(''); }}><X size={15}/></button>
    {error ? <p className="sb-scorer-error" role="alert">{error}</p> : null}
  </form>;
}

export default function ScoreboardPage({ s, commit, notify, viewer, mode, scorer = null, onScorerLogin, onScorerLogout, onPrefs }: {
  s: Session; commit: Commit; notify: (text: string) => void; viewer: boolean; mode: Mode;
  scorer?: string | null; onScorerLogin?: (id: string, password: string) => Promise<string | null>; onScorerLogout?: () => Promise<void>;
  /** Saves my settings in the room, so my OBS page (its link carries the key) follows them without a new link. */
  onPrefs?: (message: PrefsMessage) => void;
}) {
  const sb = sessionScoreboard(s);
  const [tab, setTab] = useState<SbSetId>(sb.onAir), [bulk, setBulk] = useState<{ a: string; map: string; b: string; chat: string } | null>(null);
  const [mine, setMine] = useMine(), base = mine.base, setBase = (b: string) => setMine({ base: b });
  const kinds = (['score', 'entry'] as OverlayKind[]).filter(k => mine.show[k]);
  // The overlay links point at the live room, which is the only way a separate OBS browser can receive the session.
  const [room, setRoom] = useState<string | null>(mode.kind === 'watch' ? mode.room : null);
  useEffect(() => { if (mode.kind === 'host') fetchMe().then(({ account }) => setRoom(account), () => setRoom(null)); }, [mode.kind]);

  const edit = (update: (b: Scoreboard) => Scoreboard, label?: string) => commit(v => ({ ...v, scoreboard: update(sessionScoreboard(v)) }), label, !!label);
  const rows = sb.sets[tab], setLabel = SB_SET_LABEL[tab];
  const setRows = (next: SbRow[], label?: string) => edit(b => ({ ...b, sets: { ...b.sets, [tab]: next } }), label);
  const place = (i: number, team: Team, value: string) => setRows(rows.map((r, j) => j === i ? { ...r, [team === 'A' ? 'pa' : 'pb']: clockHour(value) } : r));
  const paint = (i: number, team: Team, value: string) => setRows(rows.map((r, j) => j === i ? { ...r, [team === 'A' ? 'ca' : 'cb']: gameColor(value) } : r));
  const cell = (i: number, key: 'a' | 'map' | 'b', value: string) => setRows(rows.map((r, j) => j === i ? { ...r, [key]: key === 'map' ? mapShort(value) : value.slice(0, 20) } : r));
  const pasteMany = (i: number, key: 'a' | 'map' | 'b', values: string[]) => setRows(pasteDown(rows, i, key, values), `${setLabel} ${key === 'map' ? '맵' : '엔트리'} 붙여넣기`);
  // Suggestions for the entry table: each team's players by given name in their race colour, and the maps by two letters.
  const playerOptions = (team: Team): Option[] => teamPlayers(team).map(p => ({ value: givenName(p.name), race: p.race, hint: p.name }));
  const mapOptions: Option[] = [...new Map(sessionMaps(s).map(m => [mapShort(m.label), { value: mapShort(m.label), hint: m.label }])).values()];
  const win = (i: number, team: Team) => {
    const r = rows[i], next = r.winner === team ? null : team, name = (team === 'A' ? r.a : r.b).trim() || s.teams[team];
    setRows(rows.map((x, j) => j === i ? { ...x, winner: next } : x), next ? `${setLabel} ${i + 1}경기 승리 · ${name}` : `${setLabel} ${i + 1}경기 결과 취소`);
  };
  const setScore = (team: Team, delta: number) => edit(b => ({ ...b, setScore: { ...b.setScore, [team]: Math.min(99, Math.max(0, b.setScore[team] + delta)) } }), `세트 스코어 · ${s.teams[team]} ${delta > 0 ? '+1' : '-1'}`);
  // Text copied from the Battle.net chat: the entries found in it go straight into the two team columns.
  const pasteChat = (chat: string) => {
    if (!bulk) return;
    const found = chatEntries(chat, s.players);
    setBulk({ ...bulk, chat, a: found.A?.join('\n') ?? '', b: found.B?.join('\n') ?? '' });
  };
  const chatFound = bulk?.chat.trim() ? chatEntries(bulk.chat, s.players) : null;
  const applyBulk = () => { if (!bulk) return; setRows(fillRows(rows, bulk.a, bulk.map, bulk.b), `${setLabel} 엔트리 일괄 입력`); setBulk(null); };
  const clearSet = () => { if (confirm(`${setLabel} 엔트리와 결과를 모두 비울까요?`)) setRows(rows.map(emptyRow), `${setLabel} 엔트리 비우기`); };

  const view = scoreboardView(s, base || null, mine.style, mine.sets), order = sideOrder(s, base || null);
  // Beside each name: the player's start location (clock hour) and their colour in the game. On the scoreboard the race
  // letter and the location take that colour while the game is on. The swatches offered are StarCraft's player colours.
  const posInput = (i: number, team: Team, r: SbRow) => {
    const who = `${i + 1}경기 ${s.teams[team]}`, picked = (team === 'A' ? r.ca : r.cb) ?? '';
    return <>
      <input className="sb-pos-input" aria-label={`${who} 시작 위치 (몇 시)`} title="시작 위치 (몇 시)" placeholder="위치" inputMode="numeric" maxLength={2} autoComplete="off" readOnly={viewer} value={(team === 'A' ? r.pa : r.pb) ?? ''} onChange={e => place(i, team, e.target.value)}/>
      <label className={`sb-swatch${picked ? ' on' : ''}`} style={picked ? { background: picked } : undefined} title={picked ? '게임 내 색 (우클릭: 지우기)' : '게임 내 색 고르기'}
        onContextMenu={e => { if (!picked || viewer) return; e.preventDefault(); paint(i, team, ''); }}>
        <input type="color" list="sb-game-colors" aria-label={`${who} 게임 내 색`} disabled={viewer} value={picked || '#000000'} onChange={e => paint(i, team, e.target.value)}/>
      </label>
    </>;
  };
  const key = (t: Team) => t === 'A' ? 'a' as const : 'b' as const;
  const teamPlayers = (team: Team) => s.players.filter(p => p.active && p.team === team);
  // One link per streamer, carrying their own picks: the overlays they switched on, their design and 기준 선수.
  const params = [kinds.length === 1 ? `overlay=${kinds[0]}` : 'overlay', ...(mine.style !== 'glass' ? [`style=${mine.style}`] : []), ...(mine.sets.length === 1 ? [`sets=${mine.sets[0]}`] : []), ...(base ? [`base=${encodeURIComponent(base)}`] : [])];
  const [myKey] = useState(linkKey);
  useEffect(() => { if (myKey) onPrefs?.({ key: myKey, prefs: mine }); }, [myKey, mine, onPrefs]);
  // The key makes the OBS page follow later changes; the settings written next to it apply until the room sends them.
  const link = room ? `${location.origin}${location.pathname}?output&${[...params, ...(myKey ? [`me=${myKey}`] : [])].join('&')}#watch=${room}` : null;
  const copyLink = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); notify('송출 링크를 복사했습니다. OBS·XSplit 브라우저 소스에 붙여 넣으세요.'); } catch { notify('복사하지 못했습니다. 다시 시도해주세요.'); }
  };
  const toggle = (kind: OverlayKind) => setMine({ show: { ...mine.show, [kind]: !mine.show[kind] } });

  return <div className="scoreboard-page">
    <section className="panel sb-editor" data-viewer-ok={scorer ? '' : undefined}>
      {mode.kind === 'watch' && onScorerLogin && onScorerLogout ? <ScorerLogin scorer={scorer} onLogin={onScorerLogin} onLogout={onScorerLogout} notify={notify}/> : null}
      <div className="sb-editor-head">
        <div><h2>스코어보드</h2>
          <div className="segmented sb-tabs" role="group" aria-label="세트" data-viewer-ok>{SB_SETS.map(id => <button key={id} type="button" className={tab === id ? 'selected' : ''} aria-pressed={tab === id} onClick={() => setTab(id)}>{SB_SET_LABEL[id]}{sb.onAir === id ? <span className="sb-onair-dot" title="송출 중인 세트"/> : null}</button>)}</div>
        </div>
        {!viewer ? <div className="sb-actions">
          {sb.onAir !== tab ? <button className="button primary" onClick={() => edit(b => ({ ...b, onAir: tab }), `${SB_SET_NAME[tab]} 송출`)}><Radio size={15}/> {SB_SET_NAME[tab]} 송출</button> : <span className="count-pill sb-onair-pill"><Radio size={13}/> {SB_SET_NAME[tab]} 송출 중</span>}
          <button className={`button sb-bulk-button${bulk ? ' on' : ''}`} aria-pressed={!!bulk} onClick={() => setBulk(bulk ? null : { a: '', map: '', b: '', chat: '' })}><ClipboardPaste size={15}/> 일괄 입력</button>
          <button className="button" onClick={clearSet}><RotateCcw size={15}/> 비우기</button>
        </div> : sb.onAir === tab ? <span className="count-pill sb-onair-pill"><Radio size={13}/> {SB_SET_NAME[tab]} 송출 중</span> : null}
      </div>

      <div className="sb-meta">
        <label className="sb-field">{setLabel} 제목<input maxLength={40} readOnly={viewer} value={sb.titles[tab]} onChange={e => edit(b => ({ ...b, titles: { ...b.titles, [tab]: e.target.value } }))}/></label>
        <div className="sb-setscore" aria-label="세트 스코어">
          <span className="sb-field-label">세트 스코어</span>
          {order.map(t => <div key={t} className={`sb-stepper sb-${t}`}>
            <span>{s.teams[t]}</span>
            {!viewer ? <button className="icon-button" aria-label={`${s.teams[t]} 세트 스코어 빼기`} disabled={sb.setScore[t] === 0} onClick={() => setScore(t, -1)}><Minus size={14}/></button> : null}
            <b>{sb.setScore[t]}</b>
            {!viewer ? <button className="icon-button" aria-label={`${s.teams[t]} 세트 스코어 더하기`} onClick={() => setScore(t, 1)}><Plus size={14}/></button> : null}
          </div>)}
        </div>
      </div>

      {bulk && !viewer ? <div className="sb-bulk">
        <label className="sb-chat">배틀넷 채팅 붙여넣기
          <textarea rows={3} placeholder={'[2. ||||] kimsabuho: 재호 현제 병구 일장 홍구\n[2. ||||] jd2321232: 제동 명운 지성 영진 정우'} value={bulk.chat} onChange={e => pasteChat(e.target.value)}/>
        </label>
        {chatFound ? chatFound.A || chatFound.B
          ? <div className="sb-chat-result ok">{order.map(t => <p key={t}><b>{s.teams[t]}</b>{chatFound[t] ? chatFound[t]!.join(' · ') : '찾지 못함 (지금 엔트리 유지)'}</p>)}</div>
          : <p className="sb-chat-result">엔트리를 찾지 못했습니다. 선수 이름이 이번 세션 참가자와 같은지 확인해주세요.</p> : null}
        <label className="sb-chat">맵
          <textarea rows={2} placeholder="녹아 컬러 오디 백룸 옥타 아이 애티 (맵 추첨의 순서 복사를 그대로 붙여 넣어도 됩니다)" value={bulk.map} onChange={e => setBulk({ ...bulk, map: e.target.value })}/>
        </label>
        <p>비워 둔 칸은 지금 입력된 내용이 그대로 남습니다. 엔트리 먼저 넣고 맵은 나중에 넣어도 됩니다.</p>
        <div className="sb-bulk-actions"><button className="button" onClick={() => setBulk(null)}>취소</button><button className="button primary" disabled={!bulk.a.trim() && !bulk.map.trim() && !bulk.b.trim()} onClick={applyBulk}>적용</button></div>
      </div> : null}

      <datalist id="sb-game-colors">{GAME_COLORS.map(c => <option key={c} value={c}/>)}</datalist>
      <table className="sb-table">
        <thead><tr><th>#</th><th className={`sb-${order[0]}`}>{s.teams[order[0]]}</th><th>맵</th><th className={`sb-${order[1]}`}>{s.teams[order[1]]}</th><th>승리</th>{!viewer ? <th aria-label="삭제"/> : null}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} data-current={view.rows[i]?.current && sb.onAir === tab || undefined}>
          <td className="sb-no">{rows.length === 1 ? 'A' : i + 1}</td>
          <td><div className="sb-cell"><ComboCell label={`${i + 1}경기 ${s.teams[order[0]]} 선수`} options={playerOptions(order[0])} readOnly={viewer} value={r[key(order[0])]} onChange={v => cell(i, key(order[0]), v)} onPasteMany={vs => pasteMany(i, key(order[0]), vs)}/>{posInput(i, order[0], r)}</div></td>
          <td><ComboCell label={`${i + 1}경기 맵`} options={mapOptions} readOnly={viewer} maxLength={2} value={r.map} onChange={v => cell(i, 'map', v)} onPasteMany={vs => pasteMany(i, 'map', vs)}/></td>
          <td><div className="sb-cell"><ComboCell label={`${i + 1}경기 ${s.teams[order[1]]} 선수`} options={playerOptions(order[1])} readOnly={viewer} value={r[key(order[1])]} onChange={v => cell(i, key(order[1]), v)} onPasteMany={vs => pasteMany(i, key(order[1]), vs)}/>{posInput(i, order[1], r)}</div></td>
          <td className="sb-win">{order.map(t => <button key={t} type="button" className={`sb-win-button sb-${t}${r.winner === t ? ' on' : ''}`} aria-pressed={r.winner === t} disabled={viewer || !(r.a.trim() && r.b.trim())} title={`${(t === 'A' ? r.a : r.b) || s.teams[t]} 승리`} onClick={() => win(i, t)}>{(t === 'A' ? r.a : r.b).trim() || t}</button>)}</td>
          {!viewer ? <td><button className="icon-button" aria-label={`${i + 1}경기 줄 삭제`} disabled={rows.length <= 1} onClick={() => setRows(rows.filter((_, j) => j !== i), `${setLabel} ${i + 1}경기 줄 삭제`)}><X size={14}/></button></td> : null}
        </tr>)}</tbody>
      </table>
      {!viewer && rows.length < SB_MAX_ROWS ? <button className="button sb-add-row" onClick={() => setRows([...rows, emptyRow()], `${setLabel} 경기 줄 추가`)}><Plus size={15}/> 경기 추가</button> : null}
    </section>

    <section className="panel sb-side">
      <div className="sb-side-head"><h2>내 송출 설정</h2></div>
      <div data-viewer-ok><Picker label="기준 선수" value={base} onChange={setBase}
        placeholder={{ value: '', label: `기준 없음 (${s.teams.A} 왼쪽)` }}
        groups={[...(['A', 'B'] as Team[]).map(t => ({ label: s.teams[t], options: teamPlayers(t).map(p => ({ value: p.name, race: p.race })) })),
          ...(base && !s.players.some(p => p.active && p.name === base) ? [{ label: '이번 세션에 없음', options: [{ value: base }] }] : [])]}/></div>
      <p className="control-note">기준 선수의 팀이 왼쪽에 <b>{base ? `${givenName(base)}팀` : s.teams.A}</b>으로 나옵니다. 방송하는 사람마다 자기 이름을 고르고 링크를 복사하면 됩니다.</p>

      <div className="sb-onair-row" data-viewer-ok>
        {(['score', 'entry'] as OverlayKind[]).map(kind => <button key={kind} type="button" role="switch" aria-checked={mine.show[kind]} className={`button sb-switch${mine.show[kind] ? ' on' : ''}`} onClick={() => toggle(kind)}>{kind === 'score' ? '스코어보드' : '엔트리표'} <b>{mine.show[kind] ? 'ON' : 'OFF'}</b></button>)}
      </div>
      {mine.show.entry ? <div className="sb-styles" role="group" aria-label="엔트리표 세트" data-viewer-ok>
        <span className="sb-field-label">엔트리표 세트 <small>진행에 맞춰 나오고, 끈 세트는 빠집니다</small></span>
        <div className="sb-onair-row">{BOARD_SETS.map(id => { const on = mine.sets.includes(id), last = on && mine.sets.length === 1;
          return <button key={id} type="button" role="switch" aria-checked={on} disabled={last} title={last ? '한 세트는 켜 두어야 합니다. 엔트리표를 끄려면 엔트리표 OFF를 누르세요.' : undefined} className={`button sb-switch${on ? ' on' : ''}`} onClick={() => setMine({ sets: on ? mine.sets.filter(x => x !== id) : BOARD_SETS.filter(x => x === id || mine.sets.includes(x)) })}>{SB_SET_LABEL[id]} <b>{on ? 'ON' : 'OFF'}</b></button>; })}</div>
      </div> : null}
      <div className="sb-styles" role="group" aria-label="디자인" data-viewer-ok>
        <span className="sb-field-label">디자인</span>
        <div className="sb-style-list">{SB_STYLES.map(st => <button key={st} type="button" className={`sb-style-chip${view.style === st ? ' selected' : ''}`} aria-pressed={view.style === st} onClick={() => setMine({ style: st })}>{SB_STYLE_LABEL[st]}</button>)}</div>
      </div>
      <button className="button primary sb-copy-link" data-viewer-ok disabled={!link} onClick={() => void copyLink()}><Copy size={15}/> 내 송출 링크 복사</button>
      <p className="control-note">{link ? 'OBS는 소스 추가 → 브라우저, XSplit은 웹페이지 소스에 붙여 넣고 크기를 게임 화면과 같게(예: 1920×1080) 맞추면 스코어보드가 미니맵 위, 엔트리표가 콘솔 왼쪽에 딱 맞게 들어갑니다. 배경은 투명합니다.' : !kinds.length ? '스코어보드와 엔트리표가 모두 꺼져 있습니다. 하나 이상 켜야 링크를 만들 수 있습니다.' : '송출 링크는 진행자 로그인(실시간 방)에서 만들 수 있습니다.'}{link && !kinds.length ? ' 지금은 스코어보드와 엔트리표가 모두 꺼져 있어 아무것도 나오지 않습니다.' : ''}</p>
      <p className="control-note">여기 설정은 내 방송에만 적용되고, 링크를 한 번 붙여 두면 바꿀 때마다 OBS에 바로 반영됩니다. 링크를 다시 복사할 필요가 없습니다.</p>
    </section>

    {/* The broadcast at a glance, left to right: where the overlays sit on a 1920×1080 screen, then each at actual size. */}
    <section className="panel sb-previews" aria-label="송출 미리보기">
      <div className="sb-side-head"><h2>송출 미리보기</h2></div>
      <div className="sb-preview-row">
        <figure className="sb-preview-item sb-preview-layout"><figcaption className="sb-field-label">화면 배치 (1920×1080)</figcaption><div className="sb-layout-preview"><OverlayStage v={view} kinds={kinds} hud/></div></figure>
        {mine.show.score ? <figure className="sb-preview-item"><figcaption className="sb-field-label">스코어보드 · 실제 크기</figcaption><div className="sb-preview-stage" style={STAGE}><ScoreBug v={view}/></div></figure> : null}
        {mine.show.entry ? <figure className="sb-preview-item"><figcaption className="sb-field-label">엔트리표 · 실제 크기</figcaption><div className="sb-preview-stage" style={STAGE}><EntryBoards v={view}/></div></figure> : null}
      </div>
    </section>
  </div>;
}
