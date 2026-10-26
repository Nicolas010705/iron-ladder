"""Erzeugt Richtpreise für den Wocheneinkauf: supabase/shop.sql (Tabellen + Daten) und tools/shop/shop.js (Fallback in der App).
Preise = geschätzte Eigenmarken-Regalpreise (ohne Angebote), Stand Okt 2026. Bitte pflegen/korrigieren."""
import json, hashlib, pathlib
ROOT=pathlib.Path(__file__).resolve().parents[2]
STORES=[('aldi','Aldi','#00a0e3',1.00),('lidl','Lidl','#0050aa',1.00),('penny','Penny','#cd1719',1.02),('netto','Netto','#ffd500',1.02),
        ('kaufland','Kaufland','#e10915',1.03),('rewe','Rewe','#cc071e',1.08),('edeka','Edeka','#1e57a4',1.10)]
# id, Name im Regal, Lebensmittel in der App-Datenbank (Nährwerte), Packung (g), Packungstext, Basispreis Discounter €, Kategorie
P=[
 ('haferflocken','Haferflocken','Haferflocken',500,'500 g',0.89,'Getreide & Beilagen'),
 ('reis','Langkornreis','Reis, roh',1000,'1 kg',1.79,'Getreide & Beilagen'),
 ('nudeln','Spaghetti / Penne','Nudeln, roh',500,'500 g',0.89,'Getreide & Beilagen'),
 ('vk-nudeln','Vollkornnudeln','Vollkornnudeln, roh',500,'500 g',1.09,'Getreide & Beilagen'),
 ('couscous','Couscous','Couscous, roh',500,'500 g',1.29,'Getreide & Beilagen'),
 ('kartoffeln','Kartoffeln, festkochend','Kartoffeln, gekocht',2500,'2,5 kg',2.99,'Getreide & Beilagen'),
 ('suesskartoffel','Süßkartoffeln','Süßkartoffel, gegart',1000,'1 kg',2.49,'Getreide & Beilagen'),
 ('vk-brot','Vollkornbrot','Vollkornbrot',500,'500 g',1.49,'Getreide & Beilagen'),
 ('wraps','Weizen-Tortillas','Weizen-Wraps',370,'6 Stück',1.49,'Getreide & Beilagen'),
 ('haehnchen','Hähnchenbrustfilet','Hähnchenbrust, roh',1000,'1 kg',9.99,'Fleisch & Fisch'),
 ('pute','Putenbrustfilet','Putenbrust, roh',400,'400 g',5.49,'Fleisch & Fisch'),
 ('hack-mager','Rinderhack, mager','Rinderhack 5 % Fett, roh',400,'400 g',4.79,'Fleisch & Fisch'),
 ('lachs','Lachsfilet (TK)','Lachs, roh',250,'2 × 125 g',4.49,'Fleisch & Fisch'),
 ('thunfisch','Thunfisch im eigenen Saft','Thunfisch (Dose, im eigenen Saft)',130,'Dose, 130 g abgetropft',1.49,'Fleisch & Fisch'),
 ('eier','Eier, Größe M','Ei (Größe M)',600,'10 Stück',2.69,'Milch & Eier'),
 ('magerquark','Magerquark','Magerquark',500,'500 g',1.19,'Milch & Eier'),
 ('skyr','Skyr natur','Skyr natur',450,'450 g',1.49,'Milch & Eier'),
 ('huettenkaese','Hüttenkäse','Hüttenkäse',200,'200 g',0.99,'Milch & Eier'),
 ('milch','Milch 1,5 %','Milch 1,5 %',1000,'1 l',0.99,'Milch & Eier'),
 ('joghurt','Naturjoghurt 3,5 %','Naturjoghurt 3,5 %',500,'500 g',0.79,'Milch & Eier'),
 ('feta','Feta','Feta',200,'200 g',1.69,'Milch & Eier'),
 ('pudding','Proteinpudding','Proteinpudding',200,'200 g',0.99,'Milch & Eier'),
 ('banane','Bananen','Banane',1000,'1 kg',1.39,'Obst & Gemüse'),
 ('apfel','Äpfel','Apfel',1000,'1 kg',2.49,'Obst & Gemüse'),
 ('beeren','Heidelbeeren (TK)','Heidelbeeren',500,'500 g',2.99,'Obst & Gemüse'),
 ('brokkoli','Brokkoli (TK)','Brokkoli',750,'750 g',1.99,'Obst & Gemüse'),
 ('spinat','Blattspinat (TK)','Spinat',750,'750 g',1.49,'Obst & Gemüse'),
 ('paprika','Paprika-Mix','Paprika',500,'3 Stück',1.99,'Obst & Gemüse'),
 ('tomaten','Tomaten','Tomate',500,'500 g',1.49,'Obst & Gemüse'),
 ('gurke','Salatgurke','Gurke',400,'1 Stück',0.79,'Obst & Gemüse'),
 ('karotten','Karotten','Karotte',1000,'1 kg',1.19,'Obst & Gemüse'),
 ('zwiebeln','Zwiebeln','Zwiebel',1000,'1 kg',1.29,'Obst & Gemüse'),
 ('kidney','Kidneybohnen','Kidneybohnen (Dose)',250,'Dose, 250 g abgetropft',0.79,'Vorrat'),
 ('mais','Mais','Mais (Dose)',285,'Dose, 285 g',0.89,'Vorrat'),
 ('linsen','Rote Linsen','Rote Linsen, roh',500,'500 g',1.79,'Vorrat'),
 ('passata','Passierte Tomaten','Tomatensauce',500,'500 g',0.69,'Vorrat'),
 ('tofu','Tofu natur','Tofu natur',400,'2 × 200 g',1.99,'Vorrat'),
 ('rapsoel','Rapsöl','Rapsöl',920,'1 l',1.99,'Vorrat'),
 ('olivenoel','Olivenöl','Olivenöl',690,'750 ml',7.99,'Vorrat'),
 ('erdnussbutter','Erdnussbutter','Erdnussbutter',350,'350 g',2.29,'Vorrat'),
 ('mandeln','Mandeln','Mandeln',200,'200 g',2.79,'Vorrat'),
]
def price(base,f,sid,pid):
    j=(int(hashlib.md5((sid+pid).encode()).hexdigest()[:4],16)/65535-.5)*0.08  # ±4 % Streuung je Produkt
    x=base*f*(1+j) if f>1 else base*(1+j*0.5)
    return round(max(0.29,int(x*10)/10+0.09),2)   # auf ,x9 runden
