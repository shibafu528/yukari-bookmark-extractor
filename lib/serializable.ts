import { ByteStream } from "./bytestream.ts";

// spec: https://docs.oracle.com/javase/jp/6/platform/serialization/spec/protocol.html

// from spec section 6.4.2
const STREAM_MAGIC = 0xaced;
const STREAM_VERSION = 5;
const TC_NULL = 0x70;
const TC_REFERENCE = 0x71;
const TC_CLASSDESC = 0x72;
const TC_OBJECT = 0x73;
const TC_STRING = 0x74;
const TC_ARRAY = 0x75;
const TC_CLASS = 0x76;
const TC_BLOCKDATA = 0x77;
const TC_ENDBLOCKDATA = 0x78;
const TC_RESET = 0x79;
const TC_BLOCKDATALONG = 0x7A;
const TC_EXCEPTION = 0x7B;
const TC_LONGSTRING = 0x7C;
const TC_PROXYCLASSDESC = 0x7D;
const TC_ENUM = 0x7E;
const baseWireHandle = 0x7E0000;
const SC_WRITE_METHOD = 0x01; //if SC_SERIALIZABLE
const SC_BLOCK_DATA = 0x08; //if SC_EXTERNALIZABLE
const SC_SERIALIZABLE = 0x02;
const SC_EXTERNALIZABLE = 0x04;
const SC_ENUM = 0x10;

const TYPECODE_BYTE = "B".charCodeAt(0);
const TYPECODE_CHAR = "C".charCodeAt(0);
const TYPECODE_DOUBLE = "D".charCodeAt(0);
const TYPECODE_FLOAT = "F".charCodeAt(0);
const TYPECODE_INTEGER = "I".charCodeAt(0);
const TYPECODE_LONG = "J".charCodeAt(0);
const TYPECODE_SHORT = "S".charCodeAt(0);
const TYPECODE_BOOLEAN = "Z".charCodeAt(0);
const TYPECODE_ARRAY = "[".charCodeAt(0);
const TYPECODE_OBJECT = "L".charCodeAt(0);

type Handle = number;

type Reference =
  | StringReference
  | ClassDescReference
  | ObjectReference
  | ArrayReference;

interface StringReference {
  handle: Handle;
  string: string;
}

interface ObjectReference {
  handle: Handle;
  classDesc: ClassDesc;
  object: Record<string, unknown>;
  objectAnnotation: unknown[];
}

interface ArrayReference {
  handle: Handle;
  classDesc: ClassDesc;
  array: unknown[];
}

interface ClassDescReference {
  handle: Handle;
  classDesc: ClassDesc;
}

interface ClassDesc {
  className: string;
  serialVersionUID: bigint;
  classDescInfo: ClassDescInfo;
}

interface ClassDescInfo {
  classDescFlags: number;
  fields: FieldDesc[];
  classAnnotation: unknown[];
  superClassDesc: ClassDescReference | null;
}

type FieldDesc = PrimitiveFieldDesc | ArrayFieldDesc | ObjectFieldDesc;

interface PrimitiveFieldDesc {
  type: "primitive";
  typecode: number; // TYPECODE_*
  fieldName: string;
}

function isPrimitiveFieldDesc(field: FieldDesc): field is PrimitiveFieldDesc {
  return field.type === "primitive";
}

interface ArrayFieldDesc {
  type: "array";
  fieldName: string;
  className1: StringReference;
}

function isArrayFieldDesc(field: FieldDesc): field is ArrayFieldDesc {
  return field.type === "array";
}

interface ObjectFieldDesc {
  type: "object";
  fieldName: string;
  className1: StringReference;
}

function isObjectFieldDesc(field: FieldDesc): field is ObjectFieldDesc {
  return field.type === "object";
}

