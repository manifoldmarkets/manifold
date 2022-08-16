export function getParamsFromURL(url: string) {
    const q = url.split("?");
    const result = {};
    if (q.length >= 2) {
        q[1].split("&").forEach((item) => {
            try {
                result[item.split("=")[0]] = item.split("=")[1];
            } catch (e) {
                result[item.split("=")[0]] = "";
            }
        });
    }
    return result;
}

export function buildURL(baseURL: string, params: {[k: string]: unknown}) {
    const paramString = Object.keys(params)
        .map((key) => key + "=" + params[key])
        .join("&");
    return `${baseURL}?${paramString}`;
}