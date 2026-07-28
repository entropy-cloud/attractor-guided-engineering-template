@echo off
REM install-age.cmd — Windows native entry point (no Git Bash required).
REM
REM Delegates to tools/install-age.mjs (cross-platform Node, zero npm deps).
REM
REM Usage:
REM   install-age.cmd                                    REM interactive
REM   install-age.cmd C:\path\to\target "My Project Name" REM non-interactive
REM
REM Prerequisites: Node.js >= 18 in PATH.

node "%~dp0tools\install-age.mjs" %*
