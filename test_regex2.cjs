const fs = require('fs');
const content = fs.readFileSync('rest_of_app.txt', 'utf8');

const regex = /<\/?([a-zA-Z0-9]+)[^>]*>/g;
let match;
while ((match = regex.exec(content)) !== null) {
  if (match[1] === 'input') {
    console.log(JSON.stringify(match[0]));
    console.log("Ends with />?", match[0].endsWith('/>'));
  }
}
