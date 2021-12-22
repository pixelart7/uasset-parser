import { chooseTranslation, get, io, isASCII, popHeaderAndFooter, toBuffer } from './util.mjs';
import { _translationOriginalToHuman, _translationHumanToOriginal, _readLength, _readTranslation, _readVariant, _readTranslationRow } from './ff7.util.mjs';
import { HEADER_KEY, FOOTER_KEY, APPEND_OUTPUT_FILENAME, APPEND_OUTPUT_VARIANT_FILENAME, VARIANT_PREPEND } from './constants.mjs';

const OFFSET = 17;

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

export async function convert(csv, translationApplication = '1') {
  const csvString = (await csv.readFile()).toString();
  const csvArr = await io.csv.in(csvString);

  const separatedSet = popHeaderAndFooter(csvArr);

  // This part is so chaotic evil
  const variantNums = [...new Set(Object.keys(separatedSet.arr[0]).filter((v) => v.includes('variant')).map((v) => v.replace('variant', '').replace(/_.*$/, '')))].length;
  // const variantSubValueNums = Object.keys(separatedSet.arr[0]).filter((v) => v.includes('variant')).length / variantNums;
  const variantSubValueKeys = [...new Set(Object.keys(separatedSet.arr[0]).filter((v) => v.includes('variant')).map((v) => v.replace(/\d+/, 'x').replace('variantx_', '')))];

  // put variants in arr
  separatedSet.arr = separatedSet.arr.map((a) => {
    const variants = new Array(variantNums).fill('');
    const mappedVariants = variants.map((_, i) => {
      const res = {};
      variantSubValueKeys.forEach((vsk) => {
        res[vsk] = a[`variant${i+1}_${vsk}`];
      });
      return res;
    });
    return {
      ...a,
      variants: mappedVariants.filter((v) => v.type !== '').map((v) => ({ ...v, type: v.type.replace(VARIANT_PREPEND, '') })), // return only non-empty type
    }
  });

  let result = '';
  result = `${result}${separatedSet.header.original}`;
  separatedSet.arr.forEach((translation) => {
    let thisTranslationResult = '';

    // key
    const key = _translationHumanToOriginal(translation.key);
    const keyLength = toBuffer(key.length, 4);
    thisTranslationResult = `${thisTranslationResult}${keyLength.toString('hex')}${Buffer.from(key).toString('hex')}`;

    // translation
    const translationCandidate = chooseTranslation(translation, translationApplication);
    const translationValue = _translationHumanToOriginal(translationCandidate);
    let translationLength;
    if (isASCII(translationCandidate)) {
      translationLength = toBuffer(translationValue.length, 4);
      thisTranslationResult = `${thisTranslationResult}${translationLength.toString('hex')}${Buffer.from(translationValue).toString('hex')}`;
    } else {
      translationLength = toBuffer((0xFFFFFFFF) - (_translationHumanToOriginal(translationCandidate, true).length / 2) + 1, 4);
      thisTranslationResult = `${thisTranslationResult}${translationLength.toString('hex')}${_translationHumanToOriginal(translationCandidate, true).toString('hex')}`;
    }

    // variant nums
    const variantsLength = toBuffer(translation.variants.length, 4);
    thisTranslationResult = `${thisTranslationResult}${variantsLength.toString('hex')}`;
    
    translation.variants.forEach((v) => {
      let thisVariantResult = '';

      // type
      thisVariantResult = `${thisVariantResult}${v.type}`;

      // value
      const variantTranslationCandidate = (v.translation !== '') ? v.translation : v.original;
      const variantTranslation = _translationHumanToOriginal(variantTranslationCandidate);
      let variantTranslationLength;
      if (isASCII(variantTranslationCandidate)) {
        variantTranslationLength = toBuffer(variantTranslation.length, 4);
        thisVariantResult = `${thisVariantResult}${variantTranslationLength.toString('hex')}${Buffer.from(variantTranslation).toString('hex')}`;
      } else {
        variantTranslationLength = toBuffer((0xFFFFFFFF) - (_translationHumanToOriginal(variantTranslationCandidate, true).length / 2) + 1, 4);
        thisVariantResult = `${thisVariantResult}${variantTranslationLength.toString('hex')}${_translationHumanToOriginal(variantTranslationCandidate, true).toString('hex')}`;
      }

      thisTranslationResult = `${thisTranslationResult}${thisVariantResult}`;
    });

    result = `${result}${thisTranslationResult}`;
  });
  result = `${result}${separatedSet.footer.original}`;

  return result;
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
    path: `${filename}${APPEND_OUTPUT_FILENAME}`,
    header: csvHeader,
  });

  const prepareForCsv = [];

  prepareForCsv.push({
    key: HEADER_KEY,
    translation: parsed.header.buffer.toString('hex'),
  });
  prepareForCsv.push({
    key: FOOTER_KEY,
    translation: parsed.footer.buffer.toString('hex'),
  });

  parsed.content.forEach((elm) => {
    const contentConvert = {
      key: elm.key,
      translation: elm.translation,
    };
    new Array(maxVariants).fill('').forEach((_, i) => {
      contentConvert[`variant${i + 1}_type`] = (elm.variants[i]?.type) ? `${VARIANT_PREPEND}${elm.variants[i]?.type}` : '';
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
      if (!(`${VARIANT_PREPEND}${v.type}` in variantMap)) variantMap[`${VARIANT_PREPEND}${v.type}`] = '';
      if (!(elm.key in keyMap)) {
        resultArr.push({ key: elm.key, originalRowTranslation: elm.translation });
        keyMap[elm.key] = resultArr.length - 1;
      }
      resultArr[keyMap[elm.key]][`${VARIANT_PREPEND}${v.type}`] = v.translation.replace(/\u0000/gm, '<nul>');
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
    path: `${filename}${APPEND_OUTPUT_VARIANT_FILENAME}`,
    header: csvHeader,
  });

  await csvWriter.writeRecords(resultArr);
} 