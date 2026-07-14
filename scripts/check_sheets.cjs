const xlsx = require('xlsx');
const wb = xlsx.readFile('../SAI_Facilities_Master 2.xlsx');
console.log('Sheets:', wb.SheetNames);
