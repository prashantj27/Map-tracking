const xlsx = require('xlsx');
const wb = xlsx.readFile('../SAI_Facilities_Master 2.xlsx');
const sheet = wb.Sheets[wb.SheetNames[0]];
const data = xlsx.utils.sheet_to_json(sheet);
console.log(Object.keys(data[0]));

// Find the first NCOE or STC with trainees
const facilityWithTrainees = data.find(d => d.Disciplines && d.Total_Trainees > 0);
console.log(JSON.stringify(facilityWithTrainees, null, 2));
