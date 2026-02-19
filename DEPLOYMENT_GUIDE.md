# WaterTruth AI - Production Deployment Guide

## Prerequisites

- Node.js 18+ and Python 3.11+
- MongoDB instance (local or cloud)
- OpenAI API key
- Domain with HTTPS (for camera features)

## Environment Configuration

### Backend (.env)

```bash
# Database
MONGO_URL=mongodb://localhost:27017
DB_NAME=watertruth_db

# CORS (comma-separated origins)
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# OpenAI
OPENAI_API_KEY=sk-your-openai-api-key-here
OPENAI_MODEL=gpt-4o-mini  # or gpt-4o for better quality
```

### Frontend (.env)

```bash
# Backend API URL (must be HTTPS in production)
REACT_APP_BACKEND_URL=https://api.yourdomain.com
```

## Deployment Options

### Option 1: Vercel + MongoDB Atlas (Recommended)

**Frontend (Vercel):**

1. Install Vercel CLI:
```bash
npm install -g vercel
```

2. Deploy frontend:
```bash
cd /app/frontend
vercel --prod
```

3. Set environment variable:
```bash
vercel env add REACT_APP_BACKEND_URL
# Enter: https://your-backend-url.com
```

**Backend (Vercel Serverless):**

1. Create `vercel.json` in `/app/backend`:
```json
{
  "version": 2,
  "builds": [
    {"src": "server.py", "use": "@vercel/python"}
  ],
  "routes": [
    {"src": "/(.*)", "dest": "server.py"}
  ]
}
```

2. Deploy:
```bash
cd /app/backend
vercel --prod
```

3. Set environment variables:
```bash
vercel env add MONGO_URL
vercel env add OPENAI_API_KEY
vercel env add OPENAI_MODEL
```

**Database (MongoDB Atlas):**

1. Create free cluster at https://cloud.mongodb.com
2. Get connection string
3. Update `MONGO_URL` in Vercel

### Option 2: AWS (EC2 + RDS/DocumentDB)

**Backend:**

```bash
# Install dependencies
sudo apt update
sudo apt install python3-pip nginx

# Clone and setup
cd /var/www
git clone your-repo
cd watertruth-backend
pip3 install -r requirements.txt

# Run with Gunicorn
gunicorn -w 4 -k uvicorn.workers.UvicornWorker server:app --bind 0.0.0.0:8001
```

**Frontend:**

```bash
# Build
cd /app/frontend
npm run build

# Serve with Nginx
sudo cp -r build/* /var/www/html/
```

**Nginx config:**

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        root /var/www/html;
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://localhost:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Option 3: Docker Compose

**Create `docker-compose.yml`:**

```yaml
version: '3.8'

services:
  mongodb:
    image: mongo:7
    ports:
      - "27017:27017"
    volumes:
      - mongo-data:/data/db

  backend:
    build: ./backend
    ports:
      - "8001:8001"
    environment:
      - MONGO_URL=mongodb://mongodb:27017
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - OPENAI_MODEL=gpt-4o-mini
    depends_on:
      - mongodb

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    environment:
      - REACT_APP_BACKEND_URL=http://localhost:8001

volumes:
  mongo-data:
```

**Deploy:**
```bash
export OPENAI_API_KEY=your-key
docker-compose up -d
```

### Option 4: Netlify + Railway

**Frontend (Netlify):**

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Deploy
cd /app/frontend
netlify deploy --prod
```

**Backend (Railway):**

1. Visit https://railway.app
2. Create new project
3. Add MongoDB service
4. Deploy from GitHub
5. Add environment variables

## SSL/HTTPS Setup

### Let's Encrypt (Free)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

### Cloudflare (Recommended)

1. Add domain to Cloudflare
2. Enable "Always Use HTTPS"
3. Set SSL mode to "Full"
4. Enable "Automatic HTTPS Rewrites"

## Post-Deployment Checklist

- [ ] HTTPS enabled (required for camera)
- [ ] CORS configured correctly
- [ ] OpenAI API key working
- [ ] MongoDB connected
- [ ] PWA manifest accessible
- [ ] Service worker registering
- [ ] Rate limiting active
- [ ] Error logging configured
- [ ] Backup strategy in place
- [ ] Domain DNS configured

## Monitoring

**Backend Health:**
```bash
curl https://api.yourdomain.com/api/health
```

**Frontend:**
```bash
curl https://yourdomain.com/manifest.json
```

## Cost Estimates

### Free Tier (Good for testing):
- Vercel: Free (hobby)
- MongoDB Atlas: Free (512MB)
- OpenAI: Pay per use (~$0.15/1K requests with gpt-4o-mini)
- **Total: ~$5-20/month depending on usage**

### Production:
- Vercel Pro: $20/month
- MongoDB Atlas M10: $57/month
- OpenAI: ~$50-200/month (depends on traffic)
- Cloudflare: Free
- **Total: ~$130-280/month**

## Scaling Considerations

- Use CDN (Cloudflare) for static assets
- Enable MongoDB indexes on `timestamp` and `id`
- Cache OpenAI responses for common patterns
- Use Redis for rate limiting in multi-instance setups
- Consider AWS Lambda for serverless backend

## Support

For issues, check:
- Backend logs: `/var/log/supervisor/backend.err.log`
- Frontend build errors: `npm run build`
- MongoDB connection: Test connection string
- OpenAI API: Check quota and billing
