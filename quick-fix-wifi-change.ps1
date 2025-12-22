# Quick Fix for WiFi Change - Run as Administrator
# This script fixes firewall rules after changing WiFi networks

param(
    [switch]$SkipPrompt
)

$ErrorActionPreference = "Stop"

Write-Host "=== Quick Fix for WiFi Network Change ===" -ForegroundColor Cyan
Write-Host ""

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "ERROR: This script must be run as Administrator!" -ForegroundColor Red
    Write-Host "Right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

# Get current IP address
Write-Host "1. Detecting your IP address..." -ForegroundColor Green
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
    ($_.IPAddress -like '192.168.*' -or $_.IPAddress -like '10.*' -or $_.IPAddress -like '172.16.*') -and 
    $_.PrefixOrigin -eq 'Dhcp' -and
    $_.IPAddress -ne '127.0.0.1'
} | Select-Object -First 1).IPAddress

if ($ip) {
    Write-Host "   Your IP address: $ip" -ForegroundColor White
} else {
    Write-Host "   Could not detect IP. Please check manually with: ipconfig" -ForegroundColor Yellow
    $ip = "YOUR_IP_HERE"
}

Write-Host ""

# Check current network profile
Write-Host "2. Checking network profile..." -ForegroundColor Green
$networkProfile = (Get-NetConnectionProfile | Select-Object -First 1).NetworkCategory
Write-Host "   Network Profile: $networkProfile" -ForegroundColor White
if ($networkProfile -eq "Public") {
    Write-Host "   Note: Firewall rules must allow Public networks" -ForegroundColor Yellow
}
Write-Host ""

# Fix firewall rule
Write-Host "3. Updating firewall rule for port 3000..." -ForegroundColor Green

try {
    # Remove existing rule if it exists
    $existing = Get-NetFirewallRule -DisplayName "Node.js Backend - Port 3000" -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Host "   Removing existing rule..." -ForegroundColor Yellow
        Remove-NetFirewallRule -DisplayName "Node.js Backend - Port 3000"
    }
    
    # Add new rule for ALL profiles (Domain, Private, Public)
    New-NetFirewallRule `
        -DisplayName "Node.js Backend - Port 3000" `
        -Direction Inbound `
        -Protocol TCP `
        -LocalPort 3000 `
        -Action Allow `
        -Description "Allows Node.js backend server on port 3000 for mobile device testing" `
        -Profile Domain,Private,Public `
        -Enabled True
    
    Write-Host "   ✅ Firewall rule added successfully!" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Error creating firewall rule: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Alternative: Add manually via Windows Defender Firewall" -ForegroundColor Yellow
    Write-Host "  1. Press Windows + R, type 'wf.msc', press Enter" -ForegroundColor White
    Write-Host "  2. Inbound Rules → New Rule" -ForegroundColor White
    Write-Host "  3. Port → TCP → 3000 → Allow → All profiles → Finish" -ForegroundColor White
    exit 1
}

Write-Host ""

# Summary
Write-Host "=== Fix Complete ===" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Verify your mobile app's .env file has:" -ForegroundColor White
Write-Host "     API_BASE_URL=http://$ip:3000/api" -ForegroundColor Yellow
Write-Host ""
Write-Host "  2. Test from your phone's browser:" -ForegroundColor White
Write-Host "     http://$ip:3000/health" -ForegroundColor Yellow
Write-Host ""
Write-Host "  3. If the test works, restart your Flutter app" -ForegroundColor White
Write-Host ""
Write-Host "  4. Make sure both devices are on the same WiFi network" -ForegroundColor White
Write-Host ""

if (-not $SkipPrompt) {
    Write-Host "Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}

