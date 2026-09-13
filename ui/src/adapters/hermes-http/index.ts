import type { UIAdapterModule } from "../types";
import { parseHermesHttpStdoutLine } from "./parse";
import { HermesHttpConfigFields } from "./config-fields";

export const hermesHttpUIAdapter: UIAdapterModule = {
  type: "hermes_http",
  label: "Hermes HTTP",
  parseStdoutLine: parseHermesHttpStdoutLine,
  ConfigFields: HermesHttpConfigFields,
  buildAdapterConfig: (values) => ({
    command: values.command ?? "",
    instructionsFilePath: values.instructionsFilePath,
  }),
};
