import { useState } from 'react';
import { Trophy } from 'lucide-react';
import { Portrait, TeamCard } from './components';
import { number, settlement, type Session, type Team } from './domain';

const signed = (n: number) => `${n > 0 ? '+' : ''}${number(n)}개`;

export default function SettlementPage({ s }: { s: Session }) {
  const [winner, setWinner] = useState<Team | null>(s.score.A > s.score.B ? 'A' : s.score.B > s.score.A ? 'B' : null);
  const [baseId, setBaseId] = useState<string>();
  const result = settlement(s.players, winner ?? 'A', s.teamSize, baseId);
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
      <section className="panel"><span>토탈 펀딩</span><strong>{number(result.total)}<small>개</small></strong></section>
      <section className="panel"><span>두당 펀딩 · {s.teamSize}명 기준</span><strong>{number(result.per)}<small>개</small></strong>{result.remainder ? <em>나머지 {number(result.remainder)}개</em> : null}</section>
    </div>
    {!winner ? <p className="settlement-empty">경기가 끝나면 이긴 팀을 선택하세요.</p> : <section className="panel settlement-list" aria-label={`${s.teams[winner]} 정산`}>
      <header><h2>{s.teams[winner]} · 승리</h2><span>{result.winners.length}명</span></header>
      {result.winners.length && result.base ? <>
        <div className="settlement-base"><span>누구 기준으로 볼까요?</span>
          <div className="segmented" role="group" aria-label="기준 선수">{result.winners.map(({ player }) => <button key={player.id} type="button" className={player === result.base ? 'selected' : ''} aria-pressed={player === result.base} onClick={() => setBaseId(player.id)}>{player.name}</button>)}</div>
        </div>
        <table>
          <thead><tr><th>선수</th><th>받아온 펀딩 · 두당</th><th>차액 · {result.base.name} 기준</th></tr></thead>
          <tbody>{result.winners.map(({ player, per, diff }) => <tr key={player.id} className={player === result.base ? 'base' : ''}>
            <td><span className="settlement-player"><Portrait player={player} small/>{player.name}</span></td>
            <td>두당 {number(per)}개</td>
            <td className={diff > 0 ? 'receive' : diff < 0 ? 'send' : ''}>{player === result.base ? <span className="settlement-none">기준</span> : <b>{signed(diff)}</b>}</td>
          </tr>)}</tbody>
        </table>
        <p className="settlement-hint">{result.base.name} 기준: <b>−</b>는 {result.base.name}이(가) 보낼 차액, <b>+</b>는 받을 차액입니다.</p>
      </> : <p className="settlement-empty">{s.teams[winner]}에 편성된 선수가 없습니다.</p>}
    </section>}
  </section>;
}
