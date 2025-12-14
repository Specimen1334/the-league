import type { ReactNode } from "react";
import Link from "next/link";

export function HubTile(props: {
  title: string;
  description: string;
  href?: string;
  disabledReason?: string;
  meta?: ReactNode;
}) {
  const content = (
    <div className="card-body">
      <div className="stack stack-sm">
        <div>
          <div className="heading-md">{props.title}</div>
          <div className="text-muted mt-xs">{props.description}</div>
        </div>

        {props.meta ? <div>{props.meta}</div> : null}

        {props.disabledReason ? (
          <div className="badge badge-soft">{props.disabledReason}</div>
        ) : null}
      </div>
    </div>
  );

  if (props.href && !props.disabledReason) {
    return (
      <Link href={props.href} className="card" aria-label={props.title}>
        {content}
      </Link>
    );
  }

  return (
    <div className="card" aria-disabled={true}>
      {content}
    </div>
  );
}
