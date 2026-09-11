
const fs = require('fs');
let file = fs.readFileSync('c:/orbita_d/src/services/supportService.ts', 'utf8');

file = file.replace(/gatewayManager\.fetch\(\/support\/admin\/register-token', \{/, 'gatewayManager.fetch(\'/support/admin/register-token\', {');
file = file.replace(/gatewayManager\.fetch\(\/support\/reply', \{/, 'gatewayManager.fetch(\'/support/reply\', {');

file = file.replace(/fetch\(\https:\/\/orbitad\.vercel\.app\/support\/admin\/check\?userCode=\\\$\{encodeURIComponent\(this\.myCode\)\}\\)/, 'gatewayManager.fetch(\/support/admin/check?userCode=\\)');

file = file.replace(/fetch\(\https:\/\/orbitad\.vercel\.app\/support\/admin\/tickets\?userCode=\\\$\{encodeURIComponent\(this\.myCode\)\}\, \{ headers \}\)/, 'gatewayManager.fetch(\/support/admin/tickets?userCode=\\, { headers })');

file = file.replace(/fetch\(\https:\/\/orbitad\.vercel\.app\/support\/tickets\?userCode=\\\$\{encodeURIComponent\(this\.myCode\)\}\\)/g, 'gatewayManager.fetch(\/support/tickets?userCode=\\)');

fs.writeFileSync('c:/orbita_d/src/services/supportService.ts', file);

