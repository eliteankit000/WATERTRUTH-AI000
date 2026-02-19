# 📱 WaterTruth AI - Local Mobile Testing

## 🚀 QUICKEST WAY TO TEST

### Option 1: Local Network (5 minutes setup)
**Best for:** Quick UI testing without camera

```bash
# Get your computer's IP
hostname -I

# Example output: 192.168.1.100
```

**On your phone:**
1. Connect to SAME WiFi as computer
2. Open browser
3. Go to: `http://192.168.1.100:3000`

**⚠️ Limitations:**
- Camera WON'T work (needs HTTPS)
- PWA installation WON'T work
- Can only test UI and navigation

---

### Option 2: ngrok Tunnel (10 minutes setup) ✅ RECOMMENDED
**Best for:** Testing ALL features including camera

#### Step 1: Install ngrok
```bash
# Visit: https://ngrok.com/download
# Or install via snap:
sudo snap install ngrok

# Sign up and get auth token from: https://dashboard.ngrok.com/get-started/your-authtoken
ngrok authtoken YOUR_TOKEN_HERE
```

#### Step 2: Run Testing Script
```bash
cd /app
./start-mobile-test.sh

# Choose option 2 (ngrok)
```

#### Step 3: Open URL on Phone
The script will show you a URL like:
```
https://abc123.ngrok-free.app
```

Open this URL on ANY phone (doesn't need same WiFi!)

**✅ All Features Work:**
- ✓ Live camera
- ✓ Auto-capture
- ✓ PWA installation
- ✓ Service worker
- ✓ Full functionality

---

## 📋 TESTING CHECKLIST

### Must Test:
- [ ] Home page loads
- [ ] Click "Start Camera Scan"
- [ ] Allow camera permissions
- [ ] Camera preview appears
- [ ] Point at water/blue surface
- [ ] Quality metrics update
- [ ] Auto-capture triggers
- [ ] Analysis completes
- [ ] Results display correctly
- [ ] Click "Analyze Another Sample"

### PWA Features (Only with HTTPS/ngrok):
- [ ] Install prompt appears
- [ ] Add to home screen
- [ ] Launch from home screen
- [ ] Runs in standalone mode
- [ ] Offline indicator works

---

## 🔧 TROUBLESHOOTING

### Camera not working?
```bash
# Must use HTTPS (ngrok method)
# Check if ngrok is running:
ps aux | grep ngrok

# Check frontend URL in browser console:
# Should be https://... not http://...
```

### Backend not responding?
```bash
# Check services status:
sudo supervisorctl status

# Restart if needed:
sudo supervisorctl restart all

# Check backend health:
curl http://localhost:8001/api/health
```

### ngrok tunnel closed?
```bash
# Free ngrok tunnels expire after 2 hours
# Just restart the script:
./start-mobile-test.sh
# Choose option 2 again
```

---

## 📱 ALTERNATIVE METHODS

### USB Debugging (Android Only)
```bash
# Enable Developer Options on phone
# Enable USB Debugging
# Connect via USB

# Forward ports:
adb reverse tcp:3000 tcp:3000
adb reverse tcp:8001 tcp:8001

# Access on phone:
# http://localhost:3000
```

### iOS Safari Web Inspector
```bash
# On Mac only
# Connect iPhone via USB
# Enable Web Inspector on iPhone:
# Settings → Safari → Advanced → Web Inspector

# Open Safari on Mac
# Develop → [Your iPhone] → localhost
```

---

## 💡 PRO TIPS

1. **Share ngrok URL** - Send to multiple phones for testing
2. **Test different lighting** - Indoor, outdoor, bright, dim
3. **Try various surfaces** - Water bottle, tap water, blue paper
4. **Monitor network tab** - F12 → Network in browser
5. **Check console logs** - F12 → Console for errors
6. **Test offline mode** - Turn on airplane mode after loading
7. **Battery test** - See if camera works in low power mode

---

## 🆘 QUICK HELP COMMANDS

```bash
# Show connection info
./quick-test.sh

# Start ngrok testing
./start-mobile-test.sh

# View full guide
cat /app/LOCAL_MOBILE_TESTING_GUIDE.md

# Check backend logs
tail -f /var/log/supervisor/backend.out.log

# Check frontend logs
tail -f /var/log/supervisor/frontend.out.log

# Restart everything
sudo supervisorctl restart all

# Stop ngrok
pkill ngrok
```

---

## 📊 EXPECTED PERFORMANCE

### Modern Phones (iPhone 13+, Samsung S21+)
- Camera init: < 2 seconds
- Auto-capture: < 1 second after optimal
- Analysis: 3-5 seconds
- Total: ~6-8 seconds from scan to results

### Budget Phones (iPhone 8, Budget Android)
- Camera init: 2-4 seconds
- Auto-capture: 1-2 seconds
- Analysis: 4-7 seconds
- Total: ~8-12 seconds

---

## ✅ YOU'RE READY!

**Recommended Flow:**
1. Run: `./start-mobile-test.sh`
2. Choose option 2 (ngrok)
3. Open URL on phone
4. Test camera scanning
5. Check PWA installation
6. Done! 🎉

**Need more help?** Check: `LOCAL_MOBILE_TESTING_GUIDE.md`

## API Key Setup

Before testing, make sure you have your OpenAI API key configured:

1. Get API key from: https://platform.openai.com/api-keys
2. Update `/app/backend/.env`:
   ```
   OPENAI_API_KEY=sk-your-key-here
   ```
3. Restart backend: `sudo supervisorctl restart backend`
