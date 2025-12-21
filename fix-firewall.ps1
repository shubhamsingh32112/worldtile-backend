# Windows Firewall Fix for Backend Server
# Run this script as Administrator to allow Node.js connections on port 3000

Write-Host "Configuring Windows Firewall for Backend Server..." -ForegroundColor Cyan

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "ERROR: This script must be run as Administrator!" -ForegroundColor Red
    Write-Host "Right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    exit 1
}

# Add inbound rule for port 3000 (TCP)
Write-Host "`nAdding firewall rule for port 3000 (TCP)..." -ForegroundColor Yellow

try {
    $rule = Get-NetFirewallRule -DisplayName "Node.js Backend - Port 3000" -ErrorAction SilentlyContinue
    
    if ($rule) {
        Write-Host "Firewall rule already exists. Updating..." -ForegroundColor Green
        Remove-NetFirewallRule -DisplayName "Node.js Backend - Port 3000"
    }
    
    New-NetFirewallRule `
        -DisplayName "Node.js Backend - Port 3000" `
        -Direction Inbound `
        -Protocol TCP `
        -LocalPort 3000 `
        -Action Allow `
        -Description "Allows Node.js backend server on port 3000 for mobile device testing"
    
    Write-Host "Firewall rule added successfully!" -ForegroundColor Green
    Write-Host "`nYour phone should now be able to connect to:" -ForegroundColor Cyan
    Write-Host "   http://192.168.1.15:3000/health" -ForegroundColor White
    Write-Host "`nTo verify, test from your phone's browser" -ForegroundColor Yellow
}
catch {
    Write-Host "Error creating firewall rule: $_" -ForegroundColor Red
    Write-Host "`nAlternative: Manually add firewall rule:" -ForegroundColor Yellow
    Write-Host "   1. Open Windows Defender Firewall" -ForegroundColor White
    Write-Host "   2. Advanced Settings -> Inbound Rules -> New Rule" -ForegroundColor White
    Write-Host "   3. Port -> TCP -> 3000 -> Allow" -ForegroundColor White
    exit 1
}

Write-Host "`nDone! Restart your backend server if it's running." -ForegroundColor Green

