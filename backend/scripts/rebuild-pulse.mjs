// rebuild-pulse.mjs: `pulse:rebuild` on a cloud deployment, which recounts every project's
// pulse from the events (convex/pulse.ts).
//
//   vp run @cairn/backend#rebuild:pulse -- [<name>]
//
// Run it once on each cloud deployment after the push that adds the `pulse` table, since
// the events written before it are not in it; after that every event is counted as it is
// written, and a rerun only recounts the same. The local deployment needs no script:
// `node scripts/local.mjs run pulse:rebuild` from `backend/`.
//
// The deployment is the one named, from `backend/.env.cloud.<name>.local`, or the only one
// the checkout keeps (clouds.mjs), bound by `CONVEX_DEPLOYMENT` in convex's environment,
// the way `secret.mjs` reaches it. convex 1.46 still writes whatever it talked to into
// `.env.local`, so the script holds that file's bytes and puts them back when it exits,
// however it exits. What convex prints, the events counted and the rows written, is
// written through as it said it.
import { pickClouds } from "./clouds.mjs";
import { convexSync, holdEnvLocal } from "./run-convex.mjs";

/** The cloud deployment picked, and `pulse:rebuild` run against it; convex's exit status. */
function main(argv) {
  // vp hands on the `--` that separates its own flags from the script's.
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  if (args.length > 1) {
    process.stderr.write("usage: vp run @cairn/backend#rebuild:pulse -- [<name>]\n");
    return 2;
  }
  const [name] = args;

  const picked = pickClouds({ name, one: true });
  if (picked.targets === undefined) {
    process.stderr.write(`${picked.message}\n`);
    return picked.code;
  }
  const [t] = picked.targets;

  const restore = holdEnvLocal();
  process.on("exit", restore);
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => process.exit(1));
  const result = convexSync(["run", "pulse:rebuild"], {
    env: { ...process.env, CONVEX_DEPLOYMENT: t.deployment },
  });
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  if (result.error) process.stderr.write(`${result.error.message}\n`);
  return result.status ?? 1;
}

process.exitCode = main(process.argv.slice(2));
