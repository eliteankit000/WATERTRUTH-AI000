#!/bin/bash
set -e

mkdir -p /tmp/mongodb-data
if ! pgrep -x mongod > /dev/null; then
  mongod --dbpath /tmp/mongodb-data --bind_ip 127.0.0.1 --port 27017 --fork --logpath /tmp/mongodb.log
fi

cd backend
exec uvicorn server:app --host 127.0.0.1 --port 8000 --reload
