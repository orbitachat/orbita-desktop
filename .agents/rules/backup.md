# Automated Backup & Archive Rule

When the user asks to save, make a backup, or commit changes (e.g. "делай бэкап", "бэкап", "сохрани", "зафиксируй"):
1. **Always check and update `CHANGELOG.md`** in the project root first, adding all new changes in the required Russian format.
2. Run `node scripts/backup.js "<краткое понятное описание изменений на русском>"` to commit everything (including `CHANGELOG.md`) to Git and export a clean `.zip` archive to `E:\Orbita_Backups\`.
3. Archives are always automatically saved with the name format:
   `orbita_desktop_ДД-ММ-ГГГГ_<кратко_по_русски_что_было_изменено>.zip`
   (Example: `orbita_desktop_22-08-2026_Оптимизация_запросов_и_списка_чатов.zip`).
4. Report the archive path and git commit hash to the user.
