const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(/fetch\(/g, '(fetch(');
content = content.replace(/\.json\(\)/g, ' as any).json()');
content = content.replace(/\.text\(\)/g, ' as any).text()');

fs.writeFileSync('src/App.tsx', content);
