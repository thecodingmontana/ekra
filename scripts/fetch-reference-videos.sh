#!/usr/bin/env bash
# Downloads the Trenning reference screen recordings (docs/reference/trenning/videos.txt) into
# docs/reference/trenning/videos/. They're too big for git (about 264 MB), so each checkout fetches its own copy.
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)/docs/reference/trenning"
mkdir -p "$DIR/videos"
while read -r url; do
	[[ -z "$url" ]] && continue
	name="$(printf '%b' "${url##*/}" | sed 's/+/ /g; s/%26/\&/g; s/  */-/g; s/[^A-Za-z0-9._-]//g')"
	[[ -f "$DIR/videos/$name" ]] && continue
	echo "Downloading $name"
	curl -fsSL "$url" -o "$DIR/videos/$name"
done <"$DIR/videos.txt"
echo "Videos are in $DIR/videos"
