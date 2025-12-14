import type { ReactNode } from "react";

export function SeasonStatusBadge(props: {
  status: string;
  size?: "xs" | "sm";
  prefix?: ReactNode;
}) {
  const status = (props.status || "Unknown").trim();
  const cls = statusClass(status);
  const sizeCls = props.size === "xs" ? " pill-xs" : "";

  return (
    <span className={`pill ${cls}${sizeCls}`} aria-label={`Season status: ${status}`}>
      {props.prefix ? <span className="mr-xs">{props.prefix}</span> : null}
      {status}
    </span>
  );
}

function statusClass(status: string): string {
  switch (status) {
    case "Signup":
      return "pill-outline";
    case "Drafting":
      return "pill-accent";
    case "Active":
      return "pill-accent";
    case "Playoffs":
      return "pill-accent";
    case "Completed":
      return "pill-soft";
    case "Archived":
      return "pill-danger";
    default:
      return "pill-soft";
  }
}
