import {writeFileSync} from 'node:fs';
const before=process.argv.includes('--before'),{createRace,STEP,tracks}=await import(before?'../output/race-balance/before.ts':'../src/race.ts');
const rows=[];
for(let track=0;track<tracks.length;track++)for(const seed of [7,42]){
 const race=await createRace(Array.from({length:10},(_,i)=>({id:`p${i}`,label:`선수${i+1}`})),seed,track);race.start();
 let early='',mid='',late='',last='',changes=0,lateChanges=0,largestGap=0;
 while(race.tick<180/STEP&&race.results.length<10){
  race.step();if(race.tick%30||race.results.length)continue;
  const live=[...race.marbles].sort((a,b)=>b.progress-a.progress),lead=live[0],progress=lead.progress/race.finish;
  if(progress<.2)continue;
  if(!early)early=lead.item.id;if(progress>=.5&&!mid)mid=lead.item.id;if(progress>=.75&&!late)late=lead.item.id;
  if(last&&last!==lead.item.id&&lead.progress-live.find(m=>m.item.id===last)!.progress>1){changes++;if(progress>.5)lateChanges++;last=lead.item.id;}else if(!last)last=lead.item.id;
  if(progress>.3&&progress<.85)largestGap=Math.max(largestGap,lead.progress-live[1].progress);
 }
 const row={track,seed,early,mid,late,winner:race.results[0],changes,lateChanges,largestGap:+largestGap.toFixed(1),finished:race.results.length,seconds:+(race.tick*STEP).toFixed(1)};rows.push(row);console.log(JSON.stringify(row));race.dispose();
}
const result={runs:rows.length,earlyLeaderWins:rows.filter(r=>r.early===r.winner).length,midLeaderWins:rows.filter(r=>r.mid===r.winner).length,lateLeaderWins:rows.filter(r=>r.late===r.winner).length,averageLeadChanges:rows.reduce((n,r)=>n+r.changes,0)/rows.length,averageLateLeadChanges:rows.reduce((n,r)=>n+r.lateChanges,0)/rows.length,rows};
writeFileSync(`output/race-balance/${before?'before':'after'}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
