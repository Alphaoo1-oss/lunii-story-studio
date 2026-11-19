@echo off
rem Lance l'application (serveur + interface) et ouvre le navigateur quand elle est prête.
rem Fermer cette fenêtre arrête l'application.
chcp 65001 >nul
title Lunii Story Studio
cd /d "%~dp0"

rem Déjà lancée : on ouvre simplement la page.
curl -s -o nul http://127.0.0.1:5174/api/projects && (
  start "" http://localhost:5173
  exit /b
)

echo Lunii Story Studio démarre... Le navigateur s'ouvrira tout seul.
echo Pensez à lancer Voicebox pour générer les voix.
echo Gardez cette fenêtre ouverte : la fermer arrête l'application.
echo.

rem Attend que l'interface réponde (60 s au plus), puis ouvre le navigateur.
start "" /b cmd /c "for /l %%i in (1,1,60) do (curl -s -o nul http://localhost:5173/ && (start "" http://localhost:5173 & exit) & timeout /t 1 >nul)"

rem Sans rechargement automatique : sous tsx watch, le serveur se figeait pendant les appels à Claude.
call npm.cmd run app
echo.
echo L'application s'est arrêtée.
pause
