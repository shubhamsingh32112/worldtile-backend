# Quick Firewall Fix - MUST RUN AS ADMINISTRATOR
Write-Host "=== Fixing Firewall for Port 3000 ===" -ForegroundColor Cyan
Write-Host ""

# Check admin
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: Must run as Administrator!" -ForegroundColor Red
    Write-Host "Right-click PowerShell -> Run as Administrator" -ForegroundColor Yellow
    exit 1
}

# Remove existing rule
$existing = Get-NetFirewallRule -DisplayName "Node.js Backend - Port 3000" -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Removing old firewall rule..." -ForegroundColor Yellow
    Remove-NetFirewallRule -DisplayName "Node.js Backend - Port 3000" -ErrorAction SilentlyContinue
}

# Add new rule
Write-Host "Adding firewall rule for port 3000 (ALL networks)..." -ForegroundColor Green
New-NetFirewallRule `
    -DisplayName "Node.js Backend - Port 3000" `
    -Direction Inbound `
    -Protocol TCP `
    -LocalPort 3000 `
    -Action Allow `
    -Description "Allows Node.js backend on port 3000" `
    -Profile Domain,Private,Public `
    -Enabled True

Write-Host ""
Write-Host "✅ Firewall rule added!" -ForegroundColor Green
Write-Host ""
Write-Host "Test from phone: http://10.10.2.151:3000/health" -ForegroundColor Cyan
Write-Host ""
pause

