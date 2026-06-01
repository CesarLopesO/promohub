export class UpdateMessageRouteDto {
  userId?: string;
  sessionId?: string;
  sourceGroupJid?: string;
  destinationGroupJid?: string;
  isActive?: boolean;
}
