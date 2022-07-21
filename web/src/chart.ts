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

        const padding_px = 10;
        const xAxisHeight_px = 15;
        const yAxisWidth_px = 45;
        const numXAxisLines = 5;
        const numYAxisLines = 5;
        
        const canvasWidth_px = this.canvasElement.width >> 0;
        const canvasHeight_px = this.canvasElement.height >> 0;
        const numDataPoints = this.data.length;
        const graphWidth_px = canvasWidth_px - padding_px * 2 - yAxisWidth_px;
        const graphHeight_px = canvasHeight_px - padding_px * 2 - xAxisHeight_px;

        ctx.clearRect(0, 0, canvasWidth_px, canvasHeight_px);

        let grd = this.ctx.createLinearGradient(0, 0, 0, canvasHeight_px);
        grd.addColorStop(0, "rgba(73, 201, 159, 0.8)");
        grd.addColorStop(1, "rgba(73, 201, 159, 0.0)");

        let minX = Number.MAX_VALUE;
        let maxX = -Number.MAX_VALUE;
        for (let dataIndex = 0; dataIndex < numDataPoints; dataIndex++) {
            let dataPoint = this.data[dataIndex];
            // if (dataPoint.x < minX) {
            //     minX = dataPoint.x;
            // }
            if (dataPoint.x > maxX) {
                maxX = dataPoint.x;
            }
        }
        maxX = Date.now();
        minX = maxX - 4 * 60 * 1000;

        // console.log(`Graph limits: [${minX/1000}, ${maxX/1000}]`)

        ctx.translate(padding_px + 0.5, padding_px + 0.5);
        {
            // Draw Y-Axis labels:
            ctx.fillStyle = "#FFF";
            ctx.font = "15px Readex Pro";
            for (let i = 0; i < numYAxisLines; i++) {
                let y = graphHeight_px - (0.5 + (i * graphHeight_px / (numYAxisLines - 1)) >> 0);
                let labelText = `${(i * (100 / (numYAxisLines - 1))).toFixed(0)}%`;
                let m = ctx.measureText(labelText);
                ctx.fillText(labelText, yAxisWidth_px - m.width - 5, y + (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) * 0.5);

                // ctx.fillRect(yAxisWidth - 5.5, y - 1.5, 5, 3);
            }

            ctx.translate(yAxisWidth_px, 0);

            ctx.translate(0, graphHeight_px);
            // ctx.fillRect(0, 0, 200, xAxisHeight);
            for (let i = 0; i < numXAxisLines; i++) {
                let x = (i * graphWidth_px / (numXAxisLines - 1)) >> 0;
                let labelText = (numXAxisLines - i - 1) + "m";
                if (i == numXAxisLines - 1) {
                    labelText = "now";
                    let m = ctx.measureText(labelText);
                    ctx.fillText(labelText, x - m.width, m.actualBoundingBoxAscent + 10);
                }
                else {
                    let m = ctx.measureText(labelText);
                    ctx.fillText(labelText, x - m.width * 0.5, m.actualBoundingBoxAscent + 10);
                }

                ctx.fillRect(x - 1.5, 0.5, 3, 5);
            }
            ctx.translate(0, -graphHeight_px);

            
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
            for (let i = 1; i < numXAxisLines - 1; i++) {
                let x = (i * graphWidth_px / (numXAxisLines - 1)) >> 0;
                ctx.moveTo(x, 0.5);
                ctx.lineTo(x, graphHeight_px - .5);
            }
            for (let i = 0; i < numYAxisLines - 1; i++) {
                let y = 0.5 + (i * graphHeight_px / (numYAxisLines - 1)) >> 0;
                ctx.moveTo(0, y);
                ctx.lineTo(0 + graphWidth_px, y);
            }
            ctx.stroke();

            // Render data:
            // ctx.translate(-0.5, -0.5);
            if (numDataPoints > 0) {
                ctx.save();
                ctx.rect(-0.5, 0.5, graphWidth_px + padding_px, graphHeight_px + padding_px);
                ctx.clip();
                {
                    ctx.strokeStyle = "#49C99F";
                    ctx.fillStyle = grd;//"rgba(73, 201, 159, 0.3)";
                    ctx.lineJoin = "round";
                    ctx.lineCap = "round";
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    for (let i = 0; i <= numDataPoints; i++) {
                        let p: Point;
                        if (i == numDataPoints) {
                            p = new Point(maxX, this.data[i - 1].y);
                        }
                        else {
                            p = this.data[i];
                        }
                        let transformedX = ((p.x - minX) / (maxX - minX)) * graphWidth_px;
                        let transformedY = ((1 - p.y) * graphHeight_px);
                        ctx.lineTo(transformedX, transformedY);
                    }
                    ctx.stroke();
                    ctx.lineTo(graphWidth_px, graphHeight_px);
                    ctx.lineTo(0, graphHeight_px);
                    ctx.fill();
                }
                ctx.restore();
            }
        }
        ctx.resetTransform();
    }
}

export {
    Point,
}