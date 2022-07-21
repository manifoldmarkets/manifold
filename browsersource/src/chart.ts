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
        this.ctx = this.canvasElement.getContext("2d"); //!!! Handle failed context

        window.addEventListener("resize", () => {
            this.resize();    
        });
        this.resize();

        const animationFrame = () => {
            this.render();
            window.requestAnimationFrame(animationFrame);
        };
        window.requestAnimationFrame(animationFrame);

        this.data = this.produceData();
    }

    resize() {
        this.canvasElement.width = this.canvasElement.clientWidth;
        this.canvasElement.height = this.canvasElement.clientHeight;
    }

    produceData(): Point[] {
        let points = <Point[]> [];
        let x = 0;
        for (let i = 0; i < 30; i++) {
            let y = Math.random() * 100;
            points.push(new Point(x, y));
            x += Math.random() * 20 + 5;
            points.push(new Point(x, y));
        }
        return points;
    }

    render() {
        const ctx = this.ctx;
        const canvasWidth_px = this.canvasElement.width >> 0;
        const canvasHeight_px = this.canvasElement.height >> 0;
        const padding = 10;
        const yAxisWidth = 45;
        const numDataPoints = this.data.length;
        const graphWidth_px = canvasWidth_px - padding * 2 - yAxisWidth;
        const graphHeight_px = canvasHeight_px - padding * 2;

        ctx.clearRect(0, 0, canvasWidth_px, canvasHeight_px);

        let grd = this.ctx.createLinearGradient(0, 0, 0, canvasHeight_px);
        grd.addColorStop(0, "rgba(73, 201, 159, 0.8)");
        // grd.addColorStop(0.5, "rgba(73, 201, 159, 0.2)");
        grd.addColorStop(1, "rgba(73, 201, 159, 0.0)");

        let minX = Date.now() - 1000000;//Number.MAX_VALUE;
        let maxX = -Number.MAX_VALUE;
        let minY = 0;//Number.MAX_VALUE;
        let maxY = 1;//-Number.MAX_VALUE;
        for (let dataIndex = 0; dataIndex < numDataPoints; dataIndex++) {
            let dataPoint = this.data[dataIndex];
            // if (dataPoint.x < minX) {
            //     minX = dataPoint.x;
            // }
            if (dataPoint.x > maxX) {
                maxX = dataPoint.x;
            }
            // if (dataPoint.y < minY) {
            //     minY = dataPoint.y;
            // }
            // if (dataPoint.y > maxY) {
            //     maxY = dataPoint.y;
            // }
        }

        ctx.translate(padding + 0.5, padding + 0.5);
        {
            // Draw Y-Axis labels:
            ctx.fillStyle = "#FFF";
            ctx.font = "15px Arial";
            const numYAxisLines = 5;
            for (let i = 0; i < numYAxisLines; i++) {
                let y = graphHeight_px - (0.5 + (i * graphHeight_px / (numYAxisLines - 1)) >> 0);

                let labelText = `${i * (100 / (numYAxisLines - 1))}%`;
                let m = ctx.measureText(labelText);
                ctx.fillText(labelText, yAxisWidth - m.width - 10, y + (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) * 0.5);

                // ctx.fillRect(yAxisWidth - 5.5, y - 1.5, 5, 3);
            }

            ctx.translate(yAxisWidth, 0);
            
            // Render axis lines:
            ctx.lineCap = "square";
            ctx.strokeStyle = "rgba(255, 255, 255, 1)";
            ctx.lineWidth = 3;
            ctx.beginPath();
            // ctx.moveTo(0, 0);
            // ctx.lineTo(0, graphHeight_px);

            ctx.moveTo(0, graphHeight_px);
            ctx.lineTo(graphWidth_px, graphHeight_px);
            ctx.stroke();

            // Render grid lines:
            ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let i = 1; i < 5; i++) {
                let x = (i * graphWidth_px / 5) >> 0;
                ctx.moveTo(x, 0.5);
                ctx.lineTo(x, graphHeight_px - .5);
            }
            for (let i = 0; i < numYAxisLines - 1; i++) {
                let y = 0.5 + (i * graphHeight_px / 4) >> 0;
                ctx.moveTo(0, y);
                ctx.lineTo(0 + graphWidth_px, y);
            }
            ctx.stroke();

            // Render data:
            // ctx.translate(-0.5, -0.5);
            ctx.save();
            ctx.rect(-0.5, 0.5, graphWidth_px + padding, graphHeight_px + padding);
            ctx.clip();
            {
                ctx.strokeStyle = "#49C99F";
                ctx.fillStyle = grd;//"rgba(73, 201, 159, 0.3)";
                ctx.lineJoin = "round";
                ctx.lineCap = "round";
                ctx.lineWidth = 3;
                ctx.beginPath();
                for (let i = 0; i < numDataPoints; i++) {
                    let p = this.data[i];
                    let transformedX = ((p.x - minX) / (maxX - minX)) * graphWidth_px;
                    let transformedY = canvasHeight_px - (((p.y - minY) / (maxY - minY)) * graphHeight_px);
                    ctx.lineTo(transformedX, transformedY);
                }
                ctx.stroke();
                ctx.lineTo(graphWidth_px, graphHeight_px);
                ctx.lineTo(0, graphHeight_px);
                ctx.fill();
            }
            ctx.restore();
        }
        ctx.resetTransform();
    }
}

export {
    Point,
}