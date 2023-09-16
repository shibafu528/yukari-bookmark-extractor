export class ByteStream {
  bytes: DataView;
  position: number;

  constructor(bytes: Uint8Array) {
    this.bytes = new DataView(bytes.buffer);
    this.position = 0;
  }

  get length() {
    return this.bytes.byteLength;
  }

  get eof() {
    return this.length <= this.position;
  }

  peekByte(): number {
    return this.bytes.getUint8(this.position);
  }

  readByte(): number {
    return this.bytes.getUint8(this.position++);
  }

  readBytes(length: number): ArrayBuffer {
    const buffer = this.bytes.buffer.slice(
      this.position,
      this.position + length,
    );
    this.position += length;
    return buffer;
  }

  readShort(): number {
    const value = this.bytes.getInt16(this.position, false);
    this.position += 2;
    return value;
  }

  readUShort(): number {
    const value = this.bytes.getUint16(this.position, false);
    this.position += 2;
    return value;
  }

  readInt(): number {
    const value = this.bytes.getInt32(this.position, false);
    this.position += 4;
    return value;
  }

  readUInt(): number {
    const value = this.bytes.getUint32(this.position, false);
    this.position += 4;
    return value;
  }

  readLong(): bigint {
    const value = this.bytes.getBigInt64(this.position, false);
    this.position += 8;
    return value;
  }

  readULong(): bigint {
    const value = this.bytes.getBigUint64(this.position, false);
    this.position += 8;
    return value;
  }

  readFloat(): number {
    const value = this.bytes.getFloat32(this.position, false);
    this.position += 4;
    return value;
  }

  readDouble(): number {
    const value = this.bytes.getFloat64(this.position, false);
    this.position += 8;
    return value;
  }

  // 2 bytes length + string
  readUTF(): string {
    const length = this.readUShort();
    const bytes = this.bytes.buffer.slice(
      this.position,
      this.position + length,
    );
    this.position += length;
    return new TextDecoder().decode(bytes);
  }
}
