import type { ReactNode } from "react";

export function PageHeader(props: {
  title: string;
  subtitle?: ReactNode;
  breadcrumb?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        {props.breadcrumb ? <div className="breadcrumb">{props.breadcrumb}</div> : null}
        <h1 className="page-title">{props.title}</h1>
        {props.subtitle ? <div className="page-subtitle">{props.subtitle}</div> : null}
      </div>

      {props.actions ? <div className="page-header-actions">{props.actions}</div> : null}
    </div>
  );
}
