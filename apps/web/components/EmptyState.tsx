import type { ReactNode } from "react";

export function EmptyState(props: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card">
      <div className="card-body text-center">
        <h2 className="heading-md mb-xs">
          {props.title}
        </h2>
        {props.description ? (
          <p className="text-muted mt-sm mb-xs">
            {props.description}
          </p>
        ) : null}
        {props.action ? <div className="mt-md">{props.action}</div> : null}
      </div>
    </div>
  );
}
