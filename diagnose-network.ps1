# Network Diagnostic Script
# Run as Administrator to check firewall and network settings

Write-Host "=== Network Diagnostic for Backend Server ===" -ForegroundColor Cyan
Write-Host ""

# Check if running as Admin
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "WARNING: Not running as Administrator. Some checks may fail." -ForegroundColor Yellow
    Write-Host ""
}

# 1. Check IP Address
Write-Host "1. IP Address:" -ForegroundColor Green
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.IPAddress -like '192.168.*' -and $_.PrefixOrigin -eq 'Dhcp'}).IPAddress
if ($ip) {
    Write-Host "   Computer IP: $ip" -ForegroundColor White
} else {
    Write-Host "   Could not find local IP address" -ForegroundColor Red
}
Write-Host ""

# 2. Check if port 3000 is listening
Write-Host "2. Port 3000 Status:" -ForegroundColor Green
$listening = netstat -an | Select-String ":3000" | Select-String "LISTENING"
if ($listening) {
    Write-Host "   Port 3000 is LISTENING" -ForegroundColor Green
    Write-Host "   $listening" -ForegroundColor White
} else {
    Write-Host "   Port 3000 is NOT listening" -ForegroundColor Red
    Write-Host "   Backend server may not be running" -ForegroundColor Yellow
}
Write-Host ""

# 3. Check Firewall Rules
Write-Host "3. Firewall Rules for Port 3000:" -ForegroundColor Green
try {
    $rules = Get-NetFirewallRule -ErrorAction SilentlyContinue | Where-Object {
        $portFilter = $_ | Get-NetFirewallPortFilter -ErrorAction SilentlyContinue
        $portFilter -and $portFilter.LocalPort -eq 3000
    }
    
    if ($rules) {
        foreach ($rule in $rules) {
            $portFilter = $rule | Get-NetFirewallPortFilter
            Write-Host "   Rule: $($rule.DisplayName)" -ForegroundColor White
            Write-Host "   Enabled: $($rule.Enabled)" -ForegroundColor $(if ($rule.Enabled) { "Green" } else { "Red" })
            Write-Host "   Direction: $($rule.Direction)" -ForegroundColor White
            Write-Host "   Action: $($rule.Action)" -ForegroundColor White
            Write-Host "   Profiles: $($rule.Profile -join ', ')" -ForegroundColor White
            Write-Host ""
        }
    } else {
        Write-Host "   NO FIREWALL RULE FOUND FOR PORT 3000!" -ForegroundColor Red
        Write-Host "   This is likely why your phone can't connect." -ForegroundColor Yellow
    }
} catch {
    Write-Host "   Could not check firewall rules (need Administrator)" -ForegroundColor Yellow
}
Write-Host ""

# 4. Check Firewall Profiles
Write-Host "4. Firewall Profiles:" -ForegroundColor Green
try {
    $profiles = Get-NetFirewallProfile
    foreach ($profile in $profiles) {
        $status = if ($profile.Enabled) { "ENABLED" } else { "DISABLED" }
        $color = if ($profile.Enabled) { "Green" } else { "Yellow" }
        Write-Host "   $($profile.Name): $status" -ForegroundColor $color
    }
} catch {
    Write-Host "   Could not check firewall profiles" -ForegroundColor Yellow
}
Write-Host ""

# 5. Quick Fix Option
Write-Host "5. Quick Fix:" -ForegroundColor Green
if (-not $isAdmin) {
    Write-Host "   Run this script as Administrator to add firewall rule" -ForegroundColor Yellow
} else {
    Write-Host "   Would you like to add/update firewall rule now? (Y/N)" -ForegroundColor Cyan
    $response = Read-Host
    if ($response -eq 'Y' -or $response -eq 'y') {
        Write-Host "   Adding firewall rule..." -ForegroundColor Yellow
        try {
            $existing = Get-NetFirewallRule -DisplayName "Node.js Backend - Port 3000" -ErrorAction SilentlyContinue
            if ($existing) {
                Remove-NetFirewallRule -DisplayName "Node.js Backend - Port 3000"
            }
            
            New-NetFirewallRule `
                -DisplayName "Node.js Backend - Port 3000" `
                -Direction Inbound `
                -Protocol TCP `
                -LocalPort 3000 `
                -Action Allow `
                -Description "Allows Node.js backend server on port 3000 for mobile device testing" `
                -Profile Domain,Private,Public
            
            Write-Host "   Firewall rule added successfully!" -ForegroundColor Green
            Write-Host "   Test from phone: http://$ip:3000/health" -ForegroundColor Cyan
        } catch {
            Write-Host "   Error: $_" -ForegroundColor Red
        }
    }
}

Write-Host ""
Write-Host "=== Diagnostic Complete ===" -ForegroundColor Cyan

