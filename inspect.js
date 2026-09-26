const sqlite3 = require('./node_modules/sqlite3');
const path = require('path');
const os = require('os');

const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Orbita Desktop', 'orbita.db');
const db = new sqlite3.Database(dbPath);

db.all("SELECT id, chat_id FROM messages WHERE id LIKE '%post%' AND chat_id NOT LIKE '%VZAXNAEWMWT3HGDZHI702JDB1PMSDCJ17DMUD2HIR9%'", (err, rows) => {
  if (err) console.error(err);
  else console.log('Posts in other chats:', rows);
  db.close();
});
