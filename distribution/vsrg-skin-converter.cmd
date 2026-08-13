@echo off
setlocal
"%~dp0runtime\node.exe" "%~dp0app.mjs" %*
set "exitCode=%ERRORLEVEL%"
if not "%exitCode%"=="0" (
  >&2 echo.
  >&2 echo VSRG Skin Converter exited with code %exitCode%.
  if "%~1"=="" pause
)
endlocal & exit /b %exitCode%
