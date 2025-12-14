import type { ReactNode } from "react";

export function PageShell(props: { children: ReactNode }) {
  return <div className="stack stack-lg">{props.children}</div>;
}
