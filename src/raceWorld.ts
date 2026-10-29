import * as T from 'three';
import { seeded } from './domain';
import { ROAD_HALF, RACE_THEMES, type Sample, type Track } from './race';

// Procedural scenery: all meshes and textures are authored locally; no network assets.
export function buildRaceWorld(scene: T.Scene, track: Track, samples: Sample[], theme: number, finish: number) {
  const random = seeded(9001 + theme), textures: T.Texture[] = [];
  const boxes = new T.BoxGeometry(1,1,1), cones = new T.ConeGeometry(1,1,7), rocks = new T.IcosahedronGeometry(1,0), mesas = new T.CylinderGeometry(.82,1,1,7);
  const bins = new Map<string,{geometry:T.BufferGeometry; material:T.MeshStandardMaterial; matrices:T.Matrix4[]}>();
  const dummy = new T.Object3D(), up = new T.Vector3(0,1,0);
  function instance(geometry:T.BufferGeometry, color:string, position:T.Vector3, scale:T.Vector3, rotation?:T.Quaternion, glow=0) {
    const key=geometry.uuid+color+glow;
    if(!bins.has(key)) bins.set(key,{geometry,material:new T.MeshStandardMaterial({color,roughness:.8,flatShading:true,emissive:color,emissiveIntensity:glow}),matrices:[]});
    dummy.position.copy(position);dummy.scale.copy(scale);dummy.quaternion.copy(rotation??new T.Quaternion());dummy.updateMatrix();bins.get(key)!.matrices.push(dummy.matrix.clone());
  }
  function bar(a:T.Vector3,b:T.Vector3,width:number,color:string,glow=0) { instance(boxes,color,a.clone().add(b).multiplyScalar(.5),new T.Vector3(width,a.distanceTo(b),width),new T.Quaternion().setFromUnitVectors(up,b.clone().sub(a).normalize()),glow); }
  function slab(q:Sample, lateral:number, width:number, length:number, color:string, lift=.04, depth=.05, glow=0) {
    const rotation=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(q.side,q.up,q.tangent.clone().negate()));
    instance(boxes,color,q.p.clone().addScaledVector(q.side,lateral).addScaledVector(q.up,lift),new T.Vector3(width,depth,length),rotation,glow);
  }
  const canvas=document.createElement('canvas'); canvas.width=256;canvas.height=256;
  const ctx=canvas.getContext('2d')!;
  ctx.fillStyle=track.road;ctx.fillRect(0,0,256,256);
  for(let i=0;i<1600;i++){ctx.fillStyle=`rgba(${theme===2?'255,255,255':'15,20,25'},${random()*.13})`;ctx.fillRect(random()*256,random()*256,1+random()*10,1);}
  if(theme===0){for(let y=0;y<256;y+=32){ctx.fillStyle='#302e2277';ctx.fillRect(0,y,256,3);ctx.fillStyle='#e5d5ab33';ctx.fillRect(0,y+4,256,1);for(const x of [12,244]){ctx.fillStyle='#292b28';ctx.fillRect(x,y+12,3,3);}}}
  else if(theme===5){for(let y=0;y<256;y+=28){ctx.strokeStyle='#704b3338';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,y);ctx.bezierCurveTo(70,y-12,180,y+16,256,y+4);ctx.stroke();}}
  else {ctx.strokeStyle=theme===2?'#f8fdff99':'#b5c7e82a';ctx.lineWidth=2;ctx.strokeRect(1,1,254,254);if(theme===1){ctx.strokeRect(18,18,220,220);}}
  const texture=new T.CanvasTexture(canvas);texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4;textures.push(texture);
  const roadMaterial=new T.MeshStandardMaterial({map:texture,roughness:theme===2?.3:.85,metalness:theme===1?.25:0,side:T.DoubleSide});
  const roadPositions:number[]=[],roadUvs:number[]=[],roadIndices:number[]=[];
  const deck=theme===0?'#655139':theme===2?'#aac4d6':theme===4?'#332b32':theme===5?'#84583d':'#303b54';
  for(let i=0;i<samples.length-1;i++) {
    const a=samples[i],b=samples[i+1];if(a.gap||b.gap)continue;
    const base=roadPositions.length/3;
    for(const [q,sign] of [[a,-1],[a,1],[b,1],[b,-1]] as const){const p=q.p.clone().addScaledVector(q.side,sign*ROAD_HALF);roadPositions.push(p.x,p.y,p.z);roadUvs.push((sign+1)/2,q.s/(theme===0?5:9));}
    roadIndices.push(base,base+1,base+2,base,base+2,base+3);
    if(i%2===0) {
      for(const side of [-1,1]){
        const end=samples[Math.min(i+2,samples.length-1)];if(end.gap)continue;
        bar(a.p.clone().addScaledVector(a.side,side*(ROAD_HALF+.12)).addScaledVector(a.up,.85),end.p.clone().addScaledVector(end.side,side*(ROAD_HALF+.12)).addScaledVector(end.up,.85),.16,track.wall,theme===1||theme===3?.5:0);
        bar(a.p.clone().addScaledVector(a.side,side*ROAD_HALF).addScaledVector(a.up,-.25),end.p.clone().addScaledVector(end.side,side*ROAD_HALF).addScaledVector(end.up,-.25),.5,deck);
      }
    }
    if(i%7===0){
      if(!samples[Math.min(i+4,samples.length-1)].gap){for(const side of [-1,1]){slab(a,side*3.65,.4,2.1,Math.floor(i/7)%2===0?track.accent:deck,.06);bar(a.p.clone().addScaledVector(a.side,side*4.1),a.p.clone().addScaledVector(a.side,side*4.1).addScaledVector(a.up,1.25),.2,track.wall);}}
      for(const lane of [-1.35,1.35])slab(a,lane,.09,1.5,theme===2?'#74a9c8':'#f1edca',.045);
    }
    if(i%34===0&&theme!==1){
      for(const side of [-1,1]){const p=a.p.clone().addScaledVector(a.side,side*3.5).addScaledVector(a.up,-.5),bottom=p.clone();bottom.y=-9;bar(p,bottom,.7,deck);}
      const left=a.p.clone().addScaledVector(a.side,-3.5),right=a.p.clone().addScaledVector(a.side,3.5);left.y-=9;right.y-=.5;bar(left,right,.25,deck);
    }
  }
  const roadGeo=new T.BufferGeometry();roadGeo.setAttribute('position',new T.Float32BufferAttribute(roadPositions,3));roadGeo.setAttribute('uv',new T.Float32BufferAttribute(roadUvs,2));roadGeo.setIndex(roadIndices);roadGeo.computeVertexNormals();
  const road=new T.Mesh(roadGeo,roadMaterial);road.receiveShadow=true;scene.add(road);
  // World-space arches and chevrons make the course legible at speed.
  function sign(q:Sample,text:string,color:string){
    const c=document.createElement('canvas');c.width=512;c.height=128;const x=c.getContext('2d')!;x.fillStyle=color;x.fillRect(0,0,512,128);x.strokeStyle='#ffffff55';x.lineWidth=5;x.strokeRect(8,8,496,112);x.fillStyle='#fff';x.font='bold 58px sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText(text,256,66);
    const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;textures.push(tex);
    const mesh=new T.Mesh(new T.BoxGeometry(9.3,1.6,.3),new T.MeshStandardMaterial({map:tex,roughness:.6,emissive:'#ffffff',emissiveMap:tex,emissiveIntensity:.25}));mesh.position.copy(q.p).addScaledVector(q.up,5.1);mesh.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(q.side,q.up,q.tangent.clone().negate()));scene.add(mesh);
    for(const side of [-1,1])bar(q.p.clone().addScaledVector(q.side,side*4.5),q.p.clone().addScaledVector(q.side,side*4.5).addScaledVector(q.up,5.8),.35,track.wall);
  }
  sign(samples.find(s=>s.s>15)!,RACE_THEMES[theme].subtitle,theme===0?'#426b3d':theme===2?'#397aa0':theme===5?'#8d5639':'#41416c');
  if(theme===5)for(const [t,text] of [[.3,'THE FIRST TURN'],[.54,'LONG CROSSING'],[.81,'FINAL DESCENT']] as const)sign(samples[Math.round(t*(samples.length-1))],text,'#80543b');
  sign(samples.reduce((a,b)=>Math.abs(a.s-finish)<Math.abs(b.s-finish)?a:b),'FINISH','#c24f44');
  for(const f of track.features.filter(f=>f.kind==='gate')){
    const q=samples[Math.round(f.t*(samples.length-1))];
    sign(q,'SWITCH GATE','#3a4855');
    for(const side of [-1,1]){
      slab(q,side*3.25,1.25,8,track.accent,.055,.035,.2);
      for(let j=-3;j<=3;j+=2){const center=q.p.clone().addScaledVector(q.side,side*3.25).addScaledVector(q.tangent,j).addScaledVector(q.up,.1);for(const wing of [-1,1])bar(center,center.clone().addScaledVector(q.side,wing*.35).addScaledVector(q.tangent,-.6),.1,'#ffffff',.5);}
    }
  }
  for(const f of track.features.filter(f=>f.kind==='booster')) {
    const q=samples[Math.round(f.t*(samples.length-1))];
    for(let j=-1;j<=1;j++) for(const side of [-1,1]){
      const center=q.p.clone().addScaledVector(q.tangent,j*.95).addScaledVector(q.up,.08);
      const edge=center.clone().addScaledVector(q.side,side*2).addScaledVector(q.tangent,-1.1);bar(center,edge,.16,track.accent,1);
    }
  }
  if(theme===3)for(let i=210;i<250;i+=6){const q=samples[i];bar(q.p.clone().addScaledVector(q.side,-4.5),q.p.clone().addScaledVector(q.side,-4.5).addScaledVector(q.up,5),.3,'#66758b');bar(q.p.clone().addScaledVector(q.side,4.5),q.p.clone().addScaledVector(q.side,4.5).addScaledVector(q.up,5),.3,'#66758b');bar(q.p.clone().addScaledVector(q.side,-4.5).addScaledVector(q.up,5),q.p.clone().addScaledVector(q.side,4.5).addScaledVector(q.up,5),.4,'#76deef',.7);}

  const bounds=new T.Box3().setFromPoints(samples.map(s=>s.p));const center=bounds.getCenter(new T.Vector3());
  const groundSize=theme===5?5000:1800;
  const ground=new T.Mesh(new T.PlaneGeometry(groundSize,groundSize),new T.MeshStandardMaterial({color:['#234f46','#10162c','#d6e7ee','#192339','#b44122','#bd9061'][theme],roughness:.9,metalness:theme===4?.4:0,emissive:theme===4?'#ff5415':'#000000',emissiveIntensity:.4}));ground.rotation.x=-Math.PI/2;ground.position.set(center.x,-10,center.z);scene.add(ground);
  const nearestHeight=(x:number,z:number)=>{let distance=Infinity,height=0;for(let i=0;i<samples.length;i+=8){const p=samples[i].p,d=(p.x-x)**2+(p.z-z)**2;if(d<distance){distance=d;height=p.y;}}return {distance:Math.sqrt(distance),height};};
  for(let i=0;i<(theme===5?460:330);i++) {
    const x=bounds.min.x-85+random()*(bounds.max.x-bounds.min.x+170),z=bounds.min.z-80+random()*(bounds.max.z-bounds.min.z+160),near=nearestHeight(x,z);
    if(near.distance<12)continue;
    const h=8+random()*32;
    if(theme===0||theme===2){
      const base=-9,treeH=Math.min(h,near.height+6);
      instance(boxes,theme===0?'#5b5038':'#788888',new T.Vector3(x,base+treeH*.42,z),new T.Vector3(.8,treeH*.84,.8));
      if(theme===0){
        for(let layer=0;layer<3;layer++)instance(rocks,['#256d51','#39875b','#62a56c'][layer],new T.Vector3(x+(layer-1)*treeH*.12,base+treeH*.72+layer*treeH*.1,z),new T.Vector3(treeH*.28,treeH*.24,treeH*.28));
      }else for(let layer=0;layer<3;layer++)instance(cones,layer===2?'#f5fafc':'#aac6d1',new T.Vector3(x,base+treeH*.55+layer*treeH*.17,z),new T.Vector3(treeH*(.3-layer*.055),treeH*.55,treeH*(.3-layer*.055)));
    }else if(theme===3){
      const height=near.distance<22?Math.min(h,near.height+2):h*1.9,width=4+random()*6;
      instance(boxes,i%2?'#283b56':'#344b69',new T.Vector3(x,-10+height/2,z),new T.Vector3(width,height,width));
      for(let y=-5;y<height-10;y+=4)for(const side of [-1,1])instance(boxes,i%3?'#efc882':'#7de9f4',new T.Vector3(x+side*(width/2+.02),y,z),new T.Vector3(.06,1.1,width*.7),undefined,.8);
      instance(boxes,i%2?'#e48dba':'#7ddbe5',new T.Vector3(x,height-9.8,z),new T.Vector3(width+.2,.2,width+.2),undefined,1);
    }else if(theme===4){
      instance(cones,i%2?'#4d343a':'#302c39',new T.Vector3(x,-10+h*.35,z),new T.Vector3(5+random()*5,h*.7,5+random()*5));
      if(i%4===0)instance(rocks,'#ffb34f',new T.Vector3(x,-7,z),new T.Vector3(1,.3,1),undefined,1.5);
    }else if(theme===5){
      if(near.distance<22)continue;
      const height=near.distance<40?Math.min(h,near.height+4):h*1.9,width=8+random()*12;
      for(let layer=0;layer<4;layer++)instance(mesas,['#8d563c','#b7744b','#d79865','#e5b783'][layer],new T.Vector3(x,-10+height*(layer+.5)/4,z),new T.Vector3(width*(1-layer*.12),height/4,width*(.8-layer*.09)));
      if(i%7===0){const p=new T.Vector3(x+width,-7,z);instance(boxes,'#55735a',p,new T.Vector3(.6,6,.6));bar(p.clone().add(new T.Vector3(-2,1,0)),p.clone().add(new T.Vector3(2,1,0)),.5,'#55735a');}
    }else{instance(rocks,i%2?'#485170':'#6b6582',new T.Vector3(x,random()*100-25,z),new T.Vector3(2+random()*4,2+random()*4,2+random()*4));}
  }
  if(theme===2||theme===4) for(let i=0;i<16;i++){
    const angle=i/16*Math.PI*2,radius=200+random()*100,h=80+random()*130,p=new T.Vector3(center.x+Math.cos(angle)*radius,h/2-12,center.z+Math.sin(angle)*radius);
    instance(cones,theme===2?'#94b2c9':'#46303c',p,new T.Vector3(70,h,70));
    if(theme===2)instance(cones,'#f6fbff',p.clone().add(new T.Vector3(0,h*.31,0)),new T.Vector3(27,h*.39,27));
  }
  if(theme===1){
    const planet=new T.Mesh(new T.SphereGeometry(35,32,20),new T.MeshStandardMaterial({color:'#8482b5',roughness:1}));planet.position.set(center.x+95,105,center.z-100);scene.add(planet);
    const ring=new T.Mesh(new T.RingGeometry(47,59,96),new T.MeshBasicMaterial({color:'#c9afd8',side:T.DoubleSide,transparent:true,opacity:.55}));ring.position.copy(planet.position);ring.rotation.set(1.1,.25,.35);scene.add(ring);
  }
  for(const bin of bins.values()){const mesh=new T.InstancedMesh(bin.geometry,bin.material,bin.matrices.length);bin.matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.computeBoundingSphere();scene.add(mesh);}
  const points:number[]=[];for(let i=0;i<500;i++)points.push(center.x+(random()-.5)*700,random()*200,center.z+(random()-.5)*700);
  const particles=new T.Points(new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(points,3)),new T.PointsMaterial({color:theme===4?'#ffd17c':theme===0?'#d8f8bd':'#ffffff',size:theme===1?.5:.23,transparent:true,opacity:.65,depthWrite:false}));scene.add(particles);
  return { animate(time:number){particles.position.y=theme===4?(time*.8)%20:theme===2?-(time*.6)%20:Math.sin(time*.2)*1.5;},dispose(){textures.forEach(t=>t.dispose());} };
}

export function marbleTexture(color:string) {
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=128;const c=canvas.getContext('2d')!;
  c.fillStyle=color;c.fillRect(0,0,256,128);c.strokeStyle='#ffffffb0';c.lineWidth=15;
  for(let j=0;j<3;j++){c.beginPath();for(let x=0;x<=256;x+=3){const y=64+38*Math.sin(x/256*Math.PI*2+j*2.1);if(x===0)c.moveTo(x,y);else c.lineTo(x,y);}c.stroke();}
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;return texture;
}
