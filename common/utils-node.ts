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
