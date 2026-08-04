# Push Block Blast to GitHub + open Render Blueprint
# Run from project root:  .\deploy\push-to-github.ps1

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
Set-Location $ProjectRoot

$gh = @(
  "$env:ProgramFiles\GitHub CLI\gh.exe",
  "$env:LOCALAPPDATA\Programs\GitHub CLI\gh.exe",
  (Get-Command gh -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source)
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

if (-not $gh) {
  Write-Host "GitHub CLI not found. Installing..." -ForegroundColor Yellow
  winget install --id GitHub.cli -e --accept-source-agreements --accept-package-agreements
  $gh = "$env:ProgramFiles\GitHub CLI\gh.exe"
}

Write-Host "`n=== Block Blast — GitHub + Render ===" -ForegroundColor Cyan

& $gh auth status 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Login to GitHub (browser will open)..." -ForegroundColor Yellow
  & $gh auth login -h github.com -p https -w
}

$remote = git remote get-url origin 2>$null
if (-not $remote) {
  Write-Host "Creating public repo block-blast and pushing..." -ForegroundColor Green
  & $gh repo create block-blast --public --source=. --remote=origin --push --description "Block Blast Evolved — online multiplayer puzzle game"
} else {
  Write-Host "Pushing to existing remote..." -ForegroundColor Green
  git push -u origin main
}

$user = (& $gh api user -q .login)
$repoUrl = "https://github.com/$user/block-blast"
$renderUrl = "https://dashboard.render.com/blueprint/new?repo=$([uri]::EscapeDataString($repoUrl))"

Write-Host "`nDone! Repo: $repoUrl" -ForegroundColor Green
Write-Host "Opening Render Blueprint (connect repo, click Apply)..." -ForegroundColor Cyan
Start-Process $renderUrl

Write-Host @"

Next on Render:
  1. Sign in with GitHub (free)
  2. Review render.yaml settings
  3. Click Apply — wait ~5 min
  4. Live URL: https://block-blast-062t.onrender.com
  5. PUBLIC_URL is set in render.yaml

"@ -ForegroundColor White
