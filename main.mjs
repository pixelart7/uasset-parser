import { fs, validateOutput } from './util.mjs';
import * as ff7 from './ff7.mjs';

const filename = 'US_Resident_TxtRes.uexp';

(async () => {
  // Parse
  const uexp = await fs.open(filename);

  const parsed = await ff7.parse(uexp);
  ff7.exportCsv(filename, parsed);
  ff7.exportVariantsAnalysis(filename, parsed);
  console.log('Done parsing.');

  // Convert
  const csv = await fs.open(`${filename}-output.csv`);
  const converted = await ff7.convert(csv);

  await fs.writeFile(`${filename}-converted.uexp`, Buffer.from(converted, 'hex'));

  console.log('Done converting.');

  // Validate
  const f1 = await fs.open(filename);
  const f2 = await fs.open(`${filename}-converted.uexp`);
  await validateOutput(f1, f2);
  console.log('Done validating.');
  
})();