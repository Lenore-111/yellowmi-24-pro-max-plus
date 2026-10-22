// Small, original SVG sprites share the crop palette and stay sharp at every map scale.
export const FARM_MAP_WIDTH=1040, FARM_MAP_HEIGHT=900;
const palette={d:'#4c4b35',w:'#fff4d4',s:'#e9d5ac',b:'#8a5839',t:'#c18451',r:'#bd5340',R:'#8f3e32',y:'#e7b34f',g:'#7e9c50',k:'#4d4b3d',p:'#dba59a'};
const animals={
 chicken:['................','.......rr.......','......rwwrr.....','.....wwwwwdy....','...wwwwwwwwy....','..wwwwwwwwr.....','.wwwwwwwwww.....','..wwwwsswww.....','...wwsssww......','....wwwww.......','.....y.y........','....yy.yy.......'],
 sheep:['................','....wwwwww......','..wwwwwwwww.....','.wwswwwwswww....','wwwwwwwwwwwwkk..','wwwwwwwwwwwwkkk.','.wwswwwwswwwkdk.','..wwwwwwwwwwkk..','...wwwwwwww.....','....k..k..k.....','....k..k..k.....','................'],
 cow:['................','.........w..w...','...wwwwwwwkkk...','..wwkkwwwwwwwk..','.wwwkkwwwwwkwdk.','.wwwwwwkkwwwwww.','.wwwwwwkkwwwwwp.','..wwwswwwwwwwpp.','...w..www..w....','...k..k.k..k....','...k..k.k..k....','................'],
 egg:['......','..ww..','.wwww.','.wwsw.','.wssw.','..ss..'],
 wool:['........','..wwww..','.wwswww.','wwwwwwww','.wwwwww.','..ssss..'],
 milk:['...ww...','..wwww..','..wwww..','.wwwwww.','.wwggww.','.wwggww.','.wwwwww.','..ssss..'],
};
export function farmAnimalSprite(kind){
 const rows=animals[kind]||animals.chicken;
 return '<svg class="farm-animal-sprite" viewBox="0 0 '+rows[0].length+' '+rows.length+'" aria-hidden="true" shape-rendering="crispEdges">'+rows.flatMap((row,y)=>[...row].map((c,x)=>palette[c]?'<rect x="'+x+'" y="'+y+'" width="1" height="1" fill="'+palette[c]+'"/>':'')).join('')+'</svg>';
}
const path=(fill,d,more='')=>'<path fill="'+fill+'" d="'+d+'" '+more+'/>';
const rect=(x,y,w,h,c)=>'<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" fill="'+c+'"/>';
function tree(x,y,size=1,shade=false){
 return '<g transform="translate('+x+' '+y+') scale('+size+')">'+path('#7b914c','M-20 4h45v10h-45z')+path('#7c5839','M-5-25h11v35H-5z')+path(shade?'#547746':'#658d4b','M-15-70h30v7h14v13h8v31h-8v11H-25v-9h-9v-32h9v-14h10z')+path(shade?'#7a9a55':'#8aac57','M-15-70h30v7h14v13H15v14H-8v10h-17v-23h10z')+path('#b1c574','M-8-65h16v8H-8zm-14 19h10v7h-10z')+'</g>';
}
function barn(x,y){
 return '<g transform="translate('+x+' '+y+')">'+path('#78934e','M-13 52l139 58 32-20-137-55z')+path('#a74935','M10-27l89 35v96L10 69z')+path('#d46942','M-21 11l31-38v96l-31-13z')+path('#643d32','M-32 5l46-52L117-7l-10 23-97-38-30 39z')+path('#955338','M-32 5l46-52 10 5L-22 9z')+path('#bd7950','M17-41l89 34-3 6-89-34zM8-30l90 35-3 5L5-24z')+path('#f4d29a','M-17 15l27-34 8 4-28 35zM13-18l80 32v7L13-11z')+path('#763f30','M34 29l38 15v50L34 79z')+path('#eed8a4','M31 24l44 18v55l-7-2V47L38 35v48l-7-3z')+path('#dba777','M36 45l31 40v7L36 52zm0 34l31-16v8L36 87z')+path('#773b2c','M-9 25l12-14v30L-9 48z')+path('#d6975b','M11 51l18 7v4l-18-7zm66 26l14 5v4l-14-5z')+'</g>';
}
function cottage(x,y){
 return '<g transform="translate('+x+' '+y+')">'+path('#829956','M-18 48l93 38 27-18-92-35z')+path('#d9b67b','M0-4l61 24v58L0 53z')+path('#f5d9a1','M-24 17L0-4v57l-24-10z')+path('#7c6850','M-34 10L1-29l78 30-15 26L0 1l-24 22z')+path('#a28459','M1-29L79 1l-4 8L-2-20z')+rect(34,-36,10,20,'#b7784e')+path('#6a7751','M11 19l17 7v17l-17-7zm30 12l12 5v18l-12-5z')+path('#f8ecc5','M17 22l4 2v17l-4-2zm-6 5l17 7v3l-17-7z')+path('#90633e','M29 48l13 5v18l-13-5z')+'</g>';
}
function fence(points){
 let out='';for(let i=0;i<points.length-1;i++){
  const [x1,y1]=points[i],[x2,y2]=points[i+1],n=Math.ceil(Math.hypot(x2-x1,y2-y1)/28);
  for(let j=0;j<n;j++){
   const t=j/n,u=(j+1)/n,x=x1+(x2-x1)*t,y=y1+(y2-y1)*t,xx=x1+(x2-x1)*u,yy=y1+(y2-y1)*u;
   out+='<path d="M'+x+' '+(y-10)+'L'+xx+' '+(yy-10)+'M'+x+' '+(y-20)+'L'+xx+' '+(yy-20)+'" fill="none" stroke="#a77646" stroke-width="5"/>';
   out+=rect(x-3,y-28,7,32,'#8d613b')+rect(x-3,y-28,3,25,'#dbb272');
  }
 }
 return out;
}
export function farmMapLandscape(){
 let grass='';for(let i=0;i<150;i++){
  const x=32+(i*137)%974,y=60+(i*79)%796;
  grass+=path(i%4?'#8eaf5f':'#cfda8d','M'+x+' '+y+'h3v-5h3v8h-6z');
  if(i%13===0)grass+=rect(x+9,y-4,4,4,i%2?'#fbecb3':'#e9b07d');
 }
 let trees='';for(const [x,y,s] of [[80,120,1.4],[164,96,1.2],[237,112,1.1],[370,74,1],[504,92,1.2],[630,94,1],[757,127,1.1],[941,173,1.2],[987,259,1.3],[110,766,1.2],[171,805,1.3],[923,812,1.4],[810,854,1.2],[330,824,1],[81,586,1],[968,620,1.2]])trees+=tree(x,y,s,x%2===0);
 return '<svg class="farm-land" viewBox="0 0 1040 900" aria-hidden="true" shape-rendering="crispEdges">'+rect(0,0,1040,900,'#aac676')+path('#b6ce87','M140 90l700 0 140 300-150 440H210L60 400z')+grass+
 path('#d9d69a','M242 212l41-24 445 238-38 26zM431 292l35-20 70 37-36 22zM290 604l36-20 281 144-38 23zM462 293l21-11-225 416-36-17z')+
 path('#819f61','M841 0h48l-10 75 39 67-24 82 17 96-31 85 25 80-32 83 38 77-30 78 24 96-28 81h-56l31-85-22-91 24-77-33-79 25-87-22-78 29-84-17-95 27-77-39-73z')+
 path('#78b6a5','M855 0h25l-12 76 38 69-25 79 18 96-30 83 25 81-32 84 37 78-28 77 22 96-27 81h-31l30-83-23-96 28-77-36-80 29-80-23-82 30-86-18-95 26-76-37-72z')+
 path('#9cd0bb','M865 17h8v32h-8zm18 146h8v39h-8zm-3 129h8v35h-8zm-7 285h8v28h-8zm15 116h8v29h-8zm-16 124h8v41h-8z')+
 path('#a2b965','M619 274l138 58 25 132-89 51-140-65 10-130zM173 576l166-23 112 93-133 86-152-75z')+
 fence([[611,287],[744,336],[767,449]])+fence([[554,339],[563,432],[686,491],[767,449]])+
 fence([[164,597],[231,559],[342,579]])+fence([[164,597],[166,659],[314,718],[398,665]])+
 barn(286,196)+cottage(655,190)+
 '<g transform="translate(839 505) rotate(17)">'+rect(-29,-37,64,80,'#9b7749')+Array.from({length:7},(_,i)=>rect(-29,-36+i*12,64,7,'#d7b177')).join('')+'</g>'+
 '<g transform="translate(559 649)">'+rect(0,0,12,55,'#84603e')+rect(-36,-15,84,35,'#aa7142')+rect(-32,-11,76,27,'#e4c485')+'<text x="6" y="8" text-anchor="middle" font-size="14" fill="#72583a">牧场 →</text></g>'+trees+'</svg>';
}
export function farmSoil(selected=false){
 return '<svg viewBox="0 0 128 80" aria-hidden="true" shape-rendering="crispEdges">'+path('#745335','M1 37l63 31v10L1 47z')+path('#674a31','M64 68l63-31v10L64 78z')+path(selected?'#b58447':'#aa7542','M1 37L64 6l63 31-63 31z')+
 [0,1,2,3,4].map(i=>'<path d="M'+(13+i*11)+' '+(32-i*5.5)+'l55 27" stroke="#825c36" stroke-width="4" fill="none"/>').join('')+path('none','M1 37L64 6l63 31-63 31z','stroke="'+(selected?'#f7d878':'#bf9058')+'" stroke-width="2"')+'</svg>';
}
export function farmPlotPosition(index){
 const r=Math.floor(index/4),c=index%4,cGap=Math.floor(c/2)*13,rGap=Math.floor(r/2)*13;
 return {x:430+(c-r)*65+cGap-rGap,y:328+(c+r)*32+(cGap+rGap)/2};
}
export function farmAnimalPosition(animal,index){
 const chicken=animal.kind==='chicken',base=chicken?{x:200,y:595}:{x:582,y:344};
 return {x:base.x+(index%3)*(chicken?37:44),y:base.y+Math.floor(index/3)*18+(index%3)*8};
}
