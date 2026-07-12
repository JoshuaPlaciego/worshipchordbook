const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

// Fix await fetch
content = content.replace(/const res = fetch/g, 'const res = await fetch');

// Add missing functions
const missingFunctions = `
    const getSetlistArrangement = (setId, songId) => null;
    const exportToPDF = () => { console.log('Exporting...'); };
`;

content = content.replace('    // Read saved settings', missingFunctions + '\n    // Read saved settings');
fs.writeFileSync('src/App.tsx', content);
