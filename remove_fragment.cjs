const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');
content = content.replace('  return (\n    <>\n    <div className="min-h-screen', '  return (\n    <div className="min-h-screen');
content = content.replace('    </>\n  );\n}', '  );\n}');
fs.writeFileSync('src/App.tsx', content);
