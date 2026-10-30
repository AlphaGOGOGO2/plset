import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MATCH_MAPS, mapSchedule, allocateTeams, createSession, patronFunding, funding, clockRemaining, shuffle, validateSession, setAmount, setTeam, rankByFunding, teamMembers, givenName, withTeamNames, spectatorText, setNote, sessionReport, reportFileName, addMap, removeMap, sessionMaps, participantGroups, swapTie, settlement, settlementText, settlementFileName } from './domain';
import { ROSTER, searchRoster } from './roster';
test('별명·줄인 이름·초성으로 등록 선수를 검색한다',()=>{
  assert.equal(searchRoster('현제')[0].name,'변현제');
  assert.equal(searchRoster('현제')[0].race,'P');
  assert.ok(searchRoster('현제')[0].photo);
  assert.equal(searchRoster('홍구')[0].name,'임홍규');
  assert.equal(searchRoster('짭제')[0].name,'박상현');
  assert.equal(searchRoster('ㅂㅎㅈ')[0].name,'변현제');
  assert.equal(new Set(ROSTER.map(p=>p.id)).size,ROSTER.length);
  assert.ok(ROSTER.every(p=>['god','king','jack','joker','spade','0'].includes(p.tier)));
});
test('5:5 총 1000개는 두당 200개이며 비참가자 펀딩은 제외한다',()=>{
  const s=createSession(); s.players[0].amount=1000;s.players[1].amount=500;s.players[1].active=false;
  assert.deepEqual(funding(s.players,5),{total:1000,per:200,remainder:0});
});
test('나눠떨어지지 않는 후원은 나머지를 보존한다',()=>{
  const s=createSession();s.players[0].amount=1003;
  assert.deepEqual(funding(s.players,5),{total:1003,per:200,remainder:3});
});
test('무작위 팀은 중복 없이 정확하게 편성되고 인원이 다르면 거부한다',()=>{
  const s=createSession();const p=allocateTeams(s.players,5,42);
  assert.equal(p.filter(p=>p.team==='A').length,5);assert.equal(p.filter(p=>p.team==='B').length,5);
  assert.equal(new Set(p.map(p=>p.id)).size,10);assert.equal(s.players[0].team,null);
  assert.throws(()=>allocateTeams(s.players.slice(1),5,42));
});
test('같은 시드의 추첨은 재현되며 입력을 바꾸지 않는다',()=>{
  const values=[1,2,3,4,5];assert.deepEqual(shuffle(values,9),shuffle(values,9));assert.deepEqual(values,[1,2,3,4,5]);
});
test('타이머는 틱 수가 아니라 절대 마감 시각으로 계산한다',()=>{
  assert.equal(clockRemaining({label:'',remaining:60000,deadline:100000},75000),25000);
  assert.equal(clockRemaining({label:'',remaining:60000,deadline:100000},150000),0);
});
test('가져오기 검증은 잘못된 후원·중복 ID·타이머를 거부한다',()=>{
  const s=createSession();assert.equal(validateSession(s),s);
  assert.throws(()=>validateSession({...s,players:[{...s.players[0],amount:-1}]}));
  assert.throws(()=>validateSession({...s,players:[s.players[0],s.players[0]]}));
  assert.throws(()=>validateSession({...s,timer:{...s.timer,deadline:'bad'}}));
});


test('위너스는 7경기 확정 뒤 별도 추첨의 첫 두 맵을 8·9경기에 배정하고 중복 맵을 보존한다',()=>{
  const s=createSession(),opening=MATCH_MAPS.map(m=>m.id);
  s.draw={mode:'pinball',variant:'maps',mapFormat:'winners',seed:42,startedAt:1,rank:7,items:MATCH_MAPS,results:opening,finishedAt:2};
  validateSession(s);
  s.draw={...s.draw,mapOpening:opening,rank:2,results:[],finishedAt:null};validateSession(s);
  s.draw={...s.draw,results:[opening[6],opening[0]],finishedAt:3};validateSession(s);
  assert.deepEqual(mapSchedule(s.draw),[...opening,opening[6],opening[0]]);
  for(const invalid of [
    {...s.draw,mapFormat:'proleague'},
    {...s.draw,mapOpening:opening.slice(0,6)},
    {...s.draw,mapOpening:opening.map(()=>opening[0])},
    {...s.draw,results:opening.slice(0,3)},
    {...s.draw,results:[opening[0]]},
    {...s.draw,rank:7},
  ])assert.throws(()=>validateSession({...s,draw:invalid}));
  const legacy={...s.draw,mapFormat:undefined,mapOpening:undefined,rank:7,results:opening};
  assert.doesNotThrow(()=>validateSession({...s,draw:legacy}));
});



