# Iron Ladder

Gym-Tracker als PWA: Trainings mit Zielen nach Progressive Overload, Ränge pro Muskelgruppe (Eisen bis Legende), Ernährung mit eigener Datenbank und Open-Food-Facts-Markensuche.

## Aufbau
- `src-artifact.html` – Quelle (dieselbe Datei wie das Claude-Artifact)
- `build.py` – erzeugt `index.html` für Vercel (`python3 build.py`)
- `index.html`, `manifest.webmanifest`, `sw.js`, Icons – statische Seite, kein Build-Schritt auf Vercel

## Daten
Auf Vercel speichert die App im Browser (localStorage) – pro Gerät, ohne Synchronisierung.
Nächster Schritt für geräteübergreifende Daten: Supabase.
