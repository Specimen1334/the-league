import type { ReactNode } from "react";

export function PageHeader(props: {
  title: string;
  subtitle?: string;
  breadcrumb?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        {props.breadcrumb ? <div className="breadcrumb">{props.breadcrumb}</div> : null}
        <h1 className="page-title">{props.title}</h1>
        {props.subtitle ? <p className="page-subtitle">{props.subtitle}</p> : null}
      </div>

      {props.actions ? <div className="page-header-actions">{props.actions}</div> : null}
    </div>
  );
}
