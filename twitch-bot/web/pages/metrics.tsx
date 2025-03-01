import { getCurrentEpochDay, MetricDay } from '@common/types/metric-types';
import { ChevronDoubleDownIcon, ChevronDoubleUpIcon } from '@heroicons/react/outline';
import { ArrowDownIcon, ArrowUpIcon, MoonIcon, SunIcon as SunIconSolid } from '@heroicons/react/solid';
import clsx from 'clsx';
import { Title } from 'components/title';
import { AnimationTimer, quartic } from 'lib/animation';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { Col } from 'web/components/layout/col';
import { Row } from 'web/components/layout/row';

const gap6 = 'gap-2 lg:gap-6';

let animationFactor = 0;
const animTimer = new AnimationTimer();

function Canvas(props: { render: (g: CanvasRenderingContext2D, w: number, h: number) => void }) {
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
    {
      g.lineWidth = lineWidth;
      g.strokeStyle = colour;
      g.lineCap = 'round';
      g.beginPath();
      g.arc(w / 2, h / 2, radius, -Math.PI / 2, value * Math.PI * 2 - Math.PI / 2);
      g.stroke();
    }
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
    <div className="flex h-full w-full flex-col md:flex-row">
      <div className="relative aspect-square h-full">
        <Canvas render={render} />
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

function Tooltip() {
  const ref = useRef(null);
  useEffect(() => {
    console.log('Tooltip loaded');

    // ref.current.style.transform = `translate(${window.getMou.x}px,${e.y}px)`;

    const handler = (e: MouseEvent) => {
      if (!ref.current) {
        console.log('No ref');
        return;
      }
      const div = ref.current as HTMLDivElement;
      div.style.transform = `translate(${e.x}px,${e.y}px)`;
    };

    window.addEventListener('mousemove', handler);
    return () => window.removeEventListener('mousemove', handler);
  }, []);
  return (
    <div className="bg-canvas-0 border-ink-200 dark:border-ink-500 dark:bg-ink-900 fixed inset-0 z-50 max-h-fit max-w-fit whitespace-nowrap rounded-lg border p-2 text-base" ref={ref}>
      700 / 1000
    </div>
  );
}

function LineGraphEntry(props: { bg: string; name: string; fac: number }) {
  const { bg, fac, name } = props;
  const [tooltip, setTooltip] = useState(undefined);
  const onHover = () => {
    setTooltip(true);
  };
  const onExit = () => {
    setTooltip(false);
  };
  return (
    <div onMouseEnter={onHover} onMouseLeave={onExit}>
      {tooltip && <Tooltip />}
      {name}
      <div className="relative h-2">
        <div className={clsx('absolute z-10 h-2', bg)} style={{ width: 100 * fac + '%' }} />
        <div className={clsx('bg-ink-400 h-2 w-full opacity-40')} />
      </div>
    </div>
  );
}

function LineGraph() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <LineGraphEntry bg="bg-[#A495FC]" name="Unique users" fac={500 / 1000} />
      <LineGraphEntry bg="bg-[#5883F3]" name="Featured questions" fac={700 / 1000} />
      <LineGraphEntry bg="bg-[#58D0BC]" name="New bots" fac={100 / 1000} />
    </div>
  );
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
  return <Canvas render={render} />;
}

function Panel(props: { className?: string; children?: ReactNode; disabled?: boolean }) {
  const { className, children, disabled = false } = props;
  return (
    <div className={clsx('bg-canvas-0 dark:border-ink-500 dark:bg-ink-900 relative grow rounded-xl border p-2', className)}>
      {disabled && (
        <div
          className="text-ink-0 absolute left-0 top-0 z-50 flex h-full w-full items-center justify-center text-2xl opacity-50"
          style={{ background: 'repeating-linear-gradient(45deg,#606dbc,#606dbc 10px,#465298 10px,#465298 20px)' }}
        >
          Coming soon
        </div>
      )}
      {children}
    </div>
  );
}

function getPercentageChange(prev: number, current: number): number {
  return ((current - prev) / prev) * 100;
}

