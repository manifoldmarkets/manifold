cd ../..
start=`date +%s`
docker build -f twitch-bot/Dockerfile -t mb .
end=`date +%s`
echo "================================="
echo "= Build completed in $((end-start)) seconds ="
echo "================================="
sleep 3