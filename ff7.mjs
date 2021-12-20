import { get, toAscii, isLengthUnicode, toUnicode, convertSizeOfUnicode, toInt, littleEndian } from './util.mjs';

const OFFSET = 17;

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
  output = await get(file, output.length, output.next);

  if (output.isUnicode) translation = toUnicode(output.buffer.toString('hex'));
  else translation = toAscii(output.buffer.toString('hex'));

  return {
    ...output,
    translation,
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
  
  return content;
}