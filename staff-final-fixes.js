(function(){
  const $=id=>document.getElementById(id);
  const esc=s=>String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  function activeSop(){return DATA?.sops?.find(s=>s.id===currentId)}
  async function portalConfig(){try{return await fetch('/api/me',{cache:'no-store'}).then(r=>r.json())}catch(e){return{}}}
  async function mobileBase(){const d=await portalConfig();return String(d.mobileBaseUrl||'').replace(/\/+$/,'')}
  async function sopUrl(s){const base=await mobileBase()||location.origin;return base+location.pathname+'?sop='+encodeURIComponent(s.id)}
  async function qrImageUrl(text){const d=await portalConfig(),encoded=encodeURIComponent(text),tpl=String(d.qrCodeApiUrl||'https://api.qrserver.com/v1/create-qr-code/?size=260x260&data={DATA}');return tpl.includes('{DATA}')?tpl.replaceAll('{DATA}',encoded):tpl+encoded}
  function gfMul(x,y){let z=0;for(;y;y>>=1){if(y&1)z^=x;x<<=1;if(x&0x100)x^=0x11d}return z}
  function rsGen(deg){let g=[1];for(let i=0;i<deg;i++){const next=Array(g.length+1).fill(0);for(let j=0;j<g.length;j++){next[j]^=gfMul(g[j],1);next[j+1]^=gfMul(g[j],pow2(i))}g=next}return g}
  function pow2(n){let x=1;for(let i=0;i<n;i++)x=gfMul(x,2);return x}
  function rs(data,deg){const g=rsGen(deg),res=Array(deg).fill(0);for(const b of data){const f=b^res.shift();res.push(0);for(let i=0;i<deg;i++)res[i]^=gfMul(g[i+1],f)}return res}
  function bit(val,i){return((val>>>i)&1)!==0}
  function qrSvg(text){
    const ver=5,size=37,dataCount=108,eccCount=26,bytes=[...new TextEncoder().encode(text)].slice(0,105),bits=[];
    function append(v,n){for(let i=n-1;i>=0;i--)bits.push((v>>>i)&1)}
    append(4,4);append(bytes.length,8);bytes.forEach(b=>append(b,8));append(0,Math.min(4,dataCount*8-bits.length));while(bits.length%8)bits.push(0);
    const data=[];for(let i=0;i<bits.length;i+=8)data.push(bits.slice(i,i+8).reduce((n,b)=>(n<<1)|b,0));for(let pad=0;data.length<dataCount;pad^=1)data.push(pad?0x11:0xec);
    const code=[...data,...rs(data,eccCount)],m=Array.from({length:size},()=>Array(size).fill(null)),fn=Array.from({length:size},()=>Array(size).fill(false));
    function set(x,y,dark,f=true){if(x<0||y<0||x>=size||y>=size)return;m[y][x]=!!dark;if(f)fn[y][x]=true}
    function finder(x,y){for(let dy=-1;dy<=7;dy++)for(let dx=-1;dx<=7;dx++){const xx=x+dx,yy=y+dy,inside=dx>=0&&dx<=6&&dy>=0&&dy<=6,dark=inside&&(dx===0||dx===6||dy===0||dy===6||(dx>=2&&dx<=4&&dy>=2&&dy<=4));set(xx,yy,dark)}}
    finder(0,0);finder(size-7,0);finder(0,size-7);
    for(let i=8;i<size-8;i++){set(i,6,i%2===0);set(6,i,i%2===0)}
    function align(cx,cy){for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)set(cx+dx,cy+dy,Math.max(Math.abs(dx),Math.abs(dy))!==1)}
    align(30,30);set(8,size-8,true);
    let stream=[];code.forEach(c=>{for(let i=7;i>=0;i--)stream.push((c>>>i)&1)});let idx=0,up=true;
    for(let x=size-1;x>0;x-=2){if(x===6)x--;for(let yi=0;yi<size;yi++){const y=up?size-1-yi:yi;for(let dx=0;dx<2;dx++){const xx=x-dx;if(fn[y][xx])continue;let dark=!!stream[idx++];if((xx+y)%2===0)dark=!dark;set(xx,y,dark,false)}}up=!up}
    const fmt=fmtBits(1,0);for(let i=0;i<=5;i++)set(8,i,bit(fmt,i));set(8,7,bit(fmt,6));set(8,8,bit(fmt,7));set(7,8,bit(fmt,8));for(let i=9;i<15;i++)set(14-i,8,bit(fmt,i));for(let i=0;i<8;i++)set(size-1-i,8,bit(fmt,i));for(let i=8;i<15;i++)set(8,size-15+i,bit(fmt,i));
    const cell=4,b=4,w=(size+b*2)*cell;let rects='';for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(m[y][x])rects+=`<rect x="${(x+b)*cell}" y="${(y+b)*cell}" width="${cell}" height="${cell}"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${w}" viewBox="0 0 ${w} ${w}"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${rects}</g></svg>`
  }
  function fmtBits(ecl,mask){let data=(ecl<<3)|mask,rem=data;for(let i=0;i<10;i++)rem=(rem<<1)^(((rem>>>9)&1)*0x537);return((data<<10)|rem)^0x5412}
  function dataUri(svg){return'data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(svg)))}
  async function copyActiveLink(){const s=activeSop();if(!s)return;const url=await sopUrl(s);try{await navigator.clipboard.writeText(url);setStatus('SOP link copied to clipboard.')}catch(e){const t=document.createElement('textarea');t.value=url;document.body.appendChild(t);t.select();const ok=document.execCommand('copy');t.remove();setStatus(ok?'SOP link copied to clipboard.':'Copy failed. Direct link: '+url)}}
  function setStatus(msg){const el=$('quickActionStatus');if(el)el.textContent=msg}
  async function showActiveQr(){const s=activeSop();if(!s)return;const box=$('qrBox'),url=await sopUrl(s);box?.classList.toggle('hidden');if(!box||box.classList.contains('hidden'))return;box.querySelector('img').src=await qrImageUrl(url);box.querySelector('p').textContent=url}
  function applyStaffFixes(){
    const list=typeof filtered==='function'?filtered():[];
    if(article&&list.length===0)article.innerHTML='<p class="small">No SOPs match this view. Choose another section, clear search, or ask an admin to review role assignments.</p>';
    const copy=$('copySopLinkBtn'),qr=$('showQrBtn');
    if(copy)copy.onclick=copyActiveLink;
    if(qr)qr.onclick=showActiveQr;
  }
  window.addEventListener('load',()=>setTimeout(()=>{const old=window.renderAll||renderAll;window.renderAll=function(){old.apply(this,arguments);setTimeout(applyStaffFixes,0)};applyStaffFixes()},900));
})();
