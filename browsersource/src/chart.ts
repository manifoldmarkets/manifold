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
        const width = this.canvasElement.width >> 0;
        const height = this.canvasElement.height >> 0;

        ctx.clearRect(0, 0, width, height);

        let grd = this.ctx.createLinearGradient(0, 0, 0, height);
        grd.addColorStop(0, "rgba(73, 201, 159, 0.8)");
        // grd.addColorStop(0.5, "rgba(73, 201, 159, 0.2)");
        grd.addColorStop(1, "rgba(73, 201, 159, 0.0)");

        const padding = 10;
        const numDataPoints = this.data.length;
        let minX = Number.MAX_VALUE;
        let maxX = -Number.MAX_VALUE;
        let minY = Number.MAX_VALUE;
        let maxY = -Number.MAX_VALUE;
        for (let dataIndex = 0; dataIndex < numDataPoints; dataIndex++) {
            let dataPoint = this.data[dataIndex];
            if (dataPoint.x < minX) {
                minX = dataPoint.x;
            }
            if (dataPoint.x > maxX) {
                maxX = dataPoint.x;
            }
            if (dataPoint.y < minY) {
                minY = dataPoint.y;
            }
            if (dataPoint.y > maxY) {
                maxY = dataPoint.y;
            }
        }

        ctx.translate(0.5, 0.5);
        {
            ctx.lineWidth = 1;

            // Render axis lines:
            ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
            ctx.beginPath();
            ctx.moveTo(padding, 0);
            ctx.lineTo(padding, height);

            ctx.moveTo(padding, height - padding);
            ctx.lineTo(padding + width, height - padding);
            ctx.stroke();

            // Render grid lines:
            ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
            ctx.beginPath();
            for (let i = 0 ; i < 5; i++) {
                let x = (i * width / 5) >> 0;
                ctx.moveTo(padding + x, 0.5);
                ctx.lineTo(padding + x, height - padding - .5);
            }
            for (let i = 0 ; i < 4; i++) {
                let y = 0.5 + (i * height / 4) >> 0;
                ctx.moveTo(padding, y);
                ctx.lineTo(padding + width, y);
            }
            ctx.stroke();
        }
        ctx.resetTransform();

        // Render data:
        ctx.strokeStyle = "#49C99F";
        ctx.fillStyle = grd;//"rgba(73, 201, 159, 0.3)";
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i < numDataPoints; i++) {
            let p = this.data[i];
            let transformedX = ((p.x - minX) / (maxX - minX)) * (width - 2 * padding) + padding;
            let transformedY = height - (((p.y - minY) / (maxY - minY)) * (height - 2 * padding) + padding);
            // let transformedY = ((p.y - minY + padding) / (maxY - minY + 2 * padding)) * height;
            ctx.lineTo(transformedX, transformedY);
        }
        ctx.stroke();
        ctx.lineTo(width - padding, height);
        ctx.lineTo(padding, height);
        ctx.fill();
    }
}

export {
    Point,
}