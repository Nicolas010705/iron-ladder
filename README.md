# Iron Ladder

Gym-Tracker als PWA: Trainings mit Zielen nach Progressive Overload, Ränge pro Muskelgruppe (Eisen bis Legende), Ernährung mit eigener Datenbank und Open-Food-Facts-Markensuche.

## Aufbau
- `src-artifact.html` – Quelle (dieselbe Datei wie das Claude-Artifact)
- `build.py` – erzeugt `index.html` für Vercel (`python3 build.py`)
- `index.html`, `manifest.webmanifest`, `sw.js`, Icons – statische Seite, kein Build-Schritt auf Vercel
- `3d/` – 3D-Übungsansicht: `iron3d.js` (Viewer + three.js), `body.glb` (Figur), `eq/` (Geräte), `anim/` (Bewegungen aus Blender, je Übungs-Kombination), `thumbs/` (Vorschaubilder je Bewegungsmuster)

## 3D-Übungsansicht
In der Übungsinfo zeigt eine 3D-Figur den Bewegungsablauf mit Geräten; die trainierten Muskeln leuchten
(kräftig = Hauptmuskel, heller = mitarbeitend). Ansicht Seite/Vorne/Hinten/Schräg, frei drehen, zoomen,
Tempo, Bewegung per Regler, einzelne Muskeln antippen. Im Claude-Artifact bleibt die 2D-Abbildung.

Hände und Füße werden per inverser Kinematik exakt an Griff- und Standpunkte gesetzt (Stange, Kurzhantel, Pedale,
Fußplatte …), das Schulterblatt bewegt sich mit, liegende/sitzende Körper liegen exakt auf dem Polster.
Geräte sind in Blender modelliert (Kurzhantel mit Sechskant-Gummiköpfen und Rautenrändelung, Langhantel mit Bumper-Scheiben,
Kabelturm mit Gewichtsblock, Latzug, Beinpresse …); bewegliche Teile (Gewichtsblock, Schlitten, Hebel, Kurbel) folgen der Figur.

**Bewegungen aus Blender:** Jede Übungs-Kombination (Muster + Gerät, 107 Stück) ist eine Blender-Aktion mit Keyframes am Skelett
(`3d/anim/<muster>-<gerät>.glb`, ~40 KB, lädt erst beim Öffnen der Übung). Die App spielt sie ab; fehlt eine Datei (z. B. offline
und noch nicht im Cache) oder eine eigene Übung hat eine neue Kombination, rechnet die Figur die Bewegung wie bisher per IK.
Die Aktionen entstehen aus den IK-Posen (`bake.mjs` nimmt 121 Stellungen je Bewegung auf, `build_anims.py` baut daraus die Keyframes);
von Hand in Blender animierte Übungen stehen in `HANDMADE` (`tools/blender/build_anims.py`), z. B. der Kurzhantel-Curl aus
`tools/blender/demo_curl.py`. Alle Aktionen zum Bearbeiten: `tools/3d/anim.raw/anims.blend` (wird beim Bauen erzeugt).

Neu bauen (Blender 5.2; unter Windows `blender` = `"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"`):
1. Figur: aus den MakeHuman-Quellen `sh tools/blender/fetch_sources.sh /tmp/mh && python3 tools/blender/build_model.py /tmp/mh tools/3d/body.raw.glb`
   (Blender als Python-Modul, `pip install bpy`) – oder das vorhandene Modell nachbessern: `blender -b -P tools/blender/fix_body.py`.
   Geräte: `blender -b -P tools/blender/build_equipment.py -- tools/3d/eq.raw`
2. Viewer + komprimierte Modelle: `cd tools/3d && npm i && npx playwright install chromium && node build.mjs`
3. Bewegungen: `node bake.mjs`, dann (im Repo-Ordner) `blender -b -P tools/blender/build_anims.py`, dann wieder `node build.mjs`
4. Vorschaubilder (Playwright/Chromium): `node thumbs.mjs`
5. `python3 build.py` (setzt die 3D-Version für den Cache)
6. Prüfen: `node check.mjs` (in `tools/3d`) – läuft alle Übungen mit ihren Geräte-Varianten durch und meldet
   Hände/Füße, die ihr Ziel nicht erreichen, sprunghafte Gelenkbewegungen (auch Finger und Zehen), Gelenke und Haut unter dem Boden,
   stark abgeknickte Handgelenke – und für die Blender-Bewegungen: lädt nicht, weicht mehr als 1 cm von der IK-Bewegung ab, springt zusätzlich.
   Sichtprüfung aller Übungen: `tools/3d/gallery.html` (über einen lokalen Server im Repo-Ordner öffnen, Parameter stehen auf der Seite).
   Werkzeuge zum Feintunen von Posen: `node tune.mjs <muster> <gerät> '<js>'`, `node diag.mjs <muster>:<gerät>`.

