#!/bin/bash

echo "🚀 Starting WaterTruth AI Mobile Testing..."
echo ""

# Get local IP
LOCAL_IP=$(hostname -I | awk '{print $1}')
if [ -z "$LOCAL_IP" ]; then
    LOCAL_IP=$(ifconfig | grep -Eo 'inet (addr:)?([0-9]*\.){3}[0-9]*' | grep -Eo '([0-9]*\.){3}[0-9]*' | grep -v '127.0.0.1' | head -1)
fi

echo "📡 Local IP Address: $LOCAL_IP"
echo ""

# Method selection
echo "Select testing method:"
echo "1. Local Network (HTTP - limited features)"
echo "2. ngrok Tunnel (HTTPS - full PWA features) - RECOMMENDED"
echo "3. Just show connection info"
echo ""
read -p "Enter choice [1-3]: " choice

case $choice in
    1)
        echo ""
        echo "📱 LOCAL NETWORK MODE"
        echo "=========================================="
        echo ""
        echo "⚠️  Limitations: Camera won't work (needs HTTPS)"
        echo ""
        echo "✅ On your mobile device:"
        echo "   1. Connect to SAME WiFi network"
        echo "   2. Open browser and go to:"
        echo ""
        echo "   http://$LOCAL_IP:3000"
        echo ""
        echo "🔧 Backend API:"
        echo "   http://$LOCAL_IP:8001/api/health"
        echo ""
        echo "=========================================="
        ;;
        
    2)
        # Check if ngrok is installed
        if ! command -v ngrok &> /dev/null; then
            echo ""
            echo "❌ ngrok not found!"
            echo ""
            echo "📥 Install ngrok:"
            echo "   1. Go to: https://ngrok.com/download"
            echo "   2. Download and install"
            echo "   3. Run: ngrok authtoken YOUR_TOKEN"
            echo ""
            echo "Or install via snap:"
            echo "   sudo snap install ngrok"
            echo ""
            exit 1
        fi
        
        echo ""
        echo "🔗 NGROK TUNNEL MODE"
        echo "=========================================="
        echo ""
        echo "Starting tunnels..."
        
        # Kill existing ngrok
        pkill ngrok 2>/dev/null
        sleep 2
        
        # Start backend tunnel
        ngrok http 8001 --log=stdout > /tmp/ngrok-backend.log 2>&1 &
        NGROK_BACKEND_PID=$!
        sleep 4
        
        # Get backend URL
        BACKEND_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null | grep -o '"public_url":"https://[^"]*' | grep -o 'https://[^"]*' | head -1)
        
        if [ -z "$BACKEND_URL" ]; then
            echo "❌ Failed to start backend tunnel"
            echo "Check if ngrok is properly configured"
            exit 1
        fi
        
        echo "✅ Backend tunnel: $BACKEND_URL"
        
        # Update frontend env
        sed -i.bak "s|REACT_APP_BACKEND_URL=.*|REACT_APP_BACKEND_URL=$BACKEND_URL|" /app/frontend/.env
        
        # Restart frontend
        echo "Restarting frontend..."
        sudo supervisorctl restart frontend > /dev/null 2>&1
        sleep 3
        
        # Start frontend tunnel (different port for ngrok API)
        ngrok http 3000 --log=stdout > /tmp/ngrok-frontend.log 2>&1 &
        NGROK_FRONTEND_PID=$!
        sleep 4
        
        # Get frontend URL (check on different port)
        FRONTEND_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null | grep -o '"public_url":"https://[^"]*' | grep -o 'https://[^"]*' | tail -1)
        
        if [ -z "$FRONTEND_URL" ]; then
            # Try alternative method
            FRONTEND_URL=$(cat /tmp/ngrok-frontend.log | grep -o 'https://[a-z0-9-]*\.ngrok-free\.app' | head -1)
        fi
        
        echo "✅ Frontend tunnel: $FRONTEND_URL"
        echo ""
        echo "=========================================="
        echo "🎉 WaterTruth AI Ready!"
        echo "=========================================="
        echo ""
        echo "📱 Open on your phone:"
        echo "   $FRONTEND_URL"
        echo ""
        echo "🔧 Test backend:"
        echo "   $BACKEND_URL/api/health"
        echo ""
        echo "✅ All features available:"
        echo "   ✓ Camera access"
        echo "   ✓ PWA installation"
        echo "   ✓ Auto-capture"
        echo "   ✓ Service Worker"
        echo ""
        echo "📋 Tunnel PIDs:"
        echo "   Backend: $NGROK_BACKEND_PID"
        echo "   Frontend: $NGROK_FRONTEND_PID"
        echo ""
        echo "⏹️  To stop tunnels:"
        echo "   pkill ngrok"
        echo ""
        echo "📝 Logs:"
        echo "   Backend: /tmp/ngrok-backend.log"
        echo "   Frontend: /tmp/ngrok-frontend.log"
        echo "=========================================="
        echo ""
        echo "Press Ctrl+C to stop..."
        
        # Keep script running
        wait
        ;;
        
    3)
        echo ""
        echo "📱 CONNECTION INFO"
        echo "=========================================="
        echo ""
        echo "🏠 Local Network:"
        echo "   Frontend: http://$LOCAL_IP:3000"
        echo "   Backend:  http://$LOCAL_IP:8001"
        echo ""
        echo "🔗 For full features, use ngrok:"
        echo "   Run: ./start-mobile-test.sh"
        echo "   Choose option 2"
        echo ""
        echo "📚 Full guide: /app/LOCAL_MOBILE_TESTING_GUIDE.md"
        echo "=========================================="
        ;;
        
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac
