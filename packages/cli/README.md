# @kalayaan/cli

The `kalayaan` CLI implementation — `login`, `init`, `dev`, `migrate`, `deploy`, `doctor`, `down`.

Most people should install the [`kalayaan`](https://www.npmjs.com/package/kalayaan) package instead;
this package is the implementation it re-exports, published separately for internal/advanced use
(e.g. composing the CLI's commands programmatically).

## Usage

```sh
npx kalayaan login
npx kalayaan init my-site
cd my-site && npx kalayaan dev
```

See the [main project README](https://github.com/periabyte/kalayaan-cms#readme) for the full
quickstart, schema reference, and command list.
