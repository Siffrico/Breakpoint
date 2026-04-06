export function ProfileAvatar({
  name,
  image,
}: {
  name: string;
  image?: string | null;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  if (image) {
    return (
      <div className="h-10 w-10 overflow-hidden rounded-full border border-border/80 bg-secondary/50">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt={name} className="h-full w-full object-cover" />
      </div>
    );
  }

  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border/80 bg-secondary/50 text-xs font-semibold tracking-[0.2em] text-foreground">
      {initials || "BP"}
    </div>
  );
}
