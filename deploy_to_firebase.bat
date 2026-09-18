@echo off
set "PATH=%APPDATA%\npm;%LOCALAPPDATA%\Programs\nodejs;%PATH%"

echo ===================================================
echo   Master MoltyFoam ERP - Deploy to Firebase
echo   Project: bed-shop-a6839
echo ===================================================
echo.

call firebase.cmd deploy --only hosting,firestore:rules --project bed-shop-a6839

echo.
echo ===================================================
echo   Deployment Finished!
echo   Live URL: https://bed-shop-a6839.web.app
echo ===================================================
pause
