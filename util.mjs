import { promises } from 'fs';
import { createObjectCsvWriter } from 'csv-writer';

export const fs = promises;

export const io = {
  csv: {
    out: createObjectCsvWriter,
  }
};

const convert = (from, to) => (str) => Buffer.from(str, from).toString(to);
export const toAscii = convert('hex', 'ascii');
export const toUnicode = convert('hex', 'utf16le');

export function useAsIs(string) { return string; }
export function littleEndian(string) { return (string.match(/.{2}/g) || ['']).reverse().join(''); }

export function toInt(buffer, parseFunction) { return parseInt(parseFunction(buffer.toString('hex')), 16); }

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