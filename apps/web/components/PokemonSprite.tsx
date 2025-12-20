"use client";

export function PokemonSprite({
  spriteUrl,
  alt,
  size = 56,
}: {
  spriteUrl: string | null;
  alt: string;
  size?: number;
}) {
  const px = `${size}px`;
  return (
    <div
      className="rounded-xl bg-muted flex items-center justify-center overflow-hidden shrink-0"
      style={{ width: px, height: px }}
    >
      {spriteUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={spriteUrl} alt={alt} style={{ width: px, height: px }} className="object-contain" />
      ) : (
        <span className="text-xs text-muted">?</span>
      )}
    </div>
  );
}
