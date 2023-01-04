SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
cd "$SCRIPT_DIR/.."
docker run -it --env-file=.env --env PUBLIC_FACING_URL=http://127.0.0.1:9172 -p 9172:9172 mb