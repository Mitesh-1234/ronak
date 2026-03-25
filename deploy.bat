@echo off
echo Initializing Git repository...
git init
echo Adding files...
git add .
echo Committing changes...
git commit -m "Codebase Refactoring: Extracted CSS and JS into separate folder structure"
echo Setting branch to main...
git branch -M main
echo Removing old origin if exists...
git remote remove origin 2>nul
echo Adding GitHub origin...
git remote add origin https://github.com/Mitesh-1234/ronak.git
echo Pushing to GitHub repo: Mitesh-1234/ronak...
git push -u origin main
echo.
echo =========================================================
echo SUCCESS! Your code has been pushed to GitHub.
echo.
echo To host it on Vercel, simply type this in your terminal:
echo.
echo     vercel --prod
echo.
echo =========================================================
pause
