// run-cloud.mjs: one internal function run on a cloud deployment, for the one-offs a push
// leaves behind: `pulse:rebuild`, which recounts every project's pulse from the events
// (convex/pulse.ts), and `issueText:move`, which moves every issue's long text into its
// own table (convex/issueText.ts).
//
//   vp run -F @cairn/backend run:cloud -- <module:function> [<name>]
//   vp run -F @cairn/backend run:cloud -- pulse:rebuild cairn
//
// Each is run once on each cloud deployment after the push that adds its table, and a
// rerun only does the same again. The local deployment needs no script:
// `node scripts/local.mjs run <module:function>` from `backend/`.
//
// The deployment is the one named, from `backend/.env.cloud.<name>.local`, or the only one
// the checkout keeps (clouds.mjs), bound by `CONVEX_DEPLOYMENT` in convex's environment,
// the way `secret.mjs` reaches it. convex 1.46 still writes whatever it talked to into
// `.env.local`, so the script holds that file's bytes and puts them back when it exits,
// however it exits. What convex prints, the function's answer, is written through as it
// said it.
import { pickClouds } from "./clouds.mjs";
import { convexSync, holdEnvLocal } from "./run-convex.mjs";

/** The cloud deployment picked, and the function run against it; convex's exit status. */
function main(argv) {
  // vp hands on the `--` that separates its own flags from the script's.
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  if (args.length < 1 || args.length > 2) {
    process.stderr.write(
      "usage: vp run -F @cairn/backend run:cloud -- <module:function> [<name>]\n",
    );
    return 2;
  }
  const [fn, name] = args;

  const picked = pickClouds({ name, one: true });
  if (picked.targets === undefined) {
    process.stderr.write(`${picked.message}\n`);
    return picked.code;
  }
  const [t] = picked.targets;

  const restore = holdEnvLocal();
  process.on("exit", restore);
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => process.exit(1));
  const result = convexSync(["run", fn], {
    env: { ...process.env, CONVEX_DEPLOYMENT: t.deployment },
  });
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  if (result.error) process.stderr.write(`${result.error.message}\n`);
  return result.status ?? 1;
}

process.exitCode = main(process.argv.slice(2));
