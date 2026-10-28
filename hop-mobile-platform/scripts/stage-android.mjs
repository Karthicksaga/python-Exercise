import { copyFileSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
const { APP, BUILD_TYPE, RUNNER_TEMP, GITHUB_SHA, HOP_BUILD_ID } = process.env;
if (!['rider', 'captain'].includes(APP) || !['debug', 'release'].includes(BUILD_TYPE) || !/^[\w-]+$/.test(HOP_BUILD_ID || '')) throw new Error('Invalid artifact parameters');
const dir = path.join(RUNNER_TEMP, 'hop-artifacts');
mkdirSync(dir, { recursive: true });
const prefix = `hop-${APP}-${BUILD_TYPE}-${HOP_BUILD_ID}`;
const outputs = [[`apk/${BUILD_TYPE}/app-${BUILD_TYPE}.apk`, 'apk']];
if (BUILD_TYPE === 'release') outputs.push(['bundle/release/app-release.aab', 'aab']);
const checksums = [];
for (const [source, extension] of outputs) {
  const file = `${prefix}.${extension}`;
  const target = path.join(dir, file);
  copyFileSync(`mobile/${APP}/android/app/build/outputs/${source}`, target);
  checksums.push(`${createHash('sha256').update(readFileSync(target)).digest('hex')}  ${file}`);
}
writeFileSync(path.join(dir, 'SHA256SUMS'), checksums.join('\n') + '\n');
writeFileSync(path.join(dir, 'build.json'), JSON.stringify({ app: APP, packageId: `com.hop.${APP}`, buildType: BUILD_TYPE, commit: GITHUB_SHA, buildId: HOP_BUILD_ID }, null, 2));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Hop ${APP} (${BUILD_TYPE})\n\nAPK ready for Android installation. Download the **hop-${APP}-${BUILD_TYPE}** artifact from this run and extract it. AAB files are for store distribution, not direct installation.\n\nCommit: ${GITHUB_SHA}\n\n`);
