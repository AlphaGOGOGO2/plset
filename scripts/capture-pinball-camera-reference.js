async(page)=>page.evaluate(()=>{
 const scenarios=[
  {name:'descent',initial:{x:13,y:2},zoom:1,frames:120,zones:[]},
  {name:'finish',initial:{x:13,y:108},zoom:1,frames:200,zones:[]},
  {name:'pair-switch',initial:{x:13,y:20},zoom:1,frames:140,zones:[]},
  {name:'adjacent-zones',initial:{x:13,y:10},zoom:1,frames:140,zones:[{x:13,y:12,w:20,h:8},{x:13,y:20,w:16,h:8}]},
 ];
 const results=scenarios.map(s=>{
  const camera=new window.roulette._camera.constructor();camera.initializePosition(s.initial,s.zoom);camera.startFollowingMarbles();
  const objects=['a','b','c'].map(id=>({id,x:13,y:2,get position(){return {x:this.x,y:this.y};}})),frames=[];
  for(let i=0;i<s.frames;i++){
   let balls,intensity=0,focusOnRival=false;
   if(s.name==='descent')balls=[{id:'a',x:12,y:2+i*.18},{id:'b',x:14,y:3+i*.18}];
   else if(s.name==='finish'){balls=[{id:'a',x:13,y:108+i*.025},{id:'b',x:12.5,y:107+i*.025}];intensity=Math.max(0,1-Math.abs(112-balls[0].y)/5);}
   else if(s.name==='pair-switch'){balls=[{id:'a',x:12,y:20+i*.08},{id:'b',x:14,y:21+i*.08},{id:'c',x:17,y:19+i*.12}];if(i>=60)balls=[balls[2],balls[0],balls[1]];}
   else balls=[{id:'a',x:13,y:10+i*.1},{id:'b',x:14,y:9+i*.1}];
   const marbles=balls.map(b=>{const o=objects.find(o=>o.id===b.id);Object.assign(o,b);return o;});
   camera.update({marbles,stage:{cameraZones:s.zones},intensity,targetIndex:0,focusOnRival,viewSize:{x:1600/60,y:900/60}});
   frames.push({balls,intensity,focusOnRival,expected:{x:camera.x,y:camera.y,zoom:camera.zoom}});
  }
  return {...s,frames};
 });
 return {source:'https://lazygyu.github.io/roulette/',captured:'2026-10-28',fps:60,viewSize:{x:1600/60,y:900/60},scenarios:results};
})
