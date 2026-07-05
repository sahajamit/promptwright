================================================================================
  JARVIS-AI - Windows Installation Guide
================================================================================

Thank you for downloading JARVIS-AI!

QUICK START
-----------
1. Extract this ZIP file
2. Double-click: install.bat
3. Follow the on-screen instructions
4. Open a new Command Prompt or PowerShell
5. Run: jarvis

PREREQUISITES
-------------
- Node.js v22 or higher (installer will check)
- GitHub Copilot CLI (installer will install if missing)
- Windows 10 or 11 (64-bit)

WHAT THE INSTALLER DOES
------------------------
1. Checks Node.js version (>= v22)
2. Checks/installs GitHub Copilot CLI (@github/copilot)
3. Creates %USERPROFILE%\.jarvis-ai directory
4. Extracts and installs the app
5. Adds 'jarvis' command to your PATH

AFTER INSTALLATION
------------------
Open a new Command Prompt or PowerShell and run:
    jarvis

Or double-click:
    %USERPROFILE%\.jarvis-ai\jarvis.bat

The launcher automatically cleans up stale processes, so you never need to
worry about manual cleanup!

IMPORTANT: COPILOT AUTHENTICATION
----------------------------------
Make sure you're logged in to GitHub Copilot CLI:
    copilot auth login

TROUBLESHOOTING
---------------
Q: "'jarvis' is not recognized as an internal or external command"
A: Open a new Command Prompt to load PATH changes.

Q: PowerShell execution policy error
A: The installer uses -ExecutionPolicy Bypass. If you still have issues,
   run in PowerShell as Administrator:
   Set-ExecutionPolicy RemoteSigned -Scope CurrentUser

Q: App doesn't launch
A: Make sure JARVIS-AI.exe exists at:
   %USERPROFILE%\.jarvis-ai\win-unpacked\JARVIS-AI.exe
   Run the installer again if needed.

Q: Node.js version error
A: Install Node.js v22+ from https://nodejs.org/

Q: Windows SmartScreen warning
A: Click "More info" → "Run anyway"
   The app is not signed, which triggers this warning.

SUPPORT
-------
For issues or questions, check the documentation in the GitHub repository.

================================================================================
