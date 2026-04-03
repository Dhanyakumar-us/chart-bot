@echo off
echo ==============================================
echo    BULLETPROOF GITHUB UPLOADER
echo ==============================================
echo.

echo 1. Wiping broken Github caches...
rmdir /s /q .git >nul 2>&1

echo 2. Packaging your code...
git init
git config user.email "developer@example.com"
git config user.name "Developer"
git add .
git commit -m "First upload"
git branch -M main

echo.
set /p REPO_URL="PASTE YOUR GITHUB URL (e.g. https://github.com/Dhanyakumar-hub/NoLimits-AI-Bot) : "

git remote add origin %REPO_URL%

echo.
echo 3. Firing code to GitHub Database...
git push -u origin main -f

echo.
echo ==============================================
echo DONE!
echo ==============================================
pause
