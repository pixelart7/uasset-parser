import { promises } from 'fs';
import { createObjectCsvWriter } from 'csv-writer';
import { parseString } from '@fast-csv/parse';
import { HEADER_KEY, FOOTER_KEY } from './constants.mjs';

export const fs = promises;

export const io = {
  csv: {
    in(str) {
      return new Promise((resolve, reject) => {
        const result = [];
        parseString(str, { headers: true })
          .on('error', error => reject(error))
          .on('data', row => result.push(row))
          .on('end', () => resolve(result));
      });
    },
    out: createObjectCsvWriter,
  }
};

const convert = (from, to) => (str) => Buffer.from(str, from).toString(to);
export const toAscii = convert('hex', 'ascii');
export const toUnicode = convert('hex', 'utf16le');

export function useAsIs(string) { return string; }
export function littleEndian(string) { return (string.match(/.{2}/g) || ['']).reverse().join(''); }

export function toInt(buffer, parseFunction) { return parseInt(parseFunction(buffer.toString('hex')), 16); }

export function toBuffer(number, length) {
  const arr = new ArrayBuffer(length);
  const view = new DataView(arr);
  view.setUint8(0, number);
  view.setUint8(1, number >> 8);
  view.setUint8(2, number >> 16);
  view.setUint8(3, number >> 24);
  return Buffer.from(arr);
}

export function isLengthUnicode(hexBuffer) {
  if (toInt(hexBuffer, littleEndian) > 2147483647) return true;
  return false;
}
export function convertSizeOfUnicode(hexBuffer) {
  return (0xFFFFFFFF - toInt(hexBuffer, littleEndian) + 1) * 2;
}

export async function get(file, length, offset) {
  const buffer = Buffer.alloc(length);
  await file.read(buffer, 0, length, offset);
  return {
    next: offset + length,
    buffer,
  };
}

export function popHeaderAndFooter(arr) {
  const result = {};
  const newArr = arr.filter((a) => {
    if (a.key === HEADER_KEY) {
      result.header = a;
      return false;
    }
    if (a.key === FOOTER_KEY) {
      result.footer = a;
      return false;
    }
    return true;
  });
  return {
    ...result,
    arr: newArr,
  } 
}

export function isASCII(str) {
  return /^[\x00-\x7F]*$/.test(str);
}

export function chooseTranslation(arr, translationApplication = '1', keyPrepend = 'translation') {
  const applications = translationApplication.split('+');
  let result = arr.original;
  applications.forEach((a) => {
    const candidate = arr[`${keyPrepend}${a}`];
    if (candidate !== '') result = candidate;
  });
  return result;
}

export async function validateOutput(f1, f2) {
  const { size: f1Size } = await f1.stat();
  const { size: f2Size } = await f2.stat();
  if (f1Size !== f2Size) {
    console.warn(`Size Check: wrong size - input = ${f1Size}, output = ${f2Size}`);
  }

  let next = 0;

  try {
    while (next < f1Size) {
      if (next % 38400 === 0) console.log(`Validating ${next} - ${next + 38400}`);
      const res1 = await get(f1, 8, next);
      const res2 = await get(f2, 8, next);
      if (res1.buffer.toString('hex') !== res2.buffer.toString('hex')) {
        console.warn(`Byte Check: invalid byte around position: ${next} (halted byte check)`);
        throw new Error('expected');
      }
      next = res1.next;
    }
  } catch (e) {
    if (e.code !== 'ERR_OUT_OF_RANGE' && e.message !== 'expected') console.error(e);
  }
}