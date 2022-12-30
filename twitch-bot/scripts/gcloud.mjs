import { spawnSync } from 'child_process';

const gcloudArgs = process.argv.splice(2);
const newArgs = [];
for (let arg of gcloudArgs) {
  arg = arg.replaceAll(/[\n\r\t]/g, '');
  if (arg.includes(' ')) {
    newArgs.push(`"${arg}"`);
  } else {
    newArgs.push(arg);
  }
}
spawnSync('gcloud', newArgs, { shell: true, stdio: 'inherit' });
