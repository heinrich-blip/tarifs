import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Helper to extract display name from origin/destination (handles both string and object formats)
// Third-party loads store locations as objects: { placeName, address, plannedArrival, plannedDeparture }
export function getLocationDisplayName(location: string | { placeName?: string } | null | undefined): string {
  if (!location) return '';
  if (typeof location === 'string') return location;
  if (typeof location === 'object' && location.placeName) return location.placeName;
  return '';
}
