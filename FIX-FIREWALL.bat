@echo off
echo ========================================
echo Fix Firewall for Backend Server
echo ========================================
echo.
echo This script will add a firewall rule to allow
echo connections to port 3000 from your phone.
echo.
echo NOTE: You must run this as Administrator!
echo.
pause

powershell -Command "Start-Process powershell -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"%~dp0fix-firewall-now.ps1\"' -Verb RunAs"

echo.
echo If the window opened, follow the instructions there.
echo.
pause

