const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

// The bad strings are like `presetsRes as any).text()`
content = content.replace(/([a-zA-Z0-9_]+) as any\)\.text\(\)/g, '($1 as any).text()');
content = content.replace(/([a-zA-Z0-9_]+) as any\)\.json\(\)/g, '($1 as any).json()');
// What about `await (resMeta as any).json()`? That is fine!
content = content.replace(/await \(\(res(.*?) as any\)\.json\(\)/g, 'await (res$1 as any).json()');
content = content.replace(/await \(\(res(.*?) as any\)\.text\(\)/g, 'await (res$1 as any).text()');
// And the end of file error `3791,1): error TS1128`?
// That might be my dummy functions at the top not being formatted right.

fs.writeFileSync('src/App.tsx', content);
