#!/bin/sh
# Gera dist/dd2vtt-url-importer.zip (arquivos na raiz do zip) para instalar pelo link do manifesto.
set -e
cd "$(dirname "$0")"
rm -f dist/dd2vtt-url-importer.zip
mkdir -p dist
zip -qr dist/dd2vtt-url-importer.zip module.json scripts styles TESTES.md
