# 🚀 Orbita Google Cloud Run Gateway

Этот сервис является зеркальным шлюзом для **Orbita Desktop**, работающим параллельно с Cloudflare Workers.
Клиенты Orbita автоматически замеряют пинг и выбирают этот Google Cloud шлюз, если Cloudflare заблокирован или работает медленнее.

---

## ⚡ Способ 1: Деплой через веб-консоль Google Cloud (Без терминала)

1. Зайдите в [Google Cloud Console -> Cloud Run](https://console.cloud.google.com/run).
2. Нажмите **Create Service** (Создать сервис).
3. Выберите **Continuously deploy from a repository** (или загрузите эту папку через Cloud Build / GitHub).
4. В разделе **Authentication** выберите **Allow unauthenticated invocations** (Разрешить публичный доступ).
5. В разделе **Variables & Secrets** укажите переменные окружения:
   * `LIVEKIT_API_KEY`: ваш ключ LiveKit
   * `LIVEKIT_API_SECRET`: ваш секрет LiveKit
   * `LIVEKIT_URL`: `wss://orbita-qd7zok2r.livekit.cloud`
   * `PUSHER_KEY`: ваш ключ Pusher
   * `PUSHER_SECRET`: ваш секрет Pusher
   * `PUSHER_APP_ID`: ваш App ID Pusher
   * `CLOUDINARY_API_KEY`: ваш ключ Cloudinary
   * `CLOUDINARY_API_SECRET`: ваш секрет Cloudinary
   * `CLOUDINARY_CLOUD_NAME`: ваш cloud name
6. Нажмите **Deploy**! Вы получите URL вида: `https://orbita-gateway-xxxx.a.run.app`.

---

## ⚡ Способ 2: Деплой через Google Cloud SDK CLI (1 команда)

Если у вас установлен `gcloud`:
```bash
gcloud run deploy orbita-gateway \
  --source . \
  --platform managed \
  --region europe-west1 \
  --allow-unauthenticated
```

---

## 🔗 Подключение к клиенту Орбиты

Полученный URL сервиса (например `https://orbita-gateway-xxxx.a.run.app`) укажите в корневом `.env` приложения:
```env
VITE_GOOGLE_GATEWAY_URL=https://orbita-gateway-xxxx.a.run.app
```
После этого клиент Орбиты будет автоматически пинговать и Cloudflare, и Google Cloud при каждом запуске, выбирая самый быстрый маршрут и моментально подстраховывая при сбоях!
