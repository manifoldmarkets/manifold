@echo off
Setlocal EnableDelayedExpansion

::============
::   CONFIG   
::============
set ROUTE_TO_SCRIPTS_DIR=..
set ZONE=us-central1-a
set PROJECT=mantic-markets

set DEV_INSTANCE=dev-twitch-bot
set DEV_BUILD_DIR=build\dev
set PROD_INSTANCE=twitch-bot
set PROD_BUILD_DIR=build\prod

::============
::   SCRIPT   
::============
cd %ROUTE_TO_SCRIPTS_DIR%
set /p de=Which server do you want to deploy to [DEV/prod]? 
if /i [!de!]==[prod] goto init_prod
if /i [!de!]==[p] goto init_prod
if /i [!de!]==[dev] goto init_dev
if [!de!]==[] goto init_dev
echo Invalid option entered. Exiting...
goto error

:init_dev
echo Deploying to DEV
set INSTANCE_NAME=%DEV_INSTANCE%
set BUILD_DIR=%DEV_BUILD_DIR%
goto init_build

:init_prod
echo Deploying to PROD
set INSTANCE_NAME=%PROD_INSTANCE%
set BUILD_DIR=%PROD_BUILD_DIR%
goto init_build

:init_build
set /p latestgit=Use latest git [Y/n]? 
if /i [!latestgit!]==[y] goto build_latest
if /i [!latestgit!]==[] goto build_latest
if /i [!latestgit!]==[n] goto build_workspace
echo Invalid option entered. Exiting...
goto error

:build_workspace
cd ..
echo Building code...
call npx concurrently -n WEB,SERVER "yarn --cwd web build" "yarn --cwd server build" -g || goto error
echo Preparing files...
if exist out (
	del /s /q out
	rmdir /s /q out
)
mkdir out\static
xcopy web\out out\static /s /e >nul 2>&1
xcopy server\dist out /s /e >nul 2>&1
copy scripts\%BUILD_DIR%\.env out >nul 2>&1
copy scripts\%BUILD_DIR%\Dockerfile out >nul 2>&1
goto deploy

:build_latest
if not exist %BUILD_DIR% (
	echo Build folder not found, creating...
	mkdir %BUILD_DIR%
	cd %BUILD_DIR%
	git clone https://github.com/PhilBladen/ManifoldTwitchIntegration.git src
	cd src
) else (
	cd %BUILD_DIR%
	cd src
	git pull
)
call yarn || goto error
echo Building code...
call npx concurrently -n WEB,SERVER "yarn --cwd web build" "yarn --cwd server build" -g || goto error
echo Preparing files...
cd ..
if exist out (
	del /s /q out
	rmdir /s /q out
)
mkdir out\static
xcopy src\web\out out\static /s /e >nul 2>&1
xcopy src\server\dist out /s /e >nul 2>&1
copy .env out >nul 2>&1
copy Dockerfile out >nul 2>&1
goto deploy

:deploy
echo Copying files to server...
tar -czf out.tar.gz out
del /s /q out >nul 2>&1
rmdir /s /q out >nul 2>&1
call gcloud compute scp --recurse --zone %ZONE% out.tar.gz Phil@%INSTANCE_NAME%:. || goto error
del /q out.tar.gz >nul 2>&1

set COMMAND=tar -zxf out.tar.gz out ^&^& ^
rm out.tar.gz ^&^& ^
echo Rebuilding docker image... ^&^& ^
docker build -t bot out ^&^& ^
echo Launching docker image... ^&^& ^
docker kill $^(docker ps -q^) ^|^| true ^&^& ^
docker run -itd --env-file=out/.env -p 80:80 --restart on-failure bot ^&^& ^
echo Cleaning up... ^&^& ^
rm -r out ^&^& ^
docker system prune -a -f
call gcloud compute ssh --zone %ZONE% %INSTANCE_NAME% --command "!COMMAND!" || goto error

exit /b 0

:error
echo An error occuring during the deployment process.
pause
exit /b 1