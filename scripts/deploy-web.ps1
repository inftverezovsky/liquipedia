param(
  [string]$Server = "root@82.147.67.231",
  [string]$RemoteDir = "/root/tcyber"
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $ProjectRoot

$archiveName = "tcyber-deploy.tar.gz"
$archivePath = Join-Path $ProjectRoot $archiveName
$remoteScriptName = "tcyber-remote-deploy.sh"
$remoteScriptPath = Join-Path $ProjectRoot $remoteScriptName

$paths = @(
  "Dockerfile",
  "docker-compose.yml",
  "package.json",
  "package-lock.json",
  "next.config.mjs",
  "postcss.config.js",
  "tailwind.config.ts",
  "tsconfig.json",
  "eslint.config.mjs",
  "playwright.config.ts",
  "src",
  "prisma",
  "public",
  "scripts"
)

Write-Host "Creating deploy archive..." -ForegroundColor Cyan
Remove-Item $archivePath -Force -ErrorAction SilentlyContinue
tar -czf $archiveName @paths

@"
set -euxo pipefail

REMOTE_DIR="$RemoteDir"
ARCHIVE="/root/$archiveName"

echo "==> Unpacking project"
mkdir -p "`$REMOTE_DIR"
rm -rf "`$REMOTE_DIR"/*
tar -xzf "`$ARCHIVE" -C "`$REMOTE_DIR"
cd "`$REMOTE_DIR"

echo "==> Verifying required files"
test -f scripts/hltv_playwright.mjs
test -f public/dota2_bg_1777894185405.png
grep -n "playwright install --with-deps chromium" Dockerfile

echo "==> Building web image without cache"
docker compose build --no-cache web

echo "==> Recreating web container"
docker compose up -d --force-recreate web

echo "==> Verifying Playwright browser inside container"
docker exec tcyber-web node -e "const fs=require('fs'); const { chromium }=require('playwright'); const p=chromium.executablePath(); console.log(p); fs.accessSync(p, fs.constants.X_OK);"

echo "==> Running containers"
docker ps --filter name=tcyber
"@ | Set-Content -Path $remoteScriptPath -Encoding ascii

Write-Host "Uploading archive to ${Server}..." -ForegroundColor Cyan
scp $archivePath "${Server}:/root/$archiveName"
if ($LASTEXITCODE -ne 0) { throw "Archive upload failed" }

Write-Host "Uploading remote deploy script..." -ForegroundColor Cyan
scp $remoteScriptPath "${Server}:/root/$remoteScriptName"
if ($LASTEXITCODE -ne 0) { throw "Remote script upload failed" }

Write-Host "Unpacking and rebuilding web container..." -ForegroundColor Cyan
ssh $Server "set -o pipefail; bash /root/$remoteScriptName 2>&1 | tee /root/tcyber-deploy.log"
if ($LASTEXITCODE -ne 0) { throw "Remote deploy failed" }

Write-Host "Done. Open http://82.147.67.231:3010 and press Ctrl+F5." -ForegroundColor Green
