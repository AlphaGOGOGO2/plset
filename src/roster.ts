import data from './roster.json';
import type { Player, Race } from './domain';
export interface RosterPlayer {id:string;name:string;race:Race;tier:string;aliases:string[];photo:string|null}
export const ROSTER=data.players as RosterPlayer[];
export const ROSTER_DATE=data.updatedAt;
export const TIERS=[{id:'god',label:'갓'},{id:'king',label:'킹'},{id:'jack',label:'잭'},{id:'joker',label:'조커'},{id:'spade',label:'스페이드'},{id:'0',label:'0티어'}];
const byId=new Map(ROSTER.map(p=>[p.id,p]));
const normalize=(s:string)=>s.toLowerCase().replace(/[\s\-_]/g,'');
const CHO='ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
function initials(s:string){return [...s].map(c=>{const n=c.charCodeAt(0)-0xAC00;return n>=0&&n<=11171?CHO[Math.floor(n/588)]:c;}).join('');}
export function searchRoster(query:string):RosterPlayer[] {
  const q=normalize(query);if(!q)return ROSTER;
  return ROSTER.map(p=>{const names=[p.name,...p.aliases].map(normalize);const score=names.includes(q)?0:names.some(n=>n.startsWith(q))?1:names.some(n=>n.includes(q))?2:initials(p.name).includes(q)?3:99;return {p,score};}).filter(x=>x.score<99).sort((a,b)=>a.score-b.score||a.p.name.localeCompare(b.p.name,'ko')).map(x=>x.p);
}
export function rosterForPlayer(p:Pick<Player,'name'|'rosterId'>) {return (p.rosterId?byId.get(p.rosterId):undefined)??ROSTER.find(r=>r.name===p.name);}
export function portraitUrl(p:Pick<Player,'name'|'rosterId'>){const r=rosterForPlayer(p);return r?.photo?`${import.meta.env.BASE_URL}${r.photo}`:null;}
