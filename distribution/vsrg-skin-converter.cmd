@echo off
setlocal
"%~dp0runtime\node.exe" "%~dp0app.mjs" %*
set "exitCode=%ERRORLEVEL%"
if not "%exitCode%"=="0" (
  >&2 echo.
  >&2 echo VSRG Skin Converter exited with code %exitCode%.
)
if not "%~1"=="" goto exit
if "%1"=="" pause
:exit
endlocal & exit /b %exitCode%
