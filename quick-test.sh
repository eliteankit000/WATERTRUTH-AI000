#!/bin/bash

echo ""
echo "📱 WaterTruth AI - Quick Mobile Test"
echo "=========================================="
echo ""

# Get local IP
LOCAL_IP=$(hostname -I | awk '{print $1}')
if [ -z "$LOCAL_IP" ]; then
    LOCAL_IP=$(ifconfig | grep -Eo 'inet (addr:)?([0-9]*\.){3}[0-9]*' | grep -Eo '([0-9]*\.){3}[0-9]*' | grep -v '127.0.0.1' | head -1)
fi

FRONTEND_URL="http://$LOCAL_IP:3000"

echo "🌐 Your testing URL:"
echo ""
echo "   $FRONTEND_URL"
echo ""
echo "📱 TO TEST ON YOUR PHONE:"
echo ""
echo "METHOD 1 - Type URL (Simple but limited)"
echo "  1. Connect phone to SAME WiFi"
echo "  2. Open browser on phone"
echo "  3. Type: $LOCAL_IP:3000"
echo "  ⚠️  Camera won't work (needs HTTPS)"
echo ""
echo "METHOD 2 - Use ngrok (RECOMMENDED)"
echo "  Run: ./start-mobile-test.sh"
echo "  Choose option 2 (ngrok)"
echo "  ✅ Camera works!"
echo "  ✅ Full PWA features!"
echo ""
echo "METHOD 3 - QR Code"
echo "  Run: ./generate-qr.sh"
echo "  Scan QR with phone"
echo ""
echo "=========================================="
echo ""
echo "📚 Full Guide: cat /app/LOCAL_MOBILE_TESTING_GUIDE.md"
echo ""
