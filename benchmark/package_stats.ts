import axios from "axios";
import * as child_process from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import simpleGit from "simple-git";

if (process.argv.length !== 3) {
  console.error("Usage: package_stats.js <package_dir>");
  console.error("  package_dir: Directory containing package.json");
  console.error();
  console.error("This script computes statistics for a package.");
  process.exit(1);
}
const pkgDir = process.argv[2];
const packageName = JSON.parse(
  fs.readFileSync(path.join(pkgDir, "package.json"), "utf8")
).name;

(async () => {
  const git = simpleGit(pkgDir);
  const weeklyDownloadsUrl = `https://api.npmjs.org/downloads/point/last-week/${packageName}`;
  let weeklyDownloads = 0;
  try {
    weeklyDownloads = (await axios.get(weeklyDownloadsUrl)).data.downloads;
  } catch (e) {
    console.warn(`Failed to get weekly downloads for ${packageName}: ${e}`);
    console.warn("Weekly downloads will be set to 0.");
  }
  const nyc = path.join(__dirname, "..", "node_modules", ".bin", "nyc");
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "package_stats"));
  child_process.execFileSync(
    nyc,
    [
      "--reporter=json-summary",
      `--report-dir=${tmpdir}`,
      `--temp-dir=${tmpdir}`,
      "node",
      "-e",
      'require(".")',
    ],
    { cwd: pkgDir }
  );
  const coverageFromLoading = JSON.parse(
    fs.readFileSync(path.join(tmpdir, "coverage-summary.json"), "utf8")
  ).total;
  const loc = coverageFromLoading.lines.total;
  const repository = (await git.listRemote(["--get-url"])).trim();
  const sha = (await git.revparse(["HEAD"])).trim();
  console.log(
    JSON.stringify(
      {
        packageName,
        repository,
        sha,
        loc,
        weeklyDownloads,
        coverageFromLoading,
      },
      null,
      2
    )
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
