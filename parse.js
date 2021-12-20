const createCsvWriter = require('csv-writer').createObjectCsvWriter;

const filename = 'US_Resident_TxtRes.uexp';
const offset = 17;

const valuePad = '\u0000';

const fs = require('fs').promises;

const convert = (from, to) => (str) => Buffer.from(str, from).toString(to);
const toAscii = convert('hex', 'ascii');
const toUnicode = convert('hex', 'utf16le');

function useAsIs(string) { return string; }
function littleEndian(string) { return (string.match(/.{2}/g) || ['']).reverse().join(''); }
function toInt(buffer, parseFunction) { return parseInt(parseFunction(buffer.toString('hex')), 16); }

function isLengthUnicode(hexBuffer) {
  if (toInt(hexBuffer, littleEndian) > 2147483647) return true;
  return false;
}
function convertSizeOfUnicode(hexBuffer) {
  return (0xFFFFFFFF - toInt(hexBuffer, littleEndian) + 1) * 2;
}

async function get(file, length, offset) {
  const buffer = Buffer.alloc(length);
  await file.read(buffer, 0, length, offset);
  return {
    next: offset + length,
    buffer,
  };
}

async function translationKeyValue(file, fileOffset) {
  const result = {
    next: 0,

    key: '',
    translation: '',
    isUnicode: false,

    variants: [], // { key, translation, variantType, isUnicode },

    position: {
      from: fileOffset,
      to: 0, // exclusive
    },
  };

  let output;

  // key length & key value
  output = await get(file, 4, fileOffset);
  output = await get(file, toInt(output.buffer, littleEndian), output.next);
  result.key = toAscii(output.buffer.toString('hex'));

  // translation length & translation value
  output = await get(file, 4, output.next);
  result.isUnicode = isLengthUnicode(output.buffer);
  if (result.isUnicode) {
    output = await get(file, convertSizeOfUnicode(output.buffer), output.next);
    result.translation = toUnicode(output.buffer.toString('hex'));
  } else {
    output = await get(file, toInt(output.buffer, littleEndian), output.next);
    result.translation = toAscii(output.buffer.toString('hex'));
  }

  // variant size
  output = await get(file, 4, output.next);
  let variants = toInt(output.buffer, littleEndian);

  while (variants > 0) {
    // variant type
    const variantKeyValue = {
      translation: '',
      variantType: '',
      isUnicode: false,
    }
    output = await get(file, 8, output.next);
    variantKeyValue.variantType = output.buffer.toString('hex');

    // variant translation size & translation value
    output = await get(file, 4, output.next);
    variantKeyValue.isUnicode = isLengthUnicode(output.buffer);
    if (variantKeyValue.isUnicode) {
      output = await get(file, convertSizeOfUnicode(output.buffer), output.next);
      variantKeyValue.translation = toUnicode(output.buffer.toString('hex'));
    } else {
      output = await get(file, toInt(output.buffer, littleEndian), output.next);
      variantKeyValue.translation = toAscii(output.buffer.toString('hex'));
    }

    result.variants.push(variantKeyValue);

    variants -= 1;
  }

  result.next = output.next;

  return result;
}

(async () => {
  const file = await fs.open(filename);
  const stat = await file.stat();
  const { size } = stat;

  const header = await get(file, offset, 0);
  let footer = {};

  let next = offset;

  const content = [];

  try {
    while (next < size) {
      const res = await translationKeyValue(file, next);
      content.push(res);
      next = res.next;
    }
  } catch (e) {
    console.log('File read should successfully finished.');
  } finally {
    footer = await get(file, size - next, next);
  }

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

  const csvWriter = createCsvWriter({
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