function allFieldsFromClassDesc(classDesc: ClassDesc): FieldDesc[] {
  if (classDesc.classDescInfo.superClassDesc) {
    return [
      ...allFieldsFromClassDesc(
        classDesc.classDescInfo.superClassDesc.classDesc,
      ),
      ...classDesc.classDescInfo.fields,
    ];
  } else {
    return classDesc.classDescInfo.fields;
  }
}

function simplifyReference(ref: Reference | null): unknown {
  if (!ref) {
    return ref;
  }
  if ("string" in ref) {
    return ref.string;
  }
  if ("array" in ref) {
    return ref.array.map((r) => simplifyReference(r as Reference | null));
  }
  if ("object" in ref) {
    if (ref.classDesc.className === "java.util.Date") {
      return ref.object.date;
    }
    return ref.object;
  }
  return ref;
}

class Decoder {
  input: ByteStream;
  handle: number;
  objectRegistry: { [index: Handle]: Reference };

  constructor(input: ByteStream) {
    this.input = input;
    this.handle = baseWireHandle;
    this.objectRegistry = {};
  }

  decode() {
    // magic
    if (this.input.readUShort() !== STREAM_MAGIC) {
      throw "magic !== STREAM_MAGIC";
    }
    // version
    const _version = this.input.readUShort();
    // contents
    const contents = [];
    while (!this.input.eof) {
      const content = this.decodeContent();
      if (content instanceof ArrayBuffer) {
        contents.push(content);
      } else {
        contents.push(simplifyReference(content));
      }
    }
    return contents;
  }

  decodeReference(): Reference {
    const handle = this.input.readInt() as Handle;
    return this.objectRegistry[handle];
  }

  decodeContent() {
    const tc = this.input.peekByte();
    switch (tc) {
      case TC_BLOCKDATA: {
        // console.log(`0x${tc.toString(16).toUpperCase()}: TC_BLOCKDATA`);
        this.input.readByte(); // skip tc
        const size = this.input.readByte();
        return this.input.readBytes(size);
      }
      case TC_BLOCKDATALONG: {
        // console.log(`0x${tc.toString(16).toUpperCase()}: TC_BLOCKDATALONG`);
        this.input.readByte(); // skip tc
        const size = this.input.readInt();
        return this.input.readBytes(size);
      }
      default:
        return this.decodeObject();
    }
  }

  decodeObject() {
    const tc = this.input.readByte();
    switch (tc) {
      case TC_NULL:
        // console.log(`0x${tc.toString(16).toUpperCase()}: TC_NULL`);
        return null;
      case TC_REFERENCE:
        // console.log(`0x${tc.toString(16).toUpperCase()}: TC_REFERENCE`);
        return this.decodeReference();
      case TC_CLASSDESC:
        // console.log(`0x${tc.toString(16).toUpperCase()}: TC_CLASSDESC`);
        return this.decodeClassDesc(tc);
      case TC_OBJECT:
        // console.log(`0x${tc.toString(16).toUpperCase()}: TC_OBJECT`);
        return this.decodeNewObject();
      case TC_STRING:
        // console.log(`0x${tc.toString(16).toUpperCase()}: TC_STRING`);
        return this.decodeNewString(false);
      case TC_LONGSTRING:
        // console.log(`0x${tc.toString(16).toUpperCase()}: TC_LONGSTRING`);
        return this.decodeNewString(true);
      case TC_ARRAY:
        // console.log(`0x${tc.toString(16).toUpperCase()}: TC_ARRAY`);
        return this.decodeNewArray();
      case TC_CLASS:
        console.log(`0x${tc.toString(16).toUpperCase()}: TC_CLASS`);
        break;
      case TC_EXCEPTION:
        console.log(`0x${tc.toString(16).toUpperCase()}: TC_EXCEPTION`);
        break;
      case TC_PROXYCLASSDESC:
        // console.log(`0x${tc.toString(16).toUpperCase()}: TC_PROXYCLASSDESC`);
        return this.decodeClassDesc(tc);
      case TC_ENUM:
        console.log(`0x${tc.toString(16).toUpperCase()}: TC_ENUM`);
        break;
      case TC_RESET:
        console.log(`0x${tc.toString(16).toUpperCase()}: TC_RESET`);
        break;
    }
    throw `${this.input.position.toString(16)}: unknown tc: 0x${
      tc.toString(16).toUpperCase()
    }`;
  }

