# Test Connection Script
Write-Host "=== Testing Backend Connection ===" -ForegroundColor Cyan
Write-Host ""

# Test localhost
Write-Host "1. Testing localhost:3000..." -ForegroundColor Green
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/health" -UseBasicParsing -TimeoutSec 5
    Write-Host "   ✅ SUCCESS - Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "   Response: $($response.Content)" -ForegroundColor Gray
} catch {
    Write-Host "   ❌ FAILED - Backend not running or not accessible" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Yellow
}
Write-Host ""

# Test local IP
$ip = "10.10.2.151"
Write-Host "2. Testing $ip:3000..." -ForegroundColor Green
try {
    $response = Invoke-WebRequest -Uri "http://$ip:3000/health" -UseBasicParsing -TimeoutSec 5
    Write-Host "   ✅ SUCCESS - Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "   Response: $($response.Content)" -ForegroundColor Gray
} catch {
    Write-Host "   ❌ FAILED - Cannot reach via IP address" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Yellow
}
Write-Host ""

# Check if port is listening
Write-Host "3. Checking if port 3000 is listening..." -ForegroundColor Green
$listening = netstat -an | Select-String ":3000" | Select-String "LISTENING"
if ($listening) {
    Write-Host "   ✅ Port 3000 is LISTENING" -ForegroundColor Green
    Write-Host "   $listening" -ForegroundColor Gray
} else {
    Write-Host "   ❌ Port 3000 is NOT listening" -ForegroundColor Red
}
Write-Host ""

# Check firewall rules (may fail if not admin)
Write-Host "4. Checking firewall rules for port 3000..." -ForegroundColor Green
try {
    $rules = Get-NetFirewallRule -ErrorAction SilentlyContinue | Where-Object {
        $portFilter = $_ | Get-NetFirewallPortFilter -ErrorAction SilentlyContinue
        $portFilter -and $portFilter.LocalPort -eq 3000 -and $_.Direction -eq "Inbound"
    }
    if ($rules) {
        Write-Host "   Found firewall rule(s):" -ForegroundColor White
        foreach ($rule in $rules) {
            $portFilter = $rule | Get-NetFirewallPortFilter
            $enabled = if ($rule.Enabled) { "✅ Enabled" } else { "❌ Disabled" }
            Write-Host "   - $($rule.DisplayName): $enabled" -ForegroundColor $(if ($rule.Enabled) { "Green" } else { "Red" })
            Write-Host "     Profiles: $($rule.Profile -join ', ')" -ForegroundColor Gray
        }
    } else {
        Write-Host "   ❌ NO FIREWALL RULE FOUND!" -ForegroundColor Red
        Write-Host "   This is why your phone can't connect!" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "   Run fix-firewall-now.ps1 as Administrator to fix this." -ForegroundColor Cyan
    }
} catch {
    Write-Host "   ⚠️  Cannot check firewall (need Administrator privileges)" -ForegroundColor Yellow
    Write-Host "   Run this script as Administrator to see firewall status" -ForegroundColor Yellow
}
Write-Host ""

Write-Host "=== Test Complete ===" -ForegroundColor Cyan
Write-Host ""
pause

