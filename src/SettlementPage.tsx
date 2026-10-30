import { Download, Trophy } from 'lucide-react';
import { Portrait, TeamCard } from './components';
import { number, settlement, settlementFileName, settlementText, teamMembers, type Session, type Team } from './domain';
import { saveText } from './saveText';

const signed = (n: number) => `${n > 0 ? '+' : ''}${number(n)}개`;

type Commit = (update: (s: Session) => Session, label?: string, history?: boolean) => void;
export default function SettlementPage({ s, commit, notify }: { s: Session; commit: Commit; notify: (text: string) => void }) {
  // Picks live in the session so they autosave, sync to other windows and travel with an exported session file.
  const winner: Team | null = s.settlement?.winner ?? (s.score.A > s.score.B ? 'A' : s.score.B > s.score.A ? 'B' : null), baseId = s.settlement?.baseId;
  const setWinner = (team: Team) => commit(v => ({ ...v, settlement: { ...v.settlement, winner: team } }), `정산 이긴 팀 · ${s.teams[team]}`, false);
  const setBaseId = (id: string) => commit(v => ({ ...v, settlement: { ...v.settlement, baseId: id } }), undefined, false);
  const result = settlement(s.players, winner ?? 'A', s.teamSize, baseId);
  const exportMemo = async () => {
    if (!result.base) return;
    const name = settlementFileName(result.base.name);
    try { const done = await saveText(name, settlementText(result)); if (done) notify(`${name} 파일을 ${done === 'saved' ? '저장' : '내보냈'}습니다.`); }
    catch { notify('파일 저장에 실패했습니다.'); }
  };
  return <section className="settlement-page" aria-label="경기 정산">
    <div className="patrons-heading"><h1>정산</h1></div>
    <section className="settlement-winner" aria-label="이긴 팀 선택">
      <div className="settlement-winner-head"><h2>이긴 팀 선택</h2><span>이긴 팀 카드를 누르세요.</span></div>
      <div className="settlement-teams" role="radiogroup" aria-label="이긴 팀">{(['A', 'B'] as const).map(team =>
        // The roster card holds sections, so the picker is a radio-role wrapper rather than a <button>.
        <div key={team} role="radio" tabIndex={0} aria-checked={winner === team} aria-label={`${s.teams[team]} 승리`} className={`settlement-team-pick${winner === team ? ' selected' : ''}`}
          onClick={() => setWinner(team)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setWinner(team); } }}>
          <TeamCard s={s} team={team}/>
          <span className="settlement-pick-badge"><Trophy size={14}/> {winner === team ? '승리' : '승리로 선택'}</span>
        </div>)}</div>
    </section>
    <div className="settlement-summary">
      <section className="panel"><span>토탈 펀딩</span><strong>{number(result.total)}<small>개</small></strong>
        <div className="settlement-team-totals">{(['A', 'B'] as const).map(team => { const sum = teamMembers(s.players, team).reduce((total, p) => total + p.amount, 0);
          return <span key={team} className={winner === team ? 'won' : ''}>{s.teams[team]} <b>{number(sum)}개</b> <small>두당 {number(Math.floor(sum / s.teamSize))}개</small></span>; })}</div>
      </section>
      <section className="panel"><span>두당 펀딩 · {s.teamSize}명 기준</span><strong>{number(result.per)}<small>개</small></strong>{result.remainder ? <em>나머지 {number(result.remainder)}개</em> : null}</section>
    </div>
    {!winner ? <p className="settlement-empty">경기가 끝나면 이긴 팀을 선택하세요.</p> : <section className="panel settlement-list" aria-label={`${s.teams[winner]} 정산`}>
      <header><h2>{s.teams[winner]} · 승리</h2><span>{result.winners.length}명</span>
        {result.base ? <button type="button" className="button settlement-export" onClick={() => void exportMemo()} title={`${result.base.name} 기준 정산을 메모장 파일로 저장`}><Download size={14}/> 내보내기</button> : null}</header>
      {result.winners.length && result.base ? <>
        <div className="settlement-base"><span>누구 기준으로 볼까요?</span>
          <div className="segmented" role="group" aria-label="기준 선수">{result.winners.map(({ player }) => <button key={player.id} type="button" className={player === result.base ? 'selected' : ''} aria-pressed={player === result.base} onClick={() => setBaseId(player.id)}>{player.name}</button>)}</div>
        </div>
        <table>
          <thead><tr><th>선수</th><th>받아온 펀딩 · 두당</th><th>차액 · {result.base.name} 기준</th><th>반띵</th></tr></thead>
          <tbody>{(() => {
            // Team totals sit first and stay quiet (grey band, no colour, no sign): context for the rows, not the thing to act on.
            const sum = (pick: (w: typeof result.winners[number]) => number) => result.winners.reduce((total, w) => total + pick(w), 0);
            return <tr className="sum"><td>{s.teams[winner]} 합계</td><td>두당 {number(sum(w => w.per))}개</td><td>{number(Math.abs(sum(w => w.diff)))}개</td><td className="half">{number(Math.abs(sum(w => w.half)))}개</td></tr>;
          })()}{result.winners.map(({ player, per, diff, half }) => {
            const tone = diff > 0 ? 'receive' : diff < 0 ? 'send' : '', isBase = player === result.base;
            return <tr key={player.id} className={isBase ? 'base' : ''}>
              <td><span className="settlement-player"><Portrait player={player} small/>{player.name}</span></td>
              <td>두당 {number(per)}개</td>
              <td className={tone}>{isBase ? <span className="settlement-none">기준</span> : <b>{signed(diff)}</b>}</td>
              <td className={`half ${tone}`}>{isBase ? <span className="settlement-none">—</span> : <b>{signed(half)}</b>}</td>
            </tr>;
          })}</tbody>
        </table>
        <p className="settlement-hint">{result.base.name} 기준: <b className="send">빨간 −</b>는 {result.base.name}이(가) 보낼 개수, +는 받을 개수입니다. 반띵은 차액의 절반(홀수면 소수점 버림)입니다.</p>
      </> : <p className="settlement-empty">{s.teams[winner]}에 편성된 선수가 없습니다.</p>}
    </section>}
  </section>;
}
