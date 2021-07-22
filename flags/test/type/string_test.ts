import { assertEquals, assertThrows } from "../../../dev_deps.ts";
import { parseFlags } from "../../flags.ts";
import type { IParseOptions } from "../../types.ts";
import { OptionType } from "../../types.ts";

const optionalValueOptions = <IParseOptions> {
  stopEarly: false,
  allowEmpty: false,
  flags: [{
    name: "flag",
    aliases: ["f"],
    type: OptionType.STRING,
    optionalValue: true,
  }],
};

const requiredStringValueOptions = <IParseOptions> {
  stopEarly: false,
  allowEmpty: false,
  flags: [{
    name: "flag",
    aliases: ["f"],
    type: OptionType.STRING,
  }],
};

const requiredNumberValueOptions = <IParseOptions> {
  stopEarly: false,
  allowEmpty: false,
  flags: [{
    name: "flag",
    aliases: ["f"],
    type: OptionType.NUMBER,
  }],
};

Deno.test("flags - type - string - with no value", () => {
  const { flags, unknown, literal } = parseFlags(["-f"], optionalValueOptions);

  assertEquals(flags, { flag: true });
  assertEquals(unknown, []);
  assertEquals(literal, []);
});

Deno.test("flags - type - string - with valid value", () => {
  const { flags, unknown, literal } = parseFlags(
    ["--flag", "value"],
    optionalValueOptions,
  );

  assertEquals(flags, { flag: "value" });
  assertEquals(unknown, []);
  assertEquals(literal, []);
});

Deno.test("flags - type - string - with special chars", () => {
  const { flags, unknown, literal } = parseFlags(
    ["-f", '!"§$%&/()=?*+#=\\/@*-+,<😎>,.;:_-abc123€√', "unknown"],
    optionalValueOptions,
  );

  assertEquals(flags, { flag: '!"§$%&/()=?*+#=\\/@*-+,<😎>,.;:_-abc123€√' });
  assertEquals(unknown, ["unknown"]);
  assertEquals(literal, []);
});

Deno.test("flags - type - string - with missing value", () => {
  assertThrows(
    () => parseFlags(["-f"], requiredStringValueOptions),
    Error,
    `Missing value for option "--flag".`,
  );
});

Deno.test("flags - type - string - value starting with hyphen", () => {
  const { flags, unknown, literal } = parseFlags(
    ["-f", "-a", "unknown"],
    requiredStringValueOptions,
  );

  assertEquals(flags, { flag: "-a" });
  assertEquals(unknown, ["unknown"]);
  assertEquals(literal, []);
});

Deno.test("flags - type - string - with numeric value", () => {
  const { flags, unknown, literal } = parseFlags(
    ["-f", "-1", "unknown"],
    requiredNumberValueOptions,
  );

  assertEquals(flags, { flag: -1 });
  assertEquals(unknown, ["unknown"]);
  assertEquals(literal, []);
});
