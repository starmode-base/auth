/**
 * Minimal schema-based parser
 *
 * Parse, don't validate: constructs new typed objects from unknown input,
 * stripping excess properties. Throws on invalid input.
 */

type Parser<T> = (v: unknown) => T;

function str(): Parser<string> {
  return (v) => {
    if (typeof v !== "string") throw new Error("expected string");
    return v;
  };
}

function obj<T extends Record<string, Parser<unknown>>>(
  shape: T,
): Parser<{ [K in keyof T]: ReturnType<T[K]> }> {
  return (v) => {
    if (typeof v !== "object" || v === null) throw new Error("expected object");

    const input = v as Record<string, unknown>;
    const result = {} as { [K in keyof T]: ReturnType<T[K]> };

    for (const key in shape) {
      const parser = shape[key];

      // Invariant: all keys in the shape have a parser
      if (!parser) throw new Error(`missing parser for key: ${key}`);

      try {
        const parsed = parser(input[key]);
        if (parsed !== undefined) {
          result[key] = parsed as ReturnType<T[typeof key]>;
        }
      } catch (error) {
        // Invariant: all parsers throw an Error
        if (!(error instanceof Error)) {
          throw new Error(`Unexpected error: ${error}`);
        }

        throw new Error(`"${key}": ${error.message}`);
      }
    }

    return result;
  };
}

function optional<T>(parser: Parser<T>): Parser<T | undefined> {
  return (v) => (v == null ? undefined : parser(v));
}

function array<T>(parser: Parser<T>): Parser<T[]> {
  return (v) => {
    if (!Array.isArray(v)) throw new Error("expected array");
    return v.map(parser);
  };
}

function literal<const T extends string | number | boolean>(
  values: T[],
): Parser<T> {
  return (v) => {
    for (const value of values) {
      if (v === value) return value;
    }
    throw new Error(`expected one of: ${values.join(", ")}`);
  };
}

function record(): Parser<Record<string, unknown>> {
  return (v) => {
    if (typeof v !== "object" || v === null) throw new Error("expected object");
    return { ...(v as Record<string, unknown>) };
  };
}

function tagged<
  TTag extends string,
  TVariants extends Record<string, Parser<object>>,
>(
  tag: TTag,
  variants: TVariants,
): Parser<
  {
    [K in keyof TVariants]: { [P in TTag]: K } & ReturnType<TVariants[K]>;
  }[keyof TVariants]
> {
  const validTags = Object.keys(variants);

  return (v) => {
    if (typeof v !== "object" || v === null) throw new Error("expected object");

    const input = v as Record<string, unknown>;
    const tagValue = input[tag];

    if (typeof tagValue !== "string") {
      throw new Error(`expected "${tag}" to be a string`);
    }

    const parser = variants[tagValue];
    if (!parser) {
      throw new Error(
        `expected "${tag}" to be one of: ${validTags.join(", ")}`,
      );
    }

    const parsed = parser(v);
    return { ...parsed, [tag]: tagValue } as {
      [K in keyof TVariants]: { [P in TTag]: K } & ReturnType<TVariants[K]>;
    }[keyof TVariants];
  };
}

export const p = { str, obj, optional, array, literal, record, tagged };
