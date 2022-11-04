:: This script is a quick way to deploy a docker image to the remote GCloud server.
:: It works by building the default repository Docker image first, extracting the build
:: artifacts, zipping them up along with a mini Dockerfile, copying them to the server,
:: and finally building the runtime image there.

@echo off
Setlocal EnableDelayedExpansion

::============
::   CONFIG   
::============
set ROUTE_TO_SCRIPTS_DIR=..
set PROJECT=mantic-markets

set DEV_INSTANCE=dev-twitch-bot
set DEV_BUILD_DIR=build\dev
set DEV_ZONE=europe-west2-c

set PROD_INSTANCE=twitch-bot
set PROD_BUILD_DIR=build\prod
set PROD_ZONE=us-central1-a

::============
::   SCRIPT   
::============
cd %ROUTE_TO_SCRIPTS_DIR%
set SOURCE_DIR=..
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
set ZONE=%DEV_ZONE%
goto init_build

:init_prod
echo Deploying to PROD
set INSTANCE_NAME=%PROD_INSTANCE%
set BUILD_DIR=%PROD_BUILD_DIR%
set ZONE=%PROD_ZONE%
goto init_build

:init_build
set /p latestgit=Use latest git [Y/n]? 
if /i [!latestgit!]==[y] goto update_git_and_build
if /i [!latestgit!]==[] goto update_git_and_build
if /i [!latestgit!]==[n] goto build
echo Invalid option entered. Exiting...
goto error

:update_git_and_build
if not exist %BUILD_DIR%\src (
	echo Build folder not found, creating...
	mkdir %BUILD_DIR%
	pushd %BUILD_DIR%
	git clone https://github.com/PhilBladen/ManifoldTwitchIntegration.git src
	popd
) else (
	pushd %BUILD_DIR%\src
	git pull
	popd
)
set SOURCE_DIR=%BUILD_DIR%\src
goto build

:build
pushd %SOURCE_DIR%
echo Building code...
docker rmi mb
docker build -t mb . || goto error
popd

pushd %BUILD_DIR%
echo Preparing files...
FOR /F "tokens=* USEBACKQ" %%F IN (`docker create mb`) DO SET CONTAINER_ID=%%F
docker cp %CONTAINER_ID%:deploy/. out/
docker rm %CONTAINER_ID%
popd

copy %BUILD_DIR%\.env %BUILD_DIR%\out\ >nul 2>&1
copy Dockerfile %BUILD_DIR%\out\ >nul 2>&1

goto deploy

:deploy
cd %BUILD_DIR%

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
docker run -d --env-file=out/.env --restart on-failure --network="host" --security-opt="apparmor=docker-default" bot ^&^& ^
echo Cleaning up... ^&^& ^
rm -r out ^&^& ^
docker system prune -a -f
call gcloud compute ssh --zone %ZONE% %INSTANCE_NAME% --command "!COMMAND!" || goto error

exit /b 0

:error
echo An error occuring during the deployment process.
pause
exit /b 1