prices={s[0]:{p[0]:price(p[5],s[3],s[0],p[0]) for p in P} for s in STORES}
STAND='2026-10'
js={'stand':STAND,'stores':[{'id':s[0],'n':s[1],'col':s[2]} for s in STORES],
    'products':[{'id':p[0],'n':p[1],'food':p[2],'g':p[3],'pack':p[4],'cat':p[6]} for p in P],'prices':prices}
(ROOT/'tools/shop/shop.js').write_text('const SHOP_SEED='+json.dumps(js,ensure_ascii=False,separators=(',',':'))+';\n')
q=lambda s:"'"+str(s).replace("'","''")+"'"
sql=['''-- Iron Ladder Wocheneinkauf: nur Supermärkte, Produkte und Preise. Nährwerte kommen aus der App bzw. Open Food Facts.
create table if not exists public.shop_stores (id text primary key, name text not null, color text);
create table if not exists public.shop_products (
  id text primary key, name text not null, food text not null, pack_g numeric not null, pack_label text, category text,
  off_code text  -- optional: Barcode für Open Food Facts
);
create table if not exists public.shop_prices (
  store_id text not null references public.shop_stores(id) on delete cascade,
  product_id text not null references public.shop_products(id) on delete cascade,
  price numeric(6,2) not null, updated_at timestamptz not null default now(),
  primary key (store_id, product_id)
);
alter table public.shop_stores enable row level security;
alter table public.shop_products enable row level security;
alter table public.shop_prices enable row level security;
drop policy if exists "alle lesen" on public.shop_stores;
drop policy if exists "alle lesen" on public.shop_products;
drop policy if exists "alle lesen" on public.shop_prices;
create policy "alle lesen" on public.shop_stores for select to anon, authenticated using (true);
create policy "alle lesen" on public.shop_products for select to anon, authenticated using (true);
create policy "alle lesen" on public.shop_prices for select to anon, authenticated using (true);
grant select on public.shop_stores, public.shop_products, public.shop_prices to anon, authenticated;
''']
sql.append('insert into public.shop_stores (id,name,color) values\n'+',\n'.join(f'({q(s[0])},{q(s[1])},{q(s[2])})' for s in STORES)+'\non conflict (id) do update set name=excluded.name, color=excluded.color;')
sql.append('insert into public.shop_products (id,name,food,pack_g,pack_label,category) values\n'+',\n'.join(f'({q(p[0])},{q(p[1])},{q(p[2])},{p[3]},{q(p[4])},{q(p[6])})' for p in P)+'\non conflict (id) do update set name=excluded.name, food=excluded.food, pack_g=excluded.pack_g, pack_label=excluded.pack_label, category=excluded.category;')
sql.append('insert into public.shop_prices (store_id,product_id,price) values\n'+',\n'.join(f'({q(s)},{q(p)},{v})' for s in prices for p,v in prices[s].items())+'\non conflict (store_id,product_id) do update set price=excluded.price, updated_at=now();')
(ROOT/'supabase/shop.sql').write_text('\n'.join(sql)+'\n')
print(len(P),'Produkte',len(STORES),'Märkte'); print({s:round(sum(v.values()),2) for s,v in prices.items()})
# Preise auch als Fallback in die App schreiben (zwischen den SHOP-DATA-Markern)
import re
src=ROOT/'src-artifact.html'; s=src.read_text()
s2=re.sub(r'(/\* SHOP-DATA:START[^\n]*\*/\n).*?(\n/\* SHOP-DATA:END \*/)',lambda m:m.group(1)+(ROOT/'tools/shop/shop.js').read_text().strip()+m.group(2),s,flags=re.S)
if s2!=s: src.write_text(s2); print('src-artifact.html aktualisiert – danach python3 build.py')
