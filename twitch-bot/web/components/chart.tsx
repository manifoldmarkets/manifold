class Point {
  x: number;
  y: number;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
}

export default class Chart {
  readonly canvasElement: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;

  data: Point[];

  constructor(canvasElement: HTMLCanvasElement) {
    this.canvasElement = canvasElement;

    this.ctx = this.canvasElement.getContext('2d');
    if (!this.ctx) {
      console.error('Failed to obtain render context for chart. Browser may not be compatible.');
    }

    window.addEventListener('resize', () => {
      this.resize();
    });
    this.resize();

    const animationFrame = () => {
      this.render();
      window.requestAnimationFrame(animationFrame);
    };
    window.requestAnimationFrame(animationFrame);

    // Hopefully this isn't needed. Patch to resolve any edge-cases where chart resize is not triggered by other components changing size:
    setInterval(() => {
      this.resize();
    }, 1000);

    this.data = this.produceData();
  }

  resize() {
    const pixelRatio = 1.0; //window.devicePixelRatio;
    const r = this.canvasElement.parentElement.getBoundingClientRect();
    this.canvasElement.width = r.width * pixelRatio;
    this.canvasElement.height = r.height * pixelRatio;
  }

  produceData(): Point[] {
    const points = [] as Point[];
    let x = 0;
    for (let i = 0; i < 30; i++) {
      const y = Math.random() * 100;
      points.push(new Point(x, y));
      x += Math.random() * 20 + 5;
      points.push(new Point(x, y));
    }
    return points;
  }

  render() {
    const ctx = this.ctx;

    const fontSize_px = Math.min(window.innerWidth * 0.045 * 0.7, 30); // To match HTML/CSS sizing of text
    ctx.font = fontSize_px + 'px Readex Pro';

    const padding_px = 10;
    const xAxisHeight_px = (ctx.measureText('I').fontBoundingBoxAscent + ctx.measureText('I').fontBoundingBoxDescent) >> 0;
    const yAxisWidth_px = ctx.measureText('100%').width >> 0;
    const numXAxisLines = 6;
    const numYAxisLines = 3;
    const chartXTime_minutes = 10;
    const renderGridLines = false;

    const canvasWidth_px = this.canvasElement.width >> 0;
    const canvasHeight_px = this.canvasElement.height >> 0;
    const numDataPoints = this.data.length;
    const graphWidth_px = canvasWidth_px - padding_px * 2 - yAxisWidth_px;
    const graphHeight_px = canvasHeight_px - padding_px * 2 - xAxisHeight_px;

    ctx.clearRect(0, 0, canvasWidth_px, canvasHeight_px);

    const grd = this.ctx.createLinearGradient(0, 0, 0, canvasHeight_px);
    grd.addColorStop(0, 'rgba(73, 201, 159, 0.8)');
    grd.addColorStop(1, 'rgba(73, 201, 159, 0.0)');

    const maxX = Date.now();
    const minX = maxX - chartXTime_minutes * 60 * 1000;

    ctx.translate(padding_px + 0.5, padding_px + 0.5);
    {
      // Draw Y-axis labels:
      ctx.fillStyle = '#FFF';
      for (let i = 0; i < numYAxisLines; i++) {
        const y = graphHeight_px - ((0.5 + (i * graphHeight_px) / (numYAxisLines - 1)) >> 0);
        const labelText = `${(i * (100 / (numYAxisLines - 1))).toFixed(0)}%`;
        const m = ctx.measureText(labelText);
        ctx.fillText(labelText, yAxisWidth_px - m.width - 5, y + (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) * 0.5);
      }

      ctx.translate(yAxisWidth_px, 0);

      // Draw X-axis labels:
      ctx.translate(0, graphHeight_px);
      for (let i = 0; i < numXAxisLines; i++) {
        const x = ((i * graphWidth_px) / (numXAxisLines - 1)) >> 0;
        let labelText = ((numXAxisLines - 1 - i) * chartXTime_minutes) / (numXAxisLines - 1) + 'm';
        if (i == numXAxisLines - 1) {
          labelText = 'now';
          const m = ctx.measureText(labelText);
          ctx.fillText(labelText, x - m.width, xAxisHeight_px);
        } else {
          const m = ctx.measureText(labelText);
          ctx.fillText(labelText, x - m.width * 0.5, xAxisHeight_px);
        }
        ctx.fillRect(x - 1.5, 0.5, 3, 5);
      }
      ctx.translate(0, -graphHeight_px);

      // Render axis lines:
      ctx.lineCap = 'square';
      ctx.strokeStyle = 'rgba(255, 255, 255, 1)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, graphHeight_px);
      ctx.lineTo(graphWidth_px, graphHeight_px);
      ctx.stroke();

      // Render grid lines:
      if (renderGridLines) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 1; i < numXAxisLines - 1; i++) {
          const x = ((i * graphWidth_px) / (numXAxisLines - 1)) >> 0;
          ctx.moveTo(x, 0.5);
          ctx.lineTo(x, graphHeight_px - 0.5);
        }
        for (let i = 0; i < numYAxisLines - 1; i++) {
          const y = (0.5 + (i * graphHeight_px) / (numYAxisLines - 1)) >> 0;
          ctx.moveTo(0, y);
          ctx.lineTo(0 + graphWidth_px, y);
        }
        ctx.stroke();
      }

      // Render data:
      // ctx.translate(-0.5, -0.5);
      if (numDataPoints > 0) {
        ctx.save();
        ctx.rect(-0.5, -padding_px - 0.5, graphWidth_px + padding_px, graphHeight_px + padding_px);
        ctx.clip();
        {
          ctx.strokeStyle = '#49C99F';
          ctx.fillStyle = grd; //"rgba(73, 201, 159, 0.3)";
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
          ctx.lineWidth = 3;
          ctx.beginPath();
          for (let i = 0; i <= numDataPoints; i++) {
            let p: Point;
            if (i == numDataPoints) {
              p = new Point(maxX, this.data[i - 1].y);
            } else {
              p = this.data[i];
            }
            const transformedX = ((p.x - minX) / (maxX - minX)) * graphWidth_px;
            const transformedY = (1 - p.y) * graphHeight_px;
            ctx.lineTo(transformedX, transformedY);
          }
          ctx.stroke();
          ctx.lineTo(graphWidth_px, graphHeight_px);
          ctx.lineTo(((this.data[0].x - minX) / (maxX - minX)) * graphWidth_px, graphHeight_px);
          ctx.fill();
        }
        ctx.restore();
      }
    }
    ctx.resetTransform();
  }
}

export { Point };