  decodeNewString(longString: boolean): StringReference {
    const handle = this.nextHandle();
    if (longString) {
      throw "decodeNewString: not implemented TC_LONGSTRING";
    } else {
      const string = this.input.readUTF();
      return this.objectRegistry[handle] = { handle, string };
    }
  }

  decodeNewObject(): ObjectReference {
    // classDesc
    const classDesc = (this.decodeClassDesc() as ClassDescReference).classDesc;
    // newHandle
    const handle = this.nextHandle();
    // classdata[]
    const classData: Record<string, unknown> = {};
    const objectAnnotation: unknown[] = [];
    const classDescFlags = classDesc.classDescInfo.classDescFlags;
    const fields = allFieldsFromClassDesc(classDesc);
    if (classDescFlags & SC_SERIALIZABLE) {
      // Serializable
      if (classDescFlags & SC_WRITE_METHOD) {
        // classdata >> wrclass
        // classdata >> wrclass >> nowrclass
        fields.forEach((field) => {
          classData[field.fieldName] = this.decodeValues(field);
        });
        // classdata >> wrclass >> objectAnnotation
        while (this.input.peekByte() !== TC_ENDBLOCKDATA) {
          objectAnnotation.push(this.decodeContent());
        }
        this.input.readByte(); // drop TC_ENDBLOCKDATA
      } else {
        // classdata >> nowrclass
        fields.forEach((field) => {
          classData[field.fieldName] = this.decodeValues(field);
        });
      }
    } else if (classDescFlags & SC_EXTERNALIZABLE) {
      // Externalizable
      throw "unsupport Externalizable";
    }

    if (classDesc.className === "java.util.Date") {
      const timestamp = objectAnnotation[0] as ArrayBuffer;
      const msec = new DataView(timestamp).getBigUint64(0, false);

      return this.objectRegistry[handle] = {
        handle,
        classDesc,
        object: {
          date: new Date(Number(msec)).toJSON(),
        },
        objectAnnotation,
      };
    }

    return this.objectRegistry[handle] = {
      handle,
      classDesc,
      object: classData,
      objectAnnotation,
    };
  }

  decodeNewArray(): ArrayReference {
    // classDesc
    const classDesc = (this.decodeClassDesc() as ClassDescReference).classDesc;
    // newHandle
    const handle = this.nextHandle();
    // size
    const size = this.input.readInt();
    const values: unknown[] = [];
    // values
    for (let index = 0; index < size; index++) {
      values.push(this.decodeObject());
    }
    return this.objectRegistry[handle] = {
      handle,
      classDesc,
      array: values,
    };
  }

  decodePrimitiveValue(typecode: number) {
    switch (typecode) {
      case TYPECODE_BYTE:
        return this.input.readByte();
      case TYPECODE_CHAR:
        return this.input.readUShort();
      case TYPECODE_DOUBLE:
        return this.input.readDouble();
      case TYPECODE_FLOAT:
        return this.input.readFloat();
      case TYPECODE_INTEGER:
        return this.input.readInt();
      case TYPECODE_LONG:
        return this.input.readLong();
      case TYPECODE_SHORT:
        return this.input.readShort();
      case TYPECODE_BOOLEAN:
        return this.input.readByte() === 1;
    }
    throw `unknown typecode: ${String.fromCharCode(typecode)}`;
  }

