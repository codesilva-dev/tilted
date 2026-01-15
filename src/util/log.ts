/*

*/

function log(message: string): void {
    var compiled_msg = `[LOG]: ${message}`;
    var environment = process.env.NODE_ENV || 'development';
    if (environment === 'production') {
        // send to posthog
    }
    console.log(compiled_msg);
}