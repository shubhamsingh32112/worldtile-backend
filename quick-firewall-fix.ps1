# Quick Firewall Fix - Run as Administrator
# Adds firewall rule for port 3000

New-NetFirewallRule `
    -DisplayName "Node.js Backend - Port 3000" `
    -Direction Inbound `
    -Protocol TCP `
    -LocalPort 3000 `
    -Action Allow `
    -Description "Allows Node.js backend server on port 3000"

Write-Host "Firewall rule added!" -ForegroundColor Green
Write-Host "Test from phone: http://192.168.1.15:3000/health" -ForegroundColor Cyan
pause

