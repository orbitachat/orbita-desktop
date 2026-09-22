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

  # Orbita Desktop

  Десктопный клиент мессенджера Orbita со сквозным шифрованием и низкой задержкой.

  [![License](https://img.shields.io/github/license/orbitachat/orbita-desktop?style=flat-square)](LICENSE)
  [![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
  [![Rust](https://img.shields.io/badge/Rust-000000?style=flat-square&logo=rust&logoColor=white)](https://www.rust-lang.org/)
  [![Electron](https://img.shields.io/badge/Electron-47848F?style=flat-square&logo=electron&logoColor=white)](https://www.electronjs.org/)
  [![GitHub Release](https://img.shields.io/github/v/release/orbitachat/orbita-desktop?style=flat-square)](https://github.com/orbitachat/orbita-desktop/releases)

</div>

---

## Возможности

- **Сквозное шифрование**: протокол Double Ratchet (X25519, HKDF, AES-GCM / ChaCha20-Poly1305) обеспечивает приватность переписки.
- **Локальная транскрипция**: распознавание голосовых сообщений выполняется прямо на устройстве.
- **Очистка метаданных**: метаданные файлов автоматически удаляются перед отправкой.
- **Аудио и видеозвонки**: личные и групповые звонки с минимальной задержкой на базе LiveKit и WebRTC.

---

## Стек технологий

- **Electron** — оболочка приложения (Chromium, Node.js)
- **React & TypeScript** — интерфейс (React 19, Vite, TailwindCSS)
- **Rust** — нативный модуль (`napi-rs`, Win32 API, аппаратная криптография)
- **Supabase** — серверные функции и шлюз

---

## Сборка и запуск

### Требования
- Node.js (v20 или новее)
- Rust и Cargo (для компиляции модуля `native/`)

### Установка
```bash
git clone https://github.com/orbitachat/orbita-desktop.git
cd orbita-desktop
npm install
```

### Режим разработки
```bash
npm run dev
```

### Сборка дистрибутива

Сборка инсталлятора для Windows:
```bash
npm run electron:build
```
Готовый исполняемый файл будет сохранен в каталоге `release/`.

---

## Структура проекта

```text
orbita-desktop/
├── api/                  # Эндпоинты шлюза и ретранслятора
├── electron/             # Главный процесс Electron (main, preload)
├── native/               # Нативный Rust-модуль (N-API, трей Win32, криптография)
├── public/               # Статические ресурсы (шрифты, звуки, иконки)
├── src/                  # Исходный код интерфейса на React
│   ├── components/       # Компоненты интерфейса (чаты, звонки, настройки)
│   ├── lib/              # Криптографические алгоритмы и протоколы
│   ├── store/            # Управление состоянием (Zustand)
│   ├── App.tsx           # Главное окно приложения
│   └── call-main.tsx     # Окно звонков
└── supabase/             # Edge-функции и схемы Supabase
```

---

## Участие в разработке
Информация о правилах оформления кода описана в файле [CONTRIBUTING.md](CONTRIBUTING.md).

## Безопасность
Политика сообщения об уязвимостях описана в файле [SECURITY.md](SECURITY.md).

---

## Лицензия

Исходный код доступен для ознакомления и аудита безопасности. Копирование, распространение и коммерческое использование без письменного разрешения автора запрещены. Условия приведены в файле [LICENSE](LICENSE).
