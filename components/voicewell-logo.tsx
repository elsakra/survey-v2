import Image from "next/image";

/** Raster wordmark from Voicewell marketing (634×138). */
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
      className={className}
      priority={priority}
    />
  );
}
