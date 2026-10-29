@echo off
setlocal EnableExtensions
chcp 65001 >nul
title PedeAqui - Piloto de diagnostico
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Preparar-Piloto.ps1"
echo.
if errorlevel 1 echo O teste ficou incompleto. Envie o relatorio, se ele foi criado.
pause
