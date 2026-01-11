/**
 * Minimal CBOR decoder for WebAuthn
 *
 * Only decodes the subset used by WebAuthn:
 * - Major type 0: unsigned integer
 * - Major type 1: negative integer
 * - Major type 2: byte string
 * - Major type 3: text string
 * - Major type 4: array
 * - Major type 5: map
 */

export type CborValue =
  | number
  | Uint8Array
  | string
  | CborValue[]
  | Map<CborValue, CborValue>;

export function decodeCbor(data: Uint8Array): CborValue {
  let offset = 0;

  function read(n: number): Uint8Array {
    const slice = data.subarray(offset, offset + n);
    offset += n;
    return slice;
  }

  function readUint8(): number {
    return data[offset++]!;
  }

  function readLength(additionalInfo: number): number {
    if (additionalInfo < 24) return additionalInfo;
    if (additionalInfo === 24) return readUint8();
    if (additionalInfo === 25) {
      const bytes = read(2);
      return (bytes[0]! << 8) | bytes[1]!;
    }
    if (additionalInfo === 26) {
      const bytes = read(4);
      return (
        ((bytes[0]! << 24) |
          (bytes[1]! << 16) |
          (bytes[2]! << 8) |
          bytes[3]!) >>>
        0
      );
    }
    throw new Error("CBOR: unsupported length encoding");
  }

  function decode(): CborValue {
    const initial = readUint8();
    const majorType = initial >> 5;
    const additionalInfo = initial & 0x1f;

    switch (majorType) {
      case 0: // unsigned integer
        return readLength(additionalInfo);
      case 1: // negative integer
        return -1 - readLength(additionalInfo);
      case 2: // byte string
        return new Uint8Array(read(readLength(additionalInfo)));
      case 3: {
        // text string
        const bytes = read(readLength(additionalInfo));
        return new TextDecoder().decode(bytes);
      }
      case 4: {
        // array
        const length = readLength(additionalInfo);
        const arr: CborValue[] = [];
        for (let i = 0; i < length; i++) arr.push(decode());
        return arr;
      }
      case 5: {
        // map
        const length = readLength(additionalInfo);
        const map = new Map<CborValue, CborValue>();
        for (let i = 0; i < length; i++) {
          const key = decode();
          const value = decode();
          map.set(key, value);
        }
        return map;
      }
      default:
        throw new Error(`CBOR: unsupported major type ${majorType}`);
    }
  }

  return decode();
}
