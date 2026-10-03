@echo off
title Coucou - Serveur de Developpement

echo ========================================================
echo               Coucou Windows - Lanceur Dev
echo ========================================================
echo.

cd /d "%~dp0\windows" 2>nul || cd /d "%~dp0"

:: Liberation automatique du port 1420 si un ancien serveur est reste ouvert
for /f "tokens=5" %%a in ('netstat -aon ^| find ":1420"') do (
    taskkill /f /pid %%a >nul 2>&1
)

:: Verification des dependances Node
if not exist "node_modules\" (
    echo [INFO] Installation initiale des modules npm...
    call npm.cmd install
    if errorlevel 1 (
        echo [ERREUR] Echec de npm install.
        pause
        exit /b 1
    )
)

echo Choisissez le mode de lancement :
echo   [1] Application Coucou complete (Tauri Dev - Mode dynamique / Hot-reload)
echo   [2] Serveur Web uniquement (Vite Dev - Test rapide dans le navigateur)
echo   [3] Quitter
echo.
set /p MODE="Votre choix [1] : "

if "%MODE%"=="" set MODE=1
if "%MODE%"=="1" goto launch_tauri
if "%MODE%"=="2" goto launch_vite
if "%MODE%"=="3" exit /b 0

:launch_tauri
echo.
echo [LANCEMENT] Demarrage de Coucou en mode Tauri Dev (sans build release)...
call npm.cmd run tauri dev
goto end

:launch_vite
echo.
echo [LANCEMENT] Demarrage du serveur Vite UI...
call npm.cmd run dev
goto end

:end
if errorlevel 1 (
    echo.
    echo [INFO] Le serveur s'est arrete avec une erreur.
    pause
)
