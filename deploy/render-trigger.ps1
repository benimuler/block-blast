# Trigger Render redeploy
# Option A: set deploy hook (Render Dashboard → block-blast → Settings → Deploy Hook)
#   $env:RENDER_DEPLOY_HOOK = "https://api.render.com/deploy/srv-...?key=..."
#   .\deploy\render-trigger.ps1
#
# Option B: Manual — Dashboard → block-blast → Manual Deploy → Deploy latest commit

param(
  [string]$Hook = $env:RENDER_DEPLOY_HOOK
)

$LIVE_URL = "https://block-blast-062t.onrender.com"

if (-not $Hook) {
  Write-Host "RENDER_DEPLOY_HOOK not set." -ForegroundColor Yellow
  Write-Host @"

Manual deploy (2 clicks):
  1. Open https://dashboard.render.com/
  2. Select service 'block-blast'
  3. Click 'Manual Deploy' → 'Deploy latest commit'

Enable auto-deploy from GitHub:
  Settings → Build & Deploy → connect repo benimuler/block-blast branch main

Live URL: $LIVE_URL
"@ -ForegroundColor Cyan
  exit 1
}

Write-Host "Triggering Render deploy..." -ForegroundColor Green
Invoke-RestMethod -Method Post -Uri $Hook
Write-Host "Deploy queued. Wait ~3-5 min then check: $LIVE_URL/sw.js (should show blockblast-v3.14)" -ForegroundColor Green
