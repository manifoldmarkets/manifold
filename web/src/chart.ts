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
            // this.resize();
            this.resize();    
        });
        this.canvasElement.addEventListener("resize", () => {
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
        this.canvasElement.width = this.canvasElement.parentElement.clientWidth;
        this.canvasElement.height = this.canvasElement.parentElement.clientHeight;
        console.log("Resize")
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
        const width = this.canvasElement.width;
        const height = this.canvasElement.height;

        ctx.clearRect(0, 0, width, height);

        let grd = this.ctx.createLinearGradient(0, 0, 0, height);
        grd.addColorStop(0, "rgba(73, 201, 159, 0.8)");
        grd.addColorStop(1, "rgba(73, 201, 159, 0.0)");

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

        ctx.strokeStyle = "#49C99F";
        ctx.fillStyle = grd;//"rgba(73, 201, 159, 0.3)";
        ctx.lineWidth = 8;
        ctx.beginPath();
        for (let i = 0; i < numDataPoints; i++) {
            let p = this.data[i];
            let transformedX = ((p.x - minX) / (maxX - minX)) * width;
            let transformedY = ((p.y - minY) / (maxY - minY)) * height;
            ctx.lineTo(transformedX, transformedY);
        }
        ctx.stroke();
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.fill();
    }
}