  decodeValues(field: FieldDesc) {
    // console.log(`decodeValues: ${field.fieldName}`);
    if (isPrimitiveFieldDesc(field)) {
      // console.log(`  >> typecode is ${String.fromCharCode(field.typecode)}`);
      return this.decodePrimitiveValue(field.typecode);
    } else if (isArrayFieldDesc(field)) {
      // console.log(`  >> is array of ${field.className1.string}`);
      return simplifyReference(this.decodeObject());
    } else if (isObjectFieldDesc(field)) {
      // console.log(`  >> is ${field.className1.string}`);
      return simplifyReference(this.decodeObject());
    }
    throw "invalid FieldDesc";
  }

  decodeClassDesc(
    tc: number = this.input.readByte(),
  ): ClassDescReference | null {
    switch (tc) {
      case TC_CLASSDESC: {
        // console.log(`0x${tc.toString(16).toUpperCase()}: TC_CLASSDESC`);
        // className
        const className = this.input.readUTF();
        // serialVersionUID
        const serialVersionUID = this.input.readULong();
        // newHandle
        const handle = this.nextHandle();
        // classDescInfo
        const classDescInfo = this.decodeClassDescInfo();
        return this.objectRegistry[handle] = {
          handle,
          classDesc: {
            className,
            serialVersionUID,
            classDescInfo,
          },
        };
      }
      case TC_PROXYCLASSDESC: {
        console.log(`0x${tc.toString(16).toUpperCase()}: TC_PROXYCLASSDESC`);
        // const handle = this.nextHandle();
        throw "not implemented";
      }
      case TC_NULL:
        // console.log(`0x${tc.toString(16).toUpperCase()}: TC_NULL`);
        return null;
      case TC_REFERENCE:
        // console.log(`0x${tc.toString(16).toUpperCase()}: TC_REFERENCE`);
        return this.decodeReference() as ClassDescReference;
    }
    throw `unknown tc: 0x${tc.toString(16).toUpperCase()}`;
  }

  decodeClassDescInfo(): ClassDescInfo {
    // classDescFlags
    const classDescFlags = this.input.readByte();
    // fields
    const fieldsCount = this.input.readUShort();
    const fields: FieldDesc[] = [];
    for (let fieldIndex = 0; fieldIndex < fieldsCount; fieldIndex++) {
      // fields >> fieldDesc
      const typecode = this.input.readByte();
      switch (typecode) {
        case TYPECODE_BYTE:
        case TYPECODE_CHAR:
        case TYPECODE_DOUBLE:
        case TYPECODE_FLOAT:
        case TYPECODE_INTEGER:
        case TYPECODE_LONG:
        case TYPECODE_SHORT:
        case TYPECODE_BOOLEAN: {
          // fields >> fieldDesc >> primitiveDesc
          const fieldName = this.input.readUTF();
          fields[fieldIndex] = {
            type: "primitive",
            typecode,
            fieldName,
          };
          break;
        }
        case TYPECODE_ARRAY: {
          const fieldName = this.input.readUTF();
          const className1 = this.decodeObject() as StringReference;
          fields[fieldIndex] = {
            type: "array",
            fieldName,
            className1,
          };
          break;
        }
        case TYPECODE_OBJECT: {
          const fieldName = this.input.readUTF();
          const className1 = this.decodeObject() as StringReference;
          fields[fieldIndex] = {
            type: "object",
            fieldName,
            className1,
          };
          break;
        }
        default:
          throw `unknown typecode: ${String.fromCharCode(typecode)}`;
      }
    }
    // classAnnotation >> {endBlockData | contents endBlockData}
    const classAnnotation: unknown[] = [];
    while (this.input.peekByte() !== TC_ENDBLOCKDATA) {
      classAnnotation.push(this.decodeContent());
    }
    this.input.readByte(); // drop TC_ENDBLOCKDATA
    // superClassDesc
    const superClassDesc = this.decodeClassDesc();

    return {
      classDescFlags,
      fields,
      classAnnotation,
      superClassDesc,
    };
  }

  nextHandle(): Handle {
    return this.handle++;
  }
}

export function decode(input: ByteStream) {
  return new Decoder(input).decode();
}
