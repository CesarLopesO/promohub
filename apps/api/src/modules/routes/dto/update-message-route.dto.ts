export class UpdateMessageRouteDto {
  sessionId?: string;
  sourceGroupJid?: string;
  destinationGroupJid?: string;
  destinationInviteUrl?: string | null;
  isActive?: boolean;
}
