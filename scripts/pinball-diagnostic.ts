import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createPinball,configurePinballBinary} from '../src/pinball';
const require=createRequire(import.meta.url);configurePinballBinary(readFileSync(require.resolve('box2d-wasm/dist/umd/Box2D.simd.wasm')));
for(const map of [0,1,2,3]) for(const count of [1,3,10,15,25,60]) for(const seed of [1,42,98765]){
const race=await createPinball(Array.from({length:count},(_,i)=>({id:String(i),label:String(i)})),seed,map);
while(race.tick<60000&&race.results.length<count)race.step();
if(race.results.length<count)console.log(JSON.stringify({map,count,seed,tick:race.tick,left:race.marbles.filter(m=>!race.done.has(m.item.id)).slice(0,4).map(m=>({id:m.item.id,x:m.x,y:m.y,d:m.distance,stuck:m.stuck}))}));race.dispose();}
