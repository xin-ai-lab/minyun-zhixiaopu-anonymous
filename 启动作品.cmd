@echo off
chcp 65001 >nul
cd /d "%~dp0"
if exist "runtime\python.exe" goto portable
where py >nul 2>nul
if not errorlevel 1 goto systempy
where python >nul 2>nul
if not errorlevel 1 goto systempython
echo Please extract the complete runtime package, or install Python 3.10 or newer.
pause
exit /b 1
:portable
"runtime\python.exe" -X utf8 "launch.py"
goto done
:systempy
py -3 -X utf8 "launch.py"
goto done
:systempython
python -X utf8 "launch.py"
:done
if errorlevel 1 pause
exit /b
