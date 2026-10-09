import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  children,
  aside,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 pt-10 pb-6 sm:px-6 md:flex-row md:items-end md:justify-between md:pt-14">
      <div className="max-w-3xl space-y-3">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="text-3xl leading-tight font-semibold sm:text-4xl">{title}</h1>
        {children && (
          <div className="prose-notebook max-w-2xl text-[0.95rem]">{children}</div>
        )}
      </div>
      {aside}
    </div>
  );
}
