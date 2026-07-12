const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(/\.json\(\)/g, ' as any).json()');
content = content.replace(/\.text\(\)/g, ' as any).text()');
content = content.replace(/exportToPDF\(\)/g, '(window as any).exportToPDF()');
content = content.replace(/getSetlistArrangement\(/g, '(window as any).getSetlistArrangement(');

fs.writeFileSync('src/App.tsx', content);
