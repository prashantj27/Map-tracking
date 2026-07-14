const fs = require('fs');
const xlsx = require('xlsx');

// Read New
const wb2 = xlsx.readFile('../SAI_Facilities_Master 2.xlsx');
const data2 = xlsx.utils.sheet_to_json(wb2.Sheets[wb2.SheetNames[0]]);
const keys2 = new Set();
data2.forEach(row => Object.keys(row).forEach(k => keys2.add(k)));

// Read Old
const wb1 = xlsx.readFile('../SAI_Facilities_Master.xlsx');
const data1 = xlsx.utils.sheet_to_json(wb1.Sheets[wb1.SheetNames[0]]);
const keys1 = new Set();
data1.forEach(row => Object.keys(row).forEach(k => keys1.add(k)));

console.log('Keys only in Master 2:');
console.log([...keys2].filter(k => !keys1.has(k)));

console.log('Keys only in Master 1 (old):');
console.log([...keys1].filter(k => !keys2.has(k)));

console.log('Total Rows - Master 2:', data2.length);
console.log('Total Rows - Master 1:', data1.length);
