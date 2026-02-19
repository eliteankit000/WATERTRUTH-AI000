#!/bin/bash

# WaterTruth AI - Production Setup Script
# This script configures WaterTruth AI for standalone deployment

set -e

echo "=================================="
echo "WaterTruth AI - Setup"
echo "=================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if .env files exist
if [ ! -f "/app/backend/.env" ] || [ ! -f "/app/frontend/.env" ]; then
    echo -e "${YELLOW}⚠️  Environment files not found. Creating from template...${NC}"
    cp /app/.env.example /app/backend/.env 2>/dev/null || true
    cp /app/.env.example /app/frontend/.env 2>/dev/null || true
fi

# Check for OpenAI API key
if grep -q "your-openai-api-key-here" /app/backend/.env; then
    echo -e "${RED}❌ OpenAI API key not configured!${NC}"
    echo ""
    echo "Please follow these steps:"
    echo "1. Get API key from: https://platform.openai.com/api-keys"
    echo "2. Edit /app/backend/.env"
    echo "3. Replace 'your-openai-api-key-here' with your actual key"
    echo "4. Run this script again"
    echo ""
    exit 1
fi

echo -e "${GREEN}✓ OpenAI API key configured${NC}"

# Check MongoDB
if ! pgrep -x "mongod" > /dev/null; then
    echo -e "${YELLOW}⚠️  MongoDB not running. Starting...${NC}"
    sudo systemctl start mongodb 2>/dev/null || sudo service mongodb start 2>/dev/null || true
    sleep 2
fi

if pgrep -x "mongod" > /dev/null; then
    echo -e "${GREEN}✓ MongoDB running${NC}"
else
    echo -e "${YELLOW}⚠️  MongoDB status unknown (may be running under different process name)${NC}"
fi

# Install backend dependencies
echo ""
echo "Installing backend dependencies..."
cd /app/backend
pip install -q -r requirements.txt
echo -e "${GREEN}✓ Backend dependencies installed${NC}"

# Install frontend dependencies
echo ""
echo "Installing frontend dependencies..."
cd /app/frontend
yarn install --silent 2>/dev/null || npm install --silent
echo -e "${GREEN}✓ Frontend dependencies installed${NC}"

# Check supervisor
echo ""
echo "Checking services..."
sudo supervisorctl restart all > /dev/null 2>&1
sleep 3

BACKEND_STATUS=$(sudo supervisorctl status backend | awk '{print $2}')
FRONTEND_STATUS=$(sudo supervisorctl status frontend | awk '{print $2}')

if [ "$BACKEND_STATUS" = "RUNNING" ]; then
    echo -e "${GREEN}✓ Backend service running${NC}"
else
    echo -e "${RED}❌ Backend service not running${NC}"
fi

if [ "$FRONTEND_STATUS" = "RUNNING" ]; then
    echo -e "${GREEN}✓ Frontend service running${NC}"
else
    echo -e "${RED}❌ Frontend service not running${NC}"
fi

# Test backend API
echo ""
echo "Testing backend API..."
HEALTH_CHECK=$(curl -s http://localhost:8001/api/health 2>/dev/null || echo "failed")

if echo "$HEALTH_CHECK" | grep -q "healthy"; then
    echo -e "${GREEN}✓ Backend API responding${NC}"
else
    echo -e "${RED}❌ Backend API not responding${NC}"
    echo "Check logs: tail -f /var/log/supervisor/backend.err.log"
fi

# Test frontend
echo ""
echo "Testing frontend..."
FRONTEND_CHECK=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null || echo "000")

if [ "$FRONTEND_CHECK" = "200" ]; then
    echo -e "${GREEN}✓ Frontend responding${NC}"
else
    echo -e "${YELLOW}⚠️  Frontend status: $FRONTEND_CHECK${NC}"
fi

# Get local IP
LOCAL_IP=$(hostname -I | awk '{print $1}' 2>/dev/null || ifconfig | grep -Eo 'inet (addr:)?([0-9]*\.){3}[0-9]*' | grep -Eo '([0-9]*\.){3}[0-9]*' | grep -v '127.0.0.1' | head -1)

echo ""
echo "=================================="
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo "=================================="
echo ""
echo "📱 Access your app:"
echo "   Local: http://localhost:3000"
if [ ! -z "$LOCAL_IP" ]; then
    echo "   Network: http://$LOCAL_IP:3000"
fi
echo ""
echo "🔧 API Health:"
echo "   http://localhost:8001/api/health"
echo ""
echo "📚 Next steps:"
echo "   1. Open http://localhost:3000 in browser"
echo "   2. For mobile testing, see: ./quick-test.sh"
echo "   3. For deployment, see: DEPLOYMENT_GUIDE.md"
echo ""
echo "📝 Configuration:"
echo "   Backend: /app/backend/.env"
echo "   Frontend: /app/frontend/.env"
echo ""
echo "🔍 Logs:"
echo "   Backend:  tail -f /var/log/supervisor/backend.out.log"
echo "   Frontend: tail -f /var/log/supervisor/frontend.out.log"
echo ""
echo "=================================="
