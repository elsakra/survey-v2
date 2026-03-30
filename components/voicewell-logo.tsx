import Image from "next/image";
import { cn } from "@/lib/ui";

/** Raster wordmark (634×138). Black on transparent — `globals.css` inverts in `html.dark` only. */
const LOGO_WIDTH = 634;
const LOGO_HEIGHT = 138;

export function VoicewellLogo({
  height = 24,
  className,
  priority,
}: {
  height?: number;
  className?: string;
  priority?: boolean;
}) {
  const width = Math.round((LOGO_WIDTH / LOGO_HEIGHT) * height);
  return (
    <Image
      src="/voicewell-logo.png"
      alt="Voicewell"
      width={width}
      height={height}
      priority={priority}
      className={cn("voicewell-wordmark h-auto w-auto max-w-none shrink-0", className)}
    />
  );
}
