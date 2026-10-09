import {
  Accessibility,
  Footprints,
  Grid2x2,
  Grip,
  Spline,
  Square,
  type LucideIcon,
} from "lucide-react";
import type { FeatureType } from "@/lib/survey/types";

const ICONS: Record<FeatureType, LucideIcon> = {
  ralo: Grid2x2,
  deficiente: Accessibility,
  calcada: Footprints,
  tatil: Grip,
  meiofio: Spline,
  asfalto: Square,
};

export function TypeIcon({ type, className }: { type: FeatureType; className?: string }) {
  const Icon = ICONS[type];
  return <Icon className={className ?? "size-5"} aria-hidden="true" />;
}