Bewegung zwischen Start- und Endpose: Hände laufen auf Bögen um die Schulter, wenn der Rumpf stillsteht (Seitheben, Curl, Bankdrücken),
sonst auf einer Linie (Kreuzheben); Ellbogen-/Knie-Richtung, freie Gliedmaßen und die Handdrehung (relativ zum Unterarm) werden auf der Kugel gemischt.

Posen je Bewegungsmuster (in Weltkoordinaten, mit Geräten und Varianten je Equipment): `tools/3d/poses.js`, IK: `tools/3d/figure.js`, Szene: `tools/3d/scene.js`. Lizenzen: `3d/CREDITS.md`.

## Wocheneinkauf
Ernährung → „Wocheneinkauf“: Supermarkt und Budget wählen, die App stellt aus 50 Rezepten (plus eigenen) einen 7-Tage-Plan zusammen,
der Kalorien- und Proteinziel trifft, rechnet die Einkaufsliste mit echten Packungsgrößen und vergleicht alle Märkte.
- Supabase speichert nur Märkte, Produkte und Preise (`supabase/shop.sql`, ~300 Zeilen, ein paar KB). Nährwerte kommen aus der App-Datenbank.
- Ohne die Tabellen nutzt die App eingebaute Richtpreise. Preise pflegen: `tools/shop/seed.py` anpassen, ausführen, `shop.sql` im Supabase-SQL-Editor laufen lassen.
- Nutzer können Preise in der App korrigieren (pro Markt, im Profil gespeichert).
- Eigene Rezepte aus Produkten der Preisliste anlegen (im Profil, synchronisiert). Sie werden mitgeplant, lassen sich fest einplanen und ersetzen per „Tauschen“ ein Gericht im Wochenplan.
- Jedes Rezept hat eine Schritt-für-Schritt-Anleitung mit animiertem Symbol je Arbeitsschritt (Schneiden, Braten, Kochen, Backen, Rühren, Mixen, Ruhen, Anrichten) und Tipps. Kochmodus: ein Schritt pro Seite, Mengen passend zur Portion, Timer, Bildschirm bleibt an, am Ende ins Tagebuch eintragen.
- Rezepte: `tools/shop/recipes.js`, Logik und Oberfläche: `tools/shop/shop-ui.js` (beides in `src-artifact.html` eingebettet).

## Daten & Konto
- Ohne Konto speichert die App im Browser (localStorage, Fotos in IndexedDB) – pro Gerät. Die installierte App bittet den Browser, diese Daten dauerhaft zu behalten.
- Mit Konto (Supabase, `supabase/schema.sql`) werden Profil, Trainings und Ernährung automatisch abgeglichen. Row Level Security: jede Zeile gehört genau einem Konto.
  Konfiguration in `supabase.json` (öffentlicher `anon`-Key). Fortschrittsfotos bleiben auf dem Gerät.
- Abgleich: Profil und Ernährungstage – neuere Änderung gewinnt, Trainings werden vereinigt, gelöschte Trainings bleiben gelöscht.
  Geleerte Tage werden als leere Liste gespeichert, damit andere Geräte sie nicht zurückholen. Fehlgeschlagene Speicherungen werden automatisch wiederholt.
- Die lokalen Daten sind dem zuletzt angemeldeten Konto zugeordnet. Meldet sich auf dem Gerät ein anderes Konto an, fragt die App, ob die Daten übernommen oder vom Gerät entfernt werden.
- „Backup laden“ ersetzt den Stand auch im Konto.

## Offline
Der Service Worker legt beim Installieren App, Schrift (Inter, selbst ausgeliefert aus `fonts/`, SIL OFL) und alle 3D-Dateien (ca. 2 MB) im Cache ab.
Im Claude-Artifact wird Inter weiter von Google Fonts geladen; `build.py` ersetzt das für Vercel.

## Tests
`python3 build.py && node tests/run.mjs` – startet `index.html` in Chromium (Playwright) mit nachgebautem Supabase und prüft Ziele, Sync, Kontowechsel, Backup, Wiederholung, Fotos und Bildschirmsperre.

Deployment: https://iron-ladder.vercel.app
