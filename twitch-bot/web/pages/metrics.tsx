import clsx from 'clsx';
import Head from 'next/head';
import { Col } from 'web/components/layout/col';
import { Row } from 'web/components/layout/row';
import { ReactNode, useEffect, useRef } from 'react';
import { ArrowDownIcon, ArrowUpIcon } from '@heroicons/react/solid';
import { SunIcon } from '@heroicons/react/outline';
import { SunIcon as SunIconSolid } from '@heroicons/react/solid';

type Day = {
  uniqueUsers: number;
  featuredQuestions: number;
  newBots: number;
  twitchLinks: number;
  commandsUsed: number;
  activeUsers: number;
};

const days: Day[] = [];

const gap6 = 'gap-2 md:gap-6';

// let temp = 0;

const r = (upper = 2000) => Math.floor(Math.random() * upper);
for (let i = 0; i < 20; i++) {
  days.push({ activeUsers: r(2000), commandsUsed: r(10000), featuredQuestions: r(200), newBots: r(10), twitchLinks: r(50), uniqueUsers: r(100) });
}

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

    console.log(window.devicePixelRatio);

    const render = () => {
      const g = c.getContext('2d');
      const w = c.width / pr.current;
      const h = c.height / pr.current;

      g.scale(pr.current, pr.current);
      props.render(g, w, h);
      g.resetTransform();

      // if (temp++ < 1000)
      window.requestAnimationFrame(render);
    };
    window.requestAnimationFrame(render);

    return () => {
      //TODO: Cleanup
      console.log('Died');
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

  let v = 0;
  const render = (g: CanvasRenderingContext2D, w: number, h: number) => {
    g.clearRect(0, 0, w, h);

    v += (0.9 - v) * 0.02;

    const lw = Math.min(25, w * 0.1);
    const lwp = lw + 4;
    const ir = Math.min(w, h) / 6;
    drawDonut(g, w, h, lw, '#A495FC', ir + 2 * lwp, v);
    drawDonut(g, w, h, lw, '#5883F3', ir + lwp, v * 0.8);
    drawDonut(g, w, h, lw, '#58D0BC', ir, v * 0.4);
  };
  return (
    <div className="flex w-full flex-col md:flex-row">
      <div className="relative h-full min-h-[20rem] grow ">
        <Cavnas render={render} />
      </div>
      <div className="m-6 flex items-center text-slate-800 dark:text-slate-50">
        <div className="flex max-h-fit flex-col gap-4 rounded-xl border p-6">
          <KeyItem bg="bg-[#A495FC]" name="Users with linked Twitch accounts" />
          <KeyItem bg="bg-[#5883F3]" name="Users who placed a unique bet" />
          <KeyItem bg="bg-[#58D0BC]" name="Users who placed a unique bet" />
        </div>
      </div>
    </div>
  );
}

function CanvasLineGraph() {
  const drawLine = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, v: number, colour: string) => {
    g.save();

    // g.fillRect(0, 0, w, lineWidth);

    g.fillStyle = colour;
    g.beginPath();
    g.rect(x, y, w * v, h);
    g.fill();

    g.restore();
  };

  let v = 0;
  const render = (g: CanvasRenderingContext2D, w: number, h: number) => {
    g.clearRect(0, 0, w, h);

    v += (0.9 - v) * 0.02;

    const lw = 10;
    drawLine(g, 20, 20, w - 40, lw, v, '#A495FC');
    drawLine(g, 20, 60, w - 40, lw, v * 0.7, '#5883F3');
    drawLine(g, 20, 100, w - 40, lw, v * 0.3, '#58D0BC');
  };
  return <Cavnas render={render} />;
}

function gradient(a: number[], b: number[]) {
  return (b[1] - a[1]) / (b[0] - a[0]);
}

