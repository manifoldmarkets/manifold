SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
cd "$SCRIPT_DIR/../.."
start=`date +%s`
docker build -f twitch-bot/Dockerfile -t mb .
end=`date +%s`
echo "================================="
echo "= Build completed in $((end-start)) seconds ="
echo "================================="
sleep 3