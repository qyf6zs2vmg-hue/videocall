import fs from 'fs';

const filePath = '/src/App.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Remove dark: classes
// This regex looks for dark: followed by any characters until a space, quote, or other boundary
content = content.replace(/dark:[^\s"'}]+/g, '');

// Clean up any double spaces left behind
content = content.replace(/\s{2,}/g, ' ');

fs.writeFileSync(filePath, content);
console.log('Removed all dark: classes from App.tsx');
