#!/bin/sh
set -e
pnpm --filter @workspace/api-server run build
BASE_PATH=/app/ pnpm --filter @workspace/zenthra run build
mkdir -p combined/app
cp -r artifacts/zenthra/dist/public/. combined/app/
cp artifacts/landing/index.html combined/index.html
cp artifacts/landing/zenthra-logo.png combined/zenthra-logo.png