function CanvasChart() {
  let v = 0;

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

    v += (1 - v) * 0.02;

    const lw = 5;

    const grd = g.createLinearGradient(0, -200, 0, h);
    grd.addColorStop(0, 'rgba(187,108,214,0.5)');
    grd.addColorStop(1, 'rgba(164,149,252,0.5)');

    g.fillStyle = grd;
    g.lineWidth = lw;

    const drawLine = (points: number[][]) => {
      const sx = w / points[points.length - 1][0];

      g.save();
      g.translate(0, h * (1 - v));
      g.scale(1, v);
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

function Panel(props: { className?: string; children?: ReactNode }) {
  const { className, children } = props;
  return <div className={clsx('grow rounded-xl border bg-white p-2 text-xl text-white dark:border-slate-500 dark:bg-slate-900', className)}>{children}</div>;
}

function PanelRaw(props: { name: string; value: number; percentChange: number }) {
  const { name, value, percentChange } = props;
  return (
    <Panel className="max-w-lg !flex-[1_0_10rem] dark:bg-slate-900">
      <Col className="m-4 text-slate-800 dark:text-white">
        <Row className="whitespace-nowrap text-lg">
          {name}
          <div className="min-w-[1.5rem] flex-[1_0]"></div>
          <div className={clsx(percentChange > 0 ? 'text-green-400' : 'text-red-400', 'flex flex-row items-center')}>
            {percentChange > 0 ? <ArrowUpIcon className="h-4 w-4" /> : <ArrowDownIcon className="h-4 w-4" />}
            <p>{Math.abs(percentChange)}%</p>
          </div>
        </Row>
        <div className="pt-5 text-5xl">{value}</div>
      </Col>
    </Panel>
  );
}

function DarkModeSwitch() {
  return (
    <>
      <SunIcon className="mr-1 h-8 w-8 stroke-slate-600 dark:stroke-slate-50" />
      <input
        type="checkbox"
        id="switch"
        onChange={(e) => {
          if (e.target.checked) {
            document.querySelector('html').classList.add('dark');
          } else {
            document.querySelector('html').classList.remove('dark');
          }
        }}
      />
      <label htmlFor="switch">Toggle</label>
      <SunIconSolid className="ml-1 h-8 w-8 fill-slate-600 dark:fill-slate-50" />
    </>
  );
}

export default () => {
  const day = days[days.length - 1];
  const animateThemeChange = false;
  return (
    <>
      <Head>
        <title>Twitch Metrics</title>
      </Head>
      {typeof window !== "undefined" && <div
        className={clsx(
          'font-readex-pro animate min-h-screen w-screen bg-slate-50 p-2 dark:bg-slate-600 lg:p-20',
          animateThemeChange && '[&_*]:ease [&_*]:transition-[background-color] [&_*]:duration-200'
        )}
      >
        <div className="flex flex-row pb-6">
          <div className="grow" />
          <DarkModeSwitch />
        </div>
        <Col className={clsx('grow', gap6)}>
          <div className={clsx('flex flex-col md:flex-row', gap6)}>
            <Panel className="relative overflow-hidden !p-0">
              <CanvasDonut />
            </Panel>
            <Panel className="relative h-96 overflow-hidden !p-0">
              <CanvasLineGraph />
            </Panel>
          </div>
          <Row className={clsx('flex-wrap justify-center', gap6)}>
            <PanelRaw name="Unique users" value={day.uniqueUsers} percentChange={-10.4} />
            <PanelRaw name="Featured questions" value={day.featuredQuestions} percentChange={12.1} />
            <PanelRaw name="New bots" value={day.newBots} percentChange={r()} />
            <PanelRaw name="Twitch links" value={day.twitchLinks} percentChange={r()} />
            <PanelRaw name="Commands used" value={day.commandsUsed} percentChange={r()} />
            <PanelRaw name="Active users" value={day.activeUsers} percentChange={r()} />
          </Row>
          <Panel className="relative h-96  overflow-hidden !p-0">
            <CanvasChart />
          </Panel>
        </Col>
      </div>}
    </>
  );
};
