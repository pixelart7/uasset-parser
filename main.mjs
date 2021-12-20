import { fs } from './util.mjs';
import * as ff7 from './ff7.mjs';

const filename = 'US_Resident_TxtRes.uexp';

(async () => {
  const file = await fs.open(filename);

  const parsed = await ff7.parse(file);
  ff7.exportCsv(filename, parsed);
  ff7.exportVariantsAnalysis(filename, parsed);
  console.log('Done!');

})();