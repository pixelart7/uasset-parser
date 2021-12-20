import { get, toAscii, isLengthUnicode, toUnicode, convertSizeOfUnicode, toInt, littleEndian, io } from './util.mjs';

const OFFSET = 17;

export function _translationOriginalToHuman(str) {
  let result = str;
  // 1. Remove translation end /u0000
  result = result.replace(/\u0000$/, '');
  // 2. Replace new line (FF7 uses CRLF)
  result = result.replace(/\r\n/gm, '<crlf>');
  return result;
}

export async function _readLength(file, fileOffset) {
  const result = {
    length: 0,
    isUnicode: false,
  };

  const output = await get(file, 4, fileOffset);

  result.isUnicode = isLengthUnicode(output.buffer);

  if (result.isUnicode) result.length = convertSizeOfUnicode(output.buffer);
  else result.length = toInt(output.buffer, littleEndian);

  return {
    ...output,
    ...result,
  }
}

export async function _readTranslation(file, fileOffset) {
  let translation = '';

  let output = await _readLength(file, fileOffset);
  const isUnicode = output.isUnicode;

  output = await get(file, output.length, output.next);

  if (isUnicode) translation = toUnicode(output.buffer.toString('hex'));
  else translation = toAscii(output.buffer.toString('hex'));

  return {
    ...output,
    translation: _translationOriginalToHuman(translation),
  }
}

export async function _readVariant(file, fileOffset) {
  const result = {
    type: '',
    translation: '',
  }

  let output;

  output = await get(file, 8, fileOffset);
  result.type = output.buffer.toString('hex');

  output = await _readTranslation(file, output.next);
  result.translation = output.translation;

  return {
    ...output,
    ...result,
  };
}

export async function _readTranslationRow(file, fileOffset) {
  const result = {
    key: '',
    translation: '',
    variants: [], // { translation, variantType },
  };

  let output;

  // key length & key value
  output = await _readLength(file, fileOffset);
  output = await get(file, output.length, output.next);
  result.key = toAscii(output.buffer.toString('hex'));

  // translation length & translation value
  output = await _readTranslation(file, output.next);
  result.translation = output.translation;

  // variant size
  output = await _readLength(file, output.next);
  let variants = output.length;

  for (let i = 0; i < variants; i++) {
    output = await _readVariant(file, output.next);
    result.variants.push(output);
  }

  return {
    ...output,
    ...result,
  };
}

export async function parse(file, fileOffset = OFFSET) {
  const stat = await file.stat();
  const { size } = stat;

  const header = await get(file, fileOffset, 0);
  let footer = {};

  let next = header.next;

  const content = [];

  try {
    while (next < size) {
      const res = await _readTranslationRow(file, next);
      content.push(res);
      next = res.next;
    }
  } catch (e) {
    if (e.code !== 'ERR_OUT_OF_RANGE') console.error(e);
  } finally {
    footer = await get(file, size - next, next);
  }
  
  return {
    header,
    footer,
    content
  };
}

export async function exportCsv(filename, parsed) {
  let maxVariants = 0;
  parsed.content.forEach((elm) => {
    if (elm.variants.length > maxVariants) maxVariants = elm.variants.length;
  });

  const csvHeader = [
    { id: 'key', title: 'key' },
    { id: 'translation', title: 'original' },
    { id: '<export>', title: 'translation1' },
    { id: '<export>', title: 'translation2' },
    { id: '<export>', title: 'translation3' },
    { id: '<export>', title: 'translation4' },
    { id: '<export>', title: 'translation5' },
  ];
  new Array(maxVariants).fill('').forEach((_, i) => {
    csvHeader.push({ id: `variant${i + 1}_type`, title: `variant${i + 1}_type` });
    csvHeader.push({ id: `variant${i + 1}_translation`, title: `variant${i + 1}_original` });
    csvHeader.push({ id: '<export>', title: `variant${i + 1}_translation` });
  });

  const csvWriter = io.csv.out({
    path: `${filename}-output.csv`,
    header: csvHeader,
  });

  const prepareForCsv = [];

  prepareForCsv.push({
    key: 'UT--HEADER',
    translation: parsed.header.buffer.toString('hex'),
  });
  prepareForCsv.push({
    key: 'UT--FOOTER',
    translation: parsed.footer.buffer.toString('hex'),
  });

  parsed.content.forEach((elm) => {
    const contentConvert = {
      key: elm.key,
      translation: elm.translation,
    };
    new Array(maxVariants).fill('').forEach((_, i) => {
      contentConvert[`variant${i + 1}_type`] = (elm.variants[i]?.type) ? `v-${elm.variants[i]?.type}` : '';
      contentConvert[`variant${i + 1}_translation`] = elm.variants[i]?.translation || '';
    })
    prepareForCsv.push(contentConvert);
  });

  await csvWriter.writeRecords(prepareForCsv);
}

export async function exportVariantsAnalysis(filename, parsed) {
  const variantMap = {};
  const keyMap = {};
  const resultArr = [];
  parsed.content.forEach((elm) => {
    elm.variants.forEach((v) => {
      if (!(`v-${v.type}` in variantMap)) variantMap[`v-${v.type}`] = '';
      if (!(elm.key in keyMap)) {
        resultArr.push({ key: elm.key, originalRowTranslation: elm.translation });
        keyMap[elm.key] = resultArr.length - 1;
      }
      resultArr[keyMap[elm.key]][`v-${v.type}`] = v.translation.replace(/\u0000/gm, '<nul>');
    });
  });

  const csvHeader = [
    { id: 'key', title: 'key' },
    { id: 'originalRowTranslation', title: 'original' },
  ];
  Object.keys(variantMap).forEach((vM) => {
    csvHeader.push({ id: vM, title: vM });
  });

  const csvWriter = io.csv.out({
    path: `${filename}-variants-analysis.csv`,
    header: csvHeader,
  });

  await csvWriter.writeRecords(resultArr);
} 