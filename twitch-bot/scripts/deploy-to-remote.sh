#!/bin/sh

# This script is a quick way to deploy a docker image to the remote GCloud server.
# It works by building the default repository Docker image first, extracting the build
# artifacts, zipping them up along with a mini Dockerfile, copying them to the server,
# and finally building the runtime image there.

# ============
#    CONFIG   
# ============
ROUTE_TO_SCRIPTS_DIR=.
PROJECT=mantic-markets

DEV_INSTANCE=dev-twitch-bot
DEV_BUILD_DIR=build/dev
DEV_ZONE=europe-west2-c

PROD_INSTANCE=twitch-bot
PROD_BUILD_DIR=build/prod
PROD_ZONE=us-central1-a

# ============
#    SCRIPT   
# ============
error () {
	echo An error occuring during the deployment process.
	exit 1
}

pushd () {
    command pushd "$@" > /dev/null
}

popd () {
    command popd "$@" > /dev/null
}

build() {
	pushd $SOURCE_DIR/..
	echo "CWD: $PWD"
	
	echo Building code...
	docker rmi mb
	docker build -f twitch-bot/Dockerfile -t mb . || error
	popd
	
	pushd $BUILD_DIR
	echo Preparing files...
	CONTAINER_ID=$(docker create mb)
	docker cp $CONTAINER_ID:deploy/. out/
	docker rm $CONTAINER_ID
	popd

	cp $BUILD_DIR/.env $BUILD_DIR/out/
	cp Dockerfile $BUILD_DIR/out/

	cd $BUILD_DIR

	echo Copying files to server...
	tar -czf out.tar.gz out
	rm -r out
	gcloud.cmd compute scp --recurse --zone $ZONE out.tar.gz Phil@$INSTANCE_NAME:. || error
	rm out.tar.gz

	COMMAND="tar -zxf out.tar.gz out &&
	rm out.tar.gz &&
	echo Rebuilding docker image... &&
	docker build -t bot out &&
	echo Launching docker image... &&
	docker run -d --env-file=out/.env --restart on-failure --network=host bot &&
	echo Cleaning up... &&
	rm -r out &&
	docker system prune -a -f"

	gcloud compute ssh --zone $ZONE $INSTANCE_NAME --command "$COMMAND" || error

	exit 0
}

init_dev () {
	echo Deploying to DEV
	INSTANCE_NAME=$DEV_INSTANCE
	BUILD_DIR=$DEV_BUILD_DIR
	ZONE=$DEV_ZONE
	build
}

init_prod () {
	echo Deploying to PROD
	INSTANCE_NAME=$PROD_INSTANCE
	BUILD_DIR=$PROD_BUILD_DIR
	ZONE=$PROD_ZONE
	build
}

cd $ROUTE_TO_SCRIPTS_DIR
SOURCE_DIR=..
read -p "Which server do you want to deploy to [DEV/prod]? " de
case $de in
	prod ) init_prod; break;;
	p ) init_prod; break;;
	dev ) init_dev; break;;
	"" ) init_dev; break;;
	* ) echo "Invalid option entered. Exiting..."; error; break;;
esac