#!/bin/sh
# Lädt die benötigten MakeHuman-Daten (CC0) flach in einen Ordner.
# Aufruf: sh tools/blender/fetch_sources.sh /tmp/mh
set -e
D=${1:-/tmp/mh}; mkdir -p "$D"; cd "$D"
B=https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data
curl -sSfO $B/3dobjs/base.obj
curl -sSfO $B/rigs/default.mhskel
curl -sSfO $B/rigs/default_weights.mhw
for f in universal-male-young-averagemuscle-averageweight universal-male-young-averagemuscle-minweight \
         universal-male-young-maxmuscle-averageweight universal-male-young-maxmuscle-minweight \
         african-male-young asian-male-young caucasian-male-young; do
  curl -sSfO $B/targets/macrodetails/$f.target
done
curl -sSfO $B/targets/macrodetails/proportions/male-young-averagemuscle-averageweight-idealproportions.target
curl -sSfO https://raw.githubusercontent.com/makehumancommunity/makehuman/master/LICENSE.ASSETS.md || true
echo "MakeHuman-Daten in $D"
