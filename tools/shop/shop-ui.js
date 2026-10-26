/* Preise: Supabase (shop_*-Tabellen) wenn vorhanden, sonst eingebaute Richtpreise. Nährwerte: App-Datenbank (FOODS). */
const SHOP_SLOTS=[['b','Frühstück','b'],['l','Mittagessen','m'],['d','Abendessen','m'],['s','Snack','s']];
const SHOP_KINDS=[['b','Frühstück'],['m','Hauptgericht'],['s','Snack']];
const SHOP_CATS=['Obst & Gemüse','Fleisch & Fisch','Milch & Eier','Getreide & Beilagen','Vorrat'];
let SHOP={src:'seed',stand:SHOP_SEED.stand,stores:SHOP_SEED.stores,prod:{},prices:SHOP_SEED.prices,loading:false,day:0,dirty:false,rf:'all'};
function shopIndex(products){ SHOP.prod={}; products.forEach(p=>SHOP.prod[p.id]=p); }
shopIndex(SHOP_SEED.products);
try{ const c=JSON.parse(localStorage.getItem('ironladder.shop')||'null'); if(c&&c.stores&&c.products){ Object.assign(SHOP,{src:'cloud',stand:c.stand,stores:c.stores,prices:c.prices}); shopIndex(c.products); } }catch(e){}
async function shopLoad(){
 if(!SBC||SHOP.loading||SHOP.fresh) return; SHOP.loading=true;
 try{
  const h={apikey:SBC.key,Authorization:'Bearer '+SBC.key};
  const g=t=>fetch(SBC.url+'/rest/v1/'+t,{headers:h}).then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); });
  const [st,pr,px]=await Promise.all([g('shop_stores?select=id,name,color'),g('shop_products?select=id,name,food,pack_g,pack_label,category,off_code'),g('shop_prices?select=store_id,product_id,price,updated_at')]);
  if(!st.length||!pr.length||!px.length) throw new Error('leer');
  const prices={}; let last='';
  px.forEach(r=>{ (prices[r.store_id]=prices[r.store_id]||{})[r.product_id]=+r.price; if(r.updated_at>last) last=r.updated_at; });
  const c={stand:last.slice(0,10),stores:st.map(s=>({id:s.id,n:s.name,col:s.color})),products:pr.map(p=>({id:p.id,n:p.name,food:p.food,g:+p.pack_g,pack:p.pack_label,cat:p.category,off:p.off_code})),prices};
  Object.assign(SHOP,{src:'cloud',stand:c.stand,stores:c.stores,prices}); shopIndex(c.products); SHOP.fresh=true; shopNutReset();
  try{ localStorage.setItem('ironladder.shop',JSON.stringify(c)); }catch(e){}
  if(V.tab==='food'&&V.foodView==='shop') render();
 }catch(e){ SHOP.fresh=true; /* Tabellen noch nicht angelegt: eingebaute Preise */ }
 SHOP.loading=false;
}
const shopPrefs=()=>{ const p=S.profile; p.shop=p.shop||{store:'lidl',budget:50,diet:'all'}; const s=p.shop; s.checked=s.checked||{}; s.px=s.px||{}; s.pin=s.pin||[]; return s; };
const shopOwn=()=>S.profile.shopRecipes||(S.profile.shopRecipes=[]);
const shopAll=()=>SHOP_RECIPES.concat(shopOwn());
const shopStore=id=>SHOP.stores.find(s=>s.id===id)||SHOP.stores[0];
function shopPrice(store,pid){ const o=shopPrefs().px[store+':'+pid]; if(o) return o; return (SHOP.prices[store]||{})[pid]??null; }
const shopFoodCache={};
function shopFood(pid){
 const pr=SHOP.prod[pid]; if(!pr) return null;
 return shopFoodCache[pr.food]||(shopFoodCache[pr.food]=FOODS.find(f=>f.n===pr.food&&!f.dish&&!f.own&&!f.off)||null);
}
const shopRec=id=>SHOP_RECIPES.find(r=>r.id===id)||shopOwn().find(r=>r.id===id);
const shopVeg=r=>r.own?!r.i.some(([pid])=>SHOP.prod[pid]&&SHOP.prod[pid].cat==='Fleisch & Fisch'):!!r.veg;
let SHOP_NUT={};
const shopNutReset=()=>{ SHOP_NUT={}; };
function shopNut(r,f=1){
 let b=SHOP_NUT[r.id];
 if(!b){ b={k:0,p:0,c:0,f:0,g:0}; r.i.forEach(([pid,g])=>{ const fd=shopFood(pid); b.g+=g; if(!fd) return; b.k+=fd.k*g/100; b.p+=fd.p*g/100; b.c+=fd.c*g/100; b.f+=fd.f*g/100; }); SHOP_NUT[r.id]=b; }
 return {k:b.k*f,p:b.p*f,c:b.c*f,f:b.f*f,g:b.g*f};
}
/* Preis je Portion (anteilig, ohne Packungsrundung) */
function shopPortion(r,store){ let s=0; r.i.forEach(([pid,g])=>{ const pr=SHOP.prod[pid], x=shopPrice(store,pid); if(pr&&x!=null) s+=g/pr.g*x; }); return s; }
/* Kosten mit echten Packungsgrößen: was an der Kasse bezahlt wird, und was davon in der Woche verbraucht wird */
function shopCost(needs,store){
 let total=0, used=0, missing=0; const lines=[];
 for(const pid in needs){ const pr=SHOP.prod[pid], price=shopPrice(store,pid), g=needs[pid];
  if(!pr) continue; if(price==null){ missing++; continue; }
  const packs=Math.max(1,Math.ceil(g/pr.g-0.03)); total+=packs*price; used+=Math.min(1,g/(packs*pr.g))*packs*price;
  lines.push({pid,g,packs,price,sum:packs*price}); }
 return {total,used,lines,missing};
}
function shopDays(combo){ // feste Rotation: Frühstück im Wechsel, Mittag und Abend aus den Hauptgerichten (Vorkochen!)
 const {b,m,s}=combo;
 return Array.from({length:7},(_,d)=>{ const r=[[b[d%b.length],'b'],[m[d%m.length],'l'],[m[(d+1)%m.length],'d']]; if(s.length) r.push([s[d%s.length],'s']); return r; });
}
function shopEval(combo,t,store,budget){
 const days=shopDays(combo), needs={}; let pSum=0, kErr=0;
 const out=days.map(day=>{
  let bk=0, bp=0; day.forEach(([id])=>{const n=shopNut(shopRec(id)); bk+=n.k; bp+=n.p;});
  const f=Math.min(1.6,Math.max(0.7,Math.round(t.kcal/bk*20)/20));
  kErr+=Math.abs(bk*f-t.kcal)/t.kcal; pSum+=bp*f;
  day.forEach(([id])=>shopRec(id).i.forEach(([pid,g])=>needs[pid]=(needs[pid]||0)+g*f));
  return {f,meals:day};
 });
 const cost=shopCost(needs,store), pAvg=pSum/7;
 const short=Math.max(0,1-pAvg/t.p), over=Math.max(0,cost.total-budget);
 const score=over*8+short*200+kErr/7*160+cost.total*(over?0.15:0.04)-(combo.m.length>3?1.5:0)+cost.missing*20;
 return {score,days:out,cost,pAvg,needs};
}
/* Planer: zufällige Startpläne + Verbesserung durch Tauschen (bei 50+ Rezepten zu viele Kombinationen zum Durchprobieren) */
function shopGenerate(){
 const pf=shopPrefs(), t=S.profile.targets, ok=r=>pf.diet!=='veg'||shopVeg(r);
 const pool={}; SHOP_KINDS.forEach(([k])=>pool[k]=shopAll().filter(r=>r.m===k&&ok(r)).map(r=>r.id));
 const pins={}; SHOP_KINDS.forEach(([k])=>pins[k]=pf.pin.filter(id=>pool[k].includes(id)));
 const seen=new Map(); let cheapest=1e9, cheapP=1e9;
 /* Zufallsvorliebe je Rezept: sorgt für Abwechslung zwischen Plänen, ohne Budget oder Ziel zu opfern */
 const noise={}; shopAll().forEach(r=>noise[r.id]=Math.random()*4-2);
 const ev=c=>{ const key=[c.b.slice().sort(),c.m.slice().sort(),c.s.slice().sort()].join('|'); let x=seen.get(key);
  if(!x){ const e=shopEval(c,t,pf.store,pf.budget); x={score:e.score+[...c.b,...c.m,...c.s].reduce((a,id)=>a+noise[id],0),cost:e.cost.total,pOk:e.pAvg>=t.p*.95,key}; seen.set(key,x); cheapest=Math.min(cheapest,x.cost); if(x.pOk) cheapP=Math.min(cheapP,x.cost); }
  return x; };
 const pickN=(arr,n,must)=>{ const out=must.slice(0,n); const rest=arr.filter(x=>!out.includes(x)); while(out.length<n&&rest.length) out.push(rest.splice(Math.floor(Math.random()*rest.length),1)[0]); return out; };
 const results=[];
 for(let r=0;r<36;r++){
  const nM=Math.max(pins.m.length>3?4:0,r%2?4:3), nS=Math.max(Math.min(2,pins.s.length),r%3);
  const c={b:pickN(pool.b,Math.min(2,pool.b.length),pins.b),m:pickN(pool.m,Math.min(nM,pool.m.length),pins.m),s:pickN(pool.s,Math.min(nS,pool.s.length),pins.s)};
  if(!c.b.length||!c.m.length) break;
  let cur=ev(c), better=true, rounds=0;
  while(better&&rounds++<6){ better=false;
   for(const k of ['m','b','s']) for(let i=0;i<c[k].length;i++){ if(pins[k].includes(c[k][i])) continue;
    for(const alt of pool[k]){ if(c[k].includes(alt)) continue; const old=c[k][i]; c[k][i]=alt; const x=ev(c); if(x.score<cur.score-1e-9){cur=x;better=true;} else c[k][i]=old; } }
  }
  results.push({b:c.b.slice(),m:c.m.slice(),s:c.s.slice(),score:cur.score,key:cur.key});
 }
 if(!results.length){ toast('Zu wenige Rezepte für diesen Filter.'); return false; }
 const uniq=[...new Map(results.sort((a,b)=>a.score-b.score).map(x=>[x.key,x])).values()];
 const prev=pf.plan?[pf.plan.b.slice().sort(),pf.plan.m.slice().sort(),pf.plan.s.slice().sort()].join('|'):'';
 const top=uniq.filter(x=>x.key!==prev&&x.score<=uniq[0].score+6).slice(0,6);
 const pick=top.length?top[Math.floor(Math.random()*top.length)]:uniq[0];
 pf.plan={b:pick.b,m:pick.m,s:pick.s,start:today(),store:pf.store,budget:pf.budget,diet:pf.diet,kcal:t.kcal,p:t.p,cheapest,cheapP};
 pf.checked={}; SHOP.day=0; SHOP.dirty=false; saveProfile(); return true;
}
function shopPlanView(){
 const pf=shopPrefs(), pl=pf.plan; if(!pl) return null;
 if(!pl.b.concat(pl.m,pl.s).every(shopRec)) return null;
 return shopEval(pl,{kcal:pl.kcal,p:pl.p},pf.store,pf.budget);
}
function shopSwapIn(oldId,newId){ const pl=shopPrefs().plan; if(!pl) return; ['b','m','s'].forEach(k=>{ const i=pl[k].indexOf(oldId); if(i>=0) pl[k][i]=newId; }); }
const eur=v=>Number(v||0).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
const gTxt=g=>g>=1000?fmt(g/1000,1).replace(/,0$/,'')+' kg':fmt(Math.round(g/5)*5)+' g';
const shopKindN=k=>(SHOP_KINDS.find(x=>x[0]===k)||['',''])[1];
function renderShop(){
 const pf=shopPrefs(), t=S.profile.targets, ev=shopPlanView(), pl=pf.plan, st=shopStore(pf.store);
 shopLoad();
 const own=shopOwn().length;
 const recipesCard=`<div class="card stack"><div class="row between"><h3>Rezepte</h3><span class="tag">${SHOP_RECIPES.length} + ${own} eigene</span></div>
  <p class="muted" style="font-size:.9rem">Lege eigene Rezepte aus den Produkten der Preisliste an. Sie werden mitgeplant, und mit „Tauschen“ ersetzt du jedes Gericht im Wochenplan.${pf.pin.length?` ${pf.pin.length} Rezept${pf.pin.length>1?'e':''} immer eingeplant.`:''}</p>
  <div class="row"><button class="btn sm" data-act="shopRecipes">Alle Rezepte</button><button class="btn sm" data-act="shopNew">${I.plus.replace('<svg','<svg width="14" height="14"')} Eigenes Rezept</button></div></div>`;
 const setup=`<div class="card stack shop-setup">
  <div class="stack" style="gap:8px"><span class="lbl">Supermarkt</span><div class="chips">${SHOP.stores.map(s=>`<button class="chip" data-act="shopStore" data-v="${s.id}" aria-pressed="${pf.store===s.id}"><i class="sdot" style="background:${esc(s.col||'var(--muted)')}"></i>${esc(s.n)}</button>`).join('')}</div></div>
  <div class="stack" style="gap:6px"><div class="row between"><span class="lbl">Budget pro Woche</span><b class="num" id="shop-bv">${fmt(pf.budget)} €</b></div>
   <input type="range" class="rpe" min="20" max="120" step="5" value="${pf.budget}" data-shop-budget aria-label="Budget pro Woche in Euro"></div>
  <div class="row between"><div class="chips">${[['all','Alles'],['veg','Vegetarisch']].map(([k,n])=>`<button class="chip" data-act="shopDiet" data-v="${k}" aria-pressed="${pf.diet===k}">${n}</button>`).join('')}</div>
   <span class="muted" style="font-size:.875rem">Ziel: <b class="num">${fmt(t.kcal)}</b> kcal · <b class="num">${fmt(t.p)}</b> g Protein / Tag</span></div>
  <button class="btn pri" data-act="shopPlan">${pl?'Neuen Plan erstellen':'Wochenplan erstellen'}</button>
  ${pl&&(SHOP.dirty||pl.budget!==pf.budget||pl.diet!==pf.diet||pl.kcal!==t.kcal)?`<p class="off-note">Einstellungen geändert. Erstelle einen neuen Plan, damit er dazu passt.</p>`:''}
 </div>`;
 const intro=`<div class="head"><div><h1>Wocheneinkauf</h1><p class="muted" style="margin-top:4px">Ein Einkauf, sieben Tage Essen, passend zu deinem Ziel und Budget.</p></div></div>`;
 if(!ev) return intro+setup+`<div class="empty">Wähle Supermarkt und Budget. Die App stellt aus ${shopAll().length} Rezepten den Plan zusammen, der dein Kalorien- und Proteinziel am günstigsten trifft, und rechnet mit echten Packungsgrößen.</div>`+recipesCard+shopFoot();
 const c=ev.cost, over=c.total>pf.budget, left=c.total-c.used, kAvg=ev.days.reduce((a,d)=>a+d.meals.reduce((x,[id])=>x+shopNut(shopRec(id),d.f).k,0),0)/7;
 const summary=`<div class="card stack shop-sum"><div class="row between" style="align-items:flex-end">
   <div><span class="lbl">An der Kasse bei ${esc(st.n)}</span><div class="shop-total num">${eur(c.total)}</div></div>
   <span class="tag ${over?'':'t'}">${over?`${eur(c.total-pf.budget)} über Budget`:`${eur(pf.budget-c.total)} unter Budget`}</span></div>
  <div class="bar"><i style="width:${Math.min(100,c.total/pf.budget*100)}%;background:${over?'var(--bad)':'var(--accent)'}"></i></div>
  <div class="shop-stats"><div><b class="num">${eur(c.total/7)}</b><span>pro Tag</span></div><div><b class="num">${fmt(kAvg)}</b><span>kcal / Tag</span></div><div><b class="num">${fmt(ev.pAvg)} g</b><span>Protein / Tag</span></div></div>
  ${left>0.5?`<p class="off-note">Davon bleiben Reste im Wert von ${eur(left)} für nächste Woche (angebrochene Packungen, z. B. Öl, Reis).</p>`:''}
  ${over&&pl.cheapest>pf.budget?`<p class="off-err">Mit ${fmt(pf.budget)} € ist dein Ziel bei ${esc(st.n)} kaum machbar. Der günstigste Plan liegt bei etwa ${eur(pl.cheapest)}.</p>`:''}
  ${ev.pAvg<pl.p*.9?`<p class="off-note">Protein liegt bei ${fmt(ev.pAvg)} von ${fmt(pl.p)} g. ${pl.cheapP<1e8?`Mit etwa ${eur(Math.ceil(pl.cheapP))} Budget schafft der Plan dein Proteinziel.`:'Ein Proteinpudding oder Skyr als Snack schließt die Lücke.'}</p>`:''}
 </div>`;
 const cmp=SHOP.stores.map(s=>({s,c:shopCost(ev.needs,s.id)})).filter(x=>!x.c.missing).sort((a,b)=>a.c.total-b.c.total);
 const best=cmp[0];
 const compare=`<div class="card stack"><div class="row between"><h3>Gleicher Plan, anderer Markt</h3>${best&&best.s.id!==pf.store&&best.c.total<c.total-0.005?`<span class="tag t">${esc(best.s.n)} spart ${eur(c.total-best.c.total)}</span>`:'<span class="tag t">Du bist schon am günstigsten</span>'}</div>
  <div class="shop-cmp">${cmp.map(x=>`<button data-act="shopStore" data-v="${x.s.id}" aria-pressed="${x.s.id===pf.store}"><span><i class="sdot" style="background:${esc(x.s.col)}"></i>${esc(x.s.n)}</span><b class="num">${eur(x.c.total)}</b></button>`).join('')}</div></div>`;
 const di=Math.min(SHOP.day,6), dd=ev.days[di], date=addDays(pl.start,di);
 const dayTabs=`<div class="chips shop-days">${ev.days.map((d,i)=>{const dt=addDays(pl.start,i); return `<button class="chip" data-act="shopDay" data-v="${i}" aria-pressed="${i===di}">${dt===today()?'Heute':new Date(dt+'T12:00:00').toLocaleDateString('de-DE',{weekday:'short',day:'numeric'})}</button>`}).join('')}</div>`;
 const logged=new Set((S.food[date]||[]).map(e=>e.fid));
 const meals=dd.meals.map(([id,slot])=>{ const r=shopRec(id), n=shopNut(r,dd.f), sl=SHOP_SLOTS.find(x=>x[0]===slot)[1], times=[...pl.b,...pl.m,...pl.s].includes(id)?ev.days.reduce((a,d)=>a+d.meals.filter(m=>m[0]===id).length,0):0;
  return `<details class="shop-meal"><summary><span style="min-width:0"><span class="lbl">${sl} · ${r.min||'?'} Min.${r.own?' · eigenes':''}</span><b>${esc(r.n)}</b><small>${dd.f!==1?fmt(dd.f,2)+' Portionen · ':''}${fmt(n.k)} kcal · P ${fmt(n.p)} g · KH ${fmt(n.c)} g · F ${fmt(n.f)} g</small></span>${I.right.replace('<svg','<svg class="chev" width="16" height="16"')}</summary>
   <div class="stack" style="gap:10px;padding:4px 4px 2px"><ul class="shop-ing">${r.i.map(([pid,g])=>`<li><span>${esc(SHOP.prod[pid]?.n||pid)}</span><span class="num">${gTxt(g*dd.f)}</span></li>`).join('')}</ul>
   <button class="btn ck-go" data-act="ckStart" data-v="${id}|${dd.f}|${di}.${slot}">${CK_PLAY} Kochmodus: Schritt für Schritt mit Timer</button>
   ${shopStepsHTML(r)}
   <div class="row">${logged.has('shop-'+id+'-'+slot)?`<span class="off-note">${I.check.replace('<svg','<svg width="14" height="14"')} Im Tagebuch eingetragen</span>`:`<button class="btn sm" data-act="shopLog" data-v="${di}.${slot}">${I.plus.replace('<svg','<svg width="14" height="14"')} ${date===today()?'Heute':'Am '+dLabel(date)} eintragen</button>`}
   <button class="btn sm ghost" data-act="shopSwap" data-v="${id}">Tauschen${times>1?` (${times}× diese Woche)`:''}</button>${r.own?`<button class="btn sm ghost" data-act="shopEdit" data-v="${id}">Bearbeiten</button>`:''}</div></div></details>`; }).join('');
 const dTot=dd.meals.reduce((a,[id])=>{const n=shopNut(shopRec(id),dd.f); a.k+=n.k; a.p+=n.p; return a},{k:0,p:0});
 const week=`<div class="card stack"><div class="row between"><h3>Wochenplan</h3><span class="muted num" style="font-size:.875rem">${fmt(dTot.k)} kcal · ${fmt(dTot.p)} g P</span></div>${dayTabs}<div class="stack" style="gap:8px">${meals}</div></div>`;
 const done=c.lines.filter(l=>pf.checked[l.pid]).length;
 const open=pf.listOpen!==false;
 const list=`<div class="card stack shop-list${open?' open':''}"><button class="shop-lhead" data-act="shopList" aria-expanded="${open}" aria-controls="shop-lbody"><h3>Einkaufsliste</h3><span class="row" style="gap:8px;flex-wrap:nowrap"><span class="tag${done===c.lines.length?' t':''}">${done} / ${c.lines.length} im Wagen</span>${I.right.replace('<svg','<svg class="chev" width="16" height="16"')}</span></button>
  ${open?'':`<div class="shop-lmini"><div class="bar"><i style="width:${c.lines.length?done/c.lines.length*100:0}%"></i></div><span class="muted" style="font-size:.85rem">${c.lines.length} Produkte · ${eur(c.total)}${done?` · noch ${eur(c.lines.filter(l=>!pf.checked[l.pid]).reduce((a,l)=>a+l.sum,0))} offen`:''}</span></div>`}
  <div class="shop-lbody" id="shop-lbody" ${open?'':'hidden'}>${SHOP_CATS.map(cat=>{ const ls=c.lines.filter(l=>SHOP.prod[l.pid].cat===cat); if(!ls.length) return '';
   return `<div class="stack" style="gap:6px"><span class="lbl">${esc(cat)}</span>${ls.map(l=>{const p=SHOP.prod[l.pid], on=!!pf.checked[l.pid], own=pf.px[pf.store+':'+l.pid];
    return `<div class="shop-item${on?' done':''}"><button class="check" data-act="shopCheck" data-v="${l.pid}" aria-pressed="${on}" aria-label="${esc(p.n)} abhaken">${I.check}</button>
     <span style="min-width:0"><b>${esc(p.n)}</b><small>${l.packs>1?l.packs+' × ':''}${esc(p.pack)} · gebraucht ${gTxt(l.g)}</small></span>
     <button class="shop-px num" data-act="shopPx" data-v="${l.pid}" aria-label="Preis für ${esc(p.n)} korrigieren">${eur(l.sum)}${own?'<i>eigener Preis</i>':l.packs>1?`<i>${eur(l.price)} / Pkg.</i>`:''}</button></div>`}).join('')}</div>`; }).join('')}</div>
 </div>`;
 return intro+summary+`<div class="grid g2" style="align-items:start"><div class="stack" style="gap:14px">${week}${recipesCard}</div><div class="stack" style="gap:14px">${list}${compare}</div></div>`+setup+shopFoot();
}
function shopFoot(){
 return `<p class="muted" style="font-size:.875rem;margin:0">${SHOP.src==='cloud'?'Preise aus der Iron-Ladder-Preisdatenbank':'Eingebaute Richtpreise'} (Eigenmarken, ohne Angebote, Stand ${esc(SHOP.stand)}). Echte Preise schwanken je Filiale und Woche: tippe auf einen Preis, um ihn zu korrigieren. Nährwerte aus der Iron-Ladder-Lebensmitteldatenbank.</p>`;
}
const shopX=`<button class="icon-btn" data-act="close" aria-label="Schließen">${I.x}</button>`;
function renderShopPx(pid){
 const pf=shopPrefs(), p=SHOP.prod[pid], st=shopStore(pf.store), base=(SHOP.prices[pf.store]||{})[pid], own=pf.px[pf.store+':'+pid];
 return `<div class="row between"><h2>Preis korrigieren</h2>${shopX}</div>
 <p class="muted">${esc(p.n)}, ${esc(p.pack)} bei ${esc(st.n)}. Richtpreis: ${base!=null?eur(base):'keiner'}.</p>
 <div class="field"><label for="shop-px">Preis pro Packung (€)</label><input id="shop-px" type="text" inputmode="decimal" value="${own!=null?fmt(own,2):base!=null?fmt(base,2):''}"></div>
 <div class="row"><button class="btn pri" data-act="shopPxSave" data-v="${pid}">Speichern</button>${own!=null?`<button class="btn ghost" data-act="shopPxReset" data-v="${pid}">Richtpreis nutzen</button>`:''}</div>`;
}
/* Zeile in Rezeptlisten: Nährwerte und Preis je Portion */
function shopRecRow(r,act,extra=''){
 const pf=shopPrefs(), n=shopNut(r), pr=shopPortion(r,pf.store);
 return `<button class="shop-rrow" data-act="${act}" data-v="${r.id}"><span style="min-width:0"><b>${esc(r.n)}</b><small>${fmt(n.k)} kcal · P ${fmt(n.p)} g · ${eur(pr)} / Portion${r.min?` · ${r.min} Min.`:''}</small></span>
  <span class="row" style="gap:4px;flex-wrap:nowrap">${extra}${r.own?'<span class="tag t">Eigen</span>':''}${pf.pin.includes(r.id)?'<span class="tag">Fix</span>':''}${shopVeg(r)?'<span class="tag">Veggie</span>':''}</span></button>`;
}
function renderShopSwap(id){
 const pf=shopPrefs(), pl=pf.plan, r=shopRec(id); if(!r||!pl) return `<div class="row between"><h2>Tauschen</h2>${shopX}</div>`;
 const inPlan=new Set([...pl.b,...pl.m,...pl.s]);
 const alts=shopAll().filter(x=>x.m===r.m&&!inPlan.has(x.id)&&(pf.diet!=='veg'||shopVeg(x)));
 const n0=shopNut(r);
 const sorted=alts.map(x=>({x,own:x.own?0:1,d:Math.abs(shopNut(x).k-n0.k)})).sort((a,b)=>a.own-b.own||a.d-b.d).map(o=>o.x);
 return `<div class="row between" style="flex-wrap:nowrap;align-items:flex-start"><h2 style="flex:1;min-width:0">${esc(r.n)} tauschen</h2>${shopX}</div>
 <p class="muted" style="margin:0">Das neue ${shopKindN(r.m)} ersetzt es an allen Tagen der Woche. Portionen werden wieder auf dein Kalorienziel angepasst, Einkaufsliste und Preis rechnen sich neu.</p>
 <button class="btn" data-act="shopNew" data-v="swap:${id}">${I.plus.replace('<svg','<svg width="14" height="14"')} Eigenes Rezept anlegen und einsetzen</button>
 <div class="shop-rlist">${sorted.map(x=>shopRecRow(x,'shopSwapTo')).join('')||'<div class="empty">Keine weiteren passenden Rezepte.</div>'}</div>`;
}
function renderShopRecipes(){
 const pf=shopPrefs(), f=SHOP.rf;
 const list=shopAll().filter(r=>f==='all'||(f==='own'?r.own:f==='pin'?pf.pin.includes(r.id):r.m===f));
 const groups=SHOP_KINDS.map(([k,n])=>{ const ls=list.filter(r=>r.m===k); return ls.length?`<span class="lbl" style="margin-top:6px">${n} (${ls.length})</span>${ls.map(r=>shopRecRow(r,'shopView')).join('')}`:''; }).join('');
 return `<div class="row between"><h2>Rezepte</h2>${shopX}</div>
 <div class="chips">${[['all','Alle'],['b','Frühstück'],['m','Hauptgerichte'],['s','Snacks'],['own','Eigene'],['pin','Fix eingeplant']].map(([k,n])=>`<button class="chip" data-act="shopRf" data-v="${k}" aria-pressed="${f===k}">${n}</button>`).join('')}</div>
 <button class="btn" data-act="shopNew">${I.plus.replace('<svg','<svg width="14" height="14"')} Eigenes Rezept anlegen</button>
 <div class="shop-rlist">${groups||`<div class="empty">${f==='own'?'Noch keine eigenen Rezepte. Leg dein Lieblingsgericht an, dann plant die App es mit ein.':'Nichts gefunden.'}</div>`}</div>`;
}
function renderShopView(id){
 const pf=shopPrefs(), r=shopRec(id); if(!r) return `<div class="row between"><h2>Rezept</h2>${shopX}</div><div class="empty">Rezept nicht gefunden.</div>`;
 const n=shopNut(r), pin=pf.pin.includes(id), pl=pf.plan, inPlan=pl&&[...pl.b,...pl.m,...pl.s].includes(id);
 return `<div class="row between" style="flex-wrap:nowrap"><button class="icon-btn" data-act="shopRecipes" aria-label="Zurück">${I.left}</button><h2 style="flex:1">${esc(r.n)}</h2>${shopX}</div>
 <div class="row" style="gap:6px"><span class="tag">${shopKindN(r.m)}</span>${r.min?`<span class="tag">${r.min} Min.</span>`:''}${shopVeg(r)?'<span class="tag">Vegetarisch</span>':''}${r.own?'<span class="tag t">Eigenes Rezept</span>':''}${inPlan?'<span class="tag t">Diese Woche im Plan</span>':''}</div>
 <div class="shop-stats"><div><b class="num">${fmt(n.k)}</b><span>kcal / Portion</span></div><div><b class="num">${fmt(n.p)} g</b><span>Protein</span></div><div><b class="num">${eur(shopPortion(r,pf.store))}</b><span>bei ${esc(shopStore(pf.store).n)}</span></div></div>
 <ul class="shop-ing">${r.i.map(([pid,g])=>`<li><span>${esc(SHOP.prod[pid]?.n||pid)}</span><span class="num">${gTxt(g)}</span></li>`).join('')}</ul>
 <button class="btn pri" data-act="ckStart" data-v="${id}|1|">${CK_PLAY} Kochmodus starten</button>
 ${shopStepsHTML(r)}
 <button class="btn ${pin?'':'ghost'}" data-act="shopPin" data-v="${id}" aria-pressed="${pin}">${pin?I.check.replace('<svg','<svg width="14" height="14"')+' Wird immer eingeplant':'Immer einplanen'}</button>
 <div class="row">${r.own?`<button class="btn" data-act="shopEdit" data-v="${id}">Bearbeiten</button><button class="btn ghost danger" data-act="shopDel" data-v="${id}">${SHOP.delAsk===id?'Wirklich löschen?':'Löschen'}</button>`:`<button class="btn" data-act="shopCopy" data-v="${id}">Kopieren & anpassen</button>`}</div>`;
}
/* Editor für eigene Rezepte */
let RE=null;
function shopProdOptions(sel){
 return `<option value="">Produkt wählen …</option>`+SHOP_CATS.map(cat=>`<optgroup label="${esc(cat)}">${Object.values(SHOP.prod).filter(p=>p.cat===cat).sort((a,b)=>a.n.localeCompare(b.n,'de')).map(p=>`<option value="${p.id}" ${p.id===sel?'selected':''}>${esc(p.n)} (${esc(p.pack)})</option>`).join('')}</optgroup>`).join('');
}
function shopReSum(){
 const pf=shopPrefs(), r={id:'_re',m:RE.m,i:RE.i.filter(([pid,g])=>pid&&g>0)}; delete SHOP_NUT._re;
 if(!r.i.length) return `<p class="off-note">Füge Zutaten hinzu, dann siehst du Nährwerte und Preis pro Portion.</p>`;
 const n=shopNut(r); delete SHOP_NUT._re;
 return `<div class="shop-stats"><div><b class="num">${fmt(n.k)}</b><span>kcal / Portion</span></div><div><b class="num">${fmt(n.p)} g</b><span>Protein</span></div><div><b class="num">${eur(shopPortion(r,pf.store))}</b><span>bei ${esc(shopStore(pf.store).n)}</span></div></div>`;
}
function renderShopEdit(){
 if(!RE) return '';
 return `<div class="row between"><h2>${RE.id?'Rezept bearbeiten':'Eigenes Rezept'}</h2>${shopX}</div>
 <div class="field"><label for="re-n">Name</label><input id="re-n" type="text" value="${esc(RE.n)}" placeholder="z. B. Mamas Hähnchen-Curry" data-re="n"></div>
 <div class="row" style="align-items:flex-end"><div class="field" style="flex:1"><label>Mahlzeit</label><div class="chips">${SHOP_KINDS.map(([k,n])=>`<button class="chip" data-act="reM" data-v="${k}" aria-pressed="${RE.m===k}">${n}</button>`).join('')}</div></div>
  <div class="field" style="width:110px"><label for="re-min">Minuten</label><input id="re-min" type="text" inputmode="numeric" value="${RE.min||''}" data-re="min"></div></div>
 <div class="field"><label>Zutaten für 1 Portion</label><div class="stack" style="gap:8px" id="re-ing">${RE.i.map(([pid,g],k)=>`<div class="re-row"><select data-re-p="${k}" aria-label="Zutat ${k+1}">${shopProdOptions(pid)}</select><input type="text" inputmode="decimal" value="${g||''}" placeholder="g" data-re-g="${k}" aria-label="Menge in Gramm"><span class="muted">g</span><button class="icon-btn" data-act="reRm" data-v="${k}" aria-label="Zutat entfernen">${I.trash}</button></div>`).join('')}</div>
  <button class="btn sm ghost" data-act="reAdd" style="align-self:flex-start">${I.plus.replace('<svg','<svg width="14" height="14"')} Zutat</button>
  <p class="off-note">Zutaten kommen aus der Preisliste, damit Preis und Einkaufsliste stimmen. Gewürze, Salz und Kräuter brauchst du nicht eintragen.</p></div>
 <div id="re-sum">${shopReSum()}</div>
 <div class="field"><label for="re-st">Zubereitung: jede Zeile ein Schritt</label><textarea id="re-st" rows="5" data-re="st" class="re-ta" placeholder="Reis 15 Minuten kochen.&#10;Hähnchen würfeln und scharf anbraten.&#10;Alles mischen und servieren.">${esc(RE.st||'')}</textarea><p class="off-note">Zeiten wie „10 Minuten“ werden im Kochmodus automatisch zum Timer, die Animation passt die App dem Arbeitsschritt an.</p></div>
 <button class="btn pri" data-act="reSave">${RE.swap?'Speichern & in den Plan tauschen':'Speichern'}</button>`;
}
function shopInput(t){
 if(t.dataset.shopBudget!==undefined){ shopPrefs().budget=+t.value; const o=$('#shop-bv'); if(o) o.textContent=t.value+' €'; clearTimeout(window._sb); window._sb=setTimeout(()=>{saveProfile(); SHOP.dirty=!!shopPrefs().plan&&shopPrefs().plan.budget!==+t.value; render()},500); return true; }
 if(!RE) return false;
 if(t.dataset.re){ RE[t.dataset.re]=t.dataset.re==='min'?Math.round(num(t.value)):t.value; return true; }
 if(t.dataset.reG!==undefined){ RE.i[+t.dataset.reG][1]=num(t.value); const s=$('#re-sum'); if(s) s.innerHTML=shopReSum(); return true; }
 return false;
}
function shopChange(t){
 if(RE&&t.dataset.reP!==undefined){ RE.i[+t.dataset.reP][0]=t.value; const s=$('#re-sum'); if(s) s.innerHTML=shopReSum(); return true; }
 return false;
}
const SHOP_H={
 foodView:v=>{V.foodView=v;haptic(6);render();window.scrollTo(0,0)},
 shopStore:v=>{shopPrefs().store=v;saveProfile();render()},
 shopDiet:v=>{shopPrefs().diet=v;saveProfile();render()},
 shopPlan:()=>{const b=$('[data-shop-budget]'); if(b) shopPrefs().budget=+b.value; if(!shopGenerate()) return; haptic(10); render(); const pl=shopPrefs().plan; toast(`Plan steht: ${pl.m.length} Hauptgerichte, ${pl.b.length} Frühstücke`)},
 shopDay:v=>{SHOP.day=+v;render()},
 shopList:()=>{const pf=shopPrefs(); pf.listOpen=pf.listOpen===false; haptic(6); saveProfile(); render()},
 shopCheck:v=>{const c=shopPrefs().checked; c[v]=!c[v]; if(!c[v]) delete c[v]; haptic(6); saveProfile(); render()},
 shopLog:v=>{const [di,slot]=v.split('.'); const pl=shopPrefs().plan, ev=shopPlanView(), day=ev.days[+di], m=day.meals.find(x=>x[1]===slot); if(!m) return;
  const r=shopRec(m[0]), n=shopNut(r,day.f), date=addDays(pl.start,+di);
  (S.food[date]=S.food[date]||[]).push({id:uid(),fid:'shop-'+r.id+'-'+slot,n:r.n,g:Math.round(n.g),meal:slot,k:n.k,p:n.p,c:n.c,f:n.f}); saveDay(date); render(); toast(`${r.n} eingetragen (${fmt(n.k)} kcal)`)},
 shopPx:v=>openSheet('shopPx',v),
 shopPxSave:v=>{const x=num($('#shop-px').value); if(!(x>0&&x<200)){toast('Gib einen Preis in Euro ein.');return} const pf=shopPrefs(); pf.px[pf.store+':'+v]=Math.round(x*100)/100; saveProfile(); closeSheet(); render(); toast('Preis gespeichert')},
 shopPxReset:v=>{const pf=shopPrefs(); delete pf.px[pf.store+':'+v]; saveProfile(); closeSheet(); render()},
 shopSwap:v=>openSheet('shopSwap',v),
 shopSwapTo:v=>{const old=SHEET&&SHEET.arg; shopSwapIn(old,v); saveProfile(); closeSheet(); render(); haptic(10); toast(`Getauscht: ${shopRec(v).n}`)},
 shopRecipes:()=>{SHOP.delAsk=null; openSheet('shopRecipes')},
 shopRf:v=>{SHOP.rf=v; drawSheet()},
 shopView:v=>{SHOP.delAsk=null; openSheet('shopView',v)},
 shopPin:v=>{const p=shopPrefs().pin, i=p.indexOf(v); if(i>=0) p.splice(i,1); else p.push(v); saveProfile(); drawSheet(); toast(i>=0?'Nicht mehr fest eingeplant':'Wird beim nächsten Plan immer eingeplant')},
 shopNew:v=>{RE={id:null,n:'',m:'m',min:'',i:[['',0],['',0],['',0]],st:'',swap:v&&v.startsWith('swap:')?v.slice(5):null}; if(RE.swap){ const o=shopRec(RE.swap); if(o) RE.m=o.m; } openSheet('shopEdit')},
 shopEdit:v=>{const r=shopRec(v); if(!r||!r.own) return; RE={id:r.id,n:r.n,m:r.m,min:r.min||'',i:r.i.map(x=>x.slice()),st:r.st||'',swap:null}; openSheet('shopEdit')},
 shopCopy:v=>{const r=shopRec(v); RE={id:null,n:r.n+' (meins)',m:r.m,min:r.min||'',i:r.i.map(x=>x.slice()),st:r.st||'',swap:null}; openSheet('shopEdit')},
 shopDel:v=>{ if(SHOP.delAsk!==v){SHOP.delAsk=v; drawSheet(); return}
  const pl=shopPrefs().plan, r=shopRec(v);
  if(pl&&[...pl.b,...pl.m,...pl.s].includes(v)){ const inPlan=new Set([...pl.b,...pl.m,...pl.s]); const alt=SHOP_RECIPES.find(x=>x.m===r.m&&!inPlan.has(x.id)); if(alt) shopSwapIn(v,alt.id); }
  S.profile.shopRecipes=shopOwn().filter(x=>x.id!==v); shopPrefs().pin=shopPrefs().pin.filter(x=>x!==v); SHOP.delAsk=null; delete SHOP_NUT[v]; saveProfile(); SHOP.rf='own'; openSheet('shopRecipes'); render(); toast('Rezept gelöscht')},
 reM:v=>{if(RE.swap&&v!==RE.m){toast('Beim Tauschen bleibt die Mahlzeit gleich.');return} RE.m=v; drawSheet()},
 reAdd:()=>{RE.i.push(['',0]); drawSheet(); setTimeout(()=>{const s=document.querySelector(`[data-re-p="${RE.i.length-1}"]`); if(s) s.focus()},30)},
 reRm:v=>{RE.i.splice(+v,1); if(!RE.i.length) RE.i.push(['',0]); drawSheet()},
 reSave:()=>{const ing=RE.i.filter(([pid,g])=>pid&&g>0).map(([pid,g])=>[pid,Math.round(g)]);
  if(!RE.n.trim()){toast('Gib dem Rezept einen Namen.');return} if(!ing.length){toast('Füge mindestens eine Zutat mit Menge hinzu.');return}
  const r={id:RE.id||'u-'+uid(),n:RE.n.trim(),m:RE.m,min:+RE.min||0,i:ing,st:(RE.st||'').trim(),own:1};
  const list=shopOwn(), k=list.findIndex(x=>x.id===r.id); if(k>=0) list[k]=r; else list.push(r); delete SHOP_NUT[r.id];
  const swap=RE.swap; RE=null; if(swap) shopSwapIn(swap,r.id); saveProfile(); closeSheet(); render(); haptic(10);
  toast(swap?`${r.n} ist jetzt im Plan`:k>=0?'Rezept gespeichert':`${r.n} gespeichert, wird ab jetzt mitgeplant`)},
};
/* ============ Anleitungen & Kochmodus ============ */
const CK_PLAY='<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>';
const CK_ART={
 prep:`<svg viewBox="0 0 64 64" class="ck ck-prep" aria-hidden="true"><circle class="ck-a ck-b1" cx="22" cy="27" r="7"/><circle class="ck-w ck-b2" cx="34" cy="24" r="8"/><circle class="ck-a2 ck-b3" cx="45" cy="28" r="6"/><path class="ck-l" d="M9 32h46l-5 20H14z"/><path class="ck-l" d="M22 39v6M32 39v6M42 39v6"/></svg>`,
 cut:`<svg viewBox="0 0 64 64" class="ck ck-cut" aria-hidden="true"><rect class="ck-s" x="5" y="46" width="54" height="9" rx="4"/><g class="ck-pieces"><rect class="ck-a" x="10" y="38" width="6" height="8" rx="2"/><rect class="ck-a" x="18" y="38" width="6" height="8" rx="2"/><rect class="ck-a" x="26" y="38" width="6" height="8" rx="2"/></g><rect class="ck-a ck-whole" x="34" y="36" width="16" height="10" rx="4"/><g class="ck-knife"><path class="ck-blade" d="M30 14h6v26l-6 2z"/><rect class="ck-handle" x="30" y="4" width="6" height="11" rx="2"/></g></svg>`,
 pan:`<svg viewBox="0 0 64 64" class="ck ck-pan" aria-hidden="true"><g class="ck-sizzle"><path class="ck-m s1" d="M20 22c-2-3 2-5 0-8"/><path class="ck-m s2" d="M30 20c-2-3 2-5 0-8"/><path class="ck-m s3" d="M40 22c-2-3 2-5 0-8"/></g><g class="ck-panbody"><circle class="ck-a ck-f1" cx="22" cy="38" r="4"/><circle class="ck-w ck-f2" cx="32" cy="36" r="4.5"/><circle class="ck-a ck-f3" cx="41" cy="38" r="3.5"/><path class="ck-l" d="M8 40h46c0 8-6 12-13 12H21c-7 0-13-4-13-12z"/><path class="ck-l" d="M54 42l8-3"/></g><path class="ck-flame" d="M24 60c2-4 4-4 4-7 2 3 3 4 3 7zM34 60c2-4 4-4 4-7 2 3 3 4 3 7z"/></svg>`,
 pot:`<svg viewBox="0 0 64 64" class="ck ck-pot" aria-hidden="true"><g><path class="ck-m st1" d="M22 18c-3-3 3-6 0-10"/><path class="ck-m st2" d="M32 16c-3-3 3-6 0-10"/><path class="ck-m st3" d="M42 18c-3-3 3-6 0-10"/></g><g class="ck-lid"><path class="ck-l" d="M12 27h40"/><path class="ck-l" d="M29 23h6"/></g><path class="ck-l" d="M14 31h36v16c0 6-4 9-9 9H23c-5 0-9-3-9-9z"/><path class="ck-l" d="M14 35H8M50 35h6"/><path class="ck-bub b1" d="M24 44a2 2 0 1 0 0.1 0z"/><path class="ck-bub b2" d="M34 46a2.5 2.5 0 1 0 0.1 0z"/><path class="ck-bub b3" d="M41 43a1.8 1.8 0 1 0 0.1 0z"/></svg>`,
 oven:`<svg viewBox="0 0 64 64" class="ck ck-oven" aria-hidden="true"><g><path class="ck-m h1" d="M20 12c-2-2 2-4 0-6"/><path class="ck-m h2" d="M32 12c-2-2 2-4 0-6"/><path class="ck-m h3" d="M44 12c-2-2 2-4 0-6"/></g><rect class="ck-l" x="8" y="16" width="48" height="42" rx="6"/><path class="ck-l" d="M8 26h48"/><circle class="ck-knob" cx="16" cy="21" r="1.8"/><circle class="ck-knob" cx="24" cy="21" r="1.8"/><rect class="ck-glow" x="15" y="32" width="34" height="19" rx="3"/><rect class="ck-l" x="15" y="32" width="34" height="19" rx="3"/><path class="ck-l" d="M22 44h20"/></svg>`,
 mix:`<svg viewBox="0 0 64 64" class="ck ck-mix" aria-hidden="true"><path class="ck-s" d="M12 34h40c0 12-9 20-20 20s-20-8-20-20z"/><g class="ck-spoon"><path class="ck-l" d="M34 36L46 8"/><circle class="ck-a" cx="33.5" cy="38" r="4.5"/></g><path class="ck-l" d="M10 34h44c0 13-10 21-22 21S10 47 10 34z"/><path class="ck-swirl" d="M22 40c4 3 16 3 20 0"/></svg>`,
 blend:`<svg viewBox="0 0 64 64" class="ck ck-blend" aria-hidden="true"><g class="ck-jar"><path class="ck-s" d="M18 14h28l-4 30H22z"/><g class="ck-whirl"><path class="ck-a" d="M32 26c6 0 8 4 6 8-3-3-7-3-10 0-2-4 0-8 4-8z"/></g><path class="ck-l" d="M18 12h28l-4 32H22z"/><path class="ck-l" d="M16 12h32"/></g><rect class="ck-l" x="18" y="46" width="28" height="12" rx="3"/><circle class="ck-knob" cx="32" cy="52" r="2.2"/></svg>`,
 rest:`<svg viewBox="0 0 64 64" class="ck ck-rest" aria-hidden="true"><circle class="ck-s" cx="32" cy="35" r="21"/><circle class="ck-l" cx="32" cy="35" r="21"/><path class="ck-l" d="M27 10h10M32 10v4"/><path class="ck-l ck-hand" d="M32 35V22"/><path class="ck-l ck-hand2" d="M32 35h8"/><circle class="ck-knob" cx="32" cy="35" r="2.4"/></svg>`,
 plate:`<svg viewBox="0 0 64 64" class="ck ck-plate" aria-hidden="true"><path class="ck-star p1" d="M14 14l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z"/><path class="ck-star p2" d="M50 10l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2z"/><path class="ck-star p3" d="M54 30l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z"/><g class="ck-food"><path class="ck-a" d="M18 42c0-9 6-14 14-14s14 5 14 14z"/><circle class="ck-w" cx="27" cy="34" r="3"/><circle class="ck-a2" cx="37" cy="33" r="2.5"/></g><ellipse class="ck-l" cx="32" cy="45" rx="25" ry="7"/><ellipse class="ck-l" cx="32" cy="45" rx="15" ry="3.5"/></svg>`,
};
function shopSteps(r){
 if(SHOP_STEPS[r.id]) return SHOP_STEPS[r.id];
 const raw=String(r.st||'').trim(); if(!raw) return [['plate','Alles zubereiten und anrichten.']];
 const parts=(raw.includes('\n')?raw.split(/\n+/):raw.split(/(?<=[.!])\s+(?=[A-ZÄÖÜ])/)).map(x=>x.replace(/^\s*(\d+[.)]|[-•])\s*/,'').trim()).filter(Boolean);
 const type=t=>/über nacht|ziehen|ruhen|quellen|abkühl|kühlschrank|auftau/i.test(t)?'rest':/ofen|back|°c|grill/i.test(t)?'oven':/brat|pfanne|röst|anbrat|dünst/i.test(t)?'pan':/koch|köchel|sied|wasser|dämpf|topf/i.test(t)?'pot':/püri|mix/i.test(t)?'blend':/schneid|würfel|hack|reib|schäl|streifen|scheiben/i.test(t)?'cut':/rühr|misch|verquirl|knet|heb/i.test(t)?'mix':/anricht|servier|garnier|drüber|darüber/i.test(t)?'plate':'prep';
 return parts.map(t=>{ const m=t.match(/(\d+)\s*(min|minuten)\b/i); return [type(t),t,m?+m[1]:0]; });
}
function shopStepsHTML(r){
 return `<ol class="ck-steps">${shopSteps(r).map((s,i)=>`<li><span class="ck-ic">${CK_ART[s[0]]||CK_ART.prep}</span><div><span class="lbl">Schritt ${i+1}${s[2]?` · ${s[2]} Min.`:''}</span><p>${esc(s[1])}</p>${s[3]?`<p class="ck-tip"><b>Tipp:</b> ${esc(s[3])}</p>`:''}</div></li>`).join('')}</ol>`;
}
let COOK=null;
const mmss=s=>`${Math.floor(s/60)}:${String(Math.max(0,s%60)).padStart(2,'0')}`;
function renderCook(){
 const r=COOK&&shopRec(COOK.id); if(!r) return `<div class="row between"><h2>Kochmodus</h2>${shopX}</div>`;
 const steps=shopSteps(r), total=steps.length+1, i=COOK.step, last=i===total-1, s=i?steps[i-1]:null;
 const logged=COOK.log&&(S.food[COOK.date]||[]).some(e=>e.fid==='shop-'+r.id+'-'+COOK.log.split('.')[1]);
 const tRun=COOK.tEnd&&COOK.tStep===i, left=tRun?Math.ceil((COOK.tEnd-Date.now())/1000):0;
 const body=i===0?`<div class="ck-big">${CK_ART.prep}</div><span class="lbl ck-c">Vorbereitung · alles bereitlegen</span>
   <ul class="shop-ing ck-ing">${r.i.map(([pid,g])=>`<li><span>${esc(SHOP.prod[pid]?.n||pid)}</span><span class="num">${gTxt(g*COOK.f)}</span></li>`).join('')}</ul>
   <p class="off-note ck-c">${COOK.f!==1?`Mengen für ${fmt(COOK.f,2)} Portionen, passend zu deinem Tagesziel. `:''}Dazu Salz, Pfeffer und die Gewürze aus dem Rezept.</p>`
  :`<div class="ck-big">${CK_ART[s[0]]||CK_ART.prep}</div><span class="lbl ck-c">Schritt ${i} von ${total-1}</span><p class="ck-text">${esc(s[1])}</p>${s[3]?`<p class="ck-tip"><b>Tipp:</b> ${esc(s[3])}</p>`:''}
   ${s[2]?`<div class="ck-timer">${tRun?`<b class="num" id="ck-t">${mmss(left)}</b><button class="btn sm ghost" data-act="ckTimer" data-v="stop">Stopp</button>`:`<button class="btn" data-act="ckTimer" data-v="${s[2]}">${I.clock||''} Timer ${s[2]}:00 starten</button>`}</div>`:''}`;
 return `<div class="row between" style="flex-wrap:nowrap;align-items:flex-start"><div style="min-width:0;flex:1"><span class="lbl">Kochmodus${r.min?` · ca. ${r.min} Min.`:''}</span><h2>${esc(r.n)}</h2></div>${shopX}</div>
 <div class="ck-prog" aria-hidden="true">${Array.from({length:total},(_,k)=>`<i class="${k<=i?'on':''}"></i>`).join('')}</div>
 <div class="ck-stage ${COOK.dir<0?'back':''}">${body}</div>
 <div class="ck-nav"><button class="btn" data-act="ckPrev" ${i===0?'disabled':''}>${I.left.replace('<svg','<svg width="16" height="16"')} Zurück</button><button class="btn pri" data-act="ckNext">${last?(COOK.log&&!logged?'Fertig & eintragen':'Fertig'):'Weiter'} ${last?'':I.right.replace('<svg','<svg width="16" height="16"')}</button></div>`;
}
function ckTick(){
 if(!COOK) return;
 if(COOK.tEnd){ const left=Math.ceil((COOK.tEnd-Date.now())/1000); const el=$('#ck-t'); if(el) el.textContent=mmss(left);
  if(left<=0){ const st=COOK.tStep; COOK.tEnd=null; COOK.tStep=null; haptic(40); setTimeout(()=>haptic(40),250); toast(`Timer fertig: Schritt ${st}`); if(SHEET&&SHEET.kind==='cook') drawSheet(); } }
 if(!(SHEET&&SHEET.kind==='cook')&&!COOK.tEnd){ clearInterval(COOK.int); try{COOK.lock&&COOK.lock.release()}catch(e){} COOK=null; }
}
Object.assign(SHOP_H,{
 ckStart:v=>{ const [id,f,log]=v.split('|'); if(COOK){clearInterval(COOK.int); try{COOK.lock&&COOK.lock.release()}catch(e){}}
  const pl=shopPrefs().plan; COOK={id,f:+f||1,log:log||null,date:log&&pl?addDays(pl.start,+log.split('.')[0]):null,step:0,dir:1,tEnd:null,tStep:null,lock:null};
  COOK.int=setInterval(ckTick,1000); try{ navigator.wakeLock&&navigator.wakeLock.request('screen').then(l=>{ if(COOK) COOK.lock=l; }).catch(()=>{}); }catch(e){}
  openSheet('cook')},
 ckNext:()=>{ const r=shopRec(COOK.id), total=shopSteps(r).length+1;
  if(COOK.step<total-1){ COOK.step++; COOK.dir=1; haptic(6); drawSheet(); $('#layer .sheet')?.scrollTo?.({top:0,behavior:'smooth'}); return; }
  const log=COOK.log, logged=log&&(S.food[COOK.date]||[]).some(e=>e.fid==='shop-'+r.id+'-'+log.split('.')[1]);
  closeSheet(); if(log&&!logged) SHOP_H.shopLog(log); else toast('Guten Appetit!'); },
 ckPrev:()=>{ if(COOK.step>0){ COOK.step--; COOK.dir=-1; drawSheet(); } },
 ckTimer:v=>{ if(v==='stop'){ COOK.tEnd=null; COOK.tStep=null; } else { COOK.tEnd=Date.now()+(+v)*60000; COOK.tStep=COOK.step; haptic(10); } drawSheet(); },
});
