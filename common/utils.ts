/**
 * Uses canvas.measureText to compute and return the width of the given text of given font in pixels.
 *
 * @param {String} text The text to be rendered.
 * @param {String} font The css font descriptor that text is to be rendered with (e.g. "bold 14px verdana").
 *
 * @see https://stackoverflow.com/questions/118241/calculate-text-width-with-javascript/21015393#21015393
 */
let getTextWidthCanvas: HTMLCanvasElement;
export function getTextWidth(text: string, font: string) {
    // if given, use cached canvas for better performance else, create new canvas
    var canvas = getTextWidthCanvas || (getTextWidthCanvas = document.createElement("canvas"));
    var context = canvas.getContext("2d");
    context.font = font;
    var metrics = context.measureText(text);
    return metrics.width;
}

export function getCssStyle(element: HTMLElement, prop: string) {
    return window.getComputedStyle(element, null).getPropertyValue(prop);
}

export function getCanvasFont(el = document.body) {
    const fontWeight = getCssStyle(el, "font-weight") || "normal";
    const fontSize = getCssStyle(el, "font-size") || "16px";
    const fontFamily = getCssStyle(el, "font-family") || "Times New Roman";

    return `${fontWeight} ${fontSize} ${fontFamily}`;
}
