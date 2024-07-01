export async function readDir(path: string): Promise<Array<{ name: string }>> {
  // deno-lint-ignore no-explicit-any
  const { Deno } = globalThis as any;
  path ||= ".";

  if (Deno) {
    const array = [];
    for await (const item of Deno.readDir(path)) {
      array.push(item);
    }
    return array;
  }

  const fs = await import("node:fs");

  return new Promise((resolve, reject) => {
    fs.readdir(
      path,
      (err: unknown, files: Array<string>) =>
        err ? reject(err) : resolve(files.map((name) => ({ name }))),
    );
  });
}
