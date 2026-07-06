const fs = require('fs');
const data = JSON.parse(fs.readFileSync('src/config/pipeline.json'));
let sources = [];
if (Array.isArray(data.sources)) sources = data.sources;
else if (typeof data.sources === 'object') {
    Object.values(data.sources).forEach(val => {
        if (Array.isArray(val)) sources.push(...val);
    });
}
const cats = new Set(sources.map(s => s.category));
console.log([...cats].join(','));
