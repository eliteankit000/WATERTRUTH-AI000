#!/bin/bash

mkdir -p /tmp/mongodb-data
mongod --dbpath /tmp/mongodb-data --bind_ip 127.0.0.1 --port 27017 --fork --logpath /tmp/mongodb.log

cd backend
python3 -m uvicorn server:app --host localhost --port 8000 --reload
