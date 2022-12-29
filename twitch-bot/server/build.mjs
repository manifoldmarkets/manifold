import { execSync, spawn } from 'child_process';
import esbuild from 'esbuild';

const colors = {
  Reset: '\x1b[0m',
  Bright: '\x1b[1m',
  Dim: '\x1b[2m',
  Underscore: '\x1b[4m',
  Blink: '\x1b[5m',
  Reverse: '\x1b[7m',
  Hidden: '\x1b[8m',
  FgBlack: '\x1b[30m',
  FgRed: '\x1b[31m',
  FgGreen: '\x1b[32m',
  FgYellow: '\x1b[33m',
  FgBlue: '\x1b[34m',
  FgMagenta: '\x1b[35m',
  FgCyan: '\x1b[36m',
  FgWhite: '\x1b[37m',
  BgBlack: '\x1b[40m',
  BgRed: '\x1b[41m',
  BgGreen: '\x1b[42m',
  BgYellow: '\x1b[43m',
  BgBlue: '\x1b[44m',
  BgMagenta: '\x1b[45m',
  BgCyan: '\x1b[46m',
  BgWhite: '\x1b[47m',
};

const config = {
  WAIT_FOR_DEBUGGER: {
    tagShort: '-w',
    tagLong: '--wait',
    value: false,
  },
  BUILD_ONLY: {
    tagShort: '-b',
    tagLong: '--build-only',
    value: false,
  },
  NO_COLORS: {
    tagShort: '-n',
    tagLong: '--no-colors',
    value: false,
  },
  BUILD_FILE: {
    value: 'dist/out.js',
  },
};

function printWithColor(msg, color) {
  let s = msg;
  if (!config.NO_COLORS.value) {
    s = color + s + colors.Reset;
  }
  console.log(s);
}

const args = process.argv.slice(2);
for (const arg of args) {
  let argValid = false;
  for (const c in config) {
    const configItem = config[c];
    if ((configItem.tagShort && configItem.tagShort === arg) || (configItem.tagLong && configItem.tagLong === arg)) {
      configItem.value = true;
      argValid = true;
    }
  }
  if (!argValid) {
    console.error(`Invalid arg "${arg}".`);
    process.exit(1);
  }
}

let currentlyRunningProc = undefined;
function cleanupPreviousProc() {
  if (currentlyRunningProc) {
    currentlyRunningProc.kill();
    currentlyRunningProc = undefined;
  }
}

function startProc() {
  const newProc = spawn('node', [config.WAIT_FOR_DEBUGGER.value ? '--inspect-brk' : '--inspect', '--enable-source-maps', config.BUILD_FILE.value], { stdio: 'inherit' });
  currentlyRunningProc = newProc;
}

function doTSCCheck() {
  console.log('Doing TSC check...');
  try {
    execSync('npx tsc', { stdio: 'inherit', shell: true });
    console.log('TSC check complete.');
  } catch (e) {
    printWithColor('TSC check failed.', colors.FgRed);
    process.exit(1);
  }
}

if (config.BUILD_ONLY.value) {
  doTSCCheck();
}

esbuild
  .build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    outfile: config.BUILD_FILE.value,
    sourcemap: true,
    platform: 'node',
    target: 'node16',
    minify: true,
    ignoreAnnotations: true,
    treeShaking: true,
    logLevel: config.BUILD_ONLY.value ? 'info' : 'silent',
    define: {
      'process.env.__BUILD_ID__': JSON.stringify(new Date().toISOString()),
    },
    watch: !config.BUILD_ONLY.value && {
      onRebuild: (error) => {
        cleanupPreviousProc();
        if (error) {
          console.error(error);
          return;
        }
        console.log('============================= REBUILD =============================');
        startProc();
      },
    },
  })
  .then((r) => {
    if (r) {
      if (config.BUILD_ONLY.value) {
        // printWithColor(`Build successful in ${process.uptime().toFixed(1)}s.`, colors.FgGreen);
      } else {
        startProc();
      }
    }
  })
  .catch(() => {});
