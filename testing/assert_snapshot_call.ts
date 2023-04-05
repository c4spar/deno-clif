import { eraseDown } from "../ansi/ansi_escapes.ts";
import { AssertionError, assertSnapshot, basename, red } from "./deps.ts";

export interface AssertSnapshotCallStep {
  /** Data written to the test process. */
  stdin?: Array<string> | string;
  /** Arguments passed to the test file. */
  args?: Array<string>;
  /** If enabled, test error will be ignored. */
  canFail?: true;
}

export interface AssertSnapshotCallOptions extends AssertSnapshotCallStep {
  /** Test name. */
  name: string;
  /** Import meta. Required to determine the import url of the test file. */
  meta: ImportMeta;
  /** Test function. */
  fn(): void | Promise<void>;
  /**
   * Object of test steps. Key is the test name and the value is an array of
   * input sequences/characters.
   */
  steps?: Record<string, AssertSnapshotCallStep>;
  /**
   * Arguments passed to the `deno test` command when executing the snapshot
   * tests. `--allow-env=ASSERT_SNAPSHOT_CALL` is passed by default.
   */
  denoArgs?: Array<string>;
  /**
   * Snapshot output directory. Snapshot files will be written to this directory.
   * This can be relative to the test directory or an absolute path.
   *
   * If both `dir` and `path` are specified, the `dir` option will be ignored and
   * the `path` option will be handled as normal.
   */
  dir?: string;
  /**
   * Snapshot output path. The snapshot will be written to this file. This can be
   * a path relative to the test directory or an absolute path.
   *
   * If both `dir` and `path` are specified, the `dir` option will be ignored and
   * the `path` option will be handled as normal.
   */
  path?: string;
  /**
   * Operating system snapshot suffix. This is useful when your test produces
   * different output on different operating systems.
   */
  osSuffix?: Array<typeof Deno.build.os>;
  /** Enable/disable colors. Default is `false`. */
  colors?: boolean;
  /**
   * Timeout in milliseconds to wait until the input stream data is buffered
   * before writing the next data to the stream. This ensures that each user
   * input is rendered as separate line in the snapshot file. If your test gets
   * flaky, try to increase the timeout. The default timeout is `600`.
   */
  timeout?: number;
  /** If truthy the current test step will be ignored.
   *
   * It is a quick way to skip over a step, but also can be used for
   * conditional logic, like determining if an environment feature is present.
   */
  ignore?: boolean;
  /** If at least one test has `only` set to `true`, only run tests that have
   * `only` set to `true` and fail the test suite. */
  only?: boolean;
}

const encoder = new TextEncoder();

/**
 * Run prompt snapshot tests.
 *
 * ```ts
 * import { assertSnapshotCall } from "./assert_snapshot_call.ts";
 * import { Input } from "../prompt/input.ts";
 *
 * await assertSnapshotCall({
 *   name: "test name",
 *   meta: import.meta,
 *   osSuffix: ["windows"],
 *   steps: {
 *     "should enter som text": { stdin: ["foo bar", "\n"] },
 *   },
 *   async fn() {
 *     await Input.prompt({
 *       message: "Whats your name?",
 *       default: "foo",
 *     });
 *   },
 * });
 * ```
 *
 * @param options Test options
 */
export async function assertSnapshotCall(
  options: AssertSnapshotCallOptions,
): Promise<void> {
  if (options.meta.main) {
    await runTest(options);
  } else {
    registerTest(options);
  }
}

function registerTest(options: AssertSnapshotCallOptions) {
  const fileName = basename(options.meta.url);

  Deno.test({
    name: options.name,
    ignore: options.ignore,
    only: options.only,
    async fn(ctx) {
      const steps = Object.entries(options.steps ?? {});
      if (steps.length) {
        for (const [name, inputs] of steps) {
          await ctx.step({
            name,
            fn: (ctx) => fn(ctx, inputs),
          });
        }
      } else {
        await fn(ctx);
      }
    },
  });

  async function fn(ctx: Deno.TestContext, step?: AssertSnapshotCallStep) {
    const output: string = await runPrompt(options, step);
    const suffix = options.osSuffix?.includes(Deno.build.os)
      ? `.${Deno.build.os}`
      : "";

    await assertSnapshot(ctx, output, {
      dir: options.dir,
      path: options.path ??
        (options.dir ? undefined : `__snapshots__/${fileName}${suffix}.snap`),
    });
  }
}

async function runPrompt(
  options: AssertSnapshotCallOptions,
  step?: AssertSnapshotCallStep,
): Promise<string> {
  let output: Deno.CommandOutput | undefined;
  let stdout: string | undefined;
  let stderr: string | undefined;

  try {
    const cmd = new Deno.Command("deno", {
      stdin: "piped",
      stdout: "piped",
      stderr: "piped",
      args: [
        "run",
        ...options.denoArgs ?? ["--allow-env=ASSERT_SNAPSHOT_CALL"],
        options.meta.url,
        ...options.args ?? [],
        ...step?.args ?? [],
      ],
      env: {
        ASSERT_SNAPSHOT_CALL: options.name,
        ...options.colors ? {} : { NO_COLOR: "true" },
      },
    });
    const child: Deno.ChildProcess = cmd.spawn();
    const writer = child.stdin.getWriter();

    const stdin = [
      ...options?.stdin ?? [],
      ...step?.stdin ?? [],
    ];

    if (stdin.length) {
      for (const data of stdin) {
        await writer.write(encoder.encode(data));
        // Ensure all inputs are processed and rendered separately.
        await new Promise((resolve) =>
          setTimeout(resolve, options.timeout ?? 600)
        );
      }
    }

    output = await child.output();
    stdout = new TextDecoder().decode(output.stdout);
    stderr = new TextDecoder().decode(output.stderr);

    writer.releaseLock();
    await child.stdin.close();
  } catch (error: unknown) {
    const assertionError = new AssertionError(
      `Prompt snapshot test failed: ${options.meta.url}.\n${red(stderr ?? "")}`,
    );
    assertionError.cause = error;
    throw assertionError;
  }

  if (!output.success && !options.canFail && !step?.canFail) {
    throw new AssertionError(
      `Prompt snapshot test failed: ${options.meta.url}.` +
        `Test command failed with a none zero exit code: ${output.code}.\n${
          red(stderr ?? "")
        }`,
    );
  }

  // Add a line break after each test input.
  return "stdout:\n" + stdout.replaceAll(eraseDown(), eraseDown() + "\n") +
    "\nstderr:\n" + stderr.replaceAll(eraseDown(), eraseDown() + "\n");
}

async function runTest(options: AssertSnapshotCallOptions) {
  const testName = Deno.env.get("ASSERT_SNAPSHOT_CALL");
  if (testName === options.name) {
    await options.fn();
  }
}
