import { getCurrentEpochDay, MetricDay } from '@common/types/metric-types';
import { ChevronDoubleUpIcon } from '@heroicons/react/outline';
import { ArrowDownIcon, ArrowUpIcon, MoonIcon, SunIcon as SunIconSolid, SwitchHorizontalIcon } from '@heroicons/react/solid';
import clsx from 'clsx';
import { AnimationTimer, quartic } from 'lib/animation';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { Col } from 'web/components/layout/col';
import { Row } from 'web/components/layout/row';

// const days: MetricDay[] = [];

const r = (upper = 2000) => Math.floor(Math.random() * upper);

const gap6 = 'gap-2 lg:gap-6';

let animationFactor = 0;
const animTimer = new AnimationTimer();

function Cavnas(props: { render: (g: CanvasRenderingContext2D, w: number, h: number) => void }) {
  const ref = useRef(null);
  const pr = useRef(window.devicePixelRatio);
  useEffect(() => {
    const c = ref.current as HTMLCanvasElement;

    const resize = () => {
      pr.current = window.devicePixelRatio;
      c.width = c.parentElement.clientWidth * pr.current;
      c.height = c.parentElement.clientHeight * pr.current;
    };
    window.addEventListener('resize', resize);
    resize();

    const render = () => {
      const g = c.getContext('2d');
      const w = c.width / pr.current;
      const h = c.height / pr.current;

      g.scale(pr.current, pr.current);
      props.render(g, w, h);
      g.resetTransform();

      window.requestAnimationFrame(render);
    };
    window.requestAnimationFrame(render);

    return () => {
      //TODO: Cleanup
      console.debug('Canvas unmounted');
    };
  }, []);
  return <canvas ref={ref} id="canvas" className="absolute h-full w-full"></canvas>;
}

function KeyItem(props: { bg: string; name: string }) {
  const { bg, name } = props;
  return (
    <div className="flex flex-row items-center text-base">
      <div className={clsx('mr-2 h-6 w-6 rounded-full', bg)} />
      {name}
    </div>
  );
}

function CanvasDonut() {

  const drawDonut = (g: CanvasRenderingContext2D, w: number, h: number, lineWidth: number, colour: string, radius: number, value: number) => {
    g.save();
    g.lineWidth = lineWidth;

    // g.strokeStyle = '#eee';
    // g.filter = 'blur(5px)';
    // g.beginPath();
    // g.arc(w / 2 + 5, h / 2 + 5, radius, 0, 0.5 * Math.PI * Math.sin(t++ / 50) + Math.PI, false);
    // g.stroke();
    // g.filter = 'none';

    g.strokeStyle = colour;

    g.lineCap = 'round';
    g.beginPath();
    g.arc(w / 2, h / 2, radius, -Math.PI / 2, value * Math.PI * 2 - Math.PI / 2);
    g.stroke();

    // g.lineCap = 'butt';
    // g.beginPath();
    // g.arc(w / 2, h / 2, radius, -Math.PI / 2, -Math.PI / 2 + 0.2);
    // g.stroke();

    g.restore();
  };

  const render = (g: CanvasRenderingContext2D, w: number, h: number) => {
    g.clearRect(0, 0, w, h);

    animationFactor = quartic(0, 0.9, animTimer.getTime_s(1));

    const lw = Math.min(25, w * 0.08);
    const lwp = lw + 4;
    const ir = Math.min(w, h) / 6;
    drawDonut(g, w, h, lw, '#A495FC', ir + 2 * lwp, animationFactor);
    drawDonut(g, w, h, lw, '#5883F3', ir + lwp, animationFactor * 0.8);
    drawDonut(g, w, h, lw, '#1fb0aE', ir, animationFactor * 0.4);

  };
  return (
    <div className="flex w-full flex-col md:flex-row h-full">
      <div className="relative h-full aspect-square">
        <Cavnas render={render} />
      </div>
      <div className="m-6 flex items-center">
        <div className="flex max-h-fit flex-col gap-4 rounded-xl border p-6">
          <KeyItem bg="bg-[#A495FC]" name="Users with linked Twitch accounts" />
          <KeyItem bg="bg-[#5883F3]" name="Users who placed a unique bet" />
          <KeyItem bg="bg-[#58D0BC]" name="Users who placed a unique bet" />
        </div>
      </div>
    </div>
  );
}

/* eslint-disable-next-line */
function CanvasLineGraph() {
  const drawLine = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, v: number, colour: string) => {
    g.save();

    g.fillStyle = colour;
    g.beginPath();
    g.rect(x, y, w * v, h);
    g.fill();

    g.restore();
  };

  const render = (g: CanvasRenderingContext2D, w: number, h: number) => {
    g.clearRect(0, 0, w, h);

    const lw = 10;
    drawLine(g, 20, 20, w - 40, lw, animationFactor, '#A495FC');
    drawLine(g, 20, 60, w - 40, lw, animationFactor * 0.7, '#5883F3');
    drawLine(g, 20, 100, w - 40, lw, animationFactor * 0.3, '#58D0BC');
  };
  return <Cavnas render={render} />;
}

