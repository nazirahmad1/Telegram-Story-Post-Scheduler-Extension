import type { LucideIcon } from "lucide-react";
import { useI18n } from "../i18n";
import { shouldMirrorIcon } from "../utils/icon-mirror";

interface DirectionalIconProps {
  /** Key into the icon-mirror allow-list — see src/utils/icon-mirror.ts */
  name: string;
  icon: LucideIcon;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

/**
 * Renders a lucide icon, mirroring it horizontally in RTL ONLY if `name` is
 * in the directional allow-list (arrows, chevrons, pagination). Object
 * icons (camera, gear, trash, logo) pass through unmirrored. This is the
 * one place components should reach for when rendering an icon that might
 * be directional — never decide mirroring inline in a component.
 */
export function DirectionalIcon({
  name,
  icon: Icon,
  size = 18,
  strokeWidth = 2,
  className,
}: DirectionalIconProps) {
  const { dir } = useI18n();
  return (
    <Icon
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      aria-hidden="true"
      style={shouldMirrorIcon(name, dir) ? { transform: "scaleX(-1)" } : undefined}
    />
  );
}
