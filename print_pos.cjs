const fs = require('fs');
const content = fs.readFileSync('rest_of_app.txt', 'utf8');
console.log(content.substring(6100, 6400));
