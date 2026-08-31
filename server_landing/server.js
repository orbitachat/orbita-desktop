const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || process.env.ALWAYSDATA_HTTPD_PORT || 8100;

const server = http.createServer((req, res) => {
  try {
    const filePath = path.join(__dirname, 'index.html');
    const indexHtml = fs.readFileSync(filePath, 'utf8');
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
    });
    res.end(indexHtml);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Server Error');
  }
});

server.listen(PORT, () => {
  console.log('Orbita landing running on port ' + PORT);
});
