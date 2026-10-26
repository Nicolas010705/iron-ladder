# Iron Ladder

Gym-Tracker als PWA: Trainings mit Zielen nach Progressive Overload, Ränge pro Muskelgruppe (Eisen bis Legende), Ernährung mit eigener Datenbank und Open-Food-Facts-Markensuche.

## Aufbau
- `src-artifact.html` – Quelle (dieselbe Datei wie das Claude-Artifact)
- `build.py` – erzeugt `index.html` für Vercel (`python3 build.py`)
- `index.html`, `manifest.webmanifest`, `sw.js`, Icons – statische Seite, kein Build-Schritt auf Vercel
- `3d/` – 3D-Übungsansicht: `iron3d.js` (Viewer + three.js), `body.glb` (Figur), `eq/` (Geräte), `thumbs/` (Vorschaubilder je Bewegungsmuster)

## 3D-Übungsansicht
In der Übungsinfo zeigt eine 3D-Figur den Bewegungsablauf mit Geräten; die trainierten Muskeln leuchten
(kräftig = Hauptmuskel, heller = mitarbeitend). Ansicht Seite/Vorne/Hinten/Schräg, frei drehen, zoomen,
Tempo, Bewegung per Regler, einzelne Muskeln antippen. Im Claude-Artifact bleibt die 2D-Abbildung.

Hände und Füße werden per inverser Kinematik exakt an Griff- und Standpunkte gesetzt (Stange, Kurzhantel, Pedale,
Fußplatte …), das Schulterblatt bewegt sich mit, liegende/sitzende Körper liegen exakt auf dem Polster.
Geräte sind in Blender modelliert (Langhantel mit Bumper-Scheiben, Kabelturm mit Gewichtsblock, Latzug, Beinpresse …);
bewegliche Teile (Gewichtsblock, Schlitten, Hebel, Kurbel) folgen der Figur.

Neu bauen:
1. Figur (Blender als Python-Modul, `pip install bpy`):
   `sh tools/blender/fetch_sources.sh /tmp/mh && python3 tools/blender/build_model.py /tmp/mh tools/3d/body.raw.glb`
   Geräte: `python3 tools/blender/build_equipment.py tools/3d/eq.raw`
2. Viewer + komprimierte Modelle: `cd tools/3d && npm i && node build.mjs`
3. Vorschaubilder (Playwright/Chromium): `node thumbs.mjs`
4. `python3 build.py` (setzt die 3D-Version für den Cache)

Posen je Bewegungsmuster (in Weltkoordinaten, mit Geräten und Varianten je Equipment): `tools/3d/poses.js`, IK: `tools/3d/figure.js`, Szene: `tools/3d/scene.js`. Lizenzen: `3d/CREDITS.md`.

## Wocheneinkauf
Ernährung → „Wocheneinkauf“: Supermarkt und Budget wählen, die App stellt aus 19 Rezepten einen 7-Tage-Plan zusammen,
der Kalorien- und Proteinziel trifft, rechnet die Einkaufsliste mit echten Packungsgrößen und vergleicht alle Märkte.
- Supabase speichert nur Märkte, Produkte und Preise (`supabase/shop.sql`, ~300 Zeilen, ein paar KB). Nährwerte kommen aus der App-Datenbank.
- Ohne die Tabellen nutzt die App eingebaute Richtpreise. Preise pflegen: `tools/shop/seed.py` anpassen, ausführen, `shop.sql` im Supabase-SQL-Editor laufen lassen.
- Nutzer können Preise in der App korrigieren (pro Markt, im Profil gespeichert).

## Daten
Auf Vercel speichert die App im Browser (localStorage) – pro Gerät, ohne Synchronisierung.
Nächster Schritt für geräteübergreifende Daten: Supabase.

Deployment: https://iron-ladder.vercel.app
