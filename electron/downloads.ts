// electron/downloads.ts
import { app, ipcMain, shell } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

const DOWNLOADS_FOLDER = 'Orbita';

function getDownloadsDir(): string {
  return path.join(app.getPath('downloads'), DOWNLOADS_FOLDER);
}

export function ensureDownloadsDir(): void {
  const dir = getDownloadsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function saveToDownloads(fileData: Buffer, fileName: string): string {
  const dir = getDownloadsDir();
  ensureDownloadsDir();
  const filePath = path.join(dir, fileName);
  let finalPath = filePath;
  let counter = 1;
  while (fs.existsSync(finalPath)) {
    const ext = path.extname(fileName);
    const base = path.basename(fileName, ext);
    finalPath = path.join(dir, `${base} (${counter})${ext}`);
    counter++;
  }
  fs.writeFileSync(finalPath, fileData);
  return finalPath;
}

const DANGEROUS_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.vbe',
  '.js', '.jse', '.wsf', '.wsh', '.ps1', '.ps1xml', '.ps2', '.psc1',
  '.psc2', '.msh', '.msh1', '.msh2', '.msi', '.msp', '.mst', '.hta',
  '.cpl', '.jar', '.reg', '.dll', '.sys', '.drv', '.lnk', '.inf',
  '.ins', '.isp', '.sct', '.shb', '.url', '.iso', '.vhd', '.vhdx',
  '.appx', '.msix', '.dmg', '.pkg', '.app', '.deb', '.rpm', '.sh',
  '.bash', '.zsh', '.command', '.bin', '.gadget', '.theme'
]);

function isDangerousExecutable(filePath: string): boolean {
  try {
    const ext = path.extname(filePath).toLowerCase();
    if (DANGEROUS_EXTENSIONS.has(ext)) return true;
    if (fs.existsSync(filePath)) {
      const header = Buffer.alloc(16);
      const fd = fs.openSync(filePath, 'r');
      fs.readSync(fd, header, 0, 16, 0);
      fs.closeSync(fd);
      if (header[0] === 0x4d && header[1] === 0x5a) return true;
      if (header[0] === 0x7f && header[1] === 0x45 && header[2] === 0x4c && header[3] === 0x46) return true;
      if (header[0] === 0x23 && header[1] === 0x21) return true;
    }
  } catch {}
  return false;
}

export function setupDownloadsIPC(): void {
  ensureDownloadsDir();

  ipcMain.handle('downloads:save', async (_, dataBase64: string, fileName: string) => {
    const data = Buffer.from(dataBase64, 'base64');
    const savedPath = saveToDownloads(data, fileName);
    return { path: savedPath };
  });

  ipcMain.handle('downloads:open', async (_, fileName?: string) => {
    const dir = getDownloadsDir();
    if (fileName) {
      const sanitized = path.basename(fileName);
      const filePath = path.join(dir, sanitized);
      if (fs.existsSync(filePath)) {
        if (isDangerousExecutable(filePath)) {
          shell.showItemInFolder(filePath);
          return;
        }
        await shell.openPath(filePath);
      }
    } else {
      await shell.openPath(dir);
    }
  });
}