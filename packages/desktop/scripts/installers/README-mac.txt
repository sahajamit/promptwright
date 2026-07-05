================================================================================
  JARVIS-AI - Mac Installation Guide
================================================================================

Thank you for downloading JARVIS-AI!

QUICK START
-----------
1. Open Terminal
2. Navigate to this folder: cd path/to/JARVIS-AI-Mac-v1.0.0
3. Run: chmod +x install.sh && ./install.sh
4. Follow the on-screen instructions
5. Open a new terminal and run: jarvis

PREREQUISITES
-------------
- Node.js v22 or higher (installer will check)
- GitHub Copilot CLI (installer will install if missing)
- macOS 10.12 or higher

WHAT THE INSTALLER DOES
------------------------
1. Checks Node.js version (>= v22)
2. Checks/installs GitHub Copilot CLI (@github/copilot)
3. Creates ~/.jarvis-ai directory
4. Extracts and installs the app
5. Adds 'jarvis' command to your PATH

AFTER INSTALLATION
------------------
Open a new terminal and run:
    jarvis

Or double-click:
    ~/.jarvis-ai/jarvis.sh

The launcher automatically cleans up stale processes, so you never need to
worry about manual cleanup!

IMPORTANT: COPILOT AUTHENTICATION
----------------------------------
Make sure you're logged in to GitHub Copilot CLI:
    copilot auth login

TROUBLESHOOTING
---------------
Q: "jarvis: command not found"
A: Open a new terminal to load PATH changes, or run:
   source ~/.zshrc   (or ~/.bashrc)

Q: App doesn't launch
A: Make sure JARVIS-AI.app exists at ~/.jarvis-ai/JARVIS-AI.app
   Run the installer again if needed.

Q: Node.js version error
A: Install Node.js v22+ from https://nodejs.org/

SUPPORT
-------
For issues or questions, check the documentation in the GitHub repository.

================================================================================
