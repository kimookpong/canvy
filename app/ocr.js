/* ============================== OCR: OpenThai2.0-OCR-Text (ONNX, runs in the browser) ==============================
   A port of the model's own Python runtime (runtime/line_engine.py): DB text-line detection, then a CTC line
   recogniser. Horizontal text only (no deskew / page rotation). Models and the ONNX runtime are downloaded once
   and cached; the photo never leaves the device. */
const OCR=(()=>{
  const ORT_V='1.31.1',ORT=`https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_V}/dist/`,HF='https://huggingface.co/iapp/OpenThai2.0-OCR-Text/resolve/main/';
  // det.yml post-process values + config.json rec values, as LineOCR merges them
  const C={limit:1280,thresh:.2,boxThresh:.4,unclip:1.4,minSize:3,H:48,maxW:3200,drop:.8,junkBelow:.9,junkInvalid:.05};
  let ready=null,det=null,rec=null,chars=null;
  const canvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c};
  function script(src){return new Promise((ok,no)=>{const s=document.createElement('script');s.src=src;s.crossOrigin='anonymous';s.onload=ok;s.onerror=()=>no(new Error('Could not load the OCR runtime'));document.head.appendChild(s)})}
  async function cached(name,onBytes){
    const url=HF+name;let cache=null;try{cache=await caches.open('canvy-ocr-v1')}catch(_){}
    const hit=cache&&await cache.match(url);if(hit)return hit;
    const r=await fetch(url);if(!r.ok)throw new Error('Model download failed ('+r.status+')');
    // count bytes for the progress line while keeping the body for the cache
    const total=+r.headers.get('content-length')||0,rd=r.body.getReader(),parts=[];let got=0;
    for(;;){const{done,value}=await rd.read();if(done)break;parts.push(value);got+=value.length;onBytes&&onBytes(value.length,total)}
    const res=new Response(new Blob(parts),{headers:{'content-type':r.headers.get('content-type')||'application/octet-stream'}});
    if(cache)try{await cache.put(url,res.clone())}catch(_){}
    return res;
  }
  function load(progress){
    if(!ready)ready=(async()=>{
      progress&&progress('runtime',0);
      if(!window.ort)await script(ORT+'ort.wasm.min.js');
      ort.env.wasm.wasmPaths=ORT;ort.env.wasm.numThreads=self.crossOriginIsolated?Math.min(4,navigator.hardwareConcurrency||2):1;
      let got=0;const tick=n=>{got+=n;progress&&progress('models',got)};
      const[d,r,t]=await Promise.all([cached('det.onnx',tick).then(x=>x.arrayBuffer()),cached('rec.onnx',tick).then(x=>x.arrayBuffer()),cached('rec_dict.txt').then(x=>x.text())]);
      chars=['',...t.split('\n').filter(Boolean),' '];  // 0 = CTC blank, then the dictionary, then PaddleOCR's space
      progress&&progress('init',0);
      const o={executionProviders:['wasm'],graphOptimizationLevel:'all'};
      det=await ort.InferenceSession.create(d,o);rec=await ort.InferenceSession.create(r,o);
    })().catch(e=>{ready=null;throw e});
    return ready;
  }
  const isCached=async()=>{try{const c=await caches.open('canvy-ocr-v1');return!!(await c.match(HF+'rec.onnx'))}catch(_){return false}};

  /* ---- detection: DB probability map -> line boxes (axis-aligned) ---- */
  async function detect(src){
    const W0=src.width,H0=src.height,pad=Math.max(8,Math.floor(.05*Math.min(W0,H0))),w=W0+2*pad,h=H0+2*pad;
    const s=Math.min(C.limit/Math.max(h,w),4),rh=Math.max(32,Math.round(h*s/32)*32),rw=Math.max(32,Math.round(w*s/32)*32);
    const cv=canvas(rw,rh),g=cv.getContext('2d',{willReadFrequently:true});g.fillStyle='#fff';g.fillRect(0,0,rw,rh);g.imageSmoothingQuality='high';
    g.drawImage(src,pad*rw/w,pad*rh/h,W0*rw/w,H0*rh/h);
    const px=g.getImageData(0,0,rw,rh).data,N=rw*rh,x=new Float32Array(3*N);
    // the runtime feeds BGR with ImageNet mean/std in that channel order (PaddleOCR's convention)
    for(let i=0,j=0;i<N;i++,j+=4){x[i]=(px[j+2]/255-.485)/.229;x[N+i]=(px[j+1]/255-.456)/.224;x[2*N+i]=(px[j]/255-.406)/.225}
    const out=await det.run({[det.inputNames[0]]:new ort.Tensor('float32',x,[1,3,rh,rw])}),T=out[det.outputNames[0]],[ph,pw]=T.dims.slice(-2),prob=T.data;
    const lab=new Int32Array(ph*pw),stack=new Int32Array(ph*pw),boxes=[];let L=0;
    for(let i0=0;i0<ph*pw;i0++){
      if(lab[i0]||prob[i0]<=C.thresh)continue;
      L++;let sp=0,x0=1e9,y0=1e9,x1=-1,y1=-1;stack[sp++]=i0;lab[i0]=L;
      while(sp){const i=stack[--sp],yy=(i/pw)|0,xx=i-yy*pw;if(xx<x0)x0=xx;if(xx>x1)x1=xx;if(yy<y0)y0=yy;if(yy>y1)y1=yy;
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=xx+dx,ny=yy+dy;if(nx<0||ny<0||nx>=pw||ny>=ph)continue;const k=ny*pw+nx;if(!lab[k]&&prob[k]>C.thresh){lab[k]=L;stack[sp++]=k}}}
      const bw=x1-x0+1,bh=y1-y0+1;if(Math.min(bw,bh)<C.minSize)continue;
      let sum=0;for(let yy=y0;yy<=y1;yy++)for(let xx=x0;xx<=x1;xx++)sum+=prob[yy*pw+xx];
      if(sum/(bw*bh)<C.boxThresh)continue;
      const d=bw*bh*C.unclip/(2*(bw+bh));if(Math.min(bw,bh)+2*d<C.minSize+2)continue;
      const sx=w/pw,sy=h/ph,clx=v=>Math.max(0,Math.min(W0-1,v)),cly=v=>Math.max(0,Math.min(H0-1,v));
      const bx0=clx((x0-d)*sx-pad),bx1=clx((x1+1+d)*sx-pad),by0=cly((y0-d)*sy-pad),by1=cly((y1+1+d)*sy-pad);
      if(bx1-bx0>=2&&by1-by0>=2)boxes.push({x:bx0,y:by0,w:bx1-bx0,h:by1-by0});
    }
    if(!boxes.length&&H0<=200&&W0>=1.5*H0)boxes.push({x:0,y:0,w:W0-1,h:H0-1});  // a single-line crop
    return boxes;
  }

  /* ---- recognition ---- */
  function flatten(gr,w,h){
    // each column's background from the crop's top/bottom margins, median-smoothed along the line;
    // text is whatever differs from it (dark on light or light on dark)
    const k=Math.max(2,(h/6)|0),bg0=new Float32Array(w),tmp=[];
    for(let x=0;x<w;x++){tmp.length=0;for(let y=0;y<k;y++){tmp.push(gr[y*w+x],gr[(h-1-y)*w+x])}tmp.sort((a,b)=>a-b);const m=tmp.length>>1;bg0[x]=Math.floor(tmp.length%2?tmp[m]:(tmp[m-1]+tmp[m])/2)}
    const win=Math.max(3,Math.min(h|1,255)),r=win>>1,bg=new Float32Array(w),wv=[];
    for(let x=0;x<w;x++){wv.length=0;for(let j=x-r;j<=x+r;j++)wv.push(bg0[Math.max(0,Math.min(w-1,j))]);wv.sort((a,b)=>a-b);bg[x]=wv[r]}
    const d=new Float32Array(w*h),hist=new Uint32Array(256);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const v=Math.abs(gr[y*w+x]-bg[x]);d[y*w+x]=v;hist[Math.min(255,v|0)]++}
    let acc=0,hi=255;const lim=.98*w*h;for(let i=0;i<256;i++){acc+=hist[i];if(acc>=lim){hi=i;break}}hi=Math.max(hi,24);
    const out=new Uint8ClampedArray(w*h);for(let i=0;i<w*h;i++)out[i]=255-Math.min(255,d[i]*255/hi);
    return out;
  }
  async function readBox(src,b){
    const H=C.H,ratio=b.w/Math.max(b.h,1),rw=Math.max(1,Math.min(C.maxW,Math.ceil(H*ratio))),W=Math.min(C.maxW,Math.max(16,rw));
    const cv=canvas(rw,H),g=cv.getContext('2d',{willReadFrequently:true});g.imageSmoothingQuality='high';g.drawImage(src,b.x,b.y,b.w,b.h,0,0,rw,H);
    const px=g.getImageData(0,0,rw,H).data,gr=new Float32Array(rw*H);
    for(let i=0,j=0;i<rw*H;i++,j+=4)gr[i]=Math.round(.299*px[j]+.587*px[j+1]+.114*px[j+2]);
    const f=flatten(gr,rw,H),x=new Float32Array(3*H*W),P=H*W;  // zeros = mid grey padding, as the runtime does
    for(let y=0;y<H;y++)for(let xx=0;xx<rw;xx++){const v=(f[y*rw+xx]/255-.5)/.5,i=y*W+xx;x[i]=v;x[P+i]=v;x[2*P+i]=v}
    const out=await rec.run({[rec.inputNames[0]]:new ort.Tensor('float32',x,[1,3,H,W])}),T=out[rec.outputNames[0]],[t,nc]=T.dims.slice(-2),p=T.data;
    let s='',sum=0,n=0,prev=-1;
    for(let i=0;i<t;i++){let bi=0,bv=-1;for(let c=0;c<nc;c++){const v=p[i*nc+c];if(v>bv){bv=v;bi=c}}
      if(bi!==prev&&bi!==0){s+=chars[bi]||'';sum+=bv;n++}prev=bi}
    return{text:s,conf:n?sum/n:0};
  }

  /* ---- Thai text clean-up (runtime/thai_norm.py canonical + fix_scripts) ---- */
  const PUA={0xF700:0x0E10,0xF701:0x0E34,0xF702:0x0E35,0xF703:0x0E36,0xF704:0x0E37,0xF705:0x0E48,0xF706:0x0E49,0xF707:0x0E4A,0xF708:0x0E4B,0xF709:0x0E4C,0xF70A:0x0E48,0xF70B:0x0E49,0xF70C:0x0E4A,0xF70D:0x0E4B,0xF70E:0x0E4C,0xF70F:0x0E0D,0xF710:0x0E31,0xF711:0x0E4D,0xF712:0x0E47,0xF713:0x0E48,0xF714:0x0E49,0xF715:0x0E4A,0xF716:0x0E4B,0xF717:0x0E4C,0xF718:0x0E38,0xF719:0x0E39,0xF71A:0x0E3A};
  const VOW='ัิีึืฺุู็',TONE='่้๊๋์๎',NIK='ํ';
  const rank=c=>VOW.includes(c)?0:TONE.includes(c)?1:2,MARK_RUN=new RegExp(`[${VOW}${TONE}${NIK}]{2,}`,'g');
  function canonical(t){
    t=[...(t||'')].map(ch=>{const c=ch.codePointAt(0);if(PUA[c])return String.fromCodePoint(PUA[c]);if('​‌‍⁠­﻿'.includes(ch))return'';return c===0xA0?' ':ch}).join('').normalize('NFC');
    t=t.replace(MARK_RUN,run=>{const o=[];[...run].sort((a,b)=>rank(a)-rank(b)).forEach(ch=>{if(o[o.length-1]!==ch)o.push(ch)});return o.join('')});
    t=t.replace(/([่-๋]?)ํ([่-๋]?)า/g,(m,a,b)=>a+b+'ำ').split('เเ').join('แ').split('ำำ').join('ำ');
    t=t.replace(/(^|[^A-Za-z])[Ww](?=\.?[ก-ฮเ-ไ])/g,'$1พ').replace(/([๐-๙])[Oo0]/g,'$1๐').replace(/[Oo0](?=[๐-๙])/g,'๐');
    return t.split(/\r\n|\r|\n/).map(l=>l.replace(/[ \t\f\v]+/g,' ').trim()).join('\n').trim();
  }
  const MARKS='ัิีึืฺุู็่้๊๋์ํ๎',LEAD='เแโใไ',cons=c=>c>='ก'&&c<='ฮ';
  function invalidShare(t){let thai=0,bad=0;for(let i=0;i<t.length;i++){const ch=t[i];if(ch<'฀'||ch>'๿')continue;thai++;const p=i?t[i-1]:' ';
    if(MARKS.includes(ch)&&!(cons(p)||(MARKS.includes(p)&&i>=2&&cons(t[i-2]))))bad++;else if(LEAD.includes(ch)&&!(i+1<t.length&&cons(t[i+1])))bad++}return thai?bad/thai:0}

  /* ---- page ---- */
  async function read(src,onLine){
    await load();
    const boxes=await detect(src),lines=[];let i=0;
    for(const b of boxes){const r=await readBox(src,b);onLine&&onLine(++i,boxes.length);
      const text=canonical(r.text),n=text.replace(/\s/g,'').length;
      if(!text||r.conf<C.drop||(n<2&&r.conf<.9)||(r.conf<C.junkBelow&&invalidShare(text)>C.junkInvalid))continue;
      lines.push({text,conf:r.conf,...b})}
    return lines;
  }
  return{load,read,isCached,canonical};
})();
