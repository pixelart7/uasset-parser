import { Command } from 'commander/esm.mjs';

import { io, fs, get } from './util.mjs';
import * as ff7 from './ff7.mjs';

const program = new Command();

const filename = 'US_Resident_TxtRes.uexp';

const valuePad = '\u0000';

const newlineChar = '0D0A';

(async () => {
  const file = await fs.open(filename);

  const content = await ff7.parse(file);

  let maxVariants = 0;
  content.forEach((elm) => {
    if (elm.variants.length > maxVariants) maxVariants = elm.variants.length;
  });

  const csvHeader = [
    { id: 'key', title: 'key' },
    { id: 'translation', title: 'translation' },
    { id: 'isUnicode', title: 'isUnicode' },
  ];
  new Array(maxVariants).fill('').forEach((_, i) => {
    csvHeader.push({ id: `variant${i + 1}Type`, title: `variant${i + 1}Type` });
    csvHeader.push({ id: `variant${i + 1}Translation`, title: `variant${i + 1}Translation` });
    csvHeader.push({ id: `variant${i + 1}IsUnicode`, title: `variant${i + 1}IsUnicode` });
  });
  // TODO: push header and footer

  const csvWriter = io.csv.out({
    path: `${filename}-output.csv`,
    header: csvHeader,
  });

  const prepareForCsv = [];

  content.forEach((elm) => {
    const contentConvert = {
      key: elm.key,
      translation: elm.translation,
      isUnicode: elm.isUnicode,
    };
    new Array(maxVariants).fill('').forEach((_, i) => {
      contentConvert[`variant${i + 1}Type`] = elm.variants[i]?.variantType || '';
      contentConvert[`variant${i + 1}Translation`] = elm.variants[i]?.translation || '';
      contentConvert[`variant${i + 1}IsUnicode`] = elm.variants[i]?.isUnicode || '';
    })
    prepareForCsv.push(contentConvert);
  });

  await csvWriter.writeRecords(prepareForCsv);

})();