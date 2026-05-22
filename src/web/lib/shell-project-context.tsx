import { createContext, useContext } from "react";

import type { ProjectContextViewModel } from "../presenters/project-context";

export const ShellProjectContext = createContext<ProjectContextViewModel | null>(null);

export function useShellProjectContext(): ProjectContextViewModel | null {
  return useContext(ShellProjectContext);
}
