import { describe, it, expect } from "vitest";
import { p } from "./parser";

describe("p.str", () => {
  const parse = p.str();

  it("parses string", () => {
    expect(parse("hello")).toBe("hello");
  });

  it("parses empty string", () => {
    expect(parse("")).toBe("");
  });

  it("throws on non-string", () => {
    expect(() => parse(123)).toThrow("expected string");
    expect(() => parse(null)).toThrow("expected string");
    expect(() => parse(undefined)).toThrow("expected string");
  });
});

describe("p.obj", () => {
  const parse = p.obj({ name: p.str(), age: p.str() });

  it("parses object with correct shape", () => {
    const result = parse({ name: "alice", age: "30" });
    expect(result).toStrictEqual({ name: "alice", age: "30" });
  });

  it("strips excess properties", () => {
    const result = parse({ name: "alice", age: "30", extra: "ignored" });
    expect(result).toStrictEqual({ name: "alice", age: "30" });
  });

  it("throws on non-object", () => {
    expect(() => parse(null)).toThrow("expected object");
    expect(() => parse("string")).toThrow("expected object");
  });

  it("throws on missing property (age is required)", () => {
    const result = () => parse({ name: "alice" });
    expect(result).toThrow('"age": expected string');
  });

  it("throws on missing property (empty object)", () => {
    const result = () => parse({});
    expect(result).toThrow('"name": expected string');
  });

  it("throws on missing property (Set props does not match schema)", () => {
    const result = () => parse(new Set());
    expect(result).toThrow('"name": expected string');
  });

  it("throws on missing property (Map props does not match schema)", () => {
    const result = () => parse(new Map());
    expect(result).toThrow('"name": expected string');
  });

  it("throws on missing property (Date props does not match schema)", () => {
    const result = () => parse(new Date());
    expect(result).toThrow('"name": expected string');
  });

  it("throws on invalid property (age is not a string)", () => {
    const result = () => parse({ name: "alice", age: 30 });
    expect(result).toThrow('"age": expected string');
  });

  it("throws on invalid property (name is not a string)", () => {
    const result = () => parse({ name: 123, age: "30" });
    expect(result).toThrow('"name": expected string');
  });
});

describe("p.optional", () => {
  const parse = p.optional(p.str());

  it("parses value when present", () => {
    expect(parse("hello")).toBe("hello");
  });

  it("returns undefined for null/undefined", () => {
    expect(parse(null)).toBeUndefined();
    expect(parse(undefined)).toBeUndefined();
  });
});

describe("p.array", () => {
  const parse = p.array(p.str());

  it("parses array of strings", () => {
    expect(parse(["a", "b"])).toStrictEqual(["a", "b"]);
  });

  it("parses empty array", () => {
    expect(parse([])).toStrictEqual([]);
  });

  it("parses array of strings (Array constructor)", () => {
    expect(parse(new Array("a", "b"))).toStrictEqual(["a", "b"]);
  });

  it("parses array of strings (Array function)", () => {
    expect(parse(Array("a", "b"))).toStrictEqual(["a", "b"]);
  });

  it("throws on non-array", () => {
    expect(() => parse("not array")).toThrow("expected array");
  });

  it("throws on invalid element", () => {
    expect(() => parse(["a", 123])).toThrow("expected string");
  });
});

describe("p.literal", () => {
  it("validates single literal value", () => {
    const parse = p.literal(["public-key"]);
    expect(parse("public-key")).toBe("public-key");
  });

  it("validates multiple literal values", () => {
    const parse = p.literal(["usb", "nfc", "ble"]);

    expect(parse("usb")).toBe("usb");
    expect(parse("nfc")).toBe("nfc");
    expect(parse("ble")).toBe("ble");
  });

  it("throws on invalid value (single literal)", () => {
    const parse = p.literal(["public-key"]);
    expect(() => parse("other")).toThrow("expected one of: public-key");
  });

  it("throws on invalid value (multiple literals)", () => {
    const parse = p.literal(["usb", "nfc"]);
    expect(() => parse("other")).toThrow("expected one of: usb, nfc");
  });
});

describe("p.record", () => {
  it("parses object and shallow copies", () => {
    const input = { a: 1, b: 2 };
    const result = p.record()(input);
    expect(result).toStrictEqual({ a: 1, b: 2 });

    // Check that the result is a shallow copy of the input
    expect(result).not.toBe(input);
  });

  it("throws on non-object", () => {
    expect(() => p.record()(null)).toThrow("expected object");
  });

  it("preserves nested objects", () => {
    const input = { a: { b: 1 } };
    expect(p.record()(input)).toStrictEqual({ a: { b: 1 } });
  });
});

describe("p.tagged", () => {
  const parse = p.tagged("type", {
    add: p.obj({ value: p.str() }),
    remove: p.obj({ id: p.str() }),
  });

  it("parses valid variant", () => {
    expect(parse({ type: "add", value: "hello" })).toStrictEqual({
      type: "add",
      value: "hello",
    });
    expect(parse({ type: "remove", id: "123" })).toStrictEqual({
      type: "remove",
      id: "123",
    });
  });

  it("throws on invalid tag value", () => {
    expect(() => parse({ type: "unknown" })).toThrow(
      'expected "type" to be one of: add, remove',
    );
  });

  it("throws on missing tag", () => {
    expect(() => parse({ value: "hello" })).toThrow(
      'expected "type" to be a string',
    );
  });

  it("throws on invalid body for valid tag", () => {
    expect(() => parse({ type: "add", value: 123 })).toThrow(
      '"value": expected string',
    );
  });
});

describe("nested schemas", () => {
  const parse = p.obj({
    id: p.str(),
    response: p.obj({
      data: p.str(),
      items: p.optional(p.array(p.str())),
    }),
  });

  it("parses nested structure", () => {
    const result = parse({
      id: "123",
      response: { data: "test", items: ["a", "b"] },
    });

    expect(result).toStrictEqual({
      id: "123",
      response: { data: "test", items: ["a", "b"] },
    });
  });

  it("strips excess at all levels", () => {
    const result = parse({
      id: "123",
      extra: "top",
      response: { data: "test", nested_extra: "removed" },
    });

    expect(result).toStrictEqual({
      id: "123",
      response: { data: "test" },
    });
  });

  it("throws on invalid nested property (response.items[1] is not a string)", () => {
    const result = () =>
      parse({
        id: "123",
        response: { data: "test", items: ["a", 123] },
      });

    expect(result).toThrow('"response": "items": expected string');
  });
});
