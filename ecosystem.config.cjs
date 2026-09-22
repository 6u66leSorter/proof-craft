const path = require('path')

const appDir = '/var/www/barber/app'

/** Чтобы pm2 подставил BOT_TOKEN из .env при `pm2 start` (deploy не обязан export в shell). */
require('dotenv').config({ path: path.join(appDir, '.env') })

module.exports = {
  apps: [
    {
      name: 'barber-api',
      script: path.join(appDir, 'bot', 'apiServer.js'),
      cwd: appDir,
      env: {
        NODE_ENV: 'production',
        API_PORT: '8787',
        BOT_TOKEN: process.env.BOT_TOKEN,
        WEB_APP_URL: process.env.WEB_APP_URL || 'https://barber-class.ru',
        /** См. apiServer.js: виртуально дописывает /api, если nginx срезал префикс у proxy_pass */
        API_PREFIX_STRIP_REWRITE: process.env.API_PREFIX_STRIP_REWRITE ?? '1',
        /**
         * apiServer.js не импортирует dotenv, поэтому всё, что ему нужно,
         * перечисляем здесь явно — иначе переменная до процесса не доедет.
         */
        TG_WEBAPP_AUTH: process.env.TG_WEBAPP_AUTH || 'strict',
        TELEGRAM_BOT_USERNAME: process.env.TELEGRAM_BOT_USERNAME,
        VK_APP_ID: process.env.VK_APP_ID,
        VK_APP_SECRET: process.env.VK_APP_SECRET,
        MAX_HOMEWORK_UPLOAD_MB: process.env.MAX_HOMEWORK_UPLOAD_MB,
        CHAT_ENABLED: process.env.CHAT_ENABLED,
      },
    },
    {
      name: 'barber-bot',
      script: path.join(appDir, 'bot', 'registrationBot.js'),
      cwd: appDir,
      env: {
        NODE_ENV: 'production',
        BOT_TOKEN: process.env.BOT_TOKEN,
        WEB_APP_URL: process.env.WEB_APP_URL || 'https://barber-class.ru',
      },
    },
  ],
}
