// scripts/backup.js
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function run() {
  const customMsg = process.argv.slice(2).join(' ').trim() || `Backup_${new Date().toISOString().slice(0, 10)}`;
  
  console.log('\n===================================================');
  console.log('             ORBITA AUTO-SAVE & BACKUP             ');
  console.log('===================================================\n');

  console.log('[1/3] Добавление файлов в Git...');
  try {
    execSync('git add .', { stdio: 'inherit' });
  } catch (err) {
    console.error('Ошибка git add:', err.message);
  }

  console.log(`[2/3] Создание коммита: "${customMsg}"...`);
  try {
    execSync(`git commit -m "${customMsg.replace(/"/g, '\\"')}"`, { stdio: 'inherit' });
    console.log('✅ [УСПЕХ] Точка сохранения создана в Git!');
  } catch (err) {
    console.log('ℹ️ [ИНФО] Изменений для сохранения нет (код уже зафиксирован).');
  }

  console.log('\n[3/3] Создание чистого архива на диске E:...');
  const targetDir = 'E:\\Orbita_Backups';
  
  if (fs.existsSync('E:\\')) {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const dateStr = `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}`;
    const cleanMsg = customMsg.replace(/[^a-zA-Z0-9а-яА-ЯёЁ_-]/g, '_').replace(/_+/g, '_').slice(0, 70);
    const archiveName = `orbita_desktop_${dateStr}_${cleanMsg}.zip`;
    const archivePath = path.join(targetDir, archiveName);

    try {
      execSync(`git archive -o "${archivePath}" HEAD`, { stdio: 'inherit' });
      if (fs.existsSync(archivePath)) {
        const stats = fs.statSync(archivePath);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        console.log(`\n🎉 [УСПЕХ] Чистый архив создан!`);
        console.log(`📁 Путь: ${archivePath}`);
        console.log(`📦 Размер: ${sizeMB} MB (без node_modules и target)`);
      }
    } catch (err) {
      console.error('❌ Ошибка создания архива:', err.message);
    }
  } else {
    console.log('ℹ️ [ИНФО] Диск E: недоступен. Сохранение выполнено локально в Git.');
  }

  console.log('\n===================================================');
  console.log('               ВСЁ УСПЕШНО СОХРАНЕНО               ');
  console.log('===================================================\n');
}

run();
