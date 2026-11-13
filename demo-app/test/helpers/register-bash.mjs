/** Apply the same pinned upstream session hook as the browser build, before tests load the runtime. */
import {register} from 'node:module';
register('./bash-loader.mjs',import.meta.url);
