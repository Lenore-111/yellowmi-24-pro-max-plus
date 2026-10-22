const palette={g:'#447b38',G:'#83b64b',l:'#c5d871',o:'#f1a43a',O:'#c46b2f',y:'#e7c651',Y:'#fff19b',b:'#b58351',B:'#81522f',r:'#e36b43',R:'#ab4134',p:'#835887',P:'#563e66',w:'#f5e8bf'};
const art={
 carrot:['..g.G...','..GGg...','...g....','..oooo..','..oOo...','...oo...','...O....','........'],
 potato:['........','..bbb...','.bwwbb..','.bbBbb..','.bbbBb..','..bbb...','........','........'],
 lettuce:['..G.G...','.GGlGG..','GGlGlGg.','gGlGlGG.','.gGGGg..','..ggg...','...g....','........'],
 tomato:['...g....','..ggG...','.rgrrr..','rrwrrrR.','rrwrrrR.','.rrrRR..','..RRR...','........'],
 cucumber:['....g...','...gGG..','...Glg..','..Glgg..','..Glg...','.Ggg....','.gg.....','........'],
 corn:['...g....','..yyyG..','..yYyg..','.GyYyg..','.gyyyg..','..gyg...','...g....','........'],
 eggplant:['....g...','...ggG..','..pPp...','.ppwpP..','.pppPP..','..pPP...','...P....','........'],
 pepper:['...g....','..ggG...','.rrrRr..','rrwrrrR.','rrwrrrR.','rRrrRrR.','.RR.RR..','........'],
 broccoli:['.GG.GG..','GGGGlGG.','GlGGGGg.','.ggggg..','..Ggg...','...lg...','...gg...','........'],
 pumpkin:['...g....','..ggG...','.ooooo..','ooOyOoo.','oYOyOoo.','ooOyOoO.','.OOOOO..','........'],
 sprout:['........','........','..G.G...','..gGg...','...g....','...g....','........','........'],
 leaf:['........','..G..G..','.GGlGGg.','..gGgg..','...g....','...g....','........','........'],
};
export function farmSprite(cropId,stage='crop') {
 const rows=art[stage==='crop'?cropId:stage]||art.sprout;
 return `<svg class="farm-sprite" viewBox="0 0 8 8" aria-hidden="true" shape-rendering="crispEdges">${rows.flatMap((row,y)=>[...row].map((char,x)=>palette[char]?`<rect x="${x}" y="${y}" width="1" height="1" fill="${palette[char]}"/>`:'')).join('')}</svg>`;
}
export function farmLandscape() {
 return `<svg class="farm-landscape" viewBox="0 0 160 44" aria-hidden="true" shape-rendering="crispEdges"><path fill="#d9e9b8" d="M0 0h160v44H0z"/><path fill="#fbf1d5" d="M22 7h16v3h7v5H15v-5h7zm87 1h15v3h9v5h-34v-5h10z"/><path fill="#a7c47e" d="M0 29h19v-5h28v7h34v-7h31v5h26v-6h22v21H0z"/><path fill="#749653" d="M0 37h160v7H0z"/><path fill="#b17745" d="M104 18h3v21h-3z"/><path fill="#57793f" d="M96 12h19v5h5v13H91V17h5z"/><path fill="#88ad58" d="M96 12h19v5h-19zm-5 5h13v8H91z"/><path fill="#be7350" d="M44 18h4v-4h4v-4h13v4h4v4h4v6H44z"/><path fill="#fae9c4" d="M47 24h23v16H47z"/><path fill="#815330" d="M55 29h8v11h-8z"/><path fill="#cedfb2" d="M49 27h4v5h-4zm16 0h3v5h-3z"/><path fill="#d9b576" d="M43 40h31v4H43z"/><path fill="#57793f" d="M7 36h2v4H7zm7 2h2v4h-2zm127-3h2v5h-2zm7 2h2v5h-2z"/></svg>`;
}
export const FARM_APP_ICON=`<svg viewBox="0 0 16 16" width="34" height="34" aria-hidden="true" shape-rendering="crispEdges"><path fill="#47783f" d="M5 1h2v2H5zm5 0h2v4h-2zM7 3h3v4H7z"/><path fill="#f6b04b" d="M4 6h9v3h-1v2h-2v2H8v2H6v-3H5V9H4z"/><path fill="#cc733a" d="M11 8h2v1h-1v2h-2v2H8v2H6v-3h2v-2h2z"/></svg>`;
