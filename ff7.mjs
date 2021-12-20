import { get, toAscii, isLengthUnicode, toUnicode, convertSizeOfUnicode, toInt, littleEndian } from './util.mjs';

const OFFSET = 17;

export async function _translation(file, fileOffset) {
  let result = '';

  let output = await get(file, 4, fileOffset);

  const isUnicode = isLengthUnicode(output.buffer);
  if (isUnicode) {
    output = await get(file, convertSizeOfUnicode(output.buffer), output.next);
    result = toUnicode(output.buffer.toString('hex'));
  } else {
    output = await get(file, toInt(output.buffer, littleEndian), output.next);
    result = toAscii(output.buffer.toString('hex'));
  }

  return {
    ...output,
    result,
  }
}

export async function _variant(file, fileOffset) {
  const result = {
    type: '',
    translation: '',
  }

  let output;

  output = await get(file, 8, fileOffset);
  result.type = output.buffer.toString('hex');

  output = await _translation(file, output.next);
  result.translation = output.result;

  return {
    ...output,
    ...result,
  };
}

export async function _translationKey(file, fileOffset) {
  const result = {
    key: '',
    translation: '',
    variants: [], // { translation, variantType },
  };

  let output;

  // key length & key value
  output = await get(file, 4, fileOffset);
  output = await get(file, toInt(output.buffer, littleEndian), output.next);
  result.key = toAscii(output.buffer.toString('hex'));

  // translation length & translation value
  output = await _translation(file, output.next);
  result.translation = output.result;

  // variant size
  output = await get(file, 4, output.next);
  let variants = toInt(output.buffer, littleEndian);

  for (let i = 0; i < variants; i++) {
    output = await _variant(file, output.next);
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
      const res = await _translationKey(file, next);
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