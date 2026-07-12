const fs = require('fs');
const content = fs.readFileSync('rest_of_app.txt', 'utf8');

const lines = content.split('\n');
let stack = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const numMatches = (line.match(/<div/g) || []).length;
  const numClose = (line.match(/<\/div/g) || []).length;
  
  for(let j=0; j<numMatches; j++) stack.push(line.substring(0, 10).trim());
  for(let j=0; j<numClose; j++) {
    if (stack.length === 0) {
      console.log('Unmatched closing tag at line ' + line.substring(0, 10).trim());
    } else {
      stack.pop();
    }
  }
}

if (stack.length > 0) {
  console.log('Unmatched opening tags at lines: ' + stack.join(', '));
}
