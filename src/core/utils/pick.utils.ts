import type { ApiEvent, ApiPick } from "@/lib/api";
import { sportLabel } from "@/shared/config/sports";

type Participants = Pick<
  ApiPick,
  "home" | "away" | "homeCountry" | "awayCountry"
>;

function withCountry(name: string, country?: string | null): string {
  return country ? `${name} (${country})` : name;
}

export function matchupTitle(p: Participants): string {
  return `${withCountry(p.away, p.awayCountry)} @ ${withCountry(p.home, p.homeCountry)}`;
}

export function pickAuthor(p: Pick<ApiPick, "sportKey" | "username">): string {
  return `${sportLabel(p.sportKey)} | ${p.username}`;
}

export function isUpcoming(e: ApiEvent, now = Date.now()): boolean {
  return new Date(e.commenceTime).getTime() > now;
}
