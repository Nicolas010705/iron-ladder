/* Preise: Supabase (shop_*-Tabellen) wenn vorhanden, sonst eingebaute Richtpreise. Nährwerte: App-Datenbank (FOODS). */
const SHOP_SLOTS=[['b','Frühstück','b'],['l','Mittagessen','m'],['d','Abendessen','m'],['s','Snack','s']];
const SHOP_CATS=['Obst & Gemüse','Fleisch & Fisch','Milch & Eier','Getreide & Beilagen','Vorrat'];
let SHOP={src:'seed',stand:SHOP_SEED.stand,stores:SHOP_SEED.stores,prod:{},prices:SHOP_SEED.prices,loading:false,day:0,dirty:false};
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
  Object.assign(SHOP,{src:'cloud',stand:c.stand,stores:c.stores,prices}); shopIndex(c.products); SHOP.fresh=true;
  try{ localStorage.setItem('ironladder.shop',JSON.stringify(c)); }catch(e){}
  if(V.tab==='food'&&V.foodView==='shop') render();
 }catch(e){ SHOP.fresh=true; /* Tabellen noch nicht angelegt: eingebaute Preise */ }
 SHOP.loading=false;
}
const shopPrefs=()=>{ const p=S.profile; p.shop=p.shop||{store:'lidl',budget:50,diet:'all',checked:{},px:{}}; p.shop.checked=p.shop.checked||{}; p.shop.px=p.shop.px||{}; return p.shop; };
const shopStore=id=>SHOP.stores.find(s=>s.id===id)||SHOP.stores[0];
function shopPrice(store,pid){ const o=shopPrefs().px[store+':'+pid]; if(o) return o; return (SHOP.prices[store]||{})[pid]??null; }
const shopFoodCache={};
function shopFood(pid){
 const pr=SHOP.prod[pid]; if(!pr) return null;
 return shopFoodCache[pr.food]||(shopFoodCache[pr.food]=FOODS.find(f=>f.n===pr.food&&!f.dish&&!f.own&&!f.off)||null);
}
const shopRec=id=>SHOP_RECIPES.find(r=>r.id===id);
function shopNut(r,f=1){ const t={k:0,p:0,c:0,f:0,g:0}; r.i.forEach(([pid,g])=>{ const fd=shopFood(pid); if(!fd) return; const x=g*f; t.k+=fd.k*x/100; t.p+=fd.p*x/100; t.c+=fd.c*x/100; t.f+=fd.f*x/100; t.g+=x; }); return t; }
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
  const base=day.reduce((a,[id])=>{const n=shopNut(shopRec(id)); a.k+=n.k; a.p+=n.p; return a},{k:0,p:0});
  const f=Math.min(1.6,Math.max(0.7,Math.round(t.kcal/base.k*20)/20));
  kErr+=Math.abs(base.k*f-t.kcal)/t.kcal; pSum+=base.p*f;
  day.forEach(([id])=>shopRec(id).i.forEach(([pid,g])=>needs[pid]=(needs[pid]||0)+g*f));
  return {f,meals:day};
 });
 const cost=shopCost(needs,store), pAvg=pSum/7;
 const short=Math.max(0,1-pAvg/t.p), over=Math.max(0,cost.total-budget);
 const score=over*8+short*200+kErr/7*160+cost.total*(over?0.15:0.04)-(combo.m.length>3?1.5:0)+cost.missing*20;
 return {score,days:out,cost,pAvg,needs};
}
const combos=(arr,k)=>{ const r=[]; const go=(i,acc)=>{ if(acc.length===k){r.push(acc.slice());return} for(let j=i;j<arr.length;j++){acc.push(arr[j]);go(j+1,acc);acc.pop()} }; go(0,[]); return r; };
function shopGenerate(){
 const pf=shopPrefs(), t=S.profile.targets, ok=r=>pf.diet!=='veg'||r.veg;
 const ids=m=>SHOP_RECIPES.filter(r=>r.m===m&&ok(r)).map(r=>r.id);
 const B=combos(ids('b'),2), M=combos(ids('m'),3).concat(combos(ids('m'),4)), Sn=[[]].concat(combos(ids('s'),1),combos(ids('s'),2));
 const res=[];
 B.forEach(b=>M.forEach(m=>Sn.forEach(s=>{ const e=shopEval({b,m,s},t,pf.store,pf.budget); res.push({b,m,s,score:e.score,cost:e.cost.total,pOk:e.pAvg>=t.p*.95}); })));
 res.sort((a,b)=>a.score-b.score);
 const prev=pf.plan?JSON.stringify([pf.plan.b,pf.plan.m,pf.plan.s]):'';
 const top=res.slice(0,12).filter(x=>JSON.stringify([x.b,x.m,x.s])!==prev);
 const pick=top[Math.floor(Math.random()*Math.min(6,top.length))]||res[0];
 pf.plan={b:pick.b,m:pick.m,s:pick.s,start:today(),store:pf.store,budget:pf.budget,diet:pf.diet,kcal:t.kcal,p:t.p,cheapest:res.reduce((a,x)=>Math.min(a,x.cost),1e9),cheapP:res.reduce((a,x)=>x.pOk?Math.min(a,x.cost):a,1e9)};
 pf.checked={}; SHOP.day=0; SHOP.dirty=false; saveProfile();
}
function shopPlanView(){
 const pf=shopPrefs(), pl=pf.plan; if(!pl) return null;
 if(!pl.b.concat(pl.m,pl.s).every(shopRec)) return null;
 return shopEval(pl,{kcal:pl.kcal,p:pl.p},pf.store,pf.budget);
}
const eur=v=>Number(v||0).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
const gTxt=g=>g>=1000?fmt(g/1000,1).replace(/,0$/,'')+' kg':fmt(Math.round(g/5)*5)+' g';
function renderShop(){
 const pf=shopPrefs(), t=S.profile.targets, ev=shopPlanView(), pl=pf.plan, st=shopStore(pf.store);
 shopLoad();
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
 if(!ev) return intro+setup+`<div class="empty">Wähle Supermarkt und Budget. Die App stellt aus ${SHOP_RECIPES.length} Rezepten den Plan zusammen, der dein Kalorien- und Proteinziel am günstigsten trifft, und rechnet mit echten Packungsgrößen.</div>`+shopFoot();
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
 const meals=dd.meals.map(([id,slot])=>{ const r=shopRec(id), n=shopNut(r,dd.f), sl=SHOP_SLOTS.find(x=>x[0]===slot)[1];
  return `<details class="shop-meal"><summary><span style="min-width:0"><span class="lbl">${sl} · ${r.min} Min.</span><b>${esc(r.n)}</b><small>${dd.f!==1?fmt(dd.f,2)+' Portionen · ':''}${fmt(n.k)} kcal · P ${fmt(n.p)} g · KH ${fmt(n.c)} g · F ${fmt(n.f)} g</small></span>${I.right.replace('<svg','<svg class="chev" width="16" height="16"')}</summary>
   <div class="stack" style="gap:10px;padding:4px 4px 2px"><ul class="shop-ing">${r.i.map(([pid,g])=>`<li><span>${esc(SHOP.prod[pid]?.n||pid)}</span><span class="num">${gTxt(g*dd.f)}</span></li>`).join('')}</ul>
   <p class="muted" style="font-size:.9rem">${esc(r.st)}</p>
   ${logged.has('shop-'+id+'-'+slot)?`<span class="off-note">${I.check.replace('<svg','<svg width="14" height="14"')} Im Tagebuch eingetragen</span>`:`<button class="btn sm" data-act="shopLog" data-v="${di}.${slot}">${I.plus.replace('<svg','<svg width="14" height="14"')} ${date===today()?'Heute':'Am '+dLabel(date)} eintragen</button>`}</div></details>`; }).join('');
 const dTot=dd.meals.reduce((a,[id])=>{const n=shopNut(shopRec(id),dd.f); a.k+=n.k; a.p+=n.p; return a},{k:0,p:0});
 const week=`<div class="card stack"><div class="row between"><h3>Wochenplan</h3><span class="muted num" style="font-size:.875rem">${fmt(dTot.k)} kcal · ${fmt(dTot.p)} g P</span></div>${dayTabs}<div class="stack" style="gap:8px">${meals}</div></div>`;
 const done=c.lines.filter(l=>pf.checked[l.pid]).length;
 const list=`<div class="card stack"><div class="row between"><h3>Einkaufsliste</h3><span class="tag">${done} / ${c.lines.length} im Wagen</span></div>
  ${SHOP_CATS.map(cat=>{ const ls=c.lines.filter(l=>SHOP.prod[l.pid].cat===cat); if(!ls.length) return '';
   return `<div class="stack" style="gap:6px"><span class="lbl">${esc(cat)}</span>${ls.map(l=>{const p=SHOP.prod[l.pid], on=!!pf.checked[l.pid], own=pf.px[pf.store+':'+l.pid];
    return `<div class="shop-item${on?' done':''}"><button class="check" data-act="shopCheck" data-v="${l.pid}" aria-pressed="${on}" aria-label="${esc(p.n)} abhaken">${I.check}</button>
     <span style="min-width:0"><b>${esc(p.n)}</b><small>${l.packs>1?l.packs+' × ':''}${esc(p.pack)} · gebraucht ${gTxt(l.g)}</small></span>
     <button class="shop-px num" data-act="shopPx" data-v="${l.pid}" aria-label="Preis für ${esc(p.n)} korrigieren">${eur(l.sum)}${own?'<i>eigener Preis</i>':l.packs>1?`<i>${eur(l.price)} / Pkg.</i>`:''}</button></div>`}).join('')}</div>`; }).join('')}
 </div>`;
 return intro+summary+`<div class="grid g2" style="align-items:start">${week}<div class="stack" style="gap:14px">${list}${compare}</div></div>`+setup+shopFoot();
}
function shopFoot(){
 return `<p class="muted" style="font-size:.875rem;margin:0">${SHOP.src==='cloud'?'Preise aus der Iron-Ladder-Preisdatenbank':'Eingebaute Richtpreise'} (Eigenmarken, ohne Angebote, Stand ${esc(SHOP.stand)}). Echte Preise schwanken je Filiale und Woche: tippe auf einen Preis, um ihn zu korrigieren. Nährwerte aus der Iron-Ladder-Lebensmitteldatenbank.</p>`;
}
function renderShopPx(pid){
 const pf=shopPrefs(), p=SHOP.prod[pid], st=shopStore(pf.store), base=(SHOP.prices[pf.store]||{})[pid], own=pf.px[pf.store+':'+pid];
 return `<div class="row between"><h2>Preis korrigieren</h2><button class="icon-btn" data-act="close" aria-label="Schließen">${I.x}</button></div>
 <p class="muted">${esc(p.n)}, ${esc(p.pack)} bei ${esc(st.n)}. Richtpreis: ${base!=null?eur(base):'keiner'}.</p>
 <div class="field"><label for="shop-px">Preis pro Packung (€)</label><input id="shop-px" type="text" inputmode="decimal" value="${own!=null?fmt(own,2):base!=null?fmt(base,2):''}"></div>
 <div class="row"><button class="btn pri" data-act="shopPxSave" data-v="${pid}">Speichern</button>${own!=null?`<button class="btn ghost" data-act="shopPxReset" data-v="${pid}">Richtpreis nutzen</button>`:''}</div>`;
}
