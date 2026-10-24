# Iron Ladder

Gym-Tracker als PWA: Trainings mit Zielen nach Progressive Overload, Ränge pro Muskelgruppe (Eisen bis Legende), Ernährung mit eigener Datenbank und Open-Food-Facts-Markensuche.

## Aufbau
- `src-artifact.html` – Quelle (dieselbe Datei wie das Claude-Artifact)
- `build.py` – erzeugt `index.html` für Vercel (`python3 build.py`)
- `index.html`, `manifest.webmanifest`, `sw.js`, Icons – statische Seite, kein Build-Schritt auf Vercel
- `3d/` – 3D-Übungsansicht: `iron3d.js` (Viewer + three.js), `body.glb` (Modell), `thumbs/` (Vorschaubilder je Bewegungsmuster)

## 3D-Übungsansicht
In der Übungsinfo zeigt eine 3D-Figur den Bewegungsablauf mit Geräten; die trainierten Muskeln leuchten
(kräftig = Hauptmuskel, heller = mitarbeitend). Ansicht Seite/Vorne/Hinten/Schräg, frei drehen, zoomen,
Tempo, Bewegung per Regler, einzelne Muskeln antippen. Im Claude-Artifact bleibt die 2D-Abbildung.

Neu bauen:
1. Modell (Blender als Python-Modul, `pip install bpy`):
   `sh tools/blender/fetch_sources.sh /tmp/mh && python3 tools/blender/build_model.py /tmp/mh tools/3d/body.raw.glb`
2. Viewer + komprimiertes Modell: `cd tools/3d && npm i && node build.mjs`
3. Vorschaubilder (Playwright/Chromium): `node thumbs.mjs`
4. `python3 build.py` (setzt die 3D-Version für den Cache)

Posen je Bewegungsmuster: `tools/3d/poses.js`. Lizenzen: `3d/CREDITS.md`.

## Daten
Auf Vercel speichert die App im Browser (localStorage) – pro Gerät, ohne Synchronisierung.
Nächster Schritt für geräteübergreifende Daten: Supabase.

Deployment: https://iron-ladder.vercel.app
