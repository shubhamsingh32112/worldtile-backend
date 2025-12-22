# Fix "Site Can't Be Reached" Error

## Your Current Status
- ✅ Backend is running on port 3000
- ✅ IP Address: 10.10.2.151
- ✅ .env file has correct URL: http://10.10.2.151:3000/api
- ❌ Firewall is blocking connections from your phone

## Solution: Fix Windows Firewall

### Method 1: Run PowerShell Script (Easiest)

1. **Right-click** on PowerShell icon in Start menu
2. Select **"Run as Administrator"**
3. Navigate to backend folder:
   ```powershell
   cd C:\Users\ACER\Desktop\1worldtile\backend
   ```
4. Run the fix script:
   ```powershell
   .\fix-firewall-now.ps1
   ```

### Method 2: Manual Firewall Fix (If script doesn't work)

1. Press `Windows + R`
2. Type: `wf.msc` and press Enter
3. Click **"Inbound Rules"** in the left panel
4. Click **"New Rule..."** in the right panel
5. Select **"Port"** → Click **Next**
6. Select **"TCP"** → Enter **3000** in "Specific local ports" → Click **Next**
7. Select **"Allow the connection"** → Click **Next**
8. **IMPORTANT**: Check all three boxes:
   - ☑ Domain
   - ☑ Private  
   - ☑ Public
   Then click **Next**
9. Name it: `Node.js Backend - Port 3000` → Click **Finish**

### Method 3: Quick Command (Run as Admin)

```powershell
New-NetFirewallRule -DisplayName "Node.js Backend - Port 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Domain,Private,Public
```

## After Fixing Firewall

1. **Test from your phone's browser:**
   ```
   http://10.10.2.151:3000/health
   ```
   You should see: `{"status":"OK","message":"WorldTile API is running",...}`

2. **Verify same WiFi network:**
   - Your computer: Connected to "Radisson_Guest"
   - Your phone: Must also be connected to "Radisson_Guest"

3. **Restart your Flutter app:**
   - Completely close and reopen the app
   - Don't just hot reload

## Still Not Working?

### Check Network Sharing (Public Network Issue)

Since you're on a **Public** network, Windows might block connections. Try this:

1. Open **Network and Sharing Center**
2. Click on your network connection ("Radisson_Guest")
3. Change network profile from **Public** to **Private**:
   - Click "Public network"
   - Select "Private"
   - Click "OK"

**OR** via PowerShell (as Admin):
```powershell
Get-NetConnectionProfile | Set-NetConnectionProfile -NetworkCategory Private
```

### Test from Computer First

Test if the IP is accessible from your computer:
```powershell
curl http://10.10.2.151:3000/health
```

If this works but phone doesn't, it's definitely a firewall issue.

### Check Backend Logs

When you try to connect from your phone, check your backend terminal. 
- **If you see request logs**: Firewall might be allowing but blocking response
- **If you see NO logs**: Firewall is blocking the connection entirely

### Disable Firewall Temporarily (Testing Only)

To test if firewall is the issue:
```powershell
# Run as Admin
Set-NetFirewallProfile -Profile Public -Enabled False
```

Test from phone. **If it works, firewall was the issue!**

**Re-enable after testing:**
```powershell
Set-NetFirewallProfile -Profile Public -Enabled True
```

## Quick Checklist

- [ ] Firewall rule added for port 3000 (all profiles)
- [ ] Phone and computer on same WiFi network
- [ ] Tested from phone browser: http://10.10.2.151:3000/health
- [ ] Backend is running (check terminal)
- [ ] Restarted Flutter app after fixing firewall

