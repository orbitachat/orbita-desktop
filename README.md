```text
                                         _.oo.
                 _.u[[/;:,.         .odMMMMMM'
              .o888UU[[[/;:-.  .o@P^    MMM^
             oN88888UU[[[/;::-.        dP^
            dNMMNN888UU[[[/;:--.   .o@P^
           ,MMMMMMN888UU[[/;::-. o@^
           NNMMMNN888UU[[[/~.o@P^
           888888888UU[[[/o@^-..
          oI8888UU[[[/o@P^:--..
       .@^  YUU[[[/o@^;::---..
     oMP     ^/o@P^;:::---..
  .dMMM    .o@^ ^;::---...
 dMMMMMMM@^`       `^^^^
YMMMUP^
```

<div align="center">

  # Orbita

  Десктопный мессенджер со сквозным шифрованием, высокой производительностью и интеграцией с Windows.

  [![License](https://img.shields.io/github/license/orbitachat/orbita-desktop?style=flat-square)](LICENSE)
  [![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
  [![Rust](https://img.shields.io/badge/Rust-000000?style=flat-square&logo=rust&logoColor=white)](https://www.rust-lang.org/)
  [![Electron](https://img.shields.io/badge/Electron-47848F?style=flat-square&logo=electron&logoColor=white)](https://www.electronjs.org/)
  [![GitHub Release](https://img.shields.io/github/v/release/orbitachat/orbita-desktop?style=flat-square)](https://github.com/orbitachat/orbita-desktop/releases)

</div>

---

## Основные возможности

- **Сквозное шифрование**: протокол Double Ratchet (X25519, HKDF, AES-GCM / ChaCha20-Poly1305) обеспечивает приватность данных, прямую и обратную секретность.
- **Тёмный интерфейс**: интерфейс на базе Material Design 3 с адаптивной цветовой палитрой.
- **Локальная транскрипция**: распознавание голосовых сообщений выполняется непосредственно на устройстве пользователя.
- **Очистка метаданных**: перед отправкой файлов автоматически удаляются их метаданные.
- **Голосовые и видеозвонки**: личные и групповые звонки с низкой задержкой на базе LiveKit и WebRTC.

---

## Стек технологий

- **Electron** — оболочка приложения (Chromium, Node.js)
- **React & TypeScript** — клиентская часть (React 19, Vite, TailwindCSS)
- **Rust** — нативный модуль (`napi-rs`, Win32 API, аппаратное шифрование)
- **Supabase** — серверная логика и шлюз (Cloudflare Workers, Vercel Serverless)

---

## Быстрый старт

### Требования
- Node.js (версия 20 или новее)
- Rust и Cargo (для сборки нативных модулей из директории `native/`)

### Установка
```bash
git clone https://github.com/orbitachat/orbita-desktop.git
cd orbita-desktop
npm install
```

### Запуск в режиме разработки
```bash
npm run dev
```

### Сборка приложения

Сборка инсталлятора для Windows:
```bash
npm run electron:build
```
Готовый исполняемый файл будет сохранен в папке `release/`.

Для сборки под Linux или macOS нужно изменить целевой системный билдер в `package.json`.

---

## Структура проекта

```text
orbita-desktop/
├── api/                  # Эндпоинты шлюза и ретранслятора
├── electron/             # Главный процесс Electron (main, preload, жизненный цикл)
├── native/               # Нативный Rust-модуль (N-API, системный трей Win32, криптография)
├── public/               # Статические ресурсы (шрифты, звуки, иконки)
├── src/                  # Клиентский код React
│   ├── components/       # Компоненты интерфейса (чаты, звонки, настройки)
│   ├── lib/              # Криптографические алгоритмы и протоколы
│   ├── store/            # Управление состоянием (Zustand)
│   ├── App.tsx           # Главное окно приложения
│   └── call-main.tsx     # Точка входа для окна звонков
└── supabase/             # Edge-функции и схемы Supabase
```

---

## Участие в разработке
Подробности о правилах оформления кода и работе с ветками см. в файле [CONTRIBUTING.md](CONTRIBUTING.md).

## Безопасность
Политика раскрытия уязвимостей описана в файле [SECURITY.md](SECURITY.md).

---

## Лицензия

Код доступен для ознакомления, аудита безопасности и исследований. Копирование, распространение, коммерческое использование и создание производных продуктов без письменного согласия автора запрещены. Полный текст условий приведен в файле [LICENSE](LICENSE).