test('기존 맵 약칭을 풀네임으로 바꾸면서 위너스 경기 순서와 반복 맵을 유지한다',()=>{
 const s=createSession(),oldNames=['컬러','오디','넉아','아이','백룸','옥타','에티'],ids=MATCH_MAPS.map(m=>m.id);
 s.draw={mode:'pinball',variant:'maps',mapFormat:'winners',mapOpening:[...ids].reverse(),seed:1,startedAt:1,rank:2,items:ids.map((id,i)=>({id,label:oldNames[i]})),results:[ids[0],ids[3]],finishedAt:2};
 const result=validateSession(s);assert.deepEqual(result.draw!.items.map(i=>i.label),['컬러리스페이트','오디세이','녹아웃','아이올로스','백룸','옥타곤','애티튜드']);
 assert.deepEqual(mapSchedule(result.draw!),[...[...ids].reverse(),ids[0],ids[3]]);
});


test('귀인 펀딩은 같은 닉네임의 여러 기록을 합산하고 현재 팀 인원으로 두당과 잔여를 계산한다',()=>{
 const s=createSession();s.patrons=[{id:'a',nickname:'귀인',amount:1000,note:''},{id:'b',nickname:'귀인',amount:503,note:'추가 후원'}];
 assert.deepEqual(patronFunding(s.patrons,5),{total:1503,per:300,remainder:3});
 assert.deepEqual(patronFunding(s.patrons,3),{total:1503,per:501,remainder:0});
 assert.deepEqual(patronFunding(s.patrons.slice(1),5),{total:503,per:100,remainder:3});
 assert.equal(funding(s.players,5).total,0);
 const restored=validateSession(JSON.parse(JSON.stringify(s)));assert.deepEqual(restored.patrons,s.patrons);
});

