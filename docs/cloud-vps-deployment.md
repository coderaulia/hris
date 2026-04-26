# Cloud / VPS Deployment Guide

This guide covers deploying the **HR Performance Suite** (Frontend + Laravel Backend) on a Linux VPS (e.g., Ubuntu 22.04) using Nginx.

## Prerequisites

- A Linux VPS with a public IP.
- A domain name pointing to your VPS IP.
- PHP 8.2+, Nginx, PostgreSQL, and Node.js installed.
- SSL Certificate (recommended via Certbot/Let's Encrypt).

---

## 1. Backend Deployment (Laravel)

### Step 1: Clone and Install
```bash
cd /var/www
git clone https://github.com/your-repo/hris.git
cd hris/backend
composer install --optimize-autoloader --no-dev
```

### Step 2: Environment Setup
```bash
cp .env.example .env
nano .env
```
Update these values:
- `APP_ENV=production`
- `APP_DEBUG=false`
- `APP_URL=https://api.yourdomain.com`
- `DB_HOST=127.0.0.1` (or your RDS/Managed DB host)
- `DB_DATABASE=hris`
- `DB_USERNAME=postgres`
- `DB_PASSWORD=your_secure_password`

### Step 3: Permissions & Optimization
```bash
php artisan key:generate
php artisan migrate --force
php artisan config:cache
php artisan route:cache

chown -R www-data:www-data storage bootstrap/cache
chmod -R 775 storage bootstrap/cache
```

---

## 2. Frontend Deployment (Vite)

### Step 1: Build the App
```bash
cd /var/www/hris
npm install
```
Create a `.env` file in the root:
```env
VITE_BACKEND_TYPE=laravel
VITE_LARAVEL_API_URL=https://api.yourdomain.com/api/v1
```
Build:
```bash
npm run build
```
This generates a `dist/` directory.

---

## 3. Nginx Configuration

Create a configuration file: `/etc/nginx/sites-available/hris`

```nginx
# --- Frontend (SPA) ---
server {
    listen 80;
    server_name yourdomain.com;
    root /var/www/hris/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Optional: Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }
}

# --- Backend (API) ---
server {
    listen 80;
    server_name api.yourdomain.com;
    root /var/www/hris/backend/public;
    index index.php;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/var/run/php/php8.2-fpm.sock;
    }

    location ~ /\.ht {
        deny all;
    }
}
```

Enable the site and restart Nginx:
```bash
ln -s /etc/nginx/sites-available/hris /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

---

## 4. SSL Setup (Certbot)

```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d yourdomain.com -d api.yourdomain.com
```

---

## 5. Maintenance Commands

- **Update App**: `git pull` -> `npm run build` (frontend) / `php artisan migrate` (backend).
- **Clear Caches**: `php artisan optimize:clear`.
- **Logs**: `tail -f /var/www/hris/backend/storage/logs/laravel.log`.
