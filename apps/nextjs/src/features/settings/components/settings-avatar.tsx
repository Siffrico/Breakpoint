import Image from "next/image";

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
      <div className="border-border/80 bg-secondary/50 size-10 overflow-hidden rounded-full border">
        <Image
          src={image}
          alt={name}
          width={40}
          height={40}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  return (
    <div className="border-border/80 bg-secondary/50 text-foreground flex size-10 items-center justify-center rounded-full border text-xs font-semibold tracking-[0.2em]">
      {initials || "BP"}
    </div>
  );
}
