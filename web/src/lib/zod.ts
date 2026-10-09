/**
 * zod, configured once for the whole app. `jitless` turns off zod's
 * `new Function` fast path and the probe for it: the site's
 * Content-Security-Policy has no 'unsafe-eval', and the browser reports even
 * a caught probe as a policy violation. Import `z` from here, not from "zod".
 */
import { z } from "zod";

z.config({ jitless: true });

export { z };
