import type { ServerAdapterModule } from "@paperclipai/adapter-utils";
import { createServerAdapter } from "./server/index.js";

export { createServerAdapter };
export type { ServerAdapterModule };

export default createServerAdapter();