function Tooltip() {
  const ref = useRef(null);
  useEffect(() => {
    console.log("Tooltip loaded");

    // ref.current.style.transform = `translate(${window.getMou.x}px,${e.y}px)`;

    const handler = (e: MouseEvent) => {
      if (!ref.current) {
        console.log("No ref");
        return;
      };
      const div = ref.current as HTMLDivElement;
      div.style.transform = `translate(${e.x}px,${e.y}px)`;
    }

    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, []);
  return <div className="fixed inset-0 border border-slate-200 dark:border-slate-500 max-w-fit max-h-fit bg-white dark:bg-slate-900 z-50 rounded-lg text-base p-2 whitespace-nowrap" ref={ref}>
    700 / 1000
  </div>
}

function LineGraphEntry(props: { bg: string, name: string, fac: number }) {
  const { bg, fac, name } = props;
  const [tooltip, setTooltip] = useState(undefined);
  const onHover = () => {
    setTooltip(true);
  }
  const onExit = () => {
    setTooltip(false);
  }
  return <div onMouseEnter={onHover} onMouseLeave={onExit}>
    {tooltip && <Tooltip />}
    {name}
    <div className="h-2 relative">
      <div className={clsx("absolute h-2 z-10", bg)} style={{ width: (100 * fac) + "%" }} />
      <div className={clsx("w-full bg-gray-400 h-2 opacity-40")} />
    </div>
  </div>
}

function LineGraph() {
  return <div className="flex flex-col p-6 gap-6">
    {/* <LineGraphEntry bg="bg-[#A495FC]" name="Unique users" fac={day.uniqueUserFeatures / 1000} /> */}
    {/* <LineGraphEntry bg="bg-[#5883F3]" name="Featured questions" fac={day.featuredQuestions / 1000} /> */}
    {/* <LineGraphEntry bg="bg-[#58D0BC]" name="New bots" fac={day.newBots / 1000} /> */}
  </div>
}

function gradient(a: number[], b: number[]) {
  return (b[1] - a[1]) / (b[0] - a[0]);
}

function CanvasChart() {
  const data: number[][][] = [];

  for (let i = 0; i < 3; i++) {
    const points: number[][] = [];
    for (let j = 0; j < 15; j++) {
      points.push([j * 50, Math.random() * 400]);
    }
    data.push(points);
  }

  const render = (g: CanvasRenderingContext2D, w: number, h: number) => {
    g.clearRect(0, 0, w, h);

    const lw = 5;

    const grd = g.createLinearGradient(0, -200, 0, h);
    grd.addColorStop(0, 'rgba(187,108,214,0.5)');
    grd.addColorStop(1, 'rgba(164,149,252,0.5)');

    g.fillStyle = grd;
    g.lineWidth = lw;

    const drawLine = (points: number[][]) => {
      const sx = w / points[points.length - 1][0];

      g.save();
      g.translate(0, h * (1 - animationFactor));
      g.scale(1, animationFactor);
      g.beginPath();
      g.moveTo(points[0][0], points[0][1]);

      let m = 0;
      let dx1 = 0;
      let dy1 = 0;

      const f = 0.3;
      const t = 1;

      let preP = points[0];

      for (let i = 1; i < points.length; i++) {
        const curP = points[i];
        const nexP = points[i + 1];
        let dx2: number, dy2: number;
        if (nexP) {
          m = gradient(preP, nexP);
          dx2 = (nexP[0] - curP[0]) * -f;
          dy2 = dx2 * m * t;
        } else {
          dx2 = 0;
          dy2 = 0;
        }

        g.bezierCurveTo(sx * (preP[0] - dx1), preP[1] - dy1, sx * (curP[0] + dx2), curP[1] + dy2, sx * curP[0], curP[1]);

        dx1 = dx2;
        dy1 = dy2;
        preP = curP;
      }
      g.lineTo(w, h);
      g.lineTo(0, h);
      g.fill();
      g.restore();
    };

    for (const line of data) {
      drawLine(line);
    }
  };
  return <Cavnas render={render} />;
}

function Panel(props: { className?: string; children?: ReactNode; disabled?: boolean }) {
  const { className, children, disabled = false } = props;
  return <div className={clsx('relative grow rounded-xl border bg-white p-2 dark:border-slate-500 dark:bg-slate-900', className)}>
    {disabled && <div className="absolute top-0 left-0 z-50 w-full h-full opacity-50 flex items-center justify-center text-white text-2xl" style={{ background: "repeating-linear-gradient(45deg,#606dbc,#606dbc 10px,#465298 10px,#465298 20px)" }}>Coming soon</div>}
    {children}
  </div>;
}

function PanelRaw(props: { name: string; value: number; percentChange: number }) {
  const { name, value, percentChange } = props;
  let pString = Math.abs(percentChange).toFixed(1);
  if (pString.endsWith("0")) {
    pString = pString.substring(0, pString.length - 2);
  }
  return (
    <Panel className="max-w-lg !flex-[1_0_10rem] dark:bg-slate-900">
      <Col className="m-4">
        <Row className="whitespace-nowrap text-lg">
          {name}
          <div className="min-w-[1.5rem] flex-[1_0]"></div>
          <div className={clsx(percentChange >= 0 ? 'text-green-400' : 'text-red-400', 'flex flex-row items-center')}>
            {!isFinite(percentChange) ? <ChevronDoubleUpIcon className="h-4 w-4" /> : percentChange > 0 ? <ArrowUpIcon className="h-4 w-4" /> : percentChange === 0 ? <p>=</p> : <ArrowDownIcon className="h-4 w-4" />}
            {isFinite(percentChange) && percentChange !== 0 && <p>{pString}%</p>}
          </div>
        </Row>
        <div className="pt-5 text-5xl">{value}</div>
      </Col>
    </Panel>
  );
}

function DarkModeSwitch() {
  const isDarkMode = localStorage.getItem("dark-mode") ? true : false;
  useEffect(() => {
    if (isDarkMode) {
      document.querySelector('html').classList.add('dark');
    }
  }, []);
  return (
    <>
      <SunIconSolid className="mr-1 h-8 w-8 fill-slate-600 dark:fill-slate-50" />
      <input
        type="checkbox"
        id="switch"
        defaultChecked={isDarkMode}
        onChange={(e) => {
          if (e.target.checked) {
            document.querySelector('html').classList.add('dark');
            localStorage.setItem("dark-mode", "true");
          } else {
            document.querySelector('html').classList.remove('dark');
            localStorage.removeItem("dark-mode");
          }
        }}
      />
      <label htmlFor="switch">Toggle</label>
      <MoonIcon className="ml-1 h-7 w-7 fill-slate-600 dark:fill-slate-50" />
    </>
  );
}

function MetricsPage() {
  const animateThemeChange = false;
  const [prevDay, setPrevDay] = useState<MetricDay>(null);
  const [day, setData] = useState<MetricDay>(null);
  useEffect(() => {
    fetch(`/metric-data?epochDay=${getCurrentEpochDay()}`).then(r => r.json()).then((r) => setData(r));
    fetch(`/metric-data?epochDay=${getCurrentEpochDay() - 1}`).then(r => r.json()).then((r) => setPrevDay(r));
  }, []);
  const getP = (param: string): number => {
    if (!prevDay) return NaN;
    if (day[param] === prevDay[param]) return 0;
    return (day[param] - prevDay[param]) / prevDay[param] * 100;
  }
  return (
    <>
      <Head>
        <title>Twitch Metrics</title>
      </Head>
      {typeof window !== "undefined" && <div
        className={clsx(
          'font-readex-pro animate min-h-screen w-full bg-slate-50 p-2 dark:bg-slate-600 lg:p-20 text-slate-800 dark:text-white',
          animateThemeChange && '[&_*]:ease [&_*]:transition-[background-color,border-color] [&_*]:duration-300'
        )}
      >
        <div className="flex flex-row pb-6">
          <div className="grow" />
          <DarkModeSwitch />
        </div>
        <Col className={clsx('grow', gap6)}>
          <div className={clsx('flex flex-row flex-wrap', gap6)}>
            <Panel className="relative overflow-hidden !p-0 flex-1 min-w-fit min-h-fit" disabled>
              <CanvasDonut />
            </Panel>
            <Panel className="relative overflow-hidden !p-0 flex-1 min-w-fit" disabled>
              <LineGraph />
            </Panel>
          </div>
          <Row className={clsx('flex-wrap justify-center', gap6)}>
            {day &&
              <>
                <PanelRaw name="Unique users" value={day.uniqueUserFeatures} percentChange={getP("uniqueUserFeatures")} />
                <PanelRaw name="Featured questions" value={day.featuredQuestions} percentChange={getP("featuredQuestions")} />
                <PanelRaw name="New bots" value={day.newBots} percentChange={getP("newBots")} />
                <PanelRaw name="Twitch links" value={day.twitchLinks} percentChange={getP("twitchLinks")} />
                <PanelRaw name="Commands used" value={day.commandsUsed} percentChange={getP("commandsUsed")} />
                <PanelRaw name="Active users" value={day.activeUsers} percentChange={getP("activeUsers")} />
              </>
            }
          </Row>
          <Panel className="relative h-96  overflow-hidden !p-0" disabled>
            <CanvasChart />
          </Panel>
        </Col>
      </div>}
    </>
  );
};

const DynamicComponentWithNoSSR = dynamic(() => Promise.resolve(MetricsPage), {
  ssr: false
})

export default () => <DynamicComponentWithNoSSR />