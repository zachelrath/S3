export default function statsReport500(err, statsClient) {
    if (err && err.code === 500) {
        statsClient.report500();
    }
    return undefined;
}
