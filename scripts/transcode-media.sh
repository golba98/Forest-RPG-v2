#!/usr/bin/env bash
# Regenerates the compressed V2 media from the original university project.
# The legacy directory is only READ; all outputs are written inside this project.
#
# Usage: scripts/transcode-media.sh [legacy-project-root]
set -euo pipefail

LEGACY_ROOT="${1:-/home/k9-vortex/Development/1-JavaScript/3-Game Development}"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$PROJECT_ROOT/public/assets"

case "$OUT" in
  "$LEGACY_ROOT"*) echo "Refusing to write inside the legacy project" >&2; exit 1 ;;
esac

command -v ffmpeg >/dev/null || { echo "ffmpeg is required" >&2; exit 1; }

mkdir -p "$OUT/audio/music" "$OUT/video"

for track in game_music menu_music; do
  src="$LEGACY_ROOT/assets/8-Music/$track.wav"
  # OGG Vorbis (primary) + MP3 (fallback for decoders without Vorbis support)
  ffmpeg -hide_banner -loglevel error -y -i "$src" -c:a libvorbis -q:a 5 "$OUT/audio/music/$track.ogg"
  ffmpeg -hide_banner -loglevel error -y -i "$src" -c:a libmp3lame -b:a 160k "$OUT/audio/music/$track.mp3"
done

# Menu background loop: silent VP9 WebM (the menu plays its own music track)
ffmpeg -hide_banner -loglevel error -y -i "$LEGACY_ROOT/assets/1-Background/1-Menu/Menu_Vid.mp4" \
  -an -c:v libvpx-vp9 -crf 40 -b:v 0 -row-mt 1 -deadline good -cpu-used 4 \
  "$OUT/video/menu_vid.webm"

ls -la "$OUT/audio/music" "$OUT/video"
