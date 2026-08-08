import type { ReactNode } from 'react';
import { Text } from '@cloudflare/kumo';

/** Single content width for every admin page. */
export function Page({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <div className="mb-6 grid gap-1.5">
        <Text as="h1" variant="heading2">
          {title}
        </Text>
        {description ? (
          <Text className="text-kumo-subtle">{description}</Text>
        ) : null}
      </div>
      {children}
    </div>
  );
}