test('기존 세션에는 빈 귀인 목록을 추가하고 잘못된 귀인 기록은 거부한다',()=>{
 const s=createSession(),legacy=JSON.parse(JSON.stringify(s));delete legacy.patrons;
 assert.deepEqual(validateSession(legacy).patrons,[]);
 const valid={id:'x',nickname:'후원자',amount:1000,note:'응원'};
 for(const patrons of [null,{},[{...valid,nickname:' '}],[{...valid,amount:-1}],[{...valid,amount:1.5}],[{...valid,amount:100000001}],[{...valid,note:'x'.repeat(201)}],[valid,valid]])assert.throws(()=>validateSession({...s,patrons}));
});
test('펀딩 순위는 금액 내림차순, 같은 금액이면 나중에 바뀐 선수가 아래로 간다',()=>{
  const s=createSession();
  let players=setAmount(s.players,s.players[5].id,200,1000);
  players=setAmount(players,s.players[1].id,200,2000);
  players=setAmount(players,s.players[8].id,500,3000);
  assert.deepEqual(rankByFunding(players).slice(0,3).map(p=>p.id),[s.players[8].id,s.players[5].id,s.players[1].id]);
  players=setAmount(players,s.players[5].id,200,4000);
  assert.deepEqual(rankByFunding(players).slice(1,3).map(p=>p.id),[s.players[1].id,s.players[5].id]);
  assert.deepEqual(rankByFunding(s.players).map(p=>p.id),s.players.map(p=>p.id));
});
test('팀 슬롯은 배정한 순서대로 채워진다',()=>{
  const s=createSession();
  let players=setTeam(s.players,s.players[7].id,'A',1000);
  players=setTeam(players,s.players[2].id,'A',2000);
  players=setTeam(players,s.players[0].id,'A',3000);
  assert.deepEqual(teamMembers(players,'A').map(p=>p.id),[s.players[7].id,s.players[2].id,s.players[0].id]);
  players=setTeam(players,s.players[7].id,null,4000);
  players=setTeam(players,s.players[7].id,'A',5000);
  assert.deepEqual(teamMembers(players,'A').map(p=>p.id),[s.players[2].id,s.players[0].id,s.players[7].id]);
  assert.equal(teamMembers(players,'B').length,0);
});
test('팀 이름은 처음 들어간 선수의 성을 뺀 이름을 따르고 직접 지은 이름은 유지한다',()=>{
  assert.equal(givenName('임홍규'),'홍규');assert.equal(givenName('유영진'),'영진');assert.equal(givenName('남궁민수'),'민수');assert.equal(givenName('초롱'),'초롱');assert.equal(givenName('Flash'),'Flash');
  const s=createSession();const hong=s.players.find(p=>p.name==='임홍규')!,young=s.players.find(p=>p.name==='유영진')!,song=s.players.find(p=>p.name==='송병구')!;
  let next=withTeamNames({...s,players:setTeam(s.players,hong.id,'A',1000)});
  assert.equal(next.teams.A,'홍규팀');assert.equal(next.teams.B,'TEAM B');
  next=withTeamNames({...next,players:setTeam(next.players,young.id,'A',2000)});
  assert.equal(next.teams.A,'홍규팀');
  next=withTeamNames({...next,players:setTeam(next.players,hong.id,null,3000)});
  assert.equal(next.teams.A,'영진팀');
  next=withTeamNames({...next,players:setTeam(next.players,young.id,null,4000)});
  assert.equal(next.teams.A,'TEAM A');
  next=withTeamNames({...next,teams:{...next.teams,B:'우리팀'},players:setTeam(next.players,song.id,'B',5000)});
  assert.equal(next.teams.B,'우리팀');
});
test('관전 복사는 펀딩 상위 6명의 성을 뺀 이름을 순위대로 잇는다',()=>{
  const s=createSession();let players=s.players;
  const amounts=[['임홍규',500],['김정우',400],['조일장',300],['김명운',300],['이재호',200],['유영진',100],['김지성',50]] as const;
  amounts.forEach(([name,amount],i)=>{players=setAmount(players,players.find(p=>p.name===name)!.id,amount,1000+i);});
  assert.equal(spectatorText(players),'관전 : 홍규-정우-일장-명운-재호-영진');
  assert.equal(spectatorText(players.map(p=>p.name==='임홍규'?{...p,active:false}:p)),'관전 : 정우-일장-명운-재호-영진-지성');
});
test('참가자 비고는 빈 문자열이면 지워지고 200자를 넘으면 거부한다',()=>{
  const s=createSession();const id=s.players[0].id;
  assert.equal(setNote(s.players,id,'룸따개')[0].note,'룸따개');
  assert.equal(setNote(setNote(s.players,id,'룸따개'),id,'')[0].note,undefined);
  assert.equal(validateSession({...s,players:setNote(s.players,id,'메모')}).players[0].note,'메모');
  assert.throws(()=>validateSession({...s,players:setNote(s.players,id,'x'.repeat(201))}));
});
test('텍스트 보고서는 참가자·펀딩·팀·귀인·메모를 담고 파일명은 MMDDPL이다', () => {
  const now=new Date(2026,9,26);
  assert.equal(reportFileName(now),'1026PL.txt');
  let s=createSession();const hong=s.players.find(p=>p.name==='임홍규')!,young=s.players.find(p=>p.name==='유영진')!;
  s={...s,players:setTeam(setTeam(setAmount(setAmount(s.players,hong.id,10000,1),young.id,5000,2),hong.id,'A',3),young.id,'B',4),patrons:[{id:'p1',nickname:'후원자A',amount:1000,note:''},{id:'p2',nickname:'후원자B',amount:3000,note:'응원'}]};
  s=withTeamNames(s);
  const text=sessionReport(s,now),lines=text.split('\r\n');
  assert.equal(lines[0],'PL SET 진행 기록 · 2026-10-26');
  assert.ok(lines.includes('[참가자] 10명'));
  assert.ok(lines.some(l=>l.startsWith('Z 저그 4명: 임홍규')));
  assert.ok(lines.includes('[펀딩 현황] 두당 3,000개 · 토탈 15,000개'));
  assert.ok(lines.includes('01. 임홍규 (Z) · 두당 2,000개 · 토탈 10,000개 · 1위'));
  assert.ok(lines.some(l=>l.startsWith('관전 : 홍규-영진-')));
  assert.ok(lines.includes('[팀 편성] 홍규팀 vs 영진팀'));
  assert.ok(lines.includes('A 홍규팀 1/5: 임홍규'));
  assert.ok(lines.includes('[귀인 펀딩] 2건 · 토탈 4,000개 · 두당 800개'));
  assert.ok(lines.includes('01. 후원자B · 3,000개 · 응원'));
  assert.ok(lines.includes('[오늘의 진행]'));
  assert.ok(lines.some(l=>l.startsWith('10. ')&&l.endsWith('룸따개')));
});
test('맵 목록은 추가·삭제할 수 있고 빈 이름·중복·30개 초과를 거부하며 기존 세션은 기본 7개를 받는다',()=>{
  let s=createSession();
  assert.equal(sessionMaps(s).length,7);
  s=addMap(s,' 네오 실피드 ');
  assert.equal(sessionMaps(s).length,8);assert.equal(sessionMaps(s)[7].label,'네오 실피드');
  assert.throws(()=>addMap(s,'  '));assert.throws(()=>addMap(s,'네오 실피드'));assert.throws(()=>addMap(s,'x'.repeat(31)));
  s=removeMap(s,sessionMaps(s)[0].id);
  assert.equal(sessionMaps(s).length,7);assert.ok(!sessionMaps(s).some(m=>m.label==='컬러리스페이트'));
  assert.doesNotThrow(()=>validateSession(s));
  const legacy=JSON.parse(JSON.stringify(createSession()));delete legacy.maps;
  assert.equal(validateSession(legacy).maps!.length,7);
  assert.throws(()=>validateSession({...s,maps:[{id:'a',label:'같은 맵'},{id:'b',label:'같은 맵'}]}));
  let full=createSession();for(let i=0;i<23;i++)full=addMap(full,`맵 ${i}`);
  assert.throws(()=>addMap(full,'하나 더'));
});
test('맵 수가 달라도 위너스는 전체 맵 확정 뒤 재추첨 2개를 뒤에 붙인다',()=>{
  let s=createSession();for(const id of sessionMaps(s).slice(0,2).map(m=>m.id))s=removeMap(s,id);
  const maps=sessionMaps(s),opening=maps.map(m=>m.id);assert.equal(maps.length,5);
  s.draw={mode:'pinball',variant:'maps',mapFormat:'winners',seed:3,startedAt:1,rank:5,items:maps,results:opening,finishedAt:2};
  validateSession(s);
  s.draw={...s.draw,mapOpening:opening,rank:2,results:[opening[4],opening[4]].slice(0,1),finishedAt:null};validateSession(s);
  s.draw={...s.draw,results:[opening[4],opening[1]],finishedAt:3};validateSession(s);
  assert.equal(mapSchedule(s.draw).length,7);
  assert.throws(()=>validateSession({...s,draw:{...s.draw,mapOpening:opening.slice(0,4)}}));
  assert.throws(()=>validateSession({...s,draw:{...s.draw,items:maps.slice(0,1),mapOpening:undefined,rank:1,results:[opening[0]]}}));
});
test('참가자 그룹을 종족별·팀별로 나눈다',()=>{
  const s=createSession();
  const [hong,jung,jo,,jae]=s.players; // 임홍규 Z, 김정우 Z, 조일장 Z, 김명운 Z, 이재호 T
  let players=setTeam(s.players,hong.id,'A',1); players=setTeam(players,jung.id,'B',2); players=setTeam(players,jo.id,'A',3);
  players=players.map(p=>p.id===jae.id?{...p,active:false}:p);
  const session={...s,players,teams:{A:'홍구팀',B:'정우팀'}};
  const race=participantGroups(session,'race');
  assert.deepEqual(race.map(g=>g.key),['T','Z','P']);
  assert.deepEqual(race.map(g=>g.label),['테란','저그','프로토스']);
  assert.deepEqual(race.map(g=>g.players.length),[3,4,2]);
  assert.ok(race.every(g=>g.capacity===undefined));
  const team=participantGroups(session,'team');
  assert.deepEqual(team.map(g=>g.key),['A','B']);
  assert.deepEqual(team.map(g=>g.label),['홍구팀','정우팀']);
  assert.deepEqual(team[0].players.map(p=>p.name),['임홍규','조일장']);
  assert.deepEqual(team[1].players.map(p=>p.name),['김정우']);
  assert.deepEqual(team.map(g=>g.capacity),[5,5]);
});
test('같은 금액인 선수끼리만 순서를 바꿀 수 있다',()=>{
  const s=createSession();
  let players=setAmount(s.players,s.players[0].id,300,1); players=setAmount(players,s.players[1].id,300,2); players=setAmount(players,s.players[2].id,300,3); players=setAmount(players,s.players[3].id,100,4);
  const names=(list:typeof players)=>rankByFunding(list.filter(p=>p.active)).slice(0,4).map(p=>p.name);
  assert.deepEqual(names(players),['임홍규','김정우','조일장','김명운']);
  const moved=swapTie(players,s.players[2].id,'up');
  assert.deepEqual(names(moved),['임홍규','조일장','김정우','김명운']);
  assert.deepEqual(names(swapTie(moved,s.players[2].id,'up')),['조일장','임홍규','김정우','김명운']);
  assert.equal(swapTie(players,s.players[3].id,'up'),players);
  assert.equal(swapTie(players,s.players[0].id,'up'),players);
});
test('정산: 기준 선수의 두당과 팀원 두당의 차액을 보여준다',()=>{
  const p=(name:string,amount:number,team:'A'|'B',teamAt:number)=>({id:name,name,race:'P' as const,amount,team,active:true,teamAt});
  // 4명 팀: 총액 13200 → 두당 3300, 11200 → 2800, 7200 → 1800, 8000 → 2000
  const players=[p('김택용',13200,'A',1),p('이현제',11200,'A',2),p('김기석',7200,'A',3),p('김정우',8000,'A',4),p('임홍규',3600,'B',5),p('송병구',0,'B',6),{...p('휴식',500,'A',7),active:false}];
  const r=settlement(players,'A',4);
  assert.deepEqual([r.total,r.per,r.remainder],[43200,10800,0],'토탈은 활성 참가자 전원, 두당은 토탈 ÷ 팀 인원');
  assert.deepEqual(r.winners.map(w=>[w.player.name,w.per]),[['김택용',3300],['이현제',2800],['김정우',2000],['김기석',1800]]);
  assert.equal(r.base?.name,'김택용','기준을 고르지 않으면 두당이 가장 많은 선수');
  assert.deepEqual(r.winners.map(w=>w.diff),[0,-500,-1300,-1500],'기준 선수가 보내는 차액은 음수');
  assert.deepEqual(settlement(players,'A',4,'이현제').winners.map(w=>w.diff),[500,0,-800,-1000],'기준보다 두당이 많은 팀원에게서는 받으므로 양수');
  assert.deepEqual(r.winners.map(w=>w.half),[0,-250,-650,-750],'반띵은 차액의 절반');
  assert.deepEqual(settlement([p('가',4,'A',1),p('나',0,'A',2)],'A',4,'가').winners.map(w=>w.half),[0,0],'홀수 차액은 0 쪽으로 버리고 -0을 만들지 않는다');
  assert.equal(settlement(players,'A',4,'임홍규').base?.name,'김택용','이긴 팀이 아닌 선수를 기준으로 고르면 최다 두당으로 돌아간다');
  assert.equal(settlement([],'B',5).base,undefined);
});
test('정산 메모: 기준 선수가 받는 줄, 구분선, 보내는 줄 순서로 차액(반띵)을 적는다',()=>{
  const p=(name:string,per:number,teamAt:number)=>({id:name,name,race:'P' as const,amount:per*4,team:'A' as const,active:true,teamAt});
  const players=[p('정영재',3400,1),p('김택용',3300,2),p('변현제',2800,3),p('김정우',2000,4),p('김기석',1800,5)];
  assert.equal(settlementText(settlement(players,'A',4,'변현제')),'정영재->변현제 600(300)개\n김택용->변현제 500(250)개\n----------\n변현제->김기석 1,000(500)개\n변현제->김정우 800(400)개\n');
  assert.equal(settlementText(settlement(players,'A',4,'정영재')).includes('----------'),false,'받을 것이 없으면 구분선도 없다');
  assert.equal(settlementFileName('변현제',new Date(2026,9,30)),'261030프로리그 정산(변현제).txt');
});
test('세션의 정산 선택은 저장되고, 잘못된 값이면 그 선택만 버리고 세션은 불러온다',()=>{
  const kept=validateSession(JSON.parse(JSON.stringify({...createSession(),settlement:{winner:'B',baseId:'x'}})));
  assert.deepEqual(kept.settlement,{winner:'B',baseId:'x'});
  const dropped=validateSession(JSON.parse(JSON.stringify({...createSession(),settlement:{winner:'C'}})));
  assert.equal(dropped.settlement,undefined);
  assert.equal(validateSession(JSON.parse(JSON.stringify(createSession()))).settlement,undefined,'예전 세션 파일도 그대로 불러온다');
});
