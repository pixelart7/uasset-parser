import { get, toAscii, isLengthUnicode, toUnicode, convertSizeOfUnicode, toInt, littleEndian, isASCII } from './util.mjs';

export function _replaceSpeialToNull(str) {
  return str.replace(/<nul>/g, '\u0000');
}
export function _replaceNullToSpecial(str) {
  return str.replace(/\u0000/g, '<nul>');
}

export function _translationOriginalToHuman(str) {
  let result = str;
  // 1. Remove translation end /u0000
  result = result.replace(/\u0000$/, '');
  // 2. Replace new line (FF7 uses CRLF)
  result = result.replace(/\r\n/gm, '<crlf>');
  return result;
}
export function _translationHumanToOriginal(str, returnBuffer = false) {
  let result = str;
  let buff;
  // 2. Replace new line (FF7 uses CRLF)
  result = result.replace(/<crlf>/gm, '\r\n');
  // 1. Append translation end /u0000
  if (isASCII(str) && str !== '') {
    buff = Buffer.concat([Buffer.from(result), Buffer.from('\u0000')]);
    result = `${result}\u0000`; // in game file, if empty don't add anything (as it will result in 0 length)
  } else if (!isASCII(str) && str !== '') {
    buff = Buffer.concat([Buffer.from(result, 'utf16le'), Buffer.from('\u0000', 'utf16le')]);
    result = `${Buffer.from(result, 'utf16le')}\u0000\u0000`; // real
  }
  if (returnBuffer) return buff;
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
  result.key = _translationOriginalToHuman(toAscii(output.buffer.toString('hex'))); // remove ending \u0000

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