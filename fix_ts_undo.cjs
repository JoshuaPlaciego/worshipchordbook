const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(/ as any\)\.json\(\)/g, '.json()');
content = content.replace(/ as any\)\.text\(\)/g, '.text()');

fs.writeFileSync('src/App.tsx', content);