function PanelRaw(props: { name: string; days: { [day: number]: MetricDay }; propName: string }) {
  const { name, days, propName } = props;
  const today = days[0];
  const yesterday = days[1];

  if (!today || !yesterday) {
    // Not loaded data yet
    return (
      <Panel className="dark:bg-ink-900 max-w-lg !flex-[1_0_10rem]">
        <Col className="m-4">
          <Row className="whitespace-nowrap text-lg">
            {name}
            <div className="min-w-[1.5rem] flex-[1_0]"></div>
          </Row>
          <div className="min-h-[1.5em] pt-5 text-5xl"></div>
        </Col>
      </Panel>
    );
  }

  const MUCH_LOWER = <ChevronDoubleDownIcon className="h-4 w-4" />;
  const LOWER = <ArrowDownIcon className="h-4 w-4" />;
  const EQUAL = '=';
  const HIGHER = <ArrowUpIcon className="h-4 w-4" />;
  const MUCH_HIGHER = <ChevronDoubleUpIcon className="h-4 w-4" />;

  const value = today[propName] || 0;
  const prevValue = yesterday[propName] || 0;
  const percentChange = getPercentageChange(prevValue, value);

  let symbol: string | JSX.Element;
  if (value === prevValue) {
    symbol = EQUAL;
  } else if (!isFinite(percentChange)) {
    symbol = percentChange > 0 ? MUCH_HIGHER : MUCH_LOWER;
  } else if (percentChange > 0) {
    symbol = HIGHER;
  } else if (percentChange < 0) {
    symbol = LOWER;
  }

  let pString = Math.abs(percentChange).toFixed(1);
  if (pString.endsWith('0')) {
    pString = pString.substring(0, pString.length - 2);
  }

  return (
    <Panel className="dark:bg-ink-900 max-w-lg !flex-[1_0_10rem]">
      <Col className="m-4">
        <Row className="whitespace-nowrap text-lg">
          {name}
          <div className="min-w-[1.5rem] flex-[1_0]"></div>
          <div className={clsx([EQUAL, HIGHER, MUCH_HIGHER].includes(symbol) ? 'text-green-400' : 'text-red-400', 'flex flex-row items-center')}>
            {symbol}
            {isFinite(percentChange) && percentChange !== 0 && <p>{pString}%</p>}
          </div>
        </Row>
        <div className="min-h-[1.5em] pt-5 text-5xl">{value}</div>
      </Col>
    </Panel>
  );
}

function DarkModeSwitch() {
  const isDarkMode = localStorage.getItem('dark-mode') ? true : false;
  useEffect(() => {
    if (isDarkMode) {
      document.querySelector('html').classList.add('dark');
    }
  }, []);
  return (
    <div className="darkmodeslider flex">
      <SunIconSolid className="fill-ink-600 dark:fill-ink-50 mr-1 h-8 w-8" />
      <input
        type="checkbox"
        id="switch"
        defaultChecked={isDarkMode}
        onChange={(e) => {
          if (e.target.checked) {
            document.querySelector('html').classList.add('dark');
            localStorage.setItem('dark-mode', 'true');
          } else {
            document.querySelector('html').classList.remove('dark');
            localStorage.removeItem('dark-mode');
          }
        }}
      />
      <label htmlFor="switch">Toggle</label>
      <MoonIcon className="fill-ink-600 dark:fill-ink-50 ml-1 h-7 w-7" />
    </div>
  );
}

function MetricsPage() {
  const animateThemeChange = false;
  const [days, setDays] = useState<{ [day: number]: MetricDay }>({});
  useEffect(() => {
    const tempDays = {};

    const loadDay = async (daysInPast: number) => {
      const dayData = await fetch(`/metric-data?epochDay=${getCurrentEpochDay() - daysInPast}`).then((r) => r.json());
      tempDays[daysInPast] = dayData;
      setDays(days);
    };

    Promise.all([loadDay(0), loadDay(1), loadDay(2)]).then(() => setDays(tempDays));
  }, []);

  return (
    <>
      <Head>
        <title>Twitch Metrics</title>
      </Head>
      {typeof window !== 'undefined' && (
        <div
          className={clsx(
            'font-readex-pro animate dark:text-ink-0 bg-ink-50 text-ink-800 dark:bg-ink-600 min-h-screen w-full p-2 lg:p-20',
            animateThemeChange && '[&_*]:ease [&_*]:transition-[background-color,border-color] [&_*]:duration-300'
          )}
        >
          <div className="flex flex-row pb-1 text-6xl lg:pb-6">
            <Title text="Today's data" className="dark:text-ink-0 !mb-0 !mt-0 pl-1" />
            <div className="grow" />
            <DarkModeSwitch />
          </div>
          <Col className={clsx('grow', gap6)}>
            <div className={clsx('flex flex-row flex-wrap', gap6)}>
              <Panel className="relative min-h-fit min-w-fit flex-1 overflow-hidden !p-0" disabled>
                <CanvasDonut />
              </Panel>
              <Panel className="relative min-w-fit flex-1 overflow-hidden !p-0" disabled>
                <LineGraph />
              </Panel>
            </div>
            <Row className={clsx('flex-wrap justify-center', gap6)}>
              <PanelRaw name="Unique users" days={days} propName={'uniqueUserFeatures'} />
              <PanelRaw name="Featured questions" days={days} propName={'featuredQuestions'} />
              <PanelRaw name="New bots" days={days} propName={'newBots'} />
              <PanelRaw name="Twitch links" days={days} propName={'twitchLinks'} />
              <PanelRaw name="Commands used" days={days} propName={'commandsUsed'} />
              <PanelRaw name="Active traders" days={days} propName={'activeUsers'} />
            </Row>
            <Panel className="relative h-96  overflow-hidden !p-0" disabled>
              <CanvasChart />
            </Panel>
          </Col>
        </div>
      )}
    </>
  );
}

const DynamicComponentWithNoSSR = dynamic(() => Promise.resolve(MetricsPage), {
  ssr: false,
});

export default () => <DynamicComponentWithNoSSR />;
