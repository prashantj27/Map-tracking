const xlsx = require('xlsx');
const wb = xlsx.readFile('../SAI_Facilities_Master 2.xlsx');

const sheetsToInspect = ['Discipline_Detail', 'KISCE_Funds', 'KISCE_Manpower'];

sheetsToInspect.forEach(sheetName => {
  const sheet = wb.Sheets[sheetName];
  if (sheet) {
    const data = xlsx.utils.sheet_to_json(sheet);
    console.log(`\n--- Sheet: ${sheetName} ---`);
    if (data.length > 0) {
      console.log('Headers:', Object.keys(data[0]));
      console.log('Sample Row:', JSON.stringify(data[0], null, 2));
    } else {
      console.log('Sheet is empty.');
    }
  }
});
