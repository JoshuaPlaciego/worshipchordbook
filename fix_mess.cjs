const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');
content = content.replace(/return \( <>\)/g, 'return ()');
content = content.replace(/return \( <>\n/g, 'return (\n');
fs.writeFileSync('src/App.tsx', content);
