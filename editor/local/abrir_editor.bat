@echo off
rem Abre el editor del mapa en el navegador (servidor local en http://127.0.0.1:7791/). Cerrar esta ventana apaga el editor.
cd /d "%~dp0..\.."
set PY=python
where python >nul 2>nul || set PY=%LOCALAPPDATA%\Python\pythoncore-3.14-64\python.exe
"%PY%" -I herramientas\editor_mapa\servidor.py